# Bolão Copa 2026 — Design Spec

**Data:** 2026-04-20  
**Status:** Aprovado  
**Prioridade:** Alta — janela temporal crítica (Copa inicia junho 2026)

---

## Contexto

O app Resenha Pré-Jogo já tem a página `/copa-2026` com todos os 64 jogos, grupos e contagem regressiva. O Bolão Copa 2026 é a camada de engajamento social sobre esses dados: usuários palpitam nos placares, acumulam pontos e competem em rankings público e privados.

Auth, Redis e dados da Copa já estão prontos. Só `nanoid` precisa ser instalado.

---

## Decisões de produto

| Decisão | Escolha |
|---------|---------|
| Estrutura | Híbrido: ranking global público + bolões privados por convite |
| Auth | Reutilizar auth existente (email + senha + JWT `sc_auth`) |
| Rota | `/bolao` — primeiro nível, sem ícone no header |
| Escopo de palpites | 48 jogos da fase de grupos (Rodadas 1, 2 e 3) |
| Layout de palpites | Lista por rodada com tabs R1 / R2 / R3 |
| Ranking global | Opt-in automático ao primeiro palpite |
| Lock de palpites | Por jogo — trava no kickoff de cada partida |

---

## Arquitetura

### Rotas de página

```
/bolao              Hub: ranking global + meus bolões privados + CTA palpites
/bolao/palpites     Grid de palpites (R1/R2/R3) — compartilhado entre global e privados
/bolao/novo         Criar bolão privado (nome → código gerado)
/bolao/[id]         Bolão privado: ranking interno + link para palpites
```

### API Routes

```
POST /api/bolao                  Criar bolão privado (auth)
POST /api/bolao/join             Entrar por código de convite (auth)
GET  /api/bolao/me               Bolões do usuário logado
GET  /api/bolao/[id]             Meta + ranking do bolão privado
GET  /api/bolao/global           Ranking global: top 50 + posição do usuário
PUT  /api/palpites/[fixtureId]   Salvar/atualizar palpite (auth, antes do kickoff)
GET  /api/palpites               Todos os palpites do usuário logado
POST /api/bolao/score            Endpoint do cron (CRON_SECRET header)
```

### Modelo de dados Redis

```
bolao:global:ranking          Sorted Set  userId → totalPts          ranking global
bolao:{id}:meta               JSON        {nome, codigo, adminId, criadoEm}
bolao:{id}:members            Set         userIds
bolao:{id}:ranking            Sorted Set  userId → totalPts          ranking privado
bolao:code:{code}             String      bolaoId                     lookup por código
bolao:user:{userId}:boloes    Set         bolaoIds                    bolões do usuário
palpite:{userId}:{fixtureId}  JSON        {home, away, locked, ts}
score:{userId}:{fixtureId}    JSON        {pts, outcome}              após jogo encerrado
```

TTLs: meta/members/rankings sem TTL (permanentes). Palpites e scores sem TTL.

---

## Fluxo de páginas

### `/bolao` — Hub principal

**Usuário logado:**
- Ranking global (top 5 + posição do usuário com destaque)
- Lista de bolões privados do usuário (nome, nº participantes, posição)
- Botões "Criar bolão" e "Entrar por código"
- CTA fixo "Meus Palpites (X/48 preenchidos)"

**Visitante sem login:**
- Ranking global visível (público, sem necessidade de auth)
- CTA "Criar conta / Entrar" para participar
- Sem acesso a palpites ou bolões privados

### `/bolao/palpites` — Grid de palpites

- Tabs: **Rodada 1** (16/16) · **Rodada 2** (12/16) · **Rodada 3** (4/16)
- Contador de palpites preenchidos por rodada em cada tab
- Cada jogo tem 3 estados visuais:
  - **Editável** — inputs ativos, salva ao blur/change
  - **Lockado sem pontuação** — jogo em andamento, read-only
  - **Pontuado** — fundo verde (acerto exato), azul (resultado certo), cinza (errou) + pts exibidos
- Jogos sem palpite destacados em amarelo como aviso
- Salva automaticamente ao digitar (debounce 500ms) — sem botão "Salvar"

### `/bolao/novo` — Criar bolão privado

- Campo: nome do bolão
- Código de convite gerado automaticamente com `nanoid` (6 chars uppercase, ex: `TRAB42`)
- Botão criar → redireciona para `/bolao/[id]`

### `/bolao/[id]` — Bolão privado

- Nome + código de convite (para compartilhar)
- Ranking interno com posição do usuário destacada
- Botão "Meus Palpites" → `/bolao/palpites` (mesma tela, palpites são globais por usuário)
- Botão "Compartilhar" (Web Share API) com texto e link

---

## Pontuação

| Resultado | Pontos |
|-----------|--------|
| Placar exato | 10 pts |
| Resultado correto (W/D/L) | 5 pts |
| Errou | 0 pts |

