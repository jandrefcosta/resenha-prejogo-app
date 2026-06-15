# "Onde assistir" nos jogos da Copa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar a transmissão (onde assistir) nos jogos da Copa 2026, reusando o motor e a UI já existentes — pré-busca para os jogos da janela de 7 dias e busca sob demanda (ao expandir) para o resto.

**Architecture:** O `MatchCard` já exibe `preview.broadcasters`. Adicionamos uma rota `GET /api/copa/broadcasters` que resolve fixtures via `getCopaFixtures()` (server-side) e chama o motor Gemini já existente; o `CopaMatchSection` pré-busca a janela e o `CopaMatchRow` busca sob demanda ao expandir. `MatchCard` não muda.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · React 19 client components · Upstash Redis (cache do motor) · Gemini (`@google/genai`) · Vitest (unit).

**Spec:** `docs/superpowers/specs/2026-06-15-copa-broadcasters-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/semaphore.ts` | `makeSemaphore(concurrency)` — limita chamadas concorrentes | **Criar** (extrair de previews) |
| `src/app/api/previews/route.ts` | Previews dos jogos de clube | Importar `makeSemaphore` (remove cópia local) |
| `src/lib/broadcasterSearch.ts` | Motor de transmissão (Gemini) | Tweak do prompt (neutro) |
| `src/app/api/copa/broadcasters/route.ts` | Transmissão por fixture da Copa (lote/unitário) | **Criar** + teste |
| `src/components/copa/CopaMatchRow.tsx` | Linha de jogo (Grupos) | Prefetch + fetch on-expand |
| `src/components/copa/CopaMatchSection.tsx` | Seção da Copa | Pré-busca da janela + threading |
| `src/components/MatchCard.tsx` | Card do jogo | **Sem mudança** |

---

## Task 0: Branch

- [ ] **Step 1: Criar branch a partir de `main`**

Run:
```bash
git switch -c feat/copa-broadcasters
```
Expected: `Switched to a new branch 'feat/copa-broadcasters'`

---

## Task 1: Extrair `makeSemaphore` para um módulo compartilhado

**Files:**
- Create: `src/lib/semaphore.ts`
- Modify: `src/app/api/previews/route.ts`

- [ ] **Step 1: Criar `src/lib/semaphore.ts`**

```ts
/**
 * Simple semaphore to cap concurrent async calls (e.g. Gemini requests).
 * Without this, N fixtures → N simultaneous calls → 429 throttling.
 * Cached calls return immediately, so the cap only matters on cold-cache bursts.
 */
export function makeSemaphore(concurrency: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            if (queue.length > 0) queue.shift()!();
          });
      };
      if (running < concurrency) run();
      else queue.push(run);
    });
  };
}
```

- [ ] **Step 2: Em `src/app/api/previews/route.ts`, adicionar o import**

Após a linha `import type { BroadcasterInfo, Match, MatchPreview } from '@/lib/types';` (l.6), inserir:
```ts
import { makeSemaphore } from '@/lib/semaphore';
```

- [ ] **Step 3: Remover a definição local de `makeSemaphore`**

Apagar o bloco (comentário + função, l.11-35):
```ts
/**
 * Simple semaphore to cap concurrent Gemini calls.
 * Without this, 20 fixtures → 20 simultaneous Gemini requests → 429 throttling.
 * Cached fixtures hit Redis and return immediately, so the semaphore only
 * matters on cold-cache bursts.
 */
function makeSemaphore(concurrency: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            if (queue.length > 0) queue.shift()!();
          });
      };
      if (running < concurrency) run();
      else queue.push(run);
    });
  };
}
```
O uso `const withSemaphore = makeSemaphore(3);` mais abaixo continua igual (agora resolve via import).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros (os pré-existentes em `src/lib/userRow.test.ts` são aceitáveis e fora de escopo). Nenhum erro mencionando `makeSemaphore`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/semaphore.ts src/app/api/previews/route.ts
git commit -m "refactor: extract makeSemaphore into shared module"
```

---

## Task 2: Tornar o prompt do motor de transmissão neutro (Copa-friendly)

**Files:**
- Modify: `src/lib/broadcasterSearch.ts`

- [ ] **Step 1: Generalizar a primeira linha do system prompt**

Em `src/lib/broadcasterSearch.ts`, dentro de `buildSystemPrompt` (l.8), trocar:
```ts
  return `You are a sports broadcasting assistant for Brazilian football.
```
por:
```ts
  return `You are a sports broadcasting assistant for football matches shown in Brazil.
```
(O resto do prompt e a assinatura da função ficam inalterados — `competitionName` já é injetado no fim do prompt.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/broadcasterSearch.ts
git commit -m "feat: make broadcaster search prompt competition-neutral"
```

