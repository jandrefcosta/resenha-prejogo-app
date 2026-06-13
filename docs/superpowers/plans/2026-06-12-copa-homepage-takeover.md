# Copa Homepage Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During the 2026 World Cup window (Jun 11 – Jul 21), `/` redirects to `/copa-2026`, the club hub moves to a permanent `/meu-clube` route, and a fixed bottom tab bar (Copa · Bolão · Meu Clube) appears on all main pages — all reverting automatically after the window.

**Architecture:** A pure date-window helper (`isCupTakeover`) drives both a server-side `redirect()` in `src/app/page.tsx` (forced dynamic so the check isn't frozen at build time) and a client-side tab bar rendered from the root layout (visibility decided after mount, same SSR-safe pattern as `BrazilCountdown`). The current homepage JSX is extracted unchanged into `ClubHome` and served at both `/` (outside the window) and `/meu-clube` (always).

**Tech Stack:** Next.js 16 App Router (Server Components + one `'use client'` component), TypeScript 5, Tailwind, Vitest (`npm run test:unit`), Playwright (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-06-12-copa-homepage-takeover-design.md`

---

### Task 1: Feature branch

The spec commit lives on `feat/bolao-so-brasil`, so branch from the current HEAD (not `main`) to keep the spec in history.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/copa-homepage-takeover
```

Expected: `Switched to a new branch 'feat/copa-homepage-takeover'`

---

### Task 2: Cup window constants + `isCupTakeover` helper (TDD)

**Files:**
- Modify: `src/data/competitions.ts` (after the `COMPETITIONS` array, near the `world-cup-2026` entry)
- Create: `src/lib/cupTakeover.ts`
- Test: `src/lib/cupTakeover.test.ts`

- [ ] **Step 1: Add the window constant to `src/data/competitions.ts`**

Append after the `COMPETITIONS` array (before the `SERIE_A` export):

```ts
/**
 * Period in which the Copa 2026 takes over the homepage (redirect + tab bar).
 * Final is Jul 19 + 2 days of afterglow. Auto-reverts after `end`.
 * See docs/superpowers/specs/2026-06-12-copa-homepage-takeover-design.md
 */
export const WORLD_CUP_2026_WINDOW = {
  start: new Date('2026-06-11T00:00:00-03:00'),
  end: new Date('2026-07-21T23:59:59-03:00'),
} as const;
```

- [ ] **Step 2: Write the failing test `src/lib/cupTakeover.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { isCupTakeover } from './cupTakeover';

describe('isCupTakeover', () => {
  it('returns false before the window starts', () => {
    expect(isCupTakeover(new Date('2026-06-10T23:59:59-03:00'))).toBe(false);
  });

  it('returns true at the exact start boundary', () => {
    expect(isCupTakeover(new Date('2026-06-11T00:00:00-03:00'))).toBe(true);
  });

  it('returns true during the Cup', () => {
    expect(isCupTakeover(new Date('2026-07-01T12:00:00-03:00'))).toBe(true);
  });

  it('returns true at the exact end boundary', () => {
    expect(isCupTakeover(new Date('2026-07-21T23:59:59-03:00'))).toBe(true);
  });

  it('returns false after the window ends', () => {
    expect(isCupTakeover(new Date('2026-07-22T00:00:00-03:00'))).toBe(false);
  });

  it('compares instants, not local wall-clock (UTC input)', () => {
    // 2026-06-11T03:00:00Z === 2026-06-11T00:00:00-03:00 → inside
    expect(isCupTakeover(new Date('2026-06-11T03:00:00Z'))).toBe(true);
    // one second earlier in UTC → outside
    expect(isCupTakeover(new Date('2026-06-11T02:59:59Z'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/cupTakeover.test.ts`
Expected: FAIL — `Cannot find module './cupTakeover'` (or equivalent resolve error).

- [ ] **Step 4: Write `src/lib/cupTakeover.ts`**

```ts
import { WORLD_CUP_2026_WINDOW } from '@/data/competitions';

/**
 * True while the Copa 2026 homepage takeover is active (boundaries inclusive).
 * Pure date comparison — no I/O, no env reads — so it is unit-testable and
 * safe to call from both Server and Client Components.
 */
export function isCupTakeover(now: Date = new Date()): boolean {
  const t = now.getTime();
  return (
    t >= WORLD_CUP_2026_WINDOW.start.getTime() &&
    t <= WORLD_CUP_2026_WINDOW.end.getTime()
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/cupTakeover.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/data/competitions.ts src/lib/cupTakeover.ts src/lib/cupTakeover.test.ts
git commit -m "feat: add cup takeover window and isCupTakeover helper" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Extract `ClubHome` and add `/meu-clube` route

Pure extraction — no behavior change yet. `/` keeps rendering the club home.

**Files:**
- Create: `src/components/home/ClubHome.tsx`
- Create: `src/app/meu-clube/page.tsx`
- Modify: `src/app/page.tsx` (becomes a thin wrapper)

- [ ] **Step 1: Create `src/components/home/ClubHome.tsx`**

This is the entire current `HomePage` JSX from `src/app/page.tsx`, moved verbatim (only the function name and export change):

```tsx
import { ClubSelector } from '@/components/ClubSelector';
import { MatchSection } from '@/components/MatchSection';
import { HeroClubName } from '@/components/HeroClubName';
import { FooterSuggestion, FloatingSuggestion } from '@/components/SuggestionModal';
import { OnboardingModal } from '@/components/OnboardingModal';
import { StandingsButton } from '@/components/StandingsModal';
import { RoundButton } from '@/components/RoundModal';
import { EmailSubscribeButton, EmailJourneyBanner } from '@/components/EmailCaptureModal';
import Link from 'next/link';

/** Club hub — served at `/` (outside the cup window) and `/meu-clube` (always). */
export function ClubHome() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <header
        className="relative overflow-hidden px-4 pb-12 sm:px-6"
        style={{
          background:
            'linear-gradient(160deg, var(--club-primary) 0%, var(--club-gradient-end) 65%, #09090b 100%)',
          /* Pull header up into the safe area zone so gradient covers the notch/Dynamic Island,
             then pad the content down by the same amount so nothing is hidden */
          marginTop: 'calc(-1 * env(safe-area-inset-top))',
          paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)',
        }}
      >
        {/* Decorative blur blob */}
        <div
          className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ backgroundColor: 'var(--club-accent)' }}
          aria-hidden="true"
        />

        <div className="relative max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2 font-sans">
            Resenha Pré-Jogo
          </p>
          <HeroClubName />
          <p className="mt-3 text-base text-white/70 font-sans leading-relaxed">
            Próximos jogos, onde assistir &amp; análise pré-jogo do seu clube
          </p>
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <ClubSelector />
            <StandingsButton />
            <RoundButton />
            <EmailSubscribeButton />
            <Link
              href="/bolao"
              className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 backdrop-blur-sm"
            >
              🏆 Bolão da Copa
            </Link>
          </div>
        </div>
      </header>

      {/* Main content — 48px+ section gaps as per skill guidelines */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <MatchSection />
      </main>

      <footer className="py-6 flex items-center justify-center gap-3 text-xs text-zinc-600 font-sans">
        <span>Dados via API-Football</span>
        <span>·</span>
        <FooterSuggestion />
      </footer>

      <FloatingSuggestion />
      <EmailJourneyBanner />
      <OnboardingModal />
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/app/page.tsx` with a thin wrapper**

Full new file content (the redirect comes in Task 4 — keep this task a pure extraction):

```tsx
import { ClubHome } from '@/components/home/ClubHome';

export default function HomePage() {
  return <ClubHome />;
}
```

- [ ] **Step 3: Create `src/app/meu-clube/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { ClubHome } from '@/components/home/ClubHome';

export const metadata: Metadata = {
  title: 'Meu Clube',
  description:
    'Próximos jogos, onde assistir e análise pré-jogo do seu clube no futebol brasileiro.',
};

export default function MeuClubePage() {
  return <ClubHome />;
}
```

- [ ] **Step 4: Lint and build**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; route list includes `/meu-clube`.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/ClubHome.tsx src/app/page.tsx src/app/meu-clube/page.tsx
git commit -m "refactor: extract ClubHome component and add /meu-clube route" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Redirect `/` to `/copa-2026` during the window

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the redirect and force dynamic rendering**

Full new content of `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { ClubHome } from '@/components/home/ClubHome';
import { isCupTakeover } from '@/lib/cupTakeover';

// The takeover check is time-based; without this the page is statically
// rendered and the date comparison would be frozen at build time.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  if (isCupTakeover()) {
    redirect('/copa-2026');
  }
  return <ClubHome />;
}
```

- [ ] **Step 2: Verify the redirect manually (today is inside the window)**

With the dev server running (`npm run dev` — it is usually already running on :3000):

Run: `curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" http://localhost:3000/`
Expected: `307 http://localhost:3000/copa-2026`

