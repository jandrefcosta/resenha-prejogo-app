# Planejamento: Gerenciador de Bolão — Copa do Mundo 2026

**Dependência:** Requer a [página da Copa](multi-competition.md) como base — os jogos, resultados e fixtures vêm da infraestrutura planejada lá.

---

## O que é um bolão

Participantes de um grupo fazem **palpites de placar** para cada jogo da Copa antes do apito inicial. Depois do jogo, os pontos são calculados automaticamente com base na precisão do palpite. Um ranking ao vivo mostra quem está ganhando o bolão.

---

## Visão do produto

```
João cria um bolão "Bolão do Escritório"
  └─ Recebe código: ESCRITÓRIO-X7K2

Maria entra com o código
  └─ Acessa a lista de jogos e faz seus palpites

Pedro e Ana também entram e palpitam

Brasil × França começa → palpites bloqueados automaticamente
Brasil × França termina 2×1 → pontos calculados automaticamente

Ranking atualizado:
  1. Maria  — 45 pts  ████████████
  2. João   — 38 pts  ██████████
  3. Pedro  — 30 pts  ████████
  4. Ana    — 22 pts  ██████
```

---

## Regras de pontuação (padrão)

| Resultado | Pontos |
|-----------|--------|
| Placar exato (ex: palpitou 2×1, foi 2×1) | 10 pts |
| Vencedor correto, placar errado (palpitou 3×1, foi 2×1) | 5 pts |
| Empate correto, placar errado (palpitou 0×0, foi 1×1) | 5 pts |
| Palpite errado | 0 pts |
| Sem palpite | 0 pts |

As regras são configuráveis por bolão — o criador pode ajustar os pontos ao criar.

---

## Decisão: autenticação

### O problema

Na época deste planejamento, o sistema identificava o usuário apenas por um cookie httpOnly anônimo (UUID no Redis). Não havia senha, verificação de e-mail nem sessão tradicional. Para um bolão casual entre amigos, isso bastaria **no mesmo dispositivo**. O problema é trocar de dispositivo.

### Opções avaliadas

**A — Cookie only (sem mudança)**
- Funciona no mesmo dispositivo/browser
- Trocar de dispositivo: perde acesso ao bolão
- Aceitável para MVP mínimo, mas experiência ruim

**B — Nome + e-mail + magic link**
- Usuário entra com nome e e-mail
- Recebe link por e-mail para confirmar e acessar em qualquer dispositivo
- Requer: serviço de envio de e-mail (Resend, Mailgun ~$0/mês no free tier)
- Mais fricção, mas acesso multi-device

**C — Nome + e-mail + PIN de 6 dígitos ← recomendado**
- Usuário registra nome + e-mail → sistema envia PIN por e-mail
- PIN válido por 15 minutos para login
- Cookie de longa duração após login (1 ano)
- Reconecta no novo dispositivo: entra o e-mail → novo PIN
- Requer Resend ou similar — API simples, gratuita até 3.000 emails/mês
- Implementação simples: `pin:{email}` no Redis com TTL de 15min

**D — Apenas nome (sem e-mail)**
- Zero fricção para entrar
- Sem recuperação de acesso — perde tudo se limpar cookies
- Não recomendado: cria "fantasmas" no ranking sem dono real

### Decisão recomendada

**Cenário C (PIN por e-mail)** para produção.
**Cenário A (cookie only)** para MVP/teste inicial — pode migrar depois sem quebrar nada pois o cookie anônimo já existe.

---

## Modelo de dados

### Bolão

```typescript
interface Bolao {
  id: string;              // nanoid (ex: "abc123xyz")
  name: string;            // "Bolão do Escritório"
  inviteCode: string;      // 6 chars maiúsculos (ex: "X7K2AB")
  adminUserId: string;     // quem criou
  competition: string;     // "world-cup-2026"
  rules: ScoringRules;
  status: 'open' | 'active' | 'finished';
  createdAt: string;       // ISO 8601
  maxMembers?: number;     // opcional, default ilimitado
}

interface ScoringRules {
  exactScore: number;      // default: 10
  correctOutcome: number;  // default: 5
  miss: number;            // default: 0
}
```

### Participante (membro do bolão)

```typescript
interface BolaoMember {
  userId: string;
  bolaoId: string;
  displayName: string;     // nome no ranking deste bolão
  joinedAt: string;
  totalPoints: number;     // calculado, denormalizado para performance
}
```

### Palpite

