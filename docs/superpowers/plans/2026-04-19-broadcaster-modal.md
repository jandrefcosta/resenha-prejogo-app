# Broadcaster Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal that opens when a broadcaster badge is clicked, listing all broadcasters for that match with direct links sourced from Gemini web search.

**Architecture:** Extend `BroadcasterInfo` type to carry `{name, url}`, update Gemini prompt to return this shape, then wire a new `BroadcasterModal` component into `MatchCard` and `RoundModal` via click handlers on the existing badges.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Heroicons, Gemini 2.5 Flash (web search grounding), Redis (via existing caching layer)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/types.ts` | Modify | Add `BroadcasterInfo` interface; update `MatchPreview.broadcasters` |
| `src/lib/broadcasterSearch.ts` | Modify | Update Gemini prompt + parsing; change return type |
| `src/components/BroadcasterModal.tsx` | Create | Modal UI: icon + name + "Assistir →" link per broadcaster |
| `src/components/MatchCard.tsx` | Modify | Update `BroadcasterBadge` to accept `BroadcasterInfo`; add modal state + render |
| `src/components/RoundModal.tsx` | Modify | Same updates as MatchCard |

---

## Task 1: Add `BroadcasterInfo` type and update `MatchPreview`

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Open `src/lib/types.ts` and locate `MatchPreview`**

Find lines ~174-178:
```typescript
export interface MatchPreview {
  homeForm: string[];
  awayForm: string[];
  broadcasters: string[];
}
```

- [ ] **Step 2: Add `BroadcasterInfo` interface above `MatchPreview` and update the field**

Replace the `MatchPreview` block with:
```typescript
export interface BroadcasterInfo {
  name: string;
  url: string;
}

export interface MatchPreview {
  homeForm: string[];
  awayForm: string[];
  broadcasters: BroadcasterInfo[];
}
```

- [ ] **Step 3: Run type check to see current errors (expected)**

```bash
rtk tsc --noEmit 2>&1 | head -60
```

Expected: errors in `broadcasterSearch.ts`, `MatchCard.tsx`, `RoundModal.tsx` — that's correct, we'll fix them in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
rtk git add src/lib/types.ts && rtk git commit -m "feat: add BroadcasterInfo type, update MatchPreview.broadcasters"
```

---

## Task 2: Update Gemini prompt and parsing in `broadcasterSearch.ts`

**Files:**
- Modify: `src/lib/broadcasterSearch.ts`

- [ ] **Step 1: Open `src/lib/broadcasterSearch.ts` and read it fully**

Note the current structure:
- `buildSystemPrompt()` returns a string prompt
- `parseBroadcasters(text)` extracts a JSON array from the response
- `getBroadcastersForFixture()` calls both and returns `Promise<string[]>`

- [ ] **Step 2: Update `buildSystemPrompt` to request `{name, url}` objects**

Find the system prompt string (lines ~6-18). The prompt instructs Gemini to return a JSON array of broadcaster names. Update the JSON example in the prompt to include URLs. Change the relevant sentence to:

```typescript
function buildSystemPrompt(competitionName: string): string {
  return `You are a sports broadcasting assistant for Brazilian football.
Your task: find ONLY the confirmed TV/streaming broadcasters for a specific match.

Return a JSON array of objects with this exact shape:
[{"name": "Globo", "url": "https://globoplay.globo.com"}, {"name": "SporTV", "url": "https://globoplay.globo.com/sportv"}]

Rules:
- Include ONLY broadcasters confirmed for THIS specific match
- Do NOT include general channel information
- The "url" must be the direct watch/live page for the broadcaster, NOT a search page
- If you cannot find a confirmed URL for a broadcaster, use "" (empty string) for url
- If no broadcasters are confirmed, return: []
- Competition: ${competitionName}`;
}
```

- [ ] **Step 3: Update `parseBroadcasters` to return `BroadcasterInfo[]`**

Find the current `parseBroadcasters` function. Replace it with:

