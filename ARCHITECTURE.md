# Architecture — Resenha Pré-Jogo

> **How to maintain this document:** update it whenever folder structure
> changes, a major module is added/removed, an external integration
> changes, or a relevant architectural decision is made (the latter also
> becomes an ADR under `docs/adr/`). If the document and the code disagree,
> **the document is wrong** — fix it or open an issue.

## Overview

Resenha Pré-Jogo is a Brazilian football companion PWA for fans who follow
a specific club. It surfaces upcoming fixtures, live-round results,
standings, match details (lineups, goals, cards), where-to-watch info, and
a bolão (prediction game) across five competitions — all filtered around
the user's chosen team.

## Stack

- **Language:** TypeScript 5
- **Main framework:** Next.js 16.2.1 — App Router, Server Components by default
- **Build/bundler:** Turbopack (via `@serwist/turbopack`) + Sentry plugin
- **PWA:** Serwist (service worker, offline support)
- **Cache L1:** Next.js `unstable_cache` (in-process, per-instance)
- **Cache L2:** Upstash Redis (persistent, cross-instance; also leaderboard
  sorted sets and identity store)
- **Persistence (user data):** Postgres via Drizzle ORM — primary store;
  Redis is secondary/cache only
- **Auth (users):** Custom JWT (`jose`), PIN-based email authentication;
  transactional email via Resend
- **Auth (admin):** HMAC cookie `sc_admin` + Bearer token fallback for
  cron scripts
- **Hosting:** Railway (auto-deploy on push to `main`)
- **CI/CD:** Railway auto-deploy — no separate CI pipeline
- **Error monitoring:** Sentry
- **Rate limiting:** Upstash Ratelimit (`src/lib/rateLimiter.ts`)

## Folder structure

```
src/
├── app/
│   ├── page.tsx              ← homepage (club-centric match feed)
│   ├── copa-2026/            ← dedicated Copa do Mundo 2026 page + layout
│   ├── bolao/                ← bolão pages (list, new, palpites)
│   ├── admin/                ← admin panel (HMAC-auth; not user-facing)
│   ├── esqueci-senha/        ← password reset page
│   └── api/
│       ├── fixtures/         ← upcoming matches by club/competition
│       ├── past-fixtures/    ← past results
│       ├── standings/        ← league table
│       ├── round/            ← current round overview
│       ├── h2h/              ← head-to-head stats
│       ├── players/          ← squad data
│       ├── previews/         ← match preview data (injuries etc.)
│       ├── cbf/              ← CBF-specific: round, match-docs, raw
│       ├── copa/             ← Copa 2026: fixtures, standings, bracket
│       ├── bolao/            ← bolão CRUD (auth-gated)
│       ├── palpites/         ← user predictions (auth-gated)
│       ├── social/           ← social feed: posts, likes, follows (auth-gated)
│       ├── auth/             ← login, register, forgot/reset password
│       ├── admin/            ← admin actions: cache bust, seed, clubs, logs
│       ├── identity/         ← anonymous sc_uid cookie assignment
│       └── suggestions/      ← user feedback (rate-limited)
├── components/
│   ├── bolao/                ← BolaoCard, PalpiteRow, RankingTable, etc.
│   ├── copa/                 ← CopaMatchSection, CopaMatchRow, BrazilCountdown, etc.
│   └── social/               ← SocialFeed, PostComposer, AuthProvider, etc.
│   (root)                    ← shared UI: MatchSection, ResultCard, modals…
├── lib/                      ← integrations + domain utilities
│   ├── apiFootball.ts        ← API-Football v3 client
│   ├── redisCache.ts         ← Redis get/set with stale-while-error helpers
│   ├── rateLimiter.ts        ← Upstash Ratelimit wrapper
│   ├── auth.ts               ← JWT issue/verify, user session
│   ├── adminSession.ts       ← HMAC admin cookie
│   ├── broadcasterSearch.ts  ← Gemini AI broadcaster discovery
│   ├── cbfDocParser.ts       ← CBF PDF súmula parser (unpdf)
│   ├── matchDataSource.ts    ← decides CBF vs API-Football per leagueId
│   └── …
├── data/
│   ├── competitions.ts       ← Competition registry (source of truth for IDs)
│   ├── clubs.json            ← static club list with themes
│   └── national-teams.ts     ← national team data for Copa 2026
└── hooks/
    └── useAuth.ts            ← React hook wrapping /api/auth/me

scripts/                      ← CLI/cron: cache seeding + PDF ingestion
```

**Import conventions (current practice):**
- `app/` may import from anywhere.
- `components/` imports from `lib/`, `data/`, `hooks/`, and each other.
- `lib/` does not import from `components/` or `app/`.
- No module boundary enforcement tooling in place.

## Modules / business contexts

### `match-feed` (homepage)
- **Responsibility:** displays upcoming fixtures and past results for the
  user's selected club, filtered by competition.
- **Boundaries:** reads from `/api/fixtures`, `/api/past-fixtures`,
  `/api/past-results`, `/api/round`; club selection persisted in
  `localStorage`.