```typescript
interface Prediction {
  userId: string;
  bolaoId: string;
  fixtureId: number;       // ID da API-Football
  homeGoals: number;
  awayGoals: number;
  submittedAt: string;
  locked: boolean;         // true após kickoff
}
```

### Resultado calculado (por jogo)

```typescript
interface MatchScore {
  userId: string;
  bolaoId: string;
  fixtureId: number;
  points: number;          // 0, 5 ou 10
  outcome: 'exact' | 'correct_outcome' | 'miss' | 'no_prediction';
  prediction: { home: number; away: number } | null;
  actual: { home: number; away: number } | null;
}
```

---

## Catálogo de chaves Redis

Seguindo o padrão de namespacing já adotado no projeto:

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `bolao:{id}` | Permanente | JSON | Objeto `Bolao` |
| `bolao:code:{inviteCode}` | Permanente | String | `bolaoId` (lookup por código) |
| `bolao:{id}:members` | Permanente | Set Redis | Set de `userId`s |
| `bolao:{id}:member:{userId}` | Permanente | JSON | Objeto `BolaoMember` |
| `bolao:{id}:leaderboard` | Permanente | Sorted Set | Score: pontos; Member: userId |
| `prediction:{bolaoId}:{fixtureId}:{userId}` | Permanente | JSON | Objeto `Prediction` |
| `prediction:{bolaoId}:{userId}` | Permanente | Set Redis | Set de `fixtureId`s palpitados |
| `match_score:{bolaoId}:{fixtureId}:{userId}` | Permanente | JSON | Objeto `MatchScore` |
| `pin:{email}` | 15 min | String | PIN de 6 dígitos |
| `user:{userId}:boloes` | Permanente | Set Redis | Set de `bolaoId`s do usuário |

### Por que Redis e não um banco SQL?

O app já usa exclusivamente Upstash Redis. Para o bolão:
- Sorted Sets são nativos para leaderboard (`ZRANGEBYSCORE`, `ZINCRBY`)
- Sets são nativos para membros de um bolão
- Sem nova infraestrutura, sem nova conta, sem migrations
- Upstash Redis suporta todos os tipos necessários via REST API

A desvantagem (sem ACID, sem joins) é aceitável para um bolão casual onde consistência eventual é suficiente.

---

## Rotas de API

### Bolão

| Método | Rota | Ação |
|--------|------|------|
| `POST` | `/api/bolao` | Criar bolão |
| `GET` | `/api/bolao/[id]` | Detalhes do bolão |
| `POST` | `/api/bolao/join` | Entrar por código de convite |
| `GET` | `/api/bolao/[id]/leaderboard` | Ranking do bolão |
| `GET` | `/api/bolao/[id]/results` | Resultados detalhados por jogo |

### Palpites

| Método | Rota | Ação |
|--------|------|------|
| `POST` | `/api/bolao/[id]/prediction` | Submeter/atualizar palpite |
| `GET` | `/api/bolao/[id]/predictions` | Todos os palpites do usuário logado |
| `GET` | `/api/bolao/[id]/predictions/[fixtureId]` | Palpites de todos para um jogo (só após kickoff) |

### Autenticação (nova)

| Método | Rota | Ação |
|--------|------|------|
| `POST` | `/api/auth/request-pin` | Envia PIN para o e-mail |
| `POST` | `/api/auth/verify-pin` | Valida PIN e cria sessão |
| `POST` | `/api/auth/logout` | Limpa cookie de sessão |

### Cálculo de pontos (interno)

| Método | Rota | Ação |
|--------|------|------|
| `POST` | `/api/bolao/[id]/score/[fixtureId]` | Calcula pontos de um jogo (chamado pelo cron) |

---

## Cálculo de pontos

### Quando é acionado

Duas estratégias complementares:

**1. Vercel Cron** — roda a cada 30 minutos durante a Copa:
```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/score-matches",
    "schedule": "*/30 * * * *"
  }]
}
```

O cron busca jogos que terminaram (via API-Football, status `FT`), calcula pontos de todos os bolões que têm palpites para esses jogos, atualiza o leaderboard.

**2. On-demand** — quando o usuário abre o leaderboard, verifica se há jogos finalizados sem score calculado e aciona o cálculo.

### Algoritmo