Also confirm `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/meu-clube` → `200`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: redirect / to /copa-2026 during the cup window" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Fix the Copa page back-link (redirect loop)

`/copa-2026` has a "← Brasileirão" pill pointing to `/`; during the window that bounces straight back to the Copa page.

**Files:**
- Modify: `src/app/copa-2026/page.tsx` (the `<a href="/">` around line 72)

- [ ] **Step 1: Change the href**

In `src/app/copa-2026/page.tsx`, change only the `href` of the back pill (label stays — users know the club hub by "Brasileirão"):

```tsx
<a
  href="/meu-clube"
  className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 backdrop-blur-sm"
>
  ← Brasileirão
</a>
```

Note: `/bolao`'s "Início" link keeps pointing to `/` on purpose — "home" is the Copa during the window (spec §5).

- [ ] **Step 2: Verify manually**

Open `http://localhost:3000/copa-2026`, click "← Brasileirão" — must land on `/meu-clube` (club hub), not bounce back.

- [ ] **Step 3: Commit**

```bash
git add src/app/copa-2026/page.tsx
git commit -m "fix: point copa back-link to /meu-clube to avoid redirect loop" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Cup tab bar

**Files:**
- Create: `src/components/CupTabBar.tsx`
- Modify: `src/app/layout.tsx` (render after `{children}`)

No component unit test — the project tests UI via Playwright/manual only (`src/**/*.test.ts` covers pure lib code). The date logic is already unit-tested in Task 2; visibility is verified manually here (an e2e would be date-dependent, spec §Testing).

- [ ] **Step 1: Create `src/components/CupTabBar.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isCupTakeover } from '@/lib/cupTakeover';