- **Owners:** no clear owner
- **Health:** 🟢

### `match-detail` (ResultCard / Ficha do Jogo)
- **Responsibility:** rich match detail — lineups, goals, cards,
  substitutions, súmula PDF data.
- **Boundaries:** API-Football primary; CBF API for Série A rich data;
  `matchDataSource.ts` decides routing.
- **Owners:** no clear owner
- **Health:** 🟡 Boletim PDFs are image-based and cannot be parsed
  programmatically — only súmula PDFs yield structured data. This is the
  largest known piece of technical debt.

### `broadcaster-discovery`
- **Responsibility:** answers "where to watch" for a given fixture using
  Gemini 2.5 Flash + Google Search grounding.
- **Boundaries:** `lib/broadcasterSearch.ts` → Gemini API; result cached
  in Redis under `broadcasters:{fixtureId}`.
- **Owners:** no clear owner
- **Health:** 🟡 depends on Gemini Search grounding accuracy; no
  structured fallback for unsupported fixtures.

### `copa-2026`
- **Responsibility:** dedicated page for Copa do Mundo 2026 — group
  fixtures, standings, bracket, Brazil-focused highlight.
- **Boundaries:** `src/app/copa-2026/`; own API routes under
  `/api/copa/*`; isolated layout with Brazil theme.
- **Owners:** no clear owner
- **Health:** 🟢

### `bolao`
- **Responsibility:** prediction game — create/join a bolão, submit
  palpites, leaderboard.
- **Boundaries:** auth-gated (JWT); Postgres primary store for users +
  predictions; Redis sorted sets for leaderboard; email PIN auth via
  Resend.
- **Owners:** no clear owner
- **Health:** 🟡 in active development

### `social-feed`
- **Responsibility:** posts, likes, follows between users.
- **Boundaries:** auth-gated; own API routes `/api/social/*`;
  components in `src/components/social/`.
- **Owners:** no clear owner
- **Health:** 🔴 not finished — not surfaced in the UI yet

### `admin`
- **Responsibility:** internal panel for cache management, club data,
  suggestions review, real-time seed logs (SSE).
- **Boundaries:** HMAC cookie `sc_admin`; completely separate from user
  auth; Bearer token fallback for cron scripts.
- **Owners:** no clear owner
- **Health:** 🟢

## Critical flows

### 1. Upcoming fixtures for a club
1. User selects a club; selection stored in `localStorage`.
2. `MatchSection` calls `GET /api/fixtures?club=...&competition=...`.
3. Route checks Redis L2 (`fixtures:{competition.id}:{season}`); on miss,
   fetches from API-Football and writes to Redis with smart TTL.
4. `computeTtl()` returns a shorter TTL when a match is within the
   `matchWindowDays` window.

### 2. Match detail (Série A)
1. User opens a finished Série A match.
2. `ResultCard` fetches `GET /api/cbf/match?idJogo=...`.
3. Route reads Redis `cbf:round:{N}`; on miss calls CBF API.
4. On CBF API error, falls back to `:stale` Redis key
   (stale-while-error pattern).
5. Súmula PDF data served from `cbf:match:{idJogo}:docs:*` keys,
   pre-populated by the PDF ingestion pipeline.

### 3. Where to watch
1. `BroadcasterModal` calls `GET /api/broadcasters?fixtureId=...`.
2. Route checks Redis `broadcasters:{fixtureId}`; on miss calls Gemini
   2.5 Flash with Google Search grounding via `broadcasterSearch.ts`.
3. Result cached in Redis.

### 4. Bolão palpite submission
1. User logs in via PIN email flow (`/api/auth/login` → Resend PIN →
   `/api/auth/verify`).
2. JWT stored in httpOnly cookie.
3. `POST /api/palpites/{fixtureId}` — middleware validates JWT.
4. Prediction written to Postgres; leaderboard updated in Redis sorted
   set.

## External integrations

| Integration | Purpose | How | Where in code |
|---|---|---|---|
| API-Football v3 | Fixtures, standings, form, H2H, injuries, players | HTTP + `apiHeaders()` | `src/lib/apiFootball.ts` |
| CBF API (`gweb.cbf.com.br`) | Série A rich match data (lineups, goals, cards) | HTTP | `src/app/api/cbf/` |
| CONMEBOL API | Libertadores / Sul-Americana tournament data | HTTP | `src/lib/` (`getConmebolTournament`) |
| Google Gemini 2.5 Flash | Broadcaster discovery via Google Search grounding | `@google/genai` SDK | `src/lib/broadcasterSearch.ts` |
| Upstash Redis | L2 cache, leaderboard, identity store, rate limiting | `@upstash/redis` + `@upstash/ratelimit` | `src/lib/redisCache.ts`, `src/lib/rateLimiter.ts` |
| Postgres | User accounts, bolão, predictions, social (primary store) | Drizzle ORM | `src/lib/` (auth, bolão services) |
| Resend | PIN auth emails, password reset | `resend` SDK | `src/lib/email.ts` |
| Sentry | Error monitoring + performance | `@sentry/nextjs` | `next.config.ts`, `sentry.*.config.ts` |