```typescript
function parseBroadcasters(text: string): BroadcasterInfo[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown) => {
      if (typeof item === 'string') {
        // fallback: plain string from old format
        return { name: item, url: '' };
      }
      if (typeof item === 'object' && item !== null && 'name' in item) {
        const obj = item as Record<string, unknown>;
        return {
          name: typeof obj.name === 'string' ? obj.name : String(obj.name),
          url: typeof obj.url === 'string' ? obj.url : '',
        };
      }
      return null;
    }).filter((b): b is BroadcasterInfo => b !== null);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Update `getBroadcastersForFixture` return type**

Change the function signature from:
```typescript
async function getBroadcastersForFixture(...): Promise<string[]>
```
To:
```typescript
async function getBroadcastersForFixture(...): Promise<BroadcasterInfo[]>
```

Also add the import at the top of the file if not already present:
```typescript
import type { BroadcasterInfo } from './types';
```

- [ ] **Step 5: Run type check — errors should now only be in component files**

```bash
rtk tsc --noEmit 2>&1 | head -60
```

Expected: errors only in `MatchCard.tsx` and `RoundModal.tsx`.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/broadcasterSearch.ts && rtk git commit -m "feat: update Gemini prompt and parser to return BroadcasterInfo[]"
```

---

## Task 3: Create `BroadcasterModal` component

**Files:**
- Create: `src/components/BroadcasterModal.tsx`

- [ ] **Step 1: Create the file**

```typescript
'use client';

import { useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { BROADCASTER_COLORS } from '@/lib/broadcasterColors';
import type { BroadcasterInfo } from '@/lib/types';

interface Props {
  broadcasters: BroadcasterInfo[];
  isOpen: boolean;
  onClose: () => void;
}

export function BroadcasterModal({ broadcasters, isOpen, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  useScrollLock();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Onde assistir"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-sm max-h-[80dvh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white font-sans">Onde assistir</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
            aria-label="Fechar"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Broadcaster list */}
        <ul className="overflow-y-auto flex-1 divide-y divide-zinc-800">
          {broadcasters.map((b) => {
            const bg = BROADCASTER_COLORS[b.name] ?? '#666666';
            const initial = b.name.charAt(0).toUpperCase();
            return (
              <li key={b.name} className="flex items-center gap-3 px-4 py-3">
                {/* Icon */}
                <span
                  className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: bg }}
                  aria-hidden="true"
                >
                  {initial}
                </span>

                {/* Name */}
                <span className="flex-1 text-sm text-white font-sans">{b.name}</span>

                {/* Link */}
                {b.url && (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-semibold text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                  >
                    Assistir →
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check — no new errors expected from this file**

```bash
rtk tsc --noEmit 2>&1 | head -60
```

Expected: still only errors in `MatchCard.tsx` and `RoundModal.tsx`.

- [ ] **Step 3: Commit**

```bash
rtk git add src/components/BroadcasterModal.tsx && rtk git commit -m "feat: add BroadcasterModal component"
```

---

## Task 4: Update `MatchCard.tsx`

**Files:**
- Modify: `src/components/MatchCard.tsx`

- [ ] **Step 1: Add `BroadcasterModal` import**

At the top of `MatchCard.tsx`, add:
```typescript
import { BroadcasterModal } from './BroadcasterModal';
import type { BroadcasterInfo } from '@/lib/types';
```

- [ ] **Step 2: Update `BroadcasterBadge` sub-component (lines 37-47)**

Replace:
```typescript
function BroadcasterBadge({ name }: { name: string }) {
  const bg = BROADCASTER_COLORS[name] ?? "#374151";
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-bold text-white"
      style={{ backgroundColor: bg }}
    >
      {name}
    </span>
  );
}
```

With:
```typescript
function BroadcasterBadge({ broadcaster, onClick }: { broadcaster: BroadcasterInfo; onClick: () => void }) {
  const bg = BROADCASTER_COLORS[broadcaster.name] ?? "#374151";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-block rounded px-2 py-0.5 text-xs font-bold text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
      style={{ backgroundColor: bg }}
      aria-label="Ver onde assistir"
    >
      {broadcaster.name}
    </button>
  );
}
```

- [ ] **Step 3: Add modal state inside the `MatchCard` component**

Find where other `useState` calls live in `MatchCard`. Add:
```typescript
const [broadcasterModalOpen, setBroadcasterModalOpen] = useState(false);
```

- [ ] **Step 4: Update the broadcasters render section (lines ~1995-2020)**

Find:
```typescript
{!previewLoading &&
  broadcasters.length > 0 &&
  broadcasters.map((b: string) => (
    <BroadcasterBadge key={b} name={b} />
  ))}
```

Replace with:
```typescript
{!previewLoading &&
  broadcasters.length > 0 &&
  broadcasters.map((b: BroadcasterInfo) => (
    <BroadcasterBadge
      key={b.name}
      broadcaster={b}
      onClick={() => setBroadcasterModalOpen(true)}
    />
  ))}
