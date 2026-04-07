# Arquitetura Técnica

## Visão geral

```
                    ┌─────────────┐
                    │   Browser   │
                    │  (React 19) │
                    └──────┬──────┘
                           │ HTTPS
                    ┌──────▼──────┐
                    │   Vercel    │
                    │  Edge/Node  │
                    │ Next.js 16  │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼─────┐ ┌───▼────┐ ┌────▼──────────┐
       │  Upstash   │ │API-    │ │  CBF API       │
       │   Redis    │ │Football│ │  gweb.cbf.com.br│
       └────────────┘ └────────┘ └────────────────┘
                                        │
                               ┌────────▼────────┐
                               │  Google Gemini  │
                               │  + Google Search│
                               └─────────────────┘
```

---

## Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js App Router | 16.2.1 |
| UI Runtime | React | 19.2.4 |
| Linguagem | TypeScript | 5.x |
| Estilização | Tailwind CSS | 4.x |
| Deploy | Vercel | — |
| Cache distribuído | Upstash Redis | @upstash/redis ^1.37 |
| Rate limiting | Upstash Ratelimit | @upstash/ratelimit ^2.0 |
| IA | Google Gemini 2.5 Flash | @google/genai ^1.47 |
| Monitoramento | Sentry | @sentry/nextjs ^10.47 |
| Analytics | Vercel Analytics | @vercel/analytics ^2.0 |

---

## Estrutura de pastas

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Página principal (/)
│   ├── layout.tsx          # Root layout, metadata, fonts
│   ├── global-error.tsx    # Error boundary global
│   ├── opengraph-image.tsx # OG image dinâmico
│   ├── robots.ts           # robots.txt
│   ├── sitemap.ts          # sitemap.xml
│   └── api/                # Route handlers (REST API)
│       ├── fixtures/
│       ├── previews/
│       ├── broadcasters/
│       ├── form/
│       ├── h2h/
│       ├── standings/
│       ├── players/
│       ├── past-fixtures/
│       ├── round/
│       ├── cbf/
│       │   ├── round/[round]/
│       │   └── match/
│       ├── identity/
│       └── suggestions/
│
├── components/             # Componentes React (todos Client Components)
│   ├── MatchSection.tsx    # Container principal de fixtures
│   ├── MatchCard.tsx       # Card de jogo futuro
│   ├── ResultCard.tsx      # Card de jogo encerrado
│   ├── RoundModal.tsx      # Modal da rodada atual
│   ├── StandingsModal.tsx  # Modal de classificação
│   ├── ClubSelector.tsx    # Modal de seleção de clube
│   ├── ThemeProvider.tsx   # Context de tema/clube
│   ├── HeroClubName.tsx    # Header com nome do clube
│   ├── InitialLoader.tsx   # Skeleton durante hydration
│   ├── OnboardingModal.tsx # Modal de boas-vindas
│   ├── EmailCaptureModal.tsx
│   └── SuggestionModal.tsx
│
├── lib/                    # Lógica de negócio e integrações
│   ├── types.ts            # Tipos TypeScript centrais
│   ├── redisCache.ts       # Wrapper Upstash Redis
│   ├── cbfApi.ts           # Client CBF API + cache strategy
│   ├── apiFootball.ts      # Client API-Football + cache
│   ├── broadcasterSearch.ts# Gemini + Google Search
│   ├── teamForm.ts         # Form dos times
│   ├── userIdentity.ts     # Registro de usuário
│   ├── rateLimiter.ts      # Rate limiting Upstash
│   ├── matchConstants.ts   # LIVE_WINDOW_MS e outras constantes
│   └── useFocusTrap.ts     # Hook de acessibilidade (modais)
│
└── data/
    └── clubs.json          # Dados estáticos dos 20 clubes
```

---

## Fluxo de dados principal

### Carregamento inicial

```
1. Browser → GET /
   └── page.tsx renderiza shell + ThemeProvider + MatchSection

2. Client hydrates → ThemeProvider lê localStorage → aplica tema CSS

3. MatchSection → GET /api/fixtures
   └── Redis hit? → retorna | miss → API-Football → salva Redis → retorna

4. MatchSection → GET /api/previews?ids=...
   └── Para cada fixture em paralelo:
       ├── getTeamForm() → Redis | API-Football
       └── getBroadcastersForFixture() → Redis | Gemini+Search

5. Render: MatchCard[] com dados completos
```

### Aba Resultados (lazy)

```
6. User clica "Resultados"
   └── MatchSection → GET /api/past-fixtures?club=X&beforeRound=N&limit=3

7. Para cada rodada:
   └── getCbfRound(N) → Redis primary | Redis stale | CBF API

8. Render: ResultCard[] com dados oficiais
```

---

## Modelo de renderização

**Server Components:** `layout.tsx`, `page.tsx` — carregam assets, metadados e estrutura

**Client Components:** todos os componentes interativos — marcados com `'use client'`

**Route Handlers:** todos os `/api/*` — server-side, acesso a Redis e APIs externas

**Edge Runtime:** não usado atualmente — todos os handlers rodam em Node.js runtime

---

## Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `API_FOOTBALL_KEY` | Autenticação API-Football v3 |
| `GEMINI_API_KEY` | Google Gemini (transmissões) |
| `UPSTASH_REDIS_REST_URL` | Endpoint Redis Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Token Redis Upstash |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Microsoft Clarity (analytics) |
| `NEXT_PUBLIC_BASE_URL` | URL base da aplicação |
| `SENTRY_DSN` | Sentry error tracking |

---

## Monitoramento

| Sistema | O que captura |
|---------|--------------|
| Sentry | Erros JavaScript (client + server), exceções em route handlers |
| Vercel Analytics | Page views, Web Vitals |
| Microsoft Clarity | Heatmaps, session replay, rage clicks |
