# Broadcaster Modal — Design Spec

**Date:** 2026-04-19  
**Status:** Approved

---

## Context

Broadcasters are shown as colored badges in `MatchCard` and `RoundModal`, but clicking them does nothing. Users have no way to navigate to where they can actually watch the game. This feature adds a modal that opens when any broadcaster badge is clicked, listing all broadcasters for that match with a direct link to each platform.

Currently `broadcasters` is `string[]` — no URL is stored. The Gemini prompt will be extended to return `{name, url}` objects, enabling dynamic per-game links sourced from web search grounding.

---

## Architecture

### Type Change

**`src/lib/types.ts`**
```typescript
// New type
export interface BroadcasterInfo {
  name: string;
  url: string;  // empty string if unavailable
}

// Updated MatchPreview
export interface MatchPreview {
  homeForm: string[];
  awayForm: string[];
  broadcasters: BroadcasterInfo[];  // was string[]
}
```

### Gemini Prompt Update

**`src/lib/broadcasterSearch.ts`**  
Change the system prompt to request structured JSON:
```json
[{"name": "CazéTV", "url": "https://www.youtube.com/@cazechannel"}, ...]
```
Parsing logic updated to handle `BroadcasterInfo[]`. Fallback: if response is malformed or a plain string array, map each string to `{ name, url: "" }` to avoid breaking existing behavior.

Return type of `getBroadcastersForFixture` changes from `Promise<string[]>` to `Promise<BroadcasterInfo[]>`.

---

## Components

### BroadcasterModal (new)

**`src/components/BroadcasterModal.tsx`**

Follows the exact pattern of existing modals (`StandingsModal`, `RoundModal`, etc.):
- `useFocusTrap()` + `useScrollLock()`
- Backdrop: `bg-black/70 backdrop-blur-sm`, closes on click
- Props:
  ```typescript
  interface Props {
    broadcasters: BroadcasterInfo[];
    isOpen: boolean;
    onClose: () => void;
  }
  ```
- Header: "Onde assistir" + close button (X via Heroicons `XMarkIcon`)
- Body: list of broadcasters, each row:
  - **Icon:** square div with `backgroundColor` from `BROADCASTER_COLORS`, showing first letter of name (uppercase, white, centered)
  - **Name:** broadcaster name text
  - **Link button:** "Assistir →" opens `url` in new tab (`target="_blank" rel="noopener noreferrer"`). Hidden/disabled when `url === ""`

### BroadcasterBadge (updated)

Currently defined inline in `MatchCard.tsx`. Updates:
- Receives `broadcaster: BroadcasterInfo` instead of `name: string`
- Receives `onClick: (broadcasters: BroadcasterInfo[]) => void` — but the **parent** owns the full list and passes it; the badge just triggers the callback
- Gains `cursor-pointer`, `role="button"`, `aria-label="Ver onde assistir"` for accessibility
- Visual appearance unchanged

### MatchCard (updated)

**`src/components/MatchCard.tsx`**
- Add `useState<boolean>` for modal open state
- Pass full `broadcasters: BroadcasterInfo[]` to each badge's onClick
- Render `<BroadcasterModal>` conditionally

### RoundModal (updated)

**`src/components/RoundModal.tsx`**
- Same pattern as MatchCard: `useState<boolean>` + `<BroadcasterModal>`

---

## Data Flow

```
Gemini (web search grounding)
  → getBroadcastersForFixture() returns BroadcasterInfo[]
  → cached in Redis as JSON
  → API route returns BroadcasterInfo[] in MatchPreview
  → MatchCard / RoundModal render BroadcasterBadge[]
  → user clicks badge → BroadcasterModal opens with full list
  → user clicks "Assistir →" → opens broadcaster URL in new tab
```

---

## Edge Cases

| Case | Behavior |
|------|----------|
| `url === ""` | "Assistir" button hidden; broadcaster still listed |
| No broadcasters | Badge not rendered, modal never opens (existing behavior) |
| Gemini returns malformed JSON | Fallback maps strings to `{name, url: ""}` |
| Broadcaster not in `BROADCASTER_COLORS` | Icon background defaults to `#666666` |

---

## Files Modified

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `BroadcasterInfo`, update `MatchPreview.broadcasters` |
| `src/lib/broadcasterSearch.ts` | Update prompt + parsing, change return type |
| `src/components/MatchCard.tsx` | Update badge usage, add modal state + render |
| `src/components/RoundModal.tsx` | Update badge usage, add modal state + render |
| `src/components/BroadcasterModal.tsx` | **New file** |

---

## Verification

1. Run dev server: `npm run dev`
2. Open a match with known broadcasters (e.g. Brasileirão round with SporTV/Globo)
3. Click any broadcaster badge → modal opens with list
4. Verify icon shows correct color + initial letter
5. Click "Assistir →" → correct URL opens in new tab
6. Click backdrop or X → modal closes
7. Verify keyboard navigation works (Tab through items, Esc closes)
8. Verify matches with no broadcasters are unaffected
9. Check `RoundModal` broadcaster badges also trigger the modal
10. Run `rtk tsc` — no type errors
