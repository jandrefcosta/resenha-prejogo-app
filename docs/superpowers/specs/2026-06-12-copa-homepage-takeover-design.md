# Copa Homepage Takeover — Design

**Date:** 2026-06-12
**Status:** Approved
**Branch:** feat/copa-homepage-takeover (new, off main)

## Problem

The 2026 World Cup is underway (June 11 – July 19, 2026). During this period
the app's main event is the Copa do Mundo page (`/copa-2026`) and the bolão,
but the homepage (`/`) still leads with the club hub (Brasileirão + club
fixtures). We want to temporarily make the Copa the landing experience and
keep the bolão one tap away — without losing the existing club/matches flow,
and with automatic reversal after the Cup.

## Decisions (made during brainstorming)

1. **Toggle:** date window, no env var, no manual flag. Auto-on during the
   Cup, auto-off after. Zero ops work to revert.
2. **Routing:** during the window, `/` issues a temporary redirect (Next.js
   `redirect()`, 307) to `/copa-2026`. One source of truth for the Copa page;
   `/` stays canonical; PWA `start_url: '/'` lands on the Copa automatically.
3. **Club flow:** the current homepage content moves to a shared component
   and is served at a new permanent route **`/meu-clube`** (and still at `/`
   outside the window).
4. **Bolão focus:** a fixed bottom **tab bar** shown only during the window:
   ⚽ Copa · 🏆 Bolão · 🛡️ Meu Clube. No bolão status card (option B chosen
   over A/C in mockup review).
5. **Tab bar lifetime:** rendered only during the window. Component stays in
   the codebase for future reuse.

## Design

### 1. Window constants + helper

- `src/data/competitions.ts`: export `WORLD_CUP_2026_WINDOW` colocated with
  the `world-cup-2026` entry:
  - `start: 2026-06-11T00:00:00-03:00`
  - `end: 2026-07-21T23:59:59-03:00` (final is July 19 + 2 days of afterglow)
- `src/lib/cupTakeover.ts`: `isCupTakeover(now: Date = new Date()): boolean`
  — pure function, returns `start <= now <= end` (boundaries inclusive).
  No I/O, no env reads.

### 2. Homepage redirect

`src/app/page.tsx`:

- `export const dynamic = 'force-dynamic'` — the page is currently static;
  without this the date check would be evaluated once at build time.
- If `isCupTakeover()` → `redirect('/copa-2026')`.
- Else → render `<ClubHome />` (extracted component, below).

### 3. Club hub extraction (`/meu-clube`)

- `src/components/home/ClubHome.tsx`: the entire current `HomePage` JSX
  (hero, ClubSelector, StandingsButton, RoundButton, EmailSubscribeButton,
  bolão pill, MatchSection, footer, modals) moves here unchanged. Server
  Component.
- `src/app/meu-clube/page.tsx`: renders `<ClubHome />`; own `metadata`
  (title "Meu Clube"). Permanent route — survives after the Cup.
- `src/app/page.tsx` renders the same component outside the window.

### 4. Cup tab bar

- `src/components/CupTabBar.tsx`, `'use client'`, rendered from
  `src/app/layout.tsx` (inside ThemeProvider/AuthProvider tree, after
  `{children}`).
- Tabs: ⚽ Copa → `/copa-2026` · 🏆 Bolão → `/bolao` · 🛡️ Meu Clube →
  `/meu-clube`. Active tab via `usePathname()` (Bolão active for any
  `/bolao*` path).
- Visibility decided client-side after mount (renders `null` until mounted,
  then checks `isCupTakeover()` — same SSR-safe pattern as
  `BrazilCountdown`). This avoids baking the date check into statically
  rendered layout output; the brief pop-in is acceptable for a temporary
  feature.
- Hidden on `/admin*`, `/login`, `/esqueci-senha`, `/reset-senha`.
- Fixed bottom, `env(safe-area-inset-bottom)` padding, plus an in-flow
  spacer of the bar's height so footers/content aren't covered.
- Styling follows existing idiom: zinc-950 background with blur/transparency,
  min 44px touch targets, font-sans.

### 5. Link fixes

- `/copa-2026` hero pill "← Brasileirão" currently points to `/`, which
  during the window would redirect right back (loop). Change `href` to
  `/meu-clube` (keep during and after the window).
- `/bolao` "Início" back-link keeps pointing to `/` — "home" is the Copa
  during the window, and the tab bar covers club access.
- Existing "🏆 Bolão da Copa" pills on both heroes stay as-is (redundant
  with the tab bar during the window, harmless, needed outside it).

### 6. Out of scope / unchanged

- No middleware, no env flags, no new libraries.
- `manifest.ts` unchanged (`start_url: '/'`).
- No changes to data fetching, caching, bolão logic, or
  `src/components/social/`.
- No generic "home takeover" abstraction — one event, one window.

## Error handling

The feature is pure date logic plus routing; there are no new failure modes
(no I/O). The redirect target `/copa-2026` is a static route that already
exists; if its data APIs fail, existing page-level handling applies.

## Testing

- **Unit (`src/lib/cupTakeover.test.ts`):** before window, at start boundary,
  inside, at end boundary, after window; explicit `now` injection; timezone
  sanity (dates declared with `-03:00` offsets, compared as instants).
- **E2E:** specs that exercise club flows via `/` (club-selector,
  match-section, match-ficha, mobile) switch their navigation to
  `/meu-clube` so they pass regardless of the real date. No date-dependent
  e2e for the redirect; it's covered by unit tests on the helper plus the
  one-line redirect call.
- **Manual:** during the window (i.e., now): `/` lands on Copa, tab bar
  visible on Copa/Bolão/Meu Clube, club flow fully functional at
  `/meu-clube`, no redirect loop from "← Brasileirão".

## Rollback / reversal

- Automatic: after `end`, `/` renders the club home again and the tab bar
  disappears. `/meu-clube` remains as an alias.
- Emergency: shrink the window dates in `competitions.ts` and redeploy.