```

- [ ] **Step 5: Add modal render at the bottom of MatchCard's JSX return**

Just before the closing tag of the outermost element in MatchCard's return, add:
```typescript
<BroadcasterModal
  broadcasters={broadcasters}
  isOpen={broadcasterModalOpen}
  onClose={() => setBroadcasterModalOpen(false)}
/>
```

- [ ] **Step 6: Run type check — MatchCard errors should be gone**

```bash
rtk tsc --noEmit 2>&1 | head -60
```

Expected: only `RoundModal.tsx` errors remain.

- [ ] **Step 7: Commit**

```bash
rtk git add src/components/MatchCard.tsx && rtk git commit -m "feat: wire BroadcasterModal into MatchCard"
```

---

## Task 5: Update `RoundModal.tsx`

**Files:**
- Modify: `src/components/RoundModal.tsx`

- [ ] **Step 1: Add `BroadcasterModal` import**

At the top of `RoundModal.tsx`, add:
```typescript
import { BroadcasterModal } from './BroadcasterModal';
import type { BroadcasterInfo } from '@/lib/types';
```

- [ ] **Step 2: Update `BroadcasterBadge` sub-component (lines 127-137)**

Replace:
```typescript
function BroadcasterBadge({ name }: { name: string }) {
  const bg = BROADCASTER_COLORS[name] ?? '#374151';
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white leading-tight"
      style={{ backgroundColor: bg }}
    >
      {name}
    </span>
  );
}
```

With:
```typescript
function BroadcasterBadge({ broadcaster, onClick }: { broadcaster: BroadcasterInfo; onClick: () => void }) {
  const bg = BROADCASTER_COLORS[broadcaster.name] ?? '#374151';
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white leading-tight cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
      style={{ backgroundColor: bg }}
      aria-label="Ver onde assistir"
    >
      {broadcaster.name}
    </button>
  );
}
```

- [ ] **Step 3: Add modal state to the `MatchRow` sub-component**

Find the `MatchRow` component (where broadcasters are rendered, ~line 140+). Add state:
```typescript
const [broadcasterModalOpen, setBroadcasterModalOpen] = useState(false);
```

Note: `useState` is already imported in `RoundModal.tsx`.

- [ ] **Step 4: Update the broadcasters render section (lines ~206-213)**

Find:
```typescript
{!isPostponed && match.broadcasters.length > 0 && (
  <div className="flex items-center gap-1 flex-wrap">
    {match.broadcasters.map((b) => <BroadcasterBadge key={b} name={b} />)}
  </div>
)}
```

Replace with:
```typescript
{!isPostponed && match.broadcasters.length > 0 && (
  <div className="flex items-center gap-1 flex-wrap">
    {match.broadcasters.map((b: BroadcasterInfo) => (
      <BroadcasterBadge
        key={b.name}
        broadcaster={b}
        onClick={() => setBroadcasterModalOpen(true)}
      />
    ))}
  </div>
)}
```

- [ ] **Step 5: Add modal render inside `MatchRow`**

Just before the closing tag of `MatchRow`'s return, add:
```typescript
<BroadcasterModal
  broadcasters={match.broadcasters}
  isOpen={broadcasterModalOpen}
  onClose={() => setBroadcasterModalOpen(false)}
/>
```

- [ ] **Step 6: Run type check — zero errors expected**

```bash
rtk tsc --noEmit 2>&1 | head -30
```

Expected: clean output (no errors).

- [ ] **Step 7: Commit**

```bash
rtk git add src/components/RoundModal.tsx && rtk git commit -m "feat: wire BroadcasterModal into RoundModal"
```

---

## Task 6: End-to-end verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the app in the browser at `http://localhost:3000`**

- [ ] **Step 3: Find a match with broadcasters and click a badge**

Expected: `BroadcasterModal` opens with a list of broadcasters

- [ ] **Step 4: Verify each row shows**
  - Colored square with first letter
  - Broadcaster name
  - "Assistir →" button (if URL available)

- [ ] **Step 5: Click "Assistir →"**

Expected: correct broadcaster URL opens in a new tab

- [ ] **Step 6: Close via backdrop click**

Expected: modal closes

- [ ] **Step 7: Close via X button**

Expected: modal closes

- [ ] **Step 8: Close via Escape key**

Expected: modal closes (handled by `useFocusTrap`)

- [ ] **Step 9: Open `RoundModal` and click a broadcaster badge there**

Expected: same `BroadcasterModal` opens correctly

- [ ] **Step 10: Verify matches with no broadcasters are unaffected**

Expected: no badge rendered, no modal trigger

- [ ] **Step 11: Final type check**

```bash
rtk tsc --noEmit
```

Expected: no output (clean)