## Key decisions (ADRs)

No ADRs written yet. Candidates:

- Why PIN-based email auth over OAuth
- Why Redis leaderboard over pure Postgres queries
- Why stale-while-error over simple cache invalidation
- Why Gemini Search grounding over a static broadcaster DB
- Why a separate `/copa-2026` page instead of routing by competition parameter
- Why Railway over Vercel (migrated in commit `70fe86e`)

## Known issues / technical debt

### Product & infrastructure gaps

- 🔴 **Boletim PDFs are image-based** — `unpdf` cannot extract text from
  them; only súmula PDFs yield structured data. This limits Ficha do Jogo
  for many matches. A solution (OCR, alternative source, or Gemini vision)
  has not been decided yet.
- 🟡 **No Postgres schema locked down** — Drizzle ORM is a dependency but
  the data model split between Postgres (primary) and Redis (secondary)
  is still being defined.
- 🟡 **No CI pipeline** — only Railway auto-deploy on `main`; no lint,
  type-check, or test gate before deploy.

### Work in progress (features partially built)

- 🟡 **Bolão evolution** — `bolaoRedis.ts` has 5 functions ready but not
  wired: `generateInviteCode`, `scoreExists`, `saveScore`, `getScore`,
  `incrementUserPoints` (+ `RankingEntry` type). Pending: invite-code
  flow, scoring system, ranking display.
- 🟡 **Modals built but not plugged into UI** — `SuggestionModal`,
  `StandingsModal`, `GroupStandingsModal` exist in `src/components/`.
- 🟡 **CBF official-source ingestion** — parsers ready (`parseBoletim`,
  `parseSumula` in `cbfDocParser.ts`). Pending: scheduler.
- 🟢 **CONMEBOL results ingestion** — `getConmebolFinishedByTeam` feeds
  `/api/past-results`, which reads CONMEBOL results live (Redis-cached,
  self-healing) merged over the `match_snapshots` Postgres snapshot. The
  snapshot is kept fresh by the `getConmebolTournament` write-through and
  the hourly `snapshot-matches` cron (Sentry-monitored).
- 🟡 **Social feed incomplete** — routes and components exist; functions
  `hasUserLiked` and `deletePost` in `socialRedis.ts` ready but not
  wired into the UI.

### Public types kept intentionally

These exports are not "dead" — they are public contracts of their
modules, kept for current/future consumers:

- `AuthUser` (`src/hooks/useAuth.ts`)
- `AfPlayer`, `AfLineupTeam` (`src/lib/types.ts`) — API-Football contract
- `ConmebolCompetitionSlug` (`src/lib/conmebolApi.ts`)
- `CbfCardEntry` (`src/lib/cbfStandingsScraper.ts`)
- `ClubValidation` (`src/lib/admin/clubsValidation.ts`)

### Structural debt (not blocking, registered for awareness)

These are not bugs and don't break anything, but represent organizational
debt the architect agent should not flag as new findings.

- 🟡 **`src/components/` has folder+file pairs with the same name**
  (`ClubSelector/` + `ClubSelector.tsx`, `MatchCard/` + `MatchCard.tsx`,
  `ThemeProvider/` + `ThemeProvider.tsx`). Likely intermediate refactor
  state. Decide which version is canonical and consolidate.
- 🟡 **`MatchCard.tsx` is ~89KB in a single file**. Strong candidate
  for splitting into smaller subcomponents.
- 🟡 **`src/lib/` has 31 flat files** — clear subdomains visible
  (auth, external APIs, CBF docs, Redis, broadcaster, hooks). Could be
  reorganized into folders by subdomain when the next refactor happens.
- 🟡 **Hook location inconsistency** — `src/hooks/` exists with one
  file, but other hooks (`useFichaData`, `useFocusTrap`, `useScrollLock`)
  live in `src/lib/`. Decide on one location.
- 🟡 **`src/data/match-docs.json` is ~1.5MB** bundled in the repo.
  Intentional bundling decision — document why if kept (or externalize
  if it changes frequently).
- 🟡 **`src/proxy.ts`** sits as a single loose file at the root of
  `src/`, outside any subfolder. Verify intent.

> **Maintenance rule:** when a WIP item gets wired (or definitively
> dropped), update or remove the entry above. The `architect` agent uses
> this section to decide what counts as expected vs. surprising.


## Extension points

- **New competition:** add entry to `src/data/competitions.ts`; if it has
  CBF data, set `hasCbfData: true` and `cbfChampionshipId`.
- **New API route:** create under `src/app/api/<feature>/route.ts`; use
  `redisCache.ts` helpers for L2 caching; add to middleware `matcher` if
  auth is required.
- **New page:** create under `src/app/<route>/page.tsx`.
- **New component:** place in `src/components/<feature>/` if
  feature-specific, or `src/components/` root if shared UI.
- **New seed script:** add to `scripts/`, wire into `seed-all.ts`, and
  add a `package.json` script entry.
