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
| Ícones | Heroicons | @heroicons/react ^2.2 |

---

## Estrutura de pastas

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Página principal (/)
│   ├── layout.tsx          # Root layout, metadata, fonts
│   ├── global-error.tsx    # Error boundary global (App Router — não usa next/document)
│   ├── opengraph-image.tsx # OG image dinâmico
│   ├── robots.ts           # robots.txt
│   ├── sitemap.ts          # sitemap.xml
│   └── api/                # Route handlers (REST API)
│       ├── fixtures/       # Multi-competição: Série A, Libertadores, Copa BR, Sul-Am
│       ├── previews/       # Batch form + broadcasters (até 20 IDs)
│       ├── h2h/            # Cache key unificado sem leagueId
│       ├── standings/      # Série A + Libertadores (grupos); Copa do Brasil excluída
│       ├── players/
│       ├── past-fixtures/  # Resultados Série A via CBF
│       ├── past-results/   # Resultados outras competições via API-Football
│       ├── round/          # Visão da rodada atual por competição
│       ├── cbf/
│       │   ├── round/[round]/
│       │   └── match/
│       ├── debug/fixtures/ # Diagnóstico do pipeline de fixtures
│       ├── identity/
│       └── suggestions/
│
├── components/             # Componentes React (todos Client Components)
│   ├── MatchSection.tsx    # Container principal: abas, pills unificados, merge de resultados
│   ├── MatchCard.tsx       # Card de jogo futuro (Série A: CBF ficha; outras: NonCbfFichaContent)
│   ├── ResultCard.tsx      # Card de resultado Brasileirão (dados CBF completos)
│   ├── SimpleResultCard.tsx# Card de resultado outras competições (dados API-Football)
│   ├── RoundModal.tsx      # Modal da rodada atual (todas as competições de clube)
│   ├── StandingsModal.tsx  # Modal de classificação (Série A + Libertadores; sem Copa do Brasil)
│   ├── ClubSelector.tsx    # Modal de seleção de clube
│   ├── ThemeProvider.tsx   # Context de tema/clube
│   ├── HeroClubName.tsx    # Header com nome do clube
│   ├── InitialLoader.tsx   # Skeleton durante hydration
│   ├── OnboardingModal.tsx # Modal de boas-vindas
│   ├── EmailCaptureModal.tsx
│   ├── SuggestionModal.tsx
│   └── SoccerBallIcon.tsx  # Ícone SVG de bola de futebol
│
├── lib/                    # Lógica de negócio e integrações
│   ├── types.ts            # Tipos TypeScript centrais
│   ├── redisCache.ts       # Wrapper Upstash Redis
│   ├── cbfApi.ts           # Client CBF API + cache strategy
│   ├── apiFootball.ts      # Client API-Football + cache
│   ├── broadcasterSearch.ts# Gemini + Google Search (parametrizado por competição)
│   ├── broadcasterColors.ts# Mapa broadcaster → cor de badge (compartilhado)
│   ├── teamForm.ts         # Form dos times
│   ├── localiseRound.ts    # Tradução de strings de rodada API-Football → português
│   ├── matchDataSource.ts  # Abstração de fonte de dados por competição
│   ├── matchConstants.ts   # LIVE_WINDOW_MS e outras constantes
│   ├── userIdentity.ts     # Registro de usuário
│   ├── rateLimiter.ts      # Rate limiting Upstash
│   └── useFocusTrap.ts     # Hook de acessibilidade (modais)
│
└── data/
    ├── clubs.json          # Dados estáticos dos 20 clubes
    └── competitions.ts     # Registro central das 5 competições (4 clube + Copa 2026)
```

---

## Competições suportadas

Definidas em `src/data/competitions.ts`:

| ID | Nome | API-Football ID | Fonte resultados | Escopo | Formato |
|----|------|----------------|-----------------|--------|---------|
| `serie-a` | Brasileirão Série A | 71 | CBF + API-Football | club | pontos-corridos |
| `libertadores` | Copa Libertadores | 13 | API-Football | club | grupos-mata-mata |
| `copa-brasil` | Copa do Brasil | 73 | API-Football | club | mata-mata |
| `sul-americana` | Copa Sul-Americana | 11 | API-Football | club | grupos-mata-mata |
| `world-cup-2026` | Copa do Mundo 2026 | 1 | API-Football | national | grupos-mata-mata |

`hasCbfData: true` apenas para `serie-a` — determina qual componente de ficha/resultado é usado.

---

## Fluxo de dados principal

### Carregamento inicial

```
1. Browser → GET /
   └── page.tsx renderiza shell + ThemeProvider + MatchSection

2. Client hydrates → ThemeProvider lê localStorage → aplica tema CSS

3. MatchSection → GET /api/fixtures
   └── Promise.allSettled × 4 competições de clube
       ├─ Redis hit por competição? → retorna
       └─ miss → API-Football → salva Redis → retorna

4. MatchSection → GET /api/previews?ids=...  (até 20 IDs)
   └── Para cada fixture em paralelo:
       ├── getTeamForm() → Redis | API-Football
       └── getBroadcastersForFixture() → Redis | Gemini+Search

5. Render: MatchCard[] com dados completos
   Pills de filtro aparecem se clube tem jogos em >1 competição
```

### Aba Resultados (lazy)

```
6. User clica "Resultados"
   Filtro de competição persiste (não resetado na troca de aba)

7a. MatchSection → GET /api/past-fixtures?club=X&beforeRound=N&limit=3  [Série A]
    └── getCbfRound(N-i) × 3 → Redis primary | Redis stale | CBF API

7b. MatchSection → GET /api/past-results?club=X  [outras competições]
    └── Promise.allSettled × 3 competições → Redis | API-Football

8. Merge por dateMs (decrescente) → lista unificada CBF + API-Football

9. Render: ResultCard[] (Série A) + SimpleResultCard[] (outras)
   Pills expandidos com competições históricas se necessário
```

---

## Modelo de renderização

**Server Components:** `layout.tsx`, `page.tsx` — carregam assets, metadados e estrutura

**Client Components:** todos os componentes interativos — marcados com `'use client'`

**Route Handlers:** todos os `/api/*` — server-side, acesso a Redis e APIs externas

**Edge Runtime:** não usado atualmente — todos os handlers rodam em Node.js runtime

**Error boundary global:** `global-error.tsx` usa `<html>/<body>` nativos (App Router); não usa `next/document` (Pages Router only)

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
