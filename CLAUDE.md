# Resenha Pré-Jogo

> This file is read automatically by the Claude CLI whenever you run
> `claude` inside this project. Keep it **short and stable** — it's
> consumed in every interaction. Long details go into `ARCHITECTURE.md`
> or ADRs under `docs/adr/`.

## What this project is

Brazilian football companion PWA for fans who follow a specific club.
Shows fixtures, results, standings, match details, where-to-watch, and a
bolão (prediction game) across five competitions.

## Stack

- TypeScript 5 + Next.js 16 (App Router) — Server Components by default
- Postgres via Drizzle ORM (primary user data); Upstash Redis (L2 cache + leaderboard)
- Railway (auto-deploy on push to `main`)

## How Claude should work here

**Before structural changes, read:**
- `ARCHITECTURE.md` — source of truth for architecture.
- `docs/adr/` — decisions already made and their rationale.

**Project-specific conventions:**
- Server Components by default; `'use client'` only when needed.
- All API routes use `src/lib/redisCache.ts` helpers for L2 caching —
  don't bypass them with raw Upstash calls.
- Data source routing is data-driven via the `hasCbfData` flag on each
  entry in `src/data/competitions.ts` (resolved with `getCompetitionById` /
  `getCompetitionByLeagueId`, read at the call sites) — there is no central
  dispatcher module; don't hardcode leagueId checks elsewhere.
- New competitions must be registered in `src/data/competitions.ts` first.
- Postgres is the primary store; Redis is secondary/cache only.

**Do NOT:**
- Don't introduce new libraries without an ADR.
- Don't touch `src/components/social/` for new features — the social feed
  is not finished and its boundaries may change.
- Don't add `console.log` — use Sentry or the admin SSE log terminal.

## Useful commands

```bash
# Run in development
npm run dev

# Run e2e tests
npm run test:e2e

# Lint
npm run lint

# Production build
npm run build

# Seed all cache
npm run seed:all

# Update CBF match docs (PDF pipeline)
npm run docs:update
```

## Inherited standards (from dev-standards)

No overrides — global standards apply as-is.

## Recommended subagents

- `@architect` — before changes that affect structure, module boundaries,
  or public contracts. Reads `ARCHITECTURE.md` + ADRs.

## Extension points

- New competition → `src/data/competitions.ts`
- New API route → `src/app/api/<feature>/route.ts`
- New page → `src/app/<route>/page.tsx`
- New component → `src/components/<feature>/` (feature) or `src/components/` (shared)
- New seed script → `scripts/` + wire into `seed-all.ts`
