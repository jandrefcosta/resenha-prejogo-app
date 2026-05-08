# PDF Force Re-process — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-click admin operation that re-downloads all CBF PDFs for the current season, replaces them in Postgres, re-parses them, and returns a summary.

**Architecture:** New API route `POST /api/admin/force-reprocess-docs` runs the full pipeline (clear Redis + delete Postgres + re-download from CBF + re-parse via `processMatchDocuments`) for every finished round. New admin page `/admin/docs` with a client component `DocsReprocessCard` that fires the request and displays the summary.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle/Postgres, Upstash Redis, vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/admin/force-reprocess-docs/route.ts` | API: iterate rounds, clear + re-download + re-parse |
| Create | `src/app/api/admin/force-reprocess-docs/route.test.ts` | Unit tests for the route logic |
| Create | `src/app/admin/(authed)/docs/page.tsx` | Server Component shell for the Docs admin page |
| Create | `src/components/admin/DocsReprocessCard.tsx` | Client Component: button + state machine + summary |
| Modify | `src/components/admin/AdminNav.tsx` | Add "Documentos" link to LINKS array |

---

## Task 1: API Route — `force-reprocess-docs`

**Files:**
- Create: `src/app/api/admin/force-reprocess-docs/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// src/app/api/admin/force-reprocess-docs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getCbfRound } from '@/lib/cbfApi';
import { downloadPdf, processMatchDocuments, resolvePdfUrls } from '@/lib/cbfDocParser';
import { deletePdfs, savePdf } from '@/lib/cbfPdfStore';
import { deleteCache } from '@/lib/redisCache';
import { isAdminRequest, unauthorizedAdminResponse } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export interface ReprocessResult {
  ok: boolean;
  rounds: number;
  processed: number;
  errors: number;
  unavailable: number;
  durationMs: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest(req))) return unauthorizedAdminResponse();

  const start = Date.now();
  const totals = { rounds: 0, processed: 0, errors: 0, unavailable: 0 };

  for (let r = 1; r <= 38; r++) {
    let round: Awaited<ReturnType<typeof getCbfRound>>;
    try {
      round = await getCbfRound(r);
    } catch {
      continue;
    }
    if (round.status !== 'finished') continue;
    totals.rounds++;

    for (const match of round.matches) {
      const { idJogo } = match;
      if (!idJogo) continue;

      try {
        const urls = await resolvePdfUrls(match);

        await deletePdfs(idJogo);
        await Promise.all([
          deleteCache(`cbf:match:${idJogo}:docs:status`),
          deleteCache(`cbf:match:${idJogo}:sumula`),
          deleteCache(`cbf:match:${idJogo}:boletim`),
        ]);

        const [sumulaBuf, boletimBuf] = await Promise.all([
          urls.sumula  ? downloadPdf(urls.sumula)  : Promise.resolve(null),
          urls.boletim ? downloadPdf(urls.boletim) : Promise.resolve(null),
        ]);

        if (!sumulaBuf && !boletimBuf) {
          totals.unavailable++;
          continue;
        }

        await Promise.all([
          sumulaBuf  ? savePdf(idJogo, 'sumula',  sumulaBuf,  urls.sumula  ?? undefined) : Promise.resolve(),
          boletimBuf ? savePdf(idJogo, 'boletim', boletimBuf, urls.boletim ?? undefined) : Promise.resolve(),
        ]);

        const result = await processMatchDocuments(match);
        if (result.available) totals.processed++;
        else totals.unavailable++;
      } catch {
        totals.errors++;
      }
    }
  }

  const result: ReprocessResult = {
    ok: true,
    ...totals,
    durationMs: Date.now() - start,
  };

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors on the new file. If `resolvePdfUrls` or `downloadPdf` aren't exported from `cbfDocParser`, check `src/lib/cbfDocParser.ts` — both are already exported in that file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/force-reprocess-docs/route.ts
git commit -m "feat: add force-reprocess-docs admin API route"
```

---

## Task 2: Unit Tests for the Route

**Files:**
- Create: `src/app/api/admin/force-reprocess-docs/route.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/app/api/admin/force-reprocess-docs/route.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/adminAuth', () => ({
  isAdminRequest: vi.fn().mockResolvedValue(true),
  unauthorizedAdminResponse: vi.fn(() => new Response('Unauthorized', { status: 401 })),
}));

