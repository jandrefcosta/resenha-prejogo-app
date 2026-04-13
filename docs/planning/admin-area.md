# Área de Admin — Planejamento

> Painel interno para manutenção e operação do projeto, sem depender de CLI ou chamadas manuais a endpoints de debug.  
> Criado: abril 2026  
> Status: **⬜ Pendente** — único endpoint admin existente: `DELETE /api/admin/bust-match-docs`

---

## Motivação

Hoje a manutenção exige:
- Chamadas manuais a `/api/debug/*` com `DEBUG_SECRET` na query string
- CLI via `npm run seed:cbf` para popular rodadas no Redis
- Acesso direto ao Upstash console para inspecionar chaves

O objetivo da área admin é centralizar essas operações numa interface visual, segura e auditável.

---

## Acesso e autenticação

**Rota base:** `/admin`

**Mecanismo:**
- Formulário de login em `/admin/login` com senha única (`ADMIN_PASSWORD` no `.env`)
- Autenticação bem-sucedida grava cookie `sc_admin` (httpOnly, Secure, sameSite=strict) com HMAC assinado usando `ADMIN_SECRET`
- `middleware.ts` protege todas as rotas `/admin/*` — redireciona para `/admin/login` se o token for inválido ou ausente
- Logout apaga o cookie e redireciona para `/admin/login`

**O que não é:**
- Sem multiusuário, roles ou OAuth
- Sem registro — senha única definida no `.env`

**Variáveis de ambiente necessárias:**

| Variável | Descrição |
|----------|-----------|
| `ADMIN_PASSWORD` | Senha de acesso ao painel |
| `ADMIN_SECRET` | Chave para assinar o token do cookie (mín. 32 chars) |

---

## Estrutura de rotas

```
/admin                         → redirect para /admin/cache
/admin/login                   → formulário de senha
/admin/cache                   → gestão do Redis
/admin/seed                    → seed manual de rodadas CBF
/admin/clubs                   → visualização e edição de clubes
/admin/logs                    → sugestões e identidades
```

**API interna do admin:**

```
/api/admin/cache/keys          → lista chaves Redis com TTL
/api/admin/cache/bust          → expira chaves por padrão
/api/admin/cache/view          → retorna payload de uma chave
/api/admin/seed/status         → status geral do cache (todas as categorias)
/api/admin/seed/run            → executa seed por categoria (SSE stream)
/api/admin/clubs/validate      → valida ID externo de um clube
/api/admin/clubs/save          → persiste alteração no clubs.json
/api/admin/logs/suggestions    → lê lista de sugestões do Redis
/api/admin/logs/identities     → conta e lista identidades do Redis
```

Todos os endpoints `/api/admin/*` verificam o cookie `sc_admin` — retornam 401 se ausente ou inválido.

---

## Seções

### `/admin/cache` — Gestão do Redis

Painel principal. Substitui os endpoints `/api/debug/*` existentes.

**Visualização de chaves:**

| Coluna | Detalhe |
|--------|---------|
| Chave | Nome completo da chave Redis |
| TTL | Tempo restante em formato legível (ex: "4h 32min") ou "Permanente" |
| Tamanho | Bytes do payload armazenado |
| Ação | Botões: Visualizar · Expirar |

Chaves agrupadas por categoria:
- **Fixtures** — `fixtures:*`
- **Resultados** — `finished:*`
- **CONMEBOL** — `conmebol:tournament:*`
- **Standings** — `standings:*`
- **H2H / Form / Players** — `h2h:*`, `form:*`, `players:*`
- **CBF Rounds** — `cbf:round:*`
- **Broadcasters** — `broadcasters:*`

**Ações rápidas (botões com confirmação):**

| Ação | O que faz |
|------|-----------|
| Bust Fixtures | Expira todas as chaves `fixtures:*` |
| Bust CONMEBOL | Expira `conmebol:tournament:15` e `conmebol:tournament:104` |
| Bust Standings | Expira todas as chaves `standings:*` |
| Bust Tudo | Expira todas as chaves de cache (com modal de confirmação) |
| Force Refresh | Chama o endpoint correspondente com `force=1` e exibe resposta |

**Ações de re-seed (botões com confirmação + log SSE):**

Cada botão apaga as chaves da categoria e re-popula a partir das APIs externas,
equivalente a `npm run seed:<categoria> -- --reset`. O progresso é exibido em
tempo real via SSE no terminal simulado ao lado.

| Botão | Equivalente CLI | Chaves afetadas |
|-------|----------------|-----------------|
| Seed Fixtures | `seed:fixtures -- --reset` | `fixtures:*` |
| Seed Form | `seed:form -- --reset` | `form:*` |
| Seed Resultados | `seed:past-results -- --reset` | `finished:*`, `conmebol:tournament:*` |
| Seed Rodadas CBF | `seed:cbf -- --reset` | `cbf:round:*` |
| **Seed Tudo** | `seed:all -- --reset` | todas acima (com modal de confirmação) |

Botões individuais permitem re-sedar só a categoria problemática sem tocar no resto.

**Visualizador de payload:**
- Botão "Visualizar" expande o JSON armazenado na chave inline
- Syntax highlight básico (sem dependência externa — `<pre>` com Tailwind)

---

### `/admin/seed` — Aquecimento de Cache

Interface para os scripts `seed:*` — substitui o CLI para operações de manutenção.

**Painel de status geral:**

Cards por categoria mostrando estado atual do Redis:

| Categoria | Indicador |
|-----------|-----------|
| Fixtures | 4 chaves — TTL médio restante |
| Form | N/20 chaves presentes — TTL médio |
| Resultados | N chaves `finished:*` + status CONMEBOL |
| Rodadas CBF | N/38 rodadas no Redis — quantas permanentes |

**Ações de seed por categoria:**

Cada categoria tem um botão **"Re-seed"** (com confirmação) que:
1. Apaga as chaves da categoria via pipeline Redis
2. Re-fetcha da API externa
3. Exibe progresso em tempo real via SSE no terminal simulado

| Botão | Script equivalente |
|-------|--------------------|
| Re-seed Fixtures | `seed:fixtures -- --reset` |
| Re-seed Form | `seed:form -- --reset` |
| Re-seed Resultados | `seed:past-results -- --reset` |
| Re-seed Rodadas CBF | `seed:cbf -- --reset` |
| **Re-seed Tudo** | `seed:all -- --reset` (modal de confirmação adicional) |

**Formulário avançado (Rodadas CBF):**

| Campo | Tipo | Detalhe |
|-------|------|---------|
| Rodada | Number input | Seed de uma rodada específica |
| Intervalo | De / Até | Seed de múltiplas rodadas em sequência |
| Force | Checkbox | Sobrescreve dados já existentes |

**Log em tempo real:**
- Output via Server-Sent Events (SSE) exibido num terminal simulado
- Mostra progresso item a item, ícones de status (✓ ◎ ⚠ ✗) e resumo final
- Log persistido na sessão até novo seed ser executado

---

### `/admin/clubs` — Visualização de Clubes

Visualização e edição dos dados de `src/data/clubs.json`.

**Lista de clubes:**
- Cards com nome, shortName, cidade, stadium
- IDs externos: `apiFootballId`, `cbfId`, `conmebolId`
- Indicador visual de IDs ausentes (`null`)

**Edição de IDs:**
- Campos editáveis para `apiFootballId`, `cbfId`, `conmebolId` — os mais propensos a erro manual
- Botão "Validar" faz chamada teste à API-Football com o ID informado antes de salvar
- Salvar persiste no `clubs.json` via Server Action (escrita de arquivo no servidor)

**Escopo intencional:**
- Cores e dados visuais (`colors`, `textOnPrimary`) não são editáveis aqui — alteração eventual é via código
- Não há CRUD de clubes — adicionar ou remover um clube é operação de código

---

### `/admin/logs` — Sugestões e Identidades

Visibilidade sobre dados de usuários sem acessar o Upstash console.

**Sugestões:**
- Lista das últimas 50 entradas de `suggestions` (LRANGE)
- Colunas: data/hora, IP mascarado (últimos 3 octetos omitidos), texto
- Botão para limpar a lista (com confirmação)

**Identidades:**
- Contagem total de chaves `identity:*`
- Últimas 20 entradas: email mascarado (`j***@gmail.com`), data do primeiro registro, data do último acesso
- Sem exibição de IP ou email completo — apenas para contagem e diagnóstico

**Rate limit:**
- Status atual do limiter de sugestões (requests usados / limite por janela)

---

## Layout da interface

```
┌─────────────────────────────────────────────────────┐
│  Admin · Resenha Pré-Jogo            [Sair]         │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│  Cache   │  Conteúdo da seção ativa                 │
│  Seed    │                                          │
│  Clubs   │                                          │
│  Logs    │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

- Sidebar fixa, 200px
- Dark theme — zinc palette, mesmo design system do app
- Sem JavaScript de framework no admin — Server Components + Server Actions + formulários nativos
- Mobile não é prioridade (ferramenta interna de desktop)

---

## Arquivos a criar

```
src/app/admin/
  layout.tsx                   # sidebar + verificação de auth
  page.tsx                     # redirect para /admin/cache
  login/
    page.tsx                   # formulário de senha
  cache/
    page.tsx
  seed/
    page.tsx
  clubs/
    page.tsx
  logs/
    page.tsx

src/app/api/admin/
  cache/
    keys/route.ts
    bust/route.ts
    view/route.ts
  seed/
    status/route.ts            # status de todas as categorias
    run/route.ts               # SSE — aceita ?category=all|fixtures|form|past|cbf
  clubs/
    validate/route.ts
    save/route.ts
  logs/
    suggestions/route.ts
    identities/route.ts

src/lib/adminAuth.ts           # verifyAdminCookie(), signAdminToken()
src/middleware.ts              # adicionar proteção de /admin/*
```

---

## Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `src/middleware.ts` | Adicionar guard para `/admin/*` |
| `.env.local` / `.env.example` | Adicionar `ADMIN_PASSWORD`, `ADMIN_SECRET` |

---

## O que não entra nesta fase

- Editor de competições (`competitions.ts` muda raramente — CLI é suficiente)
- Métricas de performance (cobertas pelo Vercel Analytics + Sentry)
- Gestão de usuários (não há multiusuário)
- Deploy ou CI/CD via painel

---

## Ordem de implementação

```
1. Auth (base de tudo)
   └─ middleware.ts + /admin/login + adminAuth.ts

2. Cache (maior valor imediato — substitui /api/debug/*)
   └─ listagem de chaves + bust + visualizador

3. Seed (substitui CLI, adiciona visibilidade de status)
   └─ tabela de status + formulário + SSE log

4. Logs (leitura simples do Redis)
   └─ sugestões + identidades

5. Clubs (mais complexo — validação de IDs externos)
   └─ lista + edição + validação API-Football
```

---

*Planejamento interno — Resenha Pré-Jogo | abril 2026*
