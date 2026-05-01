# System Overview — Resenha Pré-Jogo

> Engenharia reversa completa do sistema. Referência para onboarding e decisões arquiteturais.

---

## Índice

1. [Stack e Dependências](#1-stack-e-dependências)
2. [Arquitetura](#2-arquitetura)
3. [Fluxo de Dados](#3-fluxo-de-dados)
4. [Regras de Negócio](#4-regras-de-negócio)
5. [Modelagem de Dados (Redis)](#5-modelagem-de-dados-redis)
6. [Segurança](#6-segurança)
7. [Padrões de Código](#7-padrões-de-código)
8. [Problemas e Riscos](#8-problemas-e-riscos)
9. [Sugestões de Melhoria](#9-sugestões-de-melhoria)
10. [Onboarding — Resumo Executivo](#10-onboarding--resumo-executivo)

---

## 1. Stack e Dependências

### Runtime e Framework

| Tecnologia | Versão | Papel |
|---|---|---|
| Next.js | 16.2.1 | Framework full-stack (App Router) |
| React | 19.2.4 | UI runtime |
| TypeScript | ^5 | Linguagem |
| Node.js | LTS | Runtime serverless (Vercel) |
| Tailwind CSS | ^4 | Estilização utility-first |

### Serviços Externos

| Serviço | Lib | Papel |
|---|---|---|
| Upstash Redis | `@upstash/redis ^1.37` | Cache distribuído + banco de dados único |
| Upstash Ratelimit | `@upstash/ratelimit ^2.0` | Rate limiting sliding window |
| Google Gemini 2.5 Flash | `@google/genai ^1.47` | Descoberta de transmissores (AI + Google Search) |
| Resend | `^6.12.2` | Envio transacional de emails |
| Vercel | — | Deploy, Edge CDN, Analytics |
| Sentry | `@sentry/nextjs ^10.47` | Error tracking client + server |
| Microsoft Clarity | — | Heatmaps e session replay |
| Vercel Analytics | `@vercel/analytics ^2.0` | Page views e Web Vitals |

### Autenticação e Segurança

| Lib | Papel |
|---|---|
| `jose ^6.2.2` | JWT sign/verify (HS256) |
| `bcryptjs ^3.0.3` | Hash de senhas (bcrypt, cost 10) |
| `nanoid ^5.1.9` | Geração de códigos de convite do bolão |

### Processamento de Documentos

| Lib | Papel |
|---|---|
| `unpdf ^1.4.0` | Parse de PDFs da CBF (súmulas e boletins financeiros) |

### Testes e DX

| Lib | Papel |
|---|---|
| `@playwright/test ^1.59.1` | Testes E2E |
| `serwist ^9.5.7` | Service Worker / PWA |
| `tsx ^4.21.0` | Execução de scripts TypeScript (seeds) |

### APIs Externas (sem SDK)

| API | URL Base | Autenticação | Uso |
|---|---|---|---|
| API-Football v3 | `https://v3.football.api-sports.io` | Header `x-apisports-key` | Fixtures, standings, form, H2H, lineups |
| CBF | `https://gweb.cbf.com.br/api/site/v1` | Bearer token hardcoded público | Brasileirão — dados ricos de jogo |
| CONMEBOL | `https://gol.conmebol.com` | Pública (sem auth) | Libertadores e Sul-Americana |

---

## 2. Arquitetura

### Tipo

Arquitetura em **camadas informal** — sem Clean Architecture ou Hexagonal formais, mas com separação consistente e deliberada.

```
┌─────────────────────────────────────────────────────────┐
│  Presentation     src/app/  (páginas, route handlers)   │
├─────────────────────────────────────────────────────────┤
│  Components       src/components/  (UI React, client)   │
├─────────────────────────────────────────────────────────┤
│  Application      src/lib/  (lógica de negócio, APIs)   │
├─────────────────────────────────────────────────────────┤
│  Data             src/data/  (estáticos, tipos)         │
├─────────────────────────────────────────────────────────┤
│  Infrastructure   redisCache.ts, auth.ts                │
└─────────────────────────────────────────────────────────┘
```

### Modelo de Renderização

| Camada | Tipo | O que faz |
|---|---|---|
| `layout.tsx`, `page.tsx` | Server Components | Entrega shell HTML, metadados, fonts |
| Todos os componentes interativos | Client Components (`'use client'`) | Fetch de dados, estado, interação |
| `/api/*` route handlers | Server-side Node.js | Acesso a Redis e APIs externas |

**Consequência prática:** o servidor entrega o shell rapidamente; toda a carga de dados acontece no cliente contra as próprias route handlers. Não há RSC data fetching direto.

### Estrutura de Pastas

```
src/
├── app/
│   ├── page.tsx              ← Server Component: shell estático
│   ├── layout.tsx            ← Providers: Auth, Theme, PWA, Analytics
│   ├── api/
│   │   ├── auth/             ← Autenticação própria (login, register, forgot, reset)
│   │   ├── fixtures/         ← Jogos futuros das 4 competições
│   │   ├── past-fixtures/    ← Resultados Série A (CBF)
│   │   ├── past-results/     ← Resultados outras competições
│   │   ├── previews/         ← Batch: form + transmissores
│   │   ├── standings/        ← Classificação
│   │   ├── round/            ← Rodada atual
│   │   ├── h2h/              ← Confrontos diretos
│   │   ├── lineups/          ← Escalações
│   │   ├── match-events/     ← Eventos de gol
│   │   ├── cbf/              ← Dados CBF (match, match-docs, raw)
│   │   ├── copa/             ← Copa do Mundo 2026
│   │   ├── copa-bracket/     ← Chaveamento da Copa
│   │   ├── bolao/            ← CRUD bolão, palpites, ranking, scoring cron
│   │   ├── social/           ← Posts, likes, follows, perfis
│   │   ├── identity/         ← Registro anônimo via email
│   │   ├── suggestions/      ← Feedback
│   │   ├── palpites/         ← Palpites do usuário autenticado
│   │   ├── admin/            ← Bust de cache, cron de documentos
│   │   └── debug/            ← Diagnóstico de fixtures, teams, broadcast
│   ├── bolao/                ← Páginas do bolão
│   ├── copa-2026/            ← Página da Copa 2026
│   └── [auth pages]/         ← login, esqueci-senha, reset-senha
│
├── components/
│   ├── MatchSection.tsx      ← Componente central da página principal (675 linhas)
│   ├── MatchCard.tsx         ← Card de jogo (futuro ou resultado)
│   ├── ThemeProvider.tsx     ← Context de clube e tema CSS
│   ├── [modais root]/        ← Standings, Round, ClubSelector, Onboarding, Email
│   ├── bolao/                ← UI do bolão (cards, ranking, palpites)
│   ├── copa/                 ← UI da copa (bracket, grupos, countdown)
│   └── social/               ← Feed social (Auth, Posts, Profile, Drawer)
│
├── lib/
│   ├── types.ts              ← Todos os tipos TypeScript centrais
│   ├── redisCache.ts         ← Wrapper Redis (getCache, setCache, setCachePermanent)
│   ├── auth.ts               ← JWT + session store Redis
│   ├── adminAuth.ts          ← Validação de token admin (timingSafeEqual)
│   ├── apiFootball.ts        ← Client API-Football + cache
│   ├── cbfApi.ts             ← Client CBF + cache adaptativo por status
│   ├── conmebolApi.ts        ← Client CONMEBOL + stale-while-error
│   ├── broadcasterSearch.ts  ← Gemini 2.5 Flash + Google Search
│   ├── bolaoRedis.ts         ← Domínio completo do bolão
│   ├── socialRedis.ts        ← Domínio completo do feed social
│   ├── matchDataSource.ts    ← Discriminador CBF vs API-Football por leagueId
│   ├── userIdentity.ts       ← Identidade anônima (sc_uid)
│   ├── passwordUtils.ts      ← bcrypt hash/verify
│   ├── rateLimiter.ts        ← Instâncias Upstash Ratelimit
│   ├── email.ts              ← Envio via Resend
│   ├── matchConstants.ts     ← LIVE_WINDOW_MS (compartilhado server/client)
│   └── localiseRound.ts      ← Tradução de rounds API-Football → pt-BR
│
└── data/
    ├── competitions.ts       ← Registro central das 5 competições
    ├── clubs.json            ← 20 clubes com IDs multi-sistema
    └── match-docs.json       ← Documentos CBF pré-parseados (PDFs offline)
```

### Padrões de Design

| Padrão | Arquivo | Descrição |
|---|---|---|
| **Registry** | `competitions.ts` | Fonte de verdade de todas as competições; discrimina toda a stack |
| **Strategy** | `matchDataSource.ts` | Seleciona CBF ou API-Football via `leagueId` |
| **Repository** | `bolaoRedis.ts`, `socialRedis.ts` | Encapsulam acesso ao Redis por domínio |
| **Facade** | `redisCache.ts` | Esconde complexidade do Upstash SDK, falhas silenciosas |
| **Stale-while-error** | `cbfApi.ts`, `conmebolApi.ts` | Dupla chave primária + stale no Redis |
| **Fan-out on write** | `socialRedis.ts:createPost` | Distribui post para feeds dos seguidores na escrita |
| **Pipeline** | `bolaoRedis.ts`, `socialRedis.ts` | Escritas multi-chave atômicas no Redis |
| **Provider** | `ThemeProvider`, `AuthProvider` | Contextos React globais na árvore de layout |
| **Lookup Map** | `MatchSection.tsx`, `apiFootball.ts` | Maps pré-computados no nível de módulo (uma vez) |

---

## 3. Fluxo de Dados

### 3.1 Carregamento Inicial da Página

```
1. GET /
   └── page.tsx (Server Component)
       └── Renderiza shell estático HTML + inicia providers

2. Browser hydrata:
   └── ThemeProvider → lê localStorage ('resenha-prejogo:club')
       ├── Clube salvo → aplica tema (CSS vars em :root)
       └── Sem clube → clubs[0] como padrão

3. MatchSection (Client Component) monta:
   └── useEffect (uma vez, via fixturesFetchedRef) → GET /api/fixtures
       └── Route Handler:
           └── Promise.allSettled × 4 competições
               ├── Redis hit → retorna JSON em ~5ms
               └── Redis miss → API-Football → salva Redis 6h → retorna
           └── Merge por slug de clube + sort cronológico
       └── Response: Cache-Control: s-maxage=21600 (Vercel CDN também cacheia)

4. MatchSection deriva:
   ├── upcomingMatches (filtrado pelo clube selecionado)
   ├── upcomingLeagueIds (para pills de filtro por competição)
   └── derivedSerieARound (nº da rodada via regex em match.round)

5. GET /api/previews?ids=id1,id2,...
   └── Para cada fixture (máx 3 Gemini concorrentes):
       ├── getTeamForm() → Redis 6h | API-Football
       └── getBroadcastersForFixture() → Redis | Gemini 2.5 Flash + Google Search
   └── Retorna Record<fixtureId, { homeForm, awayForm, broadcasters }>

6. MatchCard renderiza com dados completos
```

### 3.2 Aba "Resultados" (lazy)

```
1. Usuário clica "Resultados"
   └── pastFetchedRef: false → fetchPastResults(clubId, serieARound)

2. Dois fetches paralelos:
   ├── CBF (roundNum > 1): GET /api/past-fixtures?club=X&beforeRound=N&limit=3
   │   └── getCbfRound(N-i) × 3 → Redis | CBF API (stale-while-error)
   └── Outras: GET /api/past-results?club=X
       ├── CONMEBOL (Lib + Sul-Am) → fonte primária com stale-while-error
       └── API-Football → Copa do Brasil + fallback CONMEBOL

3. mergedResults: combina CBF + API, ordena por dateMs descrescente

4. Render discriminado:
   ├── entry.kind === 'cbf' → cbfToMatch() → MatchCard com cbfMatchDetail
   └── entry.kind === 'api' → MatchCard padrão
       └── isConmebolSource: highlightId usa conmebolId; outros usam apiFootballId
```

### 3.3 Descoberta de Transmissores (Gemini)

```
getBroadcastersForFixture(fixtureId, homeTeam, awayTeam, round, date, competition):
  ├── Redis hit → retorna (TTL 24h se encontrado, 1h se vazio)
  └── Redis miss:
      ├── Gemini 2.5 Flash com tool googleSearch
      │   ├── System: "find ONLY confirmed broadcasters for Brazilian football"
      │   └── User: "Onde assistir: Time A x Time B, Rodada N, data em pt-BR"
      ├── parseBroadcasters: regex extrai JSON do texto, filtra nulls
      ├── 429/quota → retorna [] sem cachear (retry imediato na próxima request)
      └── Salva Redis: TTL_24H (≥1 broadcaster) | TTL_1H (array vazio)
```

### 3.4 Cache em 3 Camadas

```
Request
  │
  ▼
[L1] Next.js unstable_cache
     (in-process, deduplica requests concorrentes na mesma instância)
  │ miss
  ▼
[L2] Upstash Redis
     (distribuído, persiste entre instâncias e cold starts)
  │ miss
  ▼
[L3] API Externa (API-Football / CBF / Gemini / CONMEBOL)
  │
  ▼
Salva em L2 → retorna
```

### 3.5 TTLs por Tipo de Dado

| Dado | Chave Redis | TTL |
|---|---|---|
| Fixtures (4 competições) | `fixtures:{id}:{season}` | 6h |
| Resultados finalizados | `finished:{comp}:{teamId}` | 6h |
| Form do time | `form:{teamId}:{leagueId}:{season}` | 6h |
| H2H | `h2h:{min}-{max}:{leagueId}` | 6h |
| Standings (janela de jogos qua–dom) | `standings:{leagueId}:v2` | 30min |
| Standings (fora da janela) | `standings:{leagueId}:v2` | 3h |
| Transmissores (encontrado) | `broadcasters:{fixtureId}` | 24h |
| Transmissores (vazio) | `broadcasters:{fixtureId}` | 1h |
| CBF rodada finalizada | `cbf:round:{N}` | 30 dias |
| CBF rodada ao vivo | `cbf:round:{N}` | 5min |
| CBF rodada pós-jogo | `cbf:round:{N}` | 10min |
| CBF rodada futura (≤12h) | `cbf:round:{N}` | 1h |
| CBF rodada futura (>48h) | `cbf:round:{N}` | 12h |
| CBF stale (finished) | `cbf:round:{N}:stale` | **permanente** |
| CONMEBOL ao vivo | `conmebol:tournament:{id}` | 5min |
| CONMEBOL pós-jogo | `conmebol:tournament:{id}` | 10min |
| CONMEBOL finalizado | `conmebol:tournament:{id}` | 6h |

### 3.6 Padrão Stale-While-Error (CBF e CONMEBOL)

```
getCbfRound(N) / getConmebolTournament(id):
  ├── Primary Redis hit → retorna
  ├── Primary miss → fetch API
  │     ├── Sucesso → salva primary (TTL dinâmico) + stale → retorna
  │     └── Falha (rede ou HTTP não-2xx)
  │           ├── Stale hit + fetchedAt ≤ 24h → retorna stale
  │           ├── Stale hit + fetchedAt > 24h → descarta, throw Error
  │           └── Stale miss → throw Error
  └── Stale de rodadas finished: permanente (resultados históricos nunca somem)
```

---

## 4. Regras de Negócio

### 4.1 Competições

Definidas em `src/data/competitions.ts` — registro central e única fonte de verdade.

| ID | Nome | API-Football ID | Fonte resultados | Scope | Formato |
|---|---|---|---|---|---|
| `serie-a` | Brasileirão Série A | 71 | CBF + API-Football | club | pontos-corridos |
| `libertadores` | Copa Libertadores | 13 | CONMEBOL + API-Football | club | grupos-mata-mata |
| `copa-brasil` | Copa do Brasil | 73 | API-Football | club | mata-mata |
| `sul-americana` | Copa Sul-Americana | 11 | CONMEBOL + API-Football | club | grupos-mata-mata |
| `world-cup-2026` | Copa do Mundo 2026 | 1 | API-Football | national | grupos-mata-mata |

**Campo discriminador:** `hasCbfData: true` apenas para `serie-a` — determina componente de card, fonte de dados e parser usados em toda a stack.

### 4.2 Fonte de Dados por Competição

```typescript
// src/lib/matchDataSource.ts
function getFinishedMatchSource(leagueId: number): 'cbf' | 'api-football' {
  return leagueId === 71 ? 'cbf' : 'api-football';
}
```

- **CBF** (`leagueId === 71`): escalação completa, gols, cartões, árbitros, documentos PDF
- **API-Football**: placar, estatísticas básicas
- **CONMEBOL**: placar com HT/ET/pênaltis/agregado, vencedor, tempo extra, local neutro

### 4.3 Scoring do Bolão

```typescript
// src/lib/bolaoRedis.ts — calcPts()
placar exato (ex: 2x1 = 2x1)        → 10 pts  (outcome: 'exact')
resultado correto (vitória/empate)    →  5 pts  (outcome: 'correct')
resultado errado                      →  0 pts  (outcome: 'miss')
```

**Idempotência garantida:** `SET score:userId:fixtureId NX` — o cron nunca pontua o mesmo jogo duas vezes para o mesmo usuário.

### 4.4 Janela "Ao Vivo"

```typescript
// src/lib/matchConstants.ts
LIVE_WINDOW_MS = 115 * 60 * 1000  // 90min + 25min buffer (VAR, pênaltis)
```

Usado em dois lugares:
- **Servidor** (`cbfApi.ts`): calcula TTL do cache da rodada
- **Cliente** (`MatchSection.tsx`): filtra fixtures na aba "Próximos Jogos"

Um jogo é "futuro ou ao vivo" enquanto: `Date.now() <= kickoff + LIVE_WINDOW_MS`

### 4.5 Tema Dinâmico por Clube

```typescript
// src/components/ThemeProvider.tsx — applyClubTheme()

// Near-black primary (luminância < 0.05): mistura 60% branco para visibilidade
const onDark = isNearBlack ? mixWithWhite(primary, 0.6) : primary;

// Light secondary (luminância > 0.35): escurece 70% para evitar banda branca no hero
const gradientEnd = secondaryLum > 0.35 ? mixWithBlack(secondary, 0.7) : secondary;
```

Persiste o clube escolhido em `localStorage` com a chave `resenha-prejogo:club`.

### 4.6 Identidade Dupla de Usuário

O sistema tem **dois sistemas de identidade independentes**:

| Cookie | Tipo | Uso |
|---|---|---|
| `sc_uid` | Anônimo (UUID) | Email capture, analytics |
| `sc_auth` | JWT autenticado | Social, bolão, palpites |

**Regra crítica:** O `sc_uid` não deve ser reusado como `userId` ao registrar — múltiplos usuários no mesmo dispositivo colidiriam. O registro sempre gera um `userId` novo via `randomUUID()`.

### 4.7 Recuperação de Senha

- Rate limit: 3 tentativas/hora **por hash do email** (não por IP)
- Resposta sempre `{ ok: true }` independente do email existir — **evita user enumeration**
- Token: 32 bytes random hex, TTL 1h no Redis
- Em falha de envio de email: token órfão é deletado imediatamente

### 4.8 Fan-out Social

```typescript
// src/lib/socialRedis.ts — createPost()
const followerIds = await redis.smembers(`followers:${authorId}`);
// Fan-out síncrono, limitado a 500 seguidores
for (const followerId of followerIds.slice(0, 500)) {
  pipeline.zadd(`feed:${followerId}`, { score: Date.now(), member: postId });
}
// Feed trimado em 500 entradas por usuário
pipeline.zremrangebyrank(`feed:${followerId}`, 0, -(MAX_FEED_SIZE + 1));
```

### 4.9 Validações de Cadastro

| Campo | Regra |
|---|---|
| Email | `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` |
| Username | `/^[a-z0-9_]{3,20}$/` (lowercase, somente letras/números/underscore) |
| Senha | Mínimo 8 caracteres |
| Unicidade | Email e username verificados no Redis antes de criar |

---

## 5. Modelagem de Dados (Redis)

O Redis é o único banco de dados da aplicação — sem PostgreSQL, sem ORM.

### 5.1 Usuários e Sessões

```
user:{userId}              → UserRecord { email, emailHash, ip, createdAt,
                                          username?, displayName?, passwordHash? }
email:{sha256(email)}      → userId
username:{lower}           → userId
session:{jti}              → userId          (TTL 30 dias)
reset:{token}              → { userId }      (TTL 1 hora)
sc_uid cookie              → userId anônimo  (TTL 1 ano, via /api/identity)
```

### 5.2 Bolão e Palpites

```
bolao:{id}:meta                  → BolaoMeta { id, nome, codigo, adminId, criadoEm }
bolao:{id}:members               → Set<userId>
bolao:{id}:ranking               → SortedSet<userId, pts>      ← ZINCRBY
bolao:global:ranking             → SortedSet<userId, pts>      ← ranking geral
bolao:code:{codigo}              → bolaoId                     ← lookup por convite
bolao:user:{userId}:boloes       → Set<bolaoId>

palpite:{userId}:{fixtureId}     → Palpite { home, away, locked, ts }
palpite:fixture:{fixtureId}      → Set<userId>      ← índice para o cron de scoring
palpite:user:{userId}:fixtures   → Set<fixtureId>   ← índice para GET /api/palpites
score:{userId}:{fixtureId}       → Score { pts, outcome }
```

### 5.3 Social

```
post:{id}                     → Post { id, authorId, clubId, content, likeCount, ... }
post:likes:{postId}           → Set<userId>
user:liked:{userId}           → Set<postId>
user:posts:{userId}           → SortedSet<postId, ms>
club:posts:{clubId}           → SortedSet<postId, ms>
feed:{userId}                 → SortedSet<postId, ms>   ← feed pessoal (fan-out)
following:{userId}            → Set<userId>
followers:{userId}            → Set<userId>
```

### 5.4 Cache de Dados Externos

```
fixtures:{competitionId}:{season}       → Match[]
finished:{competitionId}:{teamApiId}    → Match[]
standings:{leagueId}:v2                 → StandingsPayload (inclui ttlSeconds)
form:{teamId}:{leagueId}:{season}       → string[]  ('W'|'D'|'L')
h2h:{min}-{max}:{leagueId}             → H2HData
injuries:v2:{fixtureId}                 → InjuredPlayer[]
players:v2:{teamId}:{leagueId}:{season} → PlayerStat[]
broadcasters:{fixtureId}                → BroadcasterInfo[]
cbf:round:{N}                           → CbfRoundData
cbf:round:{N}:stale                     → CbfRoundData (backup)
cbf:match:{id}:sumula                   → CbfSumulaData (permanente)
cbf:match:{id}:boletim                  → CbfBoletimData (permanente)
cbf:match:{id}:docs:status              → { available: boolean, ts: string }
conmebol:tournament:{id}                → ConmebolTournamentData
conmebol:tournament:{id}:stale          → backup
copa-fixtures:2026                      → CopaFixturesPayload
```

### 5.5 Entidades Principais (TypeScript)

| Entidade | Arquivo | Descrição |
|---|---|---|
| `ClubTheme` | `types.ts` | Clube com IDs multi-sistema (apiFootballId, cbfId, conmebolId) e cores |
| `Match` | `types.ts` | Jogo genérico compatível com todas as fontes |
| `CbfMatchDetail` | `types.ts` | Jogo rico da CBF (escalação, gols, cartões, árbitros, docs) |
| `ConmebolMatchDetail` | `types.ts` | Jogo CONMEBOL (scoreEntries com HT/ET/pên/agg) |
| `UserRecord` | `userIdentity.ts` | Perfil (anônimo ou registrado — campos opcionais) |
| `Post` | `socialRedis.ts` | Postagem no feed social |
| `BolaoMeta` | `bolaoRedis.ts` | Metadados de um bolão |
| `Palpite` | `bolaoRedis.ts` | Palpite de um usuário para um jogo |
| `Competition` | `competitions.ts` | Definição de competição com flags e IDs |

---

## 6. Segurança

### 6.1 Autenticação

| Mecanismo | Detalhe |
|---|---|
| JWT HS256 | jose, expiração 30 dias, cookie `sc_auth` |
| Cookie flags | `httpOnly`, `secure` (produção), `sameSite: strict` |
| Session store | Redis `session:{jti}` → userId (TTL 30 dias) |
| Revogação real | `redis.exists(session:jti)` a cada request autenticado |
| Hash de senha | bcrypt, cost 10 |

### 6.2 Autorização

```typescript
// src/middleware.ts — protege via matcher
matcher: [
  '/api/social/:path*',
  '/api/bolao/((?!global|score).*)',  // regex exclui rotas públicas
  '/api/palpites/:path*',
]
```

- **Admin endpoints**: `timingSafeEqual` para comparação de token Bearer — protege contra timing attacks
- **Cron endpoint** (`/api/bolao/score`): autenticado via `CRON_SECRET` (Bearer header separado)

### 6.3 Proteções Implementadas

| Proteção | Onde |
|---|---|
| User enumeration | `forgot-password`: sempre retorna `{ ok: true }` |
| Timing attack | `timingSafeEqual` em `adminAuth.ts` |
| Dupla pontuação | `SET NX` atômico no cron de scoring |
| Rate limit (sugestões) | 3/hora por IP, sliding window |
| Rate limit (reset senha) | 3/hora por hash do email |
| Validação de input | Email regex, username regex, password length |
| Idempotência do scoring | `NX` no Redis impede dupla contagem |

### 6.4 Vulnerabilidades / Pontos de Atenção

1. **Sem rate limit no login e registro** — `POST /api/auth/login` e `POST /api/auth/register` não têm rate limiter. Expostos a brute force e registro em massa.

2. **Fan-out síncrono em `createPost`** — pipeline de 1000+ comandos Redis para usuários com 500 seguidores pode causar timeout no serverless (limite ~10s Vercel).

3. **`DEBUG_SECRET` ausente não loga aviso** — se não configurado, endpoints admin ficam inacessíveis silenciosamente.

4. **`deletePost` não remove do feed dos seguidores** — posts deletados persistem nos feeds pessoais até expiração natural (TTL 1 ano).

5. **`dangerouslySetInnerHTML` no layout** — Google Analytics e Clarity. Conteúdo vem de env vars (não de input do usuário), mas merece atenção em auditorias.

---

## 7. Padrões de Código

### 7.1 Convenções

- Todos os componentes React interativos têm `'use client'` explícito no topo
- Comentários explicam o **porquê**, nunca o **o quê**
- Tipos de API externa são modelados localmente antes de conversão para tipos internos
- Lookup Maps são pré-computados no nível de módulo (não recriados por render)
- `Promise.allSettled` como padrão em fetches paralelos (tolerância a falhas)
- Redis pipeline para todas as escritas multi-chave

### 7.2 Pontos Fortes

**Registro central de competições** — adicionar uma nova competição é apenas adicionar uma entrada em `competitions.ts`. O campo `hasCbfData` propaga automaticamente para componentes, fontes de dados e parsers.

**`ttlSeconds` embutido no payload** — evita inconsistência de `Cache-Control` entre cache hit e miss. O valor calculado na escrita é reutilizado em todas as leituras subsequentes.

**Constante `LIVE_WINDOW_MS` compartilhada** — definida em `matchConstants.ts` e importada tanto no servidor quanto no cliente. Garante que a janela de "ao vivo" seja idêntica para cache e para UI.

**Wrapper Redis com falhas silenciosas** — erros de escrita em cache não quebram a request do usuário. Erros de leitura retornam `null` e o código segue para a fonte primária.

### 7.3 Pontos Fracos

**`MatchSection.tsx` supercarregado** — 675 linhas, 13 `useState`, 3 `useRef`, 5 `useEffect`. A complexidade reflete casos de borda reais (round number chega após tab aberta), mas dificulta manutenção.

**`eslint-disable react-hooks/exhaustive-deps` em 4 lugares** — necessário em cada caso, mas indica dependências circulares no modelo de estado.

**`UserRecord` mistura anônimo e registrado** — campos opcionais (`username?`, `passwordHash?`) mascaram diferença semântica entre dois tipos de usuário.

**`CHAMPIONSHIP_ID` duplicado** — `cbfApi.ts` define `1260611` hardcoded; `competitions.ts` também tem `cbfChampionshipId: 1260611`. Podem divergir na virada de temporada.

**`cbfToMatch()` no componente de UI** — função de conversão de domínio vive em `MatchSection.tsx` em vez de em `src/lib/`.

---

## 8. Problemas e Riscos

### Alta Prioridade

**Redis como único banco sem fallback**
Usuários, palpites, bolões e posts vivem exclusivamente no Upstash Redis. Não há banco secundário ou backup explícito. Perda de dados = perda total de contas e histórico.

**Sem rate limit no login**
`POST /api/auth/login` não tem proteção contra brute force. Credenciais válidas podem ser quebradas por força bruta sem limitação.

**Fan-out síncrono pode causar timeout**
`createPost` envia pipeline de até 1000 comandos Redis dentro do request HTTP. Em Vercel serverless (timeout ~10s), usuários com muitos seguidores podem receber erro 504.

### Média Prioridade

**`deletePost` incompleto**
Posts deletados somem da `club:posts:*` e `user:posts:*`, mas **não** do `feed:{followerId}`. Seguidores continuam vendo o post até o TTL de 1 ano expirar.

**Round number derivado via regex frágil**
```typescript
// MatchSection.tsx:278
(rawFixtures.find(m => m.leagueId === 71)?.round ?? '').match(/(\d+)/)?.[1]
```
Se a API retornar formato diferente de `"Rodada N"`, `serieARound` será 0 e o histórico CBF não carregará.

**`leagueId === 71` hardcoded em múltiplos arquivos**
Aparece em `MatchSection.tsx`, `matchDataSource.ts`, `apiFootball.ts`, standings route. Deveria usar `SERIE_A.apiFootballLeagueId`.

### Baixa Prioridade

**Import de tipo entre route handlers**
`/api/bolao/score/route.ts` importa `CopaFixturesPayload` de `/api/copa/fixtures/route.ts`. Esse tipo deveria estar em `src/lib/types.ts`.

**`cbfApi.ts` não usa `competitions.ts`**
`CHAMPIONSHIP_ID = 1260611` hardcoded duplica `SERIE_A.cbfChampionshipId`.

---

## 9. Sugestões de Melhoria

### Arquitetura

**Extrair `cbfToMatch` para `src/lib/`**
Função de conversão de domínio vive em componente de UI. Mover para `lib/cbfApi.ts` ou `lib/matchDataSource.ts`.

**Separar `UserRecord` em dois tipos**
```typescript
type AnonymousUser  = { email: string; emailHash: string; ip: string; ... }
type RegisteredUser = AnonymousUser & { username: string; passwordHash: string; ... }
```

**Centralizar `leagueId` checks**
Substituir comparações `=== 71` por `=== SERIE_A.apiFootballLeagueId` em todo o codebase.

**`cbfApi.ts` consumir `SERIE_A.cbfChampionshipId`**
Remove duplicação e garante virada de temporada como ponto único de mudança.

**`CopaFixturesPayload` mover para `types.ts`**
Elimina acoplamento entre route handlers.

### Segurança

**Adicionar rate limiter no login e registro**
```typescript
// Sugestão: 5 tentativas / 15min por IP
export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:login',
});
```

**Validar secrets críticos no startup**
Adicionar health check que logue erro se `JWT_SECRET`, `CRON_SECRET` ou `DEBUG_SECRET` estiverem ausentes em produção.

### Performance

**Fan-out assíncrono para o social**
Enfileirar distribuição do post via Vercel Cron ou background job. Evita timeout para usuários com muitos seguidores.

**Decompor `MatchSection` em hooks**
Extrair `useScheduleData()` e `usePastResults()` — reduz complexidade e permite testes unitários de lógica de estado.

**Preload de tema via cookie no Server Component**
Um cookie com `clubId` lido em `layout.tsx` permite pré-aplicar CSS vars no servidor — elimina o flash de tema padrão antes da hydration.

### DX

**Completar `deletePost`**
Adicionar remoção dos feeds dos seguidores no pipeline de deleção (ou documentar explicitamente que é comportamento intencional do MVP).

**Documentar `score` endpoint como cron-only**
O `POST /api/bolao/score` autentica via `CRON_SECRET` mas a documentação não menciona como configurar o cron no Vercel.

---

## 10. Onboarding — Resumo Executivo

**O que é:** PWA de futebol brasileiro. O usuário escolhe um clube e vê jogos futuros (com onde assistir e forma dos times), resultados passados, classificação, e pode participar de um bolão de palpites e de um feed social experimental.

### O que é incomum (leia antes de mexer)

**1. Redis é o único banco de dados**
Não há PostgreSQL, Prisma, ORM. Usuários, sessões, palpites, rankings e posts vivem exclusivamente no Upstash Redis com TTLs de 1 ano. Não há migração de schema — mudanças de estrutura são tratadas por versionamento de chave (ex: `h2h:v2:...`).

**2. Dois sistemas de identidade coexistem**
`sc_uid` (cookie anônimo para email capture) e `sc_auth` (JWT para features autenticadas) são **independentes**. Nunca reutilize `sc_uid` como `userId` ao registrar — há comentário explícito no código.

**3. Três fontes de dados para jogos**
- **CBF** (`leagueId 71`): escalação completa, gols, cartões, árbitros, PDFs oficiais
- **CONMEBOL** (`leagueId 13, 11`): placares com HT/ET/pênaltis/agregado
- **API-Football** (demais): dados básicos e fallback

O campo `hasCbfData` em `competitions.ts` e a função `getFinishedMatchSource(leagueId)` são os discriminadores centrais de toda a lógica de dados.

**4. Cache adaptativo com stale-while-error**
CBF e CONMEBOL têm dupla chave Redis (`cbf:round:N` + `cbf:round:N:stale`). TTL muda dinamicamente por status inferido: `live` → 5min, `finished` → permanente. Se a API falhar, o sistema serve stale (máx 24h antes de dar erro).

**5. Gemini descobre transmissores**
Cada jogo futuro chama Gemini 2.5 Flash com Google Search para descobrir canais. Cache de 24h (ou 1h se vazio). Quota esgotada retorna `[]` sem quebrar a página.

**6. `MatchSection.tsx` é o componente mais crítico**
675 linhas, orquestra todo o fluxo de dados da página principal. É onde a maioria dos bugs de UI aparece. Ler antes de qualquer mudança na página principal.

### Caminho de onboarding recomendado

```
1. src/data/competitions.ts          ← entenda os 5 registros e os campos
2. src/lib/apiFootball.ts            ← veja como fixtures são buscados e mapeados
3. src/app/api/fixtures/route.ts     ← veja o merge das 4 competições
4. src/components/MatchSection.tsx   ← veja como o cliente consome e renderiza
5. src/lib/cbfApi.ts                 ← veja o cache adaptativo (o mais complexo)
6. src/lib/bolaoRedis.ts             ← entenda a estrutura Redis do bolão
```