const TABS = [
  { href: '/copa-2026', label: 'Copa', icon: '⚽' },
  { href: '/bolao', label: 'Bolão', icon: '🏆' },
  { href: '/meu-clube', label: 'Meu Clube', icon: '🛡️' },
] as const;

const HIDDEN_PREFIXES = ['/admin', '/login', '/esqueci-senha', '/reset-senha'];

/**
 * Fixed bottom navigation shown only during the Copa 2026 takeover window.
 * Visibility is decided after mount (renders null on the server and on the
 * first client render) to keep the time-based check out of statically
 * rendered layout output — same SSR-safe pattern as BrazilCountdown.
 */
export function CupTabBar() {
  const pathname = usePathname();
  // null = SSR / not yet hydrated → renders nothing to avoid hydration mismatch
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    setActive(isCupTakeover());
  }, []);

  if (!active || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const isCurrent = (href: string): boolean =>
    href === '/bolao' ? pathname.startsWith('/bolao') : pathname === href;

  return (
    <>
      {/* In-flow spacer so fixed bar doesn't cover page footers */}
      <div className="h-16" aria-hidden="true" />
      <nav
        aria-label="Navegação da Copa"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-zinc-950/90 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isCurrent(tab.href) ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 min-h-[56px] transition-colors ${
                isCurrent(tab.href)
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {tab.icon}
              </span>
              <span className="text-[11px] font-medium font-sans">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Render it from `src/app/layout.tsx`**

Add the import:

```tsx
import { CupTabBar } from '@/components/CupTabBar';
```

And render it right after `{children}` (inside `AuthProvider`, before `SocialDrawer`):

```tsx
<InitialLoader />
{children}
<CupTabBar />
<SocialDrawer />
```

- [ ] **Step 3: Verify manually**

With the dev server running, check:
- `http://localhost:3000/copa-2026` → tab bar visible at bottom, "Copa" highlighted.
- `http://localhost:3000/bolao` → "Bolão" highlighted (also on `/bolao/palpites`).
- `http://localhost:3000/meu-clube` → "Meu Clube" highlighted; page footer not covered (spacer present).
- `http://localhost:3000/login` and `/admin/login` → no tab bar.

- [ ] **Step 4: Lint and build**

Run: `npm run lint` then `npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/components/CupTabBar.tsx src/app/layout.tsx
git commit -m "feat: add bottom tab bar during the cup window" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Repoint club-flow e2e specs to `/meu-clube`

These specs exercise the club hub via `/`, which now redirects during the window. `/meu-clube` serves identical content regardless of date. `tests/e2e/auth.spec.ts` keeps its `goto('/')` calls — they only assert cookies and are redirect-agnostic.

**Files:**
- Modify: `tests/e2e/club-selector.spec.ts:7`
- Modify: `tests/e2e/match-section.spec.ts:17,27,39,86,98,162,181,207`
- Modify: `tests/e2e/match-ficha.spec.ts:14,55,154`
- Modify: `tests/e2e/mobile.spec.ts:10,55`

- [ ] **Step 1: Replace the navigation target in the four files**

In each listed line, change:

```ts
await page.goto('/');
```

to:

```ts
await page.goto('/meu-clube');
```

(14 occurrences total. Do NOT touch `tests/e2e/auth.spec.ts` or `tests/e2e/bolao.spec.ts`.)

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`
Expected: all specs pass (club flows now run against `/meu-clube`; bolão/auth unaffected).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/club-selector.spec.ts tests/e2e/match-section.spec.ts tests/e2e/match-ficha.spec.ts tests/e2e/mobile.spec.ts
git commit -m "test: point club-flow e2e specs at /meu-clube" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification sweep

- [ ] **Step 1: Full check**

Run, in order:
- `npm run lint` → no errors
- `npm run test:unit` → all pass
- `npm run build` → succeeds
- `npm run test:e2e` → all pass

- [ ] **Step 2: Manual takeover checklist (today is inside the window)**

- `/` → 307 to `/copa-2026`
- Tab bar on Copa, Bolão, Meu Clube pages; hidden on `/login`, `/admin*`
- Club flow fully functional at `/meu-clube` (selector, standings, round, matches)
- "← Brasileirão" on the Copa page lands on `/meu-clube` (no loop)
- PWA: installed app opening at `/` lands on the Copa page

- [ ] **Step 3: Commit any straggler fixes, then hand off**

Use superpowers:finishing-a-development-branch to merge/PR `feat/copa-homepage-takeover`.