vi.mock('@/lib/cbfApi', () => ({
  getCbfRound: vi.fn(),
}));

vi.mock('@/lib/cbfDocParser', () => ({
  resolvePdfUrls: vi.fn(),
  downloadPdf: vi.fn(),
  processMatchDocuments: vi.fn(),
}));

vi.mock('@/lib/cbfPdfStore', () => ({
  deletePdfs: vi.fn().mockResolvedValue(undefined),
  savePdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/redisCache', () => ({
  deleteCache: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import { getCbfRound } from '@/lib/cbfApi';
import { resolvePdfUrls, downloadPdf, processMatchDocuments } from '@/lib/cbfDocParser';

const mockGetCbfRound   = vi.mocked(getCbfRound);
const mockResolvePdfUrls = vi.mocked(resolvePdfUrls);
const mockDownloadPdf    = vi.mocked(downloadPdf);
const mockProcessMatch   = vi.mocked(processMatchDocuments);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/force-reprocess-docs', { method: 'POST' });
}

const FAKE_BUFFER = new ArrayBuffer(8);

const MATCH = {
  idJogo: '999001',
  mandante:  { nome: 'Atletico' },
  visitante: { nome: 'Flamengo' },
  documentos: [],
  data: '01/01/2026',
} as any;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/admin/force-reprocess-docs', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: only round 1 is finished, rounds 2–38 not finished
    mockGetCbfRound.mockImplementation(async (r: number) => {
      if (r === 1) return { status: 'finished', matches: [MATCH] };
      return { status: 'scheduled', matches: [] };
    });

    mockResolvePdfUrls.mockResolvedValue({ sumula: 'http://cbf.com/s.pdf', boletim: 'http://cbf.com/b.pdf' });
    mockDownloadPdf.mockResolvedValue(FAKE_BUFFER);
    mockProcessMatch.mockResolvedValue({ available: true, sumula: {} as any, boletim: {} as any });
  });

  it('returns 401 when not authenticated', async () => {
    const { isAdminRequest, unauthorizedAdminResponse } = await import('@/lib/adminAuth');
    vi.mocked(isAdminRequest).mockResolvedValueOnce(false);
    vi.mocked(unauthorizedAdminResponse).mockReturnValueOnce(new Response('Unauthorized', { status: 401 }) as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('counts a processed match when parse succeeds', async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.rounds).toBe(1);
    expect(body.processed).toBe(1);
    expect(body.errors).toBe(0);
    expect(body.unavailable).toBe(0);
    expect(body.durationMs).toBeTypeOf('number');
  });

  it('counts unavailable when no PDFs can be downloaded', async () => {
    mockDownloadPdf.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.unavailable).toBe(1);
    expect(body.processed).toBe(0);
  });

  it('counts error when processMatchDocuments throws', async () => {
    mockProcessMatch.mockRejectedValueOnce(new Error('parse failure'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.errors).toBe(1);
    expect(body.processed).toBe(0);
  });

  it('skips non-finished rounds', async () => {
    mockGetCbfRound.mockResolvedValue({ status: 'scheduled', matches: [] });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.rounds).toBe(0);
    expect(body.processed).toBe(0);
  });

  it('counts unavailable when processMatchDocuments returns available: false', async () => {
    mockProcessMatch.mockResolvedValue({ available: false });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.unavailable).toBe(1);
    expect(body.processed).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests and verify they pass**

```bash
npx vitest run src/app/api/admin/force-reprocess-docs/route.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/force-reprocess-docs/route.test.ts
git commit -m "test: add unit tests for force-reprocess-docs route"
```

---

## Task 3: Client Component — `DocsReprocessCard`

**Files:**
- Create: `src/components/admin/DocsReprocessCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/admin/DocsReprocessCard.tsx
'use client';

import { useState } from 'react';
import type { ReprocessResult } from '@/app/api/admin/force-reprocess-docs/route';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: ReprocessResult }
  | { status: 'error'; message: string };

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function DocsReprocessCard() {
  const [state, setState] = useState<State>({ status: 'idle' });

  async function handleReprocess() {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/admin/force-reprocess-docs', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: 'error', message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const result: ReprocessResult = await res.json();
      setState({ status: 'done', result });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' });
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-bold">Re-processar PDFs da Season</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Re-baixa todos os PDFs do CBF, substitui no Postgres e re-parseia a season inteira.
          Operação pode levar alguns minutos.
        </p>
      </div>

      <button
        type="button"
        onClick={handleReprocess}
        disabled={state.status === 'loading'}
        className="self-start rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state.status === 'loading' ? 'Processando…' : 'Re-processar tudo'}
      </button>

      {state.status === 'done' && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-sm font-mono flex flex-col gap-1">
          <span className="text-emerald-400">✓ Processados: {state.result.processed}</span>
          <span className="text-red-400">✗ Erros: {state.result.errors}</span>
          <span className="text-zinc-400">— Indisponíveis: {state.result.unavailable}</span>
          <span className="mt-1 text-zinc-500">
            Rodadas: {state.result.rounds} · Duração: {formatDuration(state.result.durationMs)}
          </span>
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-red-400">Erro: {state.message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/DocsReprocessCard.tsx
git commit -m "feat: add DocsReprocessCard admin component"
```

---

## Task 4: Admin Page — `/admin/docs`

**Files:**
- Create: `src/app/admin/(authed)/docs/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/admin/(authed)/docs/page.tsx

import { DocsReprocessCard } from '@/components/admin/DocsReprocessCard';

export const metadata = {
  title: 'Admin · Documentos',
  robots: { index: false, follow: false },
};

export default function AdminDocsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Documentos</h1>
      <DocsReprocessCard />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/(authed)/docs/page.tsx
git commit -m "feat: add /admin/docs page"
```

---

## Task 5: Add Nav Link

**Files:**
- Modify: `src/components/admin/AdminNav.tsx`

- [ ] **Step 1: Add the Documentos link to the LINKS array**

In `src/components/admin/AdminNav.tsx`, find the `LINKS` array:

```typescript
const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/cache', label: 'Cache' },
  { href: '/admin/clubs', label: 'Clubes' },
  { href: '/admin/sugestoes', label: 'Sugestões' },
];
```

Replace with:

```typescript
const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/cache', label: 'Cache' },
  { href: '/admin/clubs', label: 'Clubes' },
  { href: '/admin/sugestoes', label: 'Sugestões' },
  { href: '/admin/docs', label: 'Documentos' },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminNav.tsx
git commit -m "feat: add Documentos link to admin nav"
```

---

## Task 6: Smoke Test (Manual)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to `/admin` and log in**

Open `http://localhost:3000/admin`. Log in with admin credentials.

- [ ] **Step 3: Verify nav shows "Documentos"**

The top nav bar should show: Dashboard · Cache · Clubes · Sugestões · **Documentos**

- [ ] **Step 4: Open `/admin/docs`**

Page should render the title "Documentos" and the card "Re-processar PDFs da Season".

- [ ] **Step 5: Click "Re-processar tudo" — observe loading state**

Button text changes to "Processando…" and becomes disabled. No spinner component is needed — the text change is sufficient.

- [ ] **Step 6: Wait for the response**

After completion, the summary card should appear showing counts for Processados / Erros / Indisponíveis / Duração.

- [ ] **Step 7: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass, including the 6 new ones in `route.test.ts`.