---

## Task 3: Rota `GET /api/copa/broadcasters` (TDD)

**Files:**
- Create: `src/app/api/copa/broadcasters/route.ts`
- Test: `src/app/api/copa/broadcasters/route.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/copa/broadcasters/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/app/api/copa/fixtures/route', () => ({
  getCopaFixtures: vi.fn(),
}));
vi.mock('@/lib/broadcasterSearch', () => ({
  getBroadcastersForFixture: vi.fn(),
}));

import { GET } from './route';
import { getCopaFixtures } from '@/app/api/copa/fixtures/route';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';

function fixture(id: string) {
  return {
    id,
    homeTeam: { id: '6', name: 'Brasil', shortName: 'BRA', logo: '' },
    awayTeam: { id: '99', name: 'Escócia', shortName: 'ESC', logo: '' },
    date: '2026-06-20T19:00:00Z',
    round: 'Rodada 1',
    competition: 'World Cup',
    leagueId: 1,
    competitionName: 'Copa 2026',
    status: 'scheduled',
  };
}

function req(ids?: string) {
  const url =
    ids === undefined
      ? 'http://localhost/api/copa/broadcasters'
      : `http://localhost/api/copa/broadcasters?ids=${ids}`;
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  (getCopaFixtures as ReturnType<typeof vi.fn>).mockResolvedValue({
    phases: { Grupos: [fixture('100'), fixture('101')] },
    brazilTeamId: 6,
    updatedAt: '',
    ttlSeconds: 60,
  });
  (getBroadcastersForFixture as ReturnType<typeof vi.fn>).mockResolvedValue([
    { name: 'Globo', url: '' },
  ]);
});

