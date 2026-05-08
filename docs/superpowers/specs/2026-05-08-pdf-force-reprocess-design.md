# Design: Forced PDF Re-extraction — Admin Panel

**Date:** 2026-05-08  
**Status:** Approved  

## Problem

Some matches have incorrect or missing extraction of attendance data (público) and other fields from CBF PDF documents. Root causes are mixed — regex misses on format variations, confidence gate rejections, and Gemini fallback failures. The current `bust-match-docs` endpoint only clears cache without forcing a re-download from CBF, so re-parsing continues from potentially stale Postgres PDFs.

## Goal

Give the admin a single-click operation that re-downloads all PDFs from CBF, replaces what is stored in Postgres, and re-parses the full season — producing a final summary without requiring manual intervention per match.

## Scope

- Season-level granularity: all finished rounds (1–38) of Série A
- No per-round or per-match selection (not needed for now)
- Re-download from CBF is mandatory (not re-parse from existing Postgres content)

---

## Architecture

### New API Route: `POST /api/admin/force-reprocess-docs`

**Auth:** `isAdminRequest()` — same pattern as all other admin routes.

**Execution:** Synchronous. Client awaits the full response.

**Per-match flow:**
1. `getCbfRound(r)` for rounds 1–38 — skip non-finished rounds
2. For each match in the round:
   a. `resolvePdfUrls(match)` — fetch current URLs from CBF API/fallback
   b. `deletePdfs(idJogo)` — remove from Postgres
   c. Clear Redis keys: `cbf:match:{id}:docs:status`, `:sumula`, `:boletim`
   d. `downloadPdf(url)` + `savePdf(idJogo, type, buffer)` — re-download and store in Postgres
   e. `processMatchDocuments(match)` — parse + confidence gate + Gemini fallback + cache to Redis
3. Accumulate counters: `processed | errors | unavailable | skipped`

**Response:**
```json
{
  "ok": true,
  "rounds": 24,
  "processed": 127,
  "errors": 3,
  "unavailable": 8,
  "durationMs": 252000
}
```

**Error handling:** Per-match errors are caught individually and counted; they do not abort the full run.

---

### New Admin Page: `/admin/docs`

**Files:**
- `src/app/admin/(authed)/docs/page.tsx` — Server Component shell (metadata + layout)
- `src/components/admin/DocsReprocessCard.tsx` — Client Component with state machine

**Nav:** Add "Documentos" entry to `AdminNav.tsx`.

**UI states:**

| State | Behavior |
|-------|----------|
| `idle` | Button enabled: "Re-processar tudo" |
| `loading` | Button disabled + spinner + "Processando…" |
| `done` | Summary card: ✓ Processados / ✗ Erros / — Indisponíveis / Duração |
| `error` | Error message if route returns non-200 |

No polling, no SSE. Single `await fetch('POST /api/admin/force-reprocess-docs')` — the component waits for the response and renders the summary.

---

## Data Flow

```
Admin clicks button
  → POST /api/admin/force-reprocess-docs
    → for each finished round:
        for each match:
          resolvePdfUrls()
          deletePdfs()          ← Postgres
          clearRedisKeys()      ← Redis
          downloadPdf() + savePdf()   ← CBF → Postgres
          processMatchDocuments()     ← parse + cache → Redis
  ← { ok, rounds, processed, errors, unavailable, durationMs }
Admin sees summary
```

---

## Files to Create / Modify

| Action | File |
|--------|------|
| Create | `src/app/api/admin/force-reprocess-docs/route.ts` |
| Create | `src/app/admin/(authed)/docs/page.tsx` |
| Create | `src/components/admin/DocsReprocessCard.tsx` |
| Modify | `src/components/admin/AdminNav.tsx` |

---

## Out of Scope

- Per-round or per-match granularity
- SSE progress streaming
- Scheduling / cron integration
- Any changes to the parsing logic itself