```typescript
async function scoreFixture(bolaoId: string, fixtureId: number) {
  const fixture = await getFixtureResult(fixtureId); // API-Football
  if (fixture.status !== 'FT') return; // jogo não terminou

  const rules = await getBolaoRules(bolaoId);
  const members = await getBolaoMembers(bolaoId);

  for (const userId of members) {
    const prediction = await getPrediction(bolaoId, fixtureId, userId);
    const points = calculatePoints(prediction, fixture.score, rules);

    await savMatchScore(bolaoId, fixtureId, userId, points);
    await redis.zincrby(`bolao:${bolaoId}:leaderboard`, points, userId);
  }
}

function calculatePoints(
  prediction: Prediction | null,
  actual: { home: number; away: number },
  rules: ScoringRules
): number {
  if (!prediction) return rules.miss; // sem palpite = 0

  const exactHome = prediction.homeGoals === actual.home;
  const exactAway = prediction.awayGoals === actual.away;

  if (exactHome && exactAway) return rules.exactScore;

  const predictedOutcome = Math.sign(prediction.homeGoals - prediction.awayGoals);
  const actualOutcome = Math.sign(actual.home - actual.away);

  if (predictedOutcome === actualOutcome) return rules.correctOutcome;

  return rules.miss;
}
```

### Bloqueio de palpites (locking)

Palpites são bloqueados automaticamente no kickoff do jogo. A verificação acontece no endpoint `POST /api/bolao/[id]/prediction`:

```typescript
const fixture = await getFixture(fixtureId); // API-Football
const kickoff = new Date(fixture.date).getTime();
if (Date.now() >= kickoff) {
  return Response.json({ error: 'prediction_locked' }, { status: 409 });
}
```

---

## Páginas e componentes

### Estrutura de rotas

```
src/app/copa-2026/bolao/
  page.tsx                     # /copa-2026/bolao → lista bolões do usuário + criar/entrar
  criar/page.tsx               # /copa-2026/bolao/criar → formulário de criação
  entrar/page.tsx              # /copa-2026/bolao/entrar → formulário de entrada por código
  [id]/page.tsx                # /copa-2026/bolao/:id → painel do bolão (palpites + ranking)
  [id]/resultados/page.tsx     # /copa-2026/bolao/:id/resultados → detalhamento por jogo
```

### Componentes novos

```
src/components/bolao/
  BolaoCard.tsx                # Card de bolão na lista (nome, código, posição, pts)
  CreateBolaoModal.tsx         # Modal de criação (nome, regras de pontuação)
  JoinBolaoModal.tsx           # Modal de entrada por código
  PredictionGrid.tsx           # Grid de todos os jogos + campos de palpite
  PredictionRow.tsx            # Linha individual: jogo + input placar + status
  Leaderboard.tsx              # Ranking com avatar/inicial, nome, pontos, posição
  MatchScoreCard.tsx           # Detalhe de pontuação por jogo (palpite vs resultado)
  LockBadge.tsx                # Badge "Bloqueado" em palpites após kickoff
  ShareBolaoButton.tsx         # Botão compartilhar código de convite
```

### Tela principal do bolão (`[id]/page.tsx`)

```
┌──────────────────────────────────────────┐
│  Bolão do Escritório          [Convidar] │
│  Código: X7K2AB                          │
├──────────────────────────────────────────┤
│  [Palpites]  [Ranking]  [Resultados]     │
├──────────────────────────────────────────┤
│  ABA PALPITES:                           │
│                                          │
│  Fase de Grupos — Grupo A               │
│  ─────────────────────────────────────  │
│  Brasil × Sérvia    16/06  18h          │
│  [  2  ] × [  0  ]         ✓ salvo      │
│                                          │
│  Brasil × Suíça     21/06  15h          │
│  [  1  ] × [  1  ]         ✓ salvo      │
│                                          │
│  Espanha × Alemanha 15/06  12h          │
│  [  _  ] × [  _  ]                      │
│  ─────────────────────────────────────  │
│  França × Argentina  (Encerrado 3×2)    │
│  Seu palpite: 2×1 → +5 pts             │
│  [BLOQUEADO]                             │
└──────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────┐
│  ABA RANKING:                            │
│                                          │
│  # Nome           Pts  Últimos jogos     │
│  ─────────────────────────────────────  │
│  1 Maria          45   ●●●○○            │
│  2 João ← você   38   ●●○●○            │
│  3 Pedro          30   ●○○●●            │
│  4 Ana            22   ○○●○○            │
└──────────────────────────────────────────┘
```

---

## Compartilhamento do bolão

O botão "Convidar" usa a mesma lógica de share já implementada:

