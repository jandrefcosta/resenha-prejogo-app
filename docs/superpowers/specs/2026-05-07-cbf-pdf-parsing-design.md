# CBF PDF Parsing — Resilient Pipeline Design

**Date:** 2026-05-07
**Status:** Approved

---

## Problem

The CBF publishes two official PDF documents per Série A match:

- **Súmula de Arbitragem (`se.pdf`)** — lineups, goals, cards, substitutions, referees
- **Boletim Financeiro (`b.pdf`)** — attendance (público) and revenue (renda)

Both PDFs are available at `conteudo.cbf.com.br` but **expire ~2 months after the match**. The current pipeline has two failure modes:

1. **Image-based PDFs** — `unpdf` extracts empty or garbage text; parser produces all-null results stored permanently in Redis.
2. **Regex fragility** — CBF changes the layout; text is extractable but patterns fail silently, producing partial/null results also stored permanently.

Once a null result is cached permanently in Redis, users never get the data. Once the PDF expires on CBF's server, recovery is impossible.

---

## Goals

- Parse all available data from both document types reliably.
- Never lose data because the 2-month window passed before a user opened the match.
- Store PDFs durably so parsing can be retried if logic improves.
- Keep Gemini API costs minimal — AI only called when deterministic parsing fails.
- Preserve the "never read the PDF twice" guarantee once a good parse is cached.

---

## Non-Goals

- Parsing the Relatório de Jogo (`rdj.pdf`) — out of scope for this iteration.
- Retroactive batch reprocessing — matches where the PDF already expired before this implementation are unrecoverable. Lazy backfill only works for matches whose PDFs are downloaded into Postgres going forward.
- External object storage (R2, S3) — Postgres BYTEA is the chosen store to avoid new dependencies.

---

## Architecture

### New: `pdf_files` Postgres Table

Stores raw PDF bytes durably. Primary source for the parsing pipeline; CBF URL is the fallback within the 2-month window.

```sql
CREATE TABLE pdf_files (
  id_jogo       TEXT        NOT NULL,
  type          TEXT        NOT NULL,  -- 'sumula' | 'boletim' | 'relatorio'
  content       BYTEA       NOT NULL,
  url           TEXT,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id_jogo, type)
);
```

### New: Confidence Scorer

A pure utility function that inspects a parsed result and returns a score from 0–1 based on how many critical fields are populated.

**Súmula critical fields** (equal weight):
- `mandante.titulares.length > 0`
- `visitante.titulares.length > 0`
- `gols` array present (even if empty — zero goals is valid)
- `cartoes` array present
- `arbitros.length > 0`

**Boletim critical fields** (equal weight):
- `publico.geral !== null`
- `renda.bruta !== null`
- `ingressos.length > 0`

**Threshold:** `0.4` — if fewer than 40% of critical fields are populated, the result is considered a failed parse. This constant is defined once and easy to tune.

### New: Gemini PDF Parser

Sends the raw `ArrayBuffer` to Gemini 2.5 Flash as inline base64 with MIME type `application/pdf`. Gemini handles both text-based and image-scanned PDFs natively.

Returns a typed result (`CbfSumulaData` | `CbfBoletimData`) or `null` if the model cannot extract usable data. The prompt asks for structured JSON output matching the existing type schemas exactly — no schema changes needed downstream.

### Modified: `processMatchDocuments()`

Two new decision points added to the existing orchestration function:

**On cache hit (lazy backfill of previously bad parses):**
```
existing cached sumula/boletim found in Redis
  └─ score ≥ 0.4  →  return cached ✓  (fast path, no change)
  └─ score < 0.4  →  evict bad Redis keys, fall through to re-process
```

**After regex parsing (Gemini fallback):**
```
parseSumula() / parseBoletim() runs
  └─ score ≥ 0.4  →  store to Redis permanently ✓
  └─ score < 0.4  →  call Gemini parser with same buffer
      └─ Gemini score ≥ 0.4  →  store to Redis permanently ✓
      └─ Gemini also fails   →  store sentinel with 30-min TTL (retry later)
```

### Modified: `seed-match-docs` → Cron Job

Currently a one-off script. Must become a scheduled cron that runs after each match day to proactively download and store PDFs to Postgres **before the 2-month expiry window**.

The cron:
1. Fetches all finished Série A matches from the last N days (configurable, default 55 days to stay within the 2-month window).
2. For each match, checks if `pdf_files` already has both `sumula` and `boletim`.
3. If missing, resolves PDF URLs, downloads, and inserts into Postgres.
4. Does NOT trigger parsing — parsing remains on-demand.

---

## Data Flow

### Proactive download (cron, runs after match days)

```
seed-match-docs cron
  ├─ Get finished matches (CBF API)
  ├─ For each match missing PDFs in Postgres:
  │   ├─ Resolve URL (match.documentos[] or constructed fallback)
  │   ├─ Download ArrayBuffer
  │   └─ INSERT INTO pdf_files (id_jogo, type, content, url)
  └─ Done — no parsing at this stage
```

### On-demand parse (user opens a match ficha)

```
processMatchDocuments(match)
  ├─ 1. Redis sentinel check (existing)
  │      available: false + TTL not expired → return { available: false }
  │
  ├─ 2. Redis data check + confidence gate (NEW)
  │      sumula/boletim in Redis AND score ≥ 0.4 → return cached ✓
  │      score < 0.4 → evict keys, continue
  │
  ├─ 3. Fetch PDF from Postgres pdf_files (NEW)
  │      found → use stored buffer
  │      not found → try CBF URL directly (within 2-month window)
  │      neither → store { available: false } sentinel (30-min TTL), return
  │
  ├─ 4. Run regex parsers (existing)
  │      parseSumula() + parseBoletim()
  │
  ├─ 5. Confidence check + Gemini fallback (NEW)
  │      score ≥ 0.4 → proceed
  │      score < 0.4 → call Gemini parser
  │
  └─ 6. Store permanently in Redis (existing)
         setCachePermanent for sentinel + sumula + boletim
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| PDF not yet published | `{ available: false }` sentinel stored with 30-min TTL. Re-checked on next user open. |
| CBF URL down + not in Postgres | Same as above. |
| Regex fails + Gemini fails | `{ available: false }` sentinel with 30-min TTL. Not stored permanently so it retries. |
| Regex fails + Gemini succeeds | Gemini result stored permanently. |
| Regex succeeds | Regex result stored permanently. Gemini not called. |
| Good result already in Redis | Returned immediately. Nothing called. |
| Bad result in Redis (score < 0.4) | Keys evicted. Re-processed through full pipeline. |

---

## Files Affected

| File | Change |
|---|---|
| `src/lib/cbfDocParser.ts` | Add `scoreResult()` confidence scorer; add Gemini fallback inside `processMatchDocuments()` |
| `src/lib/cbfGeminiParser.ts` | New — Gemini PDF parser for súmula and boletim |
| `src/lib/cbfDocTypes.ts` | No changes |
| `src/lib/redisCache.ts` | No changes |
| `scripts/seed-match-docs.ts` | Add Postgres PDF storage step; convert to cron-compatible |
| `src/app/api/admin/bust-match-docs/route.ts` | Update to also evict Postgres PDF entry when busting |
| Drizzle schema | Add `pdf_files` table migration |

---

## Out of Scope

- Changing `CbfSumulaData` or `CbfBoletimData` type shapes — Gemini output maps to existing types.
- Processing Copa do Brasil / Libertadores PDFs — CBF data is Série A only.
- Batch reprocessing all historical matches — lazy on next user open.