describe('GET /api/copa/broadcasters', () => {
  it('returns {} when ids is missing', async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({});
    expect(getBroadcastersForFixture).not.toHaveBeenCalled();
  });

  it('returns broadcasters for a known fixture id', async () => {
    const res = await GET(req('100'));
    expect(await res.json()).toEqual({ '100': [{ name: 'Globo', url: '' }] });
    expect(getBroadcastersForFixture).toHaveBeenCalledTimes(1);
  });

  it('omits unknown ids without calling the engine', async () => {
    const res = await GET(req('100,999'));
    const body = await res.json();
    expect(body).toEqual({ '100': [{ name: 'Globo', url: '' }] });
    expect(getBroadcastersForFixture).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar o teste — deve falhar**

Run: `npx vitest run src/app/api/copa/broadcasters/route.test.ts`
Expected: FALHA (não encontra `./route` — módulo ainda não existe).

- [ ] **Step 3: Implementar a rota**

Criar `src/app/api/copa/broadcasters/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCopaFixtures } from '@/app/api/copa/fixtures/route';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';
import { makeSemaphore } from '@/lib/semaphore';
import type { BroadcasterInfo, Match } from '@/lib/types';

/** Cap de ids por requisição — limita a rajada de chamadas Gemini. */
const MAX_IDS = 32;
/** Nome de competição enviado ao motor (foca a busca do Gemini). */
const COPA_COMPETITION_NAME = 'Copa do Mundo 2026';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) return NextResponse.json({});

  const requestedIds = Array.from(
    new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean)),
  ).slice(0, MAX_IDS);
  if (requestedIds.length === 0) return NextResponse.json({});

  let fixtureMap: Map<string, Match>;
  try {
    const payload = await getCopaFixtures();
    fixtureMap = new Map(
      Object.values(payload.phases)
        .flat()
        .map((m) => [m.id, m] as const),
    );
  } catch {
    // Sem fixtures não há o que buscar — devolve vazio em vez de 502.
    return NextResponse.json({});
  }

  const withSemaphore = makeSemaphore(3);

  const entries = await Promise.all(
    requestedIds
      .map((id) => fixtureMap.get(id))
      .filter((m): m is Match => m !== undefined)
      .map(async (m) => {
        const broadcasters = await withSemaphore(() =>
          getBroadcastersForFixture(
            m.id,
            m.homeTeam.name,
            m.awayTeam.name,
            m.round,
            m.date,
            COPA_COMPETITION_NAME,
          ).catch(() => [] as BroadcasterInfo[]),
        );
        return [m.id, broadcasters] as const;
      }),
  );

  return NextResponse.json(Object.fromEntries(entries), {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' },
  });
}
```

- [ ] **Step 4: Rodar o teste — deve passar**

Run: `npx vitest run src/app/api/copa/broadcasters/route.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros fora de `src/lib/userRow.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/copa/broadcasters/route.ts src/app/api/copa/broadcasters/route.test.ts
git commit -m "feat: add /api/copa/broadcasters route"
```

---

## Task 4: `CopaMatchRow` — prefetch + busca sob demanda ao expandir

**Files:**
- Modify: `src/components/copa/CopaMatchRow.tsx`

- [ ] **Step 1: Atualizar imports e a interface de props**

No topo de `src/components/copa/CopaMatchRow.tsx`, trocar:
```tsx
import { useState } from 'react';
```
por:
```tsx
import { useEffect, useRef, useState } from 'react';
```
E trocar o import de tipos:
```tsx
import type { Match } from '@/lib/types';
```
por:
```tsx
import type { Match, BroadcasterInfo } from '@/lib/types';
```
Na interface `CopaMatchRowProps`, adicionar a prop:
```tsx
interface CopaMatchRowProps {
  match: Match;
  isBrazil: boolean;
  defaultExpanded?: boolean;
  /** Broadcasters já pré-buscados pela seção (janela de 7d). undefined → busca sob demanda. */
  prefetchedBroadcasters?: BroadcasterInfo[];
}
```

- [ ] **Step 2: Estado + efeito de busca sob demanda**

Trocar a assinatura e a primeira linha do componente:
```tsx
export function CopaMatchRow({ match, isBrazil, defaultExpanded = false }: CopaMatchRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
```
por:
```tsx
export function CopaMatchRow({
  match,
  isBrazil,
  defaultExpanded = false,
  prefetchedBroadcasters,
}: CopaMatchRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Transmissão: usa o prefetch da janela; senão busca sob demanda ao expandir.
  const [fetched, setFetched] = useState<BroadcasterInfo[] | null>(null);
  const [loadingBroadcasters, setLoadingBroadcasters] = useState(false);
  const broadcasterFetchTried = useRef(false);

  useEffect(() => {
    if (!expanded) return;
    if (prefetchedBroadcasters !== undefined) return; // já temos via prefetch
    if (broadcasterFetchTried.current) return;
    broadcasterFetchTried.current = true;
    setLoadingBroadcasters(true);
    fetch(`/api/copa/broadcasters?ids=${match.id}`)
      .then((r) =>
        r.ok ? (r.json() as Promise<Record<string, BroadcasterInfo[]>>) : Promise.reject(),
      )
      .then((data) => setFetched(data[match.id] ?? []))
      .catch(() => setFetched([]))
      .finally(() => setLoadingBroadcasters(false));
  }, [expanded, prefetchedBroadcasters, match.id]);

  const broadcasters = prefetchedBroadcasters ?? fetched ?? [];
```

- [ ] **Step 3: Passar o preview ao `MatchCard`**

No bloco expandido, trocar:
```tsx
          <MatchCard
            match={match}
            highlightClubId={BRAZIL_TEAM_ID}
            previewLoading={false}
          />
```
por:
```tsx
          <MatchCard
            match={match}
            highlightClubId={BRAZIL_TEAM_ID}
            preview={{ broadcasters, homeForm: [], awayForm: [] }}
            previewLoading={loadingBroadcasters}
          />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/copa/CopaMatchRow.tsx
git commit -m "feat: load broadcasters in Copa group match rows"
```

---

## Task 5: `CopaMatchSection` — pré-busca da janela de 7 dias + threading

**Files:**
- Modify: `src/components/copa/CopaMatchSection.tsx`

- [ ] **Step 1: Importar o tipo e adicionar o estado**

No topo, trocar:
```tsx
import type { Match } from '@/lib/types';
```
por:
```tsx
import type { Match, BroadcasterInfo } from '@/lib/types';
```
Logo após `const [teamGroupMap, setTeamGroupMap] = useState<Record<string, string>>({});` (l.191), adicionar:
```tsx
  const [broadcastersById, setBroadcastersById] = useState<Record<string, BroadcasterInfo[]>>({});
```

- [ ] **Step 2: Disparar a pré-busca da janela após carregar os fixtures**

Dentro do `.then((data) => { … })` do fetch de `/api/copa/fixtures`, logo após `setLoading(false);` (l.206), inserir:
```tsx
        // Pré-busca de transmissão para os jogos da janela de 7 dias.
        const now = Date.now();
        const windowEnd = now + 7 * 24 * 60 * 60 * 1000;
        const windowIds = Object.values(data.phases)
          .flat()
          .filter((m) => {
            const t = new Date(m.date).getTime();
            return t >= now - LIVE_WINDOW_MS && t <= windowEnd;
          })
          .map((m) => m.id)
          .slice(0, 32);
        if (windowIds.length > 0) {
          fetch(`/api/copa/broadcasters?ids=${windowIds.join(',')}`)
            .then((r) =>
              r.ok
                ? (r.json() as Promise<Record<string, BroadcasterInfo[]>>)
                : Promise.reject(),
            )
            .then((map) => setBroadcastersById(map))
            .catch(() => {
              // Falhou — cada card busca sob demanda ao expandir.
            });
        }
```
(`LIVE_WINDOW_MS` já está importado em l.5.)

- [ ] **Step 3: Passar o prefetch para os `CopaMatchRow` (aba Grupos)**

Trocar:
```tsx
                      <CopaMatchRow
                        key={match.id}
                        match={match}
                        isBrazil={isBrazilMatch(match)}
                        defaultExpanded={match.id === nextBrazilMatch?.id}
                      />
```
por:
```tsx
                      <CopaMatchRow
                        key={match.id}
                        match={match}
                        isBrazil={isBrazilMatch(match)}
                        defaultExpanded={match.id === nextBrazilMatch?.id}
                        prefetchedBroadcasters={broadcastersById[match.id]}
                      />
```

- [ ] **Step 4: Passar o preview para os `MatchCard` do mata-mata**

Na aba de mata-mata, trocar:
```tsx
              <MatchCard
                match={match}
                highlightClubId={BRAZIL_TEAM_ID}
                previewLoading={false}
              />
```
por:
```tsx
              <MatchCard
                match={match}
                highlightClubId={BRAZIL_TEAM_ID}
                preview={
                  broadcastersById[match.id] !== undefined
                    ? { broadcasters: broadcastersById[match.id], homeForm: [], awayForm: [] }
                    : undefined
                }
                previewLoading={false}
              />
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/copa/CopaMatchSection.tsx
git commit -m "feat: prefetch Copa broadcasters for the 7-day window"
```

---

## Task 6: Verificação final

**Files:** nenhum

- [ ] **Step 1: Unit tests**

Run: `npm run test:unit`
Expected: a suíte da nova rota passa (3 testes). As 3 falhas pré-existentes em `src/app/api/admin/force-reprocess-docs/route.test.ts` continuam (não relacionadas — confirmadas como baseline na sessão anterior).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sem **novos** erros nos arquivos tocados (`semaphore.ts`, `broadcasters/route.ts`, `CopaMatchRow.tsx`, `CopaMatchSection.tsx`, `broadcasterSearch.ts`, `previews/route.ts`). Erros pré-existentes em outros arquivos podem permanecer.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build conclui; a rota `/api/copa/broadcasters` aparece no manifesto de rotas.

- [ ] **Step 4: Verificação manual (`npm run dev`)**

Abrir `/copa-2026` e conferir:
- Expandir um jogo **dentro de 7 dias** (ex.: próximo jogo do Brasil): badges de transmissão aparecem **sem spinner** (vieram do prefetch). Clicar num badge abre o `BroadcasterModal`.
- Expandir um jogo **distante**: aparece o spinner de preview brevemente e depois badges **ou** o estado vazio ("a confirmar"), sem erro no console.
- Conferir no Network: um `GET /api/copa/broadcasters?ids=…` em lote ao carregar a página, e um `?ids=<id único>` ao expandir um jogo fora da janela.

- [ ] **Step 5: Integração (decisão do usuário)**

Usar `superpowers:finishing-a-development-branch` para escolher merge/PR. Não fazer merge em `main` sem aprovação (push em `main` dispara deploy de produção no Railway).

---

## Self-review (preenchido pelo autor do plano)

- **Cobertura do spec:** rota nova (T3) ✓, resolução server-side via `getCopaFixtures` (T3) ✓, semáforo+cache reusados (T1/T3) ✓, extração `makeSemaphore` DRY (T1) ✓, prefetch janela 7d + cap 32 (T5) ✓, sob demanda ao expandir (T4) ✓, badge no card expandido (T4) ✓, mata-mata recebe preview (T5) ✓, form vazio p/ seleções (T4/T5 passam `homeForm:[]/awayForm:[]`) ✓, tweak do prompt (T2) ✓, `MatchCard` intocado ✓, testes unit + manual (T3/T6) ✓.
- **Placeholders:** nenhum — todo passo de código traz o código literal.
- **Consistência de tipos:** `BroadcasterInfo {name,url}` e `MatchPreview {homeForm,awayForm,broadcasters}` usados de forma consistente; `getBroadcastersForFixture(id, home, away, round, date, competitionName)` casa com a assinatura real; `getCopaFixtures(): Promise<CopaFixturesPayload>` com `phases: Record<string, Match[]>` casa com o uso em T3/T5.
- **Escopo:** um único plano coeso (1 rota + 1 util + 1 tweak + 2 componentes), sem subsistemas independentes.