```typescript
async function handleShare(bolao: Bolao) {
  const text = `Entra no meu bolão da Copa do Mundo! 🏆\n\nBolão: ${bolao.name}\nCódigo: ${bolao.inviteCode}\n\nAcesse: resenha-prejogo.com/copa-2026/bolao/entrar`;

  if (navigator.share) {
    await navigator.share({ text });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
}
```

---

## Infraestrutura necessária

### O que já existe e pode ser reusado

| O que | Como reusa |
|-------|-----------|
| Cookie anônimo + UUID | `userId` nos palpites e membros |
| `redis` client (Upstash) | Armazenamento de tudo |
| `rateLimiter` | Limitar criação de bolões por usuário |
| Web Share API | Compartilhar código de convite |
| `useFocusTrap` | Modais de criação/entrada |
| Tema/cores da Copa | Visual verde/amarelo herdado |

### O que precisa ser criado

| O que | Complexidade |
|-------|-------------|
| Serviço de e-mail (Resend) | Baixa — API REST simples |
| `POST /api/auth/request-pin` + `verify-pin` | Baixa |
| `vercel.json` com cron | Baixa |
| `POST /api/cron/score-matches` | Média |
| Todas as rotas de bolão | Média |
| `PredictionGrid` com auto-save | Média |
| `Leaderboard` com sorted sets | Baixa |
| Lógica de locking por kickoff | Baixa |

### Novo pacote sugerido

```bash
npm install resend          # envio de e-mail para PIN
npm install nanoid          # IDs únicos para bolões
```

---

## Prioridade de implementação

### Etapa 1 — Auth leve (base de tudo)
1. Integrar Resend (ou similar) para envio de e-mail
2. `POST /api/auth/request-pin` — gera PIN, salva `pin:{email}` no Redis (TTL 15min), envia e-mail
3. `POST /api/auth/verify-pin` — valida PIN, atualiza `user:{id}` com `displayName`, cria cookie
4. Adicionar campo `displayName` ao `UserRecord` existente

### Etapa 2 — CRUD do bolão
5. `POST /api/bolao` — criar bolão (gera ID + código de 6 chars)
6. `POST /api/bolao/join` — entrar por código (valida, adiciona ao Set de membros)
7. `GET /api/bolao/[id]` — detalhes + verificação de membro
8. Página `/copa-2026/bolao` — lista bolões do usuário + botões criar/entrar

### Etapa 3 — Palpites
9. `POST /api/bolao/[id]/prediction` — salvar palpite (com verificação de locking)
10. `GET /api/bolao/[id]/predictions` — palpites do usuário logado
11. Componente `PredictionGrid` — lista jogos com inputs de placar

### Etapa 4 — Pontuação
12. `vercel.json` com cron a cada 30min
13. `GET /api/cron/score-matches` — busca jogos finalizados, calcula pontos, atualiza leaderboard
14. `GET /api/bolao/[id]/leaderboard` — lê sorted set do Redis, retorna ranking

### Etapa 5 — Polish
15. `GET /api/bolao/[id]/predictions/[fixtureId]` — revelar palpites dos outros após kickoff
16. `MatchScoreCard` — detalhe de pontuação por jogo
17. Notificação de resultado (push ou e-mail pós-jogo — pós-MVP)

---

## O que NÃO precisa ser criado

- Banco SQL / Prisma — Redis resolve com sorted sets e hashes
- Autenticação OAuth/social — PIN por e-mail é suficiente para o contexto
- Pagamentos — bolão casual, sem aposta financeira
- Admin panel — o criador do bolão tem controle suficiente pela UI
- Real-time (WebSocket) — polling a cada 30s no leaderboard é suficiente

---

## Estimativa de escopo

| Etapa | Complexidade | Pré-requisito |
|-------|-------------|---------------|
| Etapa 1 (auth) | Baixa | Conta Resend |
| Etapa 2 (CRUD bolão) | Baixa-Média | Etapa 1 |
| Etapa 3 (palpites) | Média | Etapas 1–2 + página Copa com fixtures |
| Etapa 4 (pontuação) | Média | Etapa 3 + `vercel.json` |
| Etapa 5 (polish) | Baixa | Etapas 1–4 |

**Dependência externa crítica:** a página da Copa (`/copa-2026`) precisa estar funcional para os fixtures existirem. O bolão sem jogos para palpitar não tem sentido. Implementar após as Etapas 1–4 do [planejamento da Copa](multi-competition.md).