**Nota:** Empates na fase de grupos são válidos — "resultado correto" inclui acertar o empate sem acertar o placar.

---

## Cron de pontuação

- **Frequência:** a cada 30 minutos (`vercel.json`)
- **Endpoint:** `POST /api/bolao/score` com header `Authorization: Bearer {CRON_SECRET}`
- **Lógica:**
  1. Busca todos os jogos da Copa com `status === 'finished'`
  2. Para cada jogo, lista todos os palpites (`palpite:*:{fixtureId}` via scan ou index)
  3. Se `score:{userId}:{fixtureId}` já existe → pula (idempotente)
  4. Calcula pontos, grava `score:{userId}:{fixtureId}`
  5. `ZINCRBY bolao:global:ranking {pts} {userId}`
  6. Para cada bolão do usuário: `ZINCRBY bolao:{id}:ranking {pts} {userId}`

**Index de palpites por jogo:** chave `palpite:fixture:{fixtureId}` (Set de userIds) — atualizada no PUT, usada pelo cron para iterar eficientemente sem SCAN.

---

## Lock de palpites

```typescript
// PUT /api/palpites/[fixtureId]
const match = await getCopaFixture(fixtureId)
const kickoff = new Date(match.date)
if (Date.now() >= kickoff.getTime()) {
  return NextResponse.json({ error: 'Palpite travado' }, { status: 403 })
}
// salva normalmente
```

- Jogo adiado (`status: postponed`): lock é desfeito, palpite volta a ser editável
- Lock verificado sempre no servidor — nunca confiar só no frontend

---

## Edge cases

| Caso | Tratamento |
|------|-----------|
| PUT após kickoff | 403 — palpite travado |
| PUT duas vezes no mesmo jogo | Sobrescreve se não lockado (Redis SET atômico) |
| Cron antes do resultado final | Checa `status === 'finished'` — pula se não finalizado |
| Cron roda duas vezes | `score:{userId}:{fixtureId}` já existe → pula (idempotente) |
| Código de convite inválido | `bolao:code:{code}` null → 404 com mensagem amigável |
| Usuário já membro do bolão | SISMEMBER → retorna 200 sem duplicar |
| Usuário sem palpite no jogo | 0 pts naquele jogo — sem auto-fill |

---

## Dependências

- **Instalar:** `nanoid` — geração de IDs e códigos de convite
- **Não necessário:** `resend` — auth existente não usa email transacional neste fluxo
- **Já disponível:** `@upstash/redis`, `jose`, `bcryptjs`, dados Copa 2026, auth JWT

---

## Arquivos a criar

```
src/app/bolao/page.tsx                    Hub principal
src/app/bolao/palpites/page.tsx           Grid de palpites
src/app/bolao/novo/page.tsx               Criar bolão
src/app/bolao/[id]/page.tsx               Bolão privado
src/app/api/bolao/route.ts                POST criar, GET me
src/app/api/bolao/join/route.ts           POST entrar por código
src/app/api/bolao/global/route.ts         GET ranking global
src/app/api/bolao/score/route.ts          POST cron pontuação
src/app/api/bolao/[id]/route.ts           GET meta + ranking privado
src/app/api/palpites/route.ts             GET todos os palpites do usuário
src/app/api/palpites/[fixtureId]/route.ts PUT salvar palpite
src/lib/bolaoRedis.ts                     Helpers Redis para bolão
src/components/bolao/RankingGlobal.tsx    Componente ranking global
src/components/bolao/BolaoCard.tsx        Card de bolão privado na lista
src/components/bolao/PalpiteRow.tsx       Linha de palpite com inputs
src/components/bolao/RodadaTabs.tsx       Tabs R1/R2/R3
src/components/bolao/RankingTable.tsx     Tabela de ranking (global e privado)
```

### Arquivos a modificar

```
vercel.json                               Adicionar cron /api/bolao/score
src/middleware.ts                         Proteger rotas /api/bolao/* (exceto global)
src/app/layout.tsx ou header              Adicionar link "Bolão" na nav
```

---

## Definition of Done

- [ ] Usuário logado acessa `/bolao` e vê ranking global e seus bolões privados
- [ ] Usuário preenche palpites em R1/R2/R3, salvamento automático funciona
- [ ] Palpite é bloqueado no kickoff — PUT após kickoff retorna 403
- [ ] Cron calcula pontos corretamente após jogo encerrado
- [ ] Ranking global e privado atualizam após cron
- [ ] Criar bolão privado gera código único, redireciona para `/bolao/[id]`
- [ ] Entrar por código válido adiciona usuário ao bolão
- [ ] Visitante sem login vê ranking global mas não consegue palpitar
- [ ] Compartilhar bolão privado usa Web Share API
