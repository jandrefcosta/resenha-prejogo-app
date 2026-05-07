# CBF PDF Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CBF PDF parsing pipeline resilient to image-based PDFs and regex fragility by storing PDFs in Postgres, adding a confidence scorer, and falling back to Gemini 2.5 Flash when regex produces poor results.

**Architecture:** PDFs are downloaded proactively by a cron job and stored permanently in a new `pdf_files` Postgres table before the 2-month CBF expiry window. On-demand parsing reads from Postgres first (falling back to the CBF URL), runs the existing regex parser, scores the result, and calls Gemini only when confidence is below 0.4. Results that pass confidence are cached permanently in Redis as before; failures get a 30-min retry sentinel.

**Tech Stack:** Drizzle ORM (existing), `@google/genai` (existing), `unpdf` (existing), vitest (new dev dependency), Upstash Redis (existing), Postgres (existing).

---

## File Map

| File | Action |
|---|---|
| `src/lib/db/schema.ts` | Add `pdfFiles` table + inferred types |
| `drizzle/` | Generated migration (via `drizzle-kit generate`) |
| `vitest.config.ts` | New — vitest config with `@` alias |
| `src/lib/cbfDocConfidence.ts` | New — confidence scorer (pure functions) |
| `src/lib/cbfDocConfidence.test.ts` | New — unit tests |
| `src/lib/cbfPdfStore.ts` | New — Postgres PDF get/save/delete |
| `src/lib/cbfGeminiParser.ts` | New — Gemini PDF parser |
| `src/lib/cbfGeminiParser.test.ts` | New — unit tests (mocked Gemini) |
| `src/lib/cbfDocParser.ts` | Modify — integrate confidence + PDF store + Gemini fallback |
| `scripts/seed-match-docs.ts` | Modify — download + store to Postgres (no parsing) |
| `src/app/api/admin/bust-match-docs/route.ts` | Modify — also delete from `pdf_files` |

---

## Task 1: Add `pdfFiles` table to Drizzle schema

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add the `bytea` custom type and `pdfFiles` table to the schema**

Open `src/lib/db/schema.ts`. Add the following after the existing imports and before the first table definition:

```typescript
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  jsonb,
  index,
  customType,        // ← add this
} from 'drizzle-orm/pg-core';

// ─── Custom types ──────────────────────────────────────────────────────────────

const bytea = customType<{ data: Buffer }>({
  dataType() { return 'bytea'; },
});
```

Then add the table and its inferred types at the end of the file (before the existing inferred-types section):

```typescript
// ─── PDF Files ─────────────────────────────────────────────────────────────────

export const pdfFiles = pgTable('pdf_files', {
  idJogo:       text('id_jogo').notNull(),
  type:         text('type').notNull(),   // 'sumula' | 'boletim' | 'relatorio'
  content:      bytea('content').notNull(),
  url:          text('url'),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.idJogo, t.type] }),
  index('idx_pdf_files_id_jogo').on(t.idJogo),
]);

export type PdfFile    = typeof pdfFiles.$inferSelect;
export type NewPdfFile = typeof pdfFiles.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

```bash
npx drizzle-kit generate --name=add_pdf_files
```

Expected: a new file appears under `drizzle/` named something like `0007_add_pdf_files.sql` containing:

```sql
CREATE TABLE "pdf_files" (
  "id_jogo" text NOT NULL,
  "type" text NOT NULL,
  "content" bytea NOT NULL,
  "url" text,
  "downloaded_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "pdf_files_id_jogo_type_pk" PRIMARY KEY("id_jogo","type")
);
CREATE INDEX "idx_pdf_files_id_jogo" ON "pdf_files" ("id_jogo");
```

- [ ] **Step 3: Push the migration to the database**

```bash
npx drizzle-kit migrate --config=drizzle.config.ts
```

Expected output: `[✓] Migrations applied successfully`

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add pdf_files table for durable CBF PDF storage"
```

---

## Task 2: Set up vitest for unit tests

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

Expected: vitest appears in `devDependencies` in `package.json`.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

Inside the `"scripts"` block, add:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

- [ ] **Step 4: Verify vitest is wired up**

```bash
npm run test:unit
```

Expected: `No test files found, exiting with code 1` (no tests yet — that's fine, confirms vitest runs).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

## Task 3: Confidence scorer (TDD)

**Files:**
- Create: `src/lib/cbfDocConfidence.ts`
- Create: `src/lib/cbfDocConfidence.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/cbfDocConfidence.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scoreSumula, scoreBoletim, CONFIDENCE_THRESHOLD } from './cbfDocConfidence';
import type { CbfSumulaData, CbfBoletimData } from './cbfDocTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const player = { numero: 1, nome: 'Jogador', apelido: 'J' };

const fullTeam = {
  nome: 'Time A', gols: 0,
  titulares: [player], reservas: [], substituicoes: [],
};

const emptyTeam = {
  nome: 'Time A', gols: 0,
  titulares: [], reservas: [], substituicoes: [],
};

const fullSumula: CbfSumulaData = {
  idJogo: '123', parsedAt: '', campeonato: 'Série A', rodada: '1',
  data: '01/01/2026', hora: '19:00', estadio: 'Arena', cidade: 'SP',
  mandante: fullTeam,
  visitante: fullTeam,
  arbitros: [{ funcao: 'Árbitro', nome: 'João', uf: 'SP' }],
  gols: [],
  cartoes: [],
};

const fullBoletim: CbfBoletimData = {
  idJogo: '123', parsedAt: '', estadio: 'Arena', data: '01/01/2026',
  publico: { geral: 10000, pagante: 9000, naoPagente: 1000 },
  renda: { bruta: 500000, liquida: 400000 },
  ingressos: [{ categoria: 'Inteira', quantidade: 9000, valorUnitario: null, valorTotal: 500000 }],
};

// ─── scoreSumula ──────────────────────────────────────────────────────────────

describe('scoreSumula', () => {
  it('returns 1.0 when all critical fields are populated', () => {
    expect(scoreSumula(fullSumula)).toBe(1.0);
  });

  it('returns 0.0 when both teams have no titulares and no referees', () => {
    const empty: CbfSumulaData = {
      ...fullSumula,
      mandante: { ...emptyTeam },
      visitante: { ...emptyTeam },
      arbitros: [],
    };
    expect(scoreSumula(empty)).toBe(0);
  });

  it('stays above threshold when only titulares + arrays are present', () => {
    const partial: CbfSumulaData = {
      ...fullSumula,
      arbitros: [],
    };
    // 4/5 checks pass → 0.8
    expect(scoreSumula(partial)).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('falls below threshold when both teams are empty regardless of referees', () => {
    const bad: CbfSumulaData = {
      ...fullSumula,
      mandante: { ...emptyTeam },
      visitante: { ...emptyTeam },
    };
    // 3/5 checks pass → 0.6 — actually above threshold, only fails arrays if they're not arrays
    // The key case: all 5 fields empty
    const worst: CbfSumulaData = {
      ...fullSumula,
      mandante: { ...emptyTeam },
      visitante: { ...emptyTeam },
      arbitros: [],
      gols: null as unknown as [],
      cartoes: null as unknown as [],
    };
    expect(scoreSumula(worst)).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
});

// ─── scoreBoletim ─────────────────────────────────────────────────────────────

describe('scoreBoletim', () => {
  it('returns 1.0 when all critical fields are populated', () => {
    expect(scoreBoletim(fullBoletim)).toBe(1.0);
  });

  it('returns 0.0 when all fields are null/empty', () => {
    const empty: CbfBoletimData = {
      ...fullBoletim,
      publico: { geral: null, pagante: null, naoPagente: null },
      renda: { bruta: null, liquida: null },
      ingressos: [],
    };
    expect(scoreBoletim(empty)).toBe(0);
  });

  it('returns above threshold when public count and gross revenue are present', () => {
    const partial: CbfBoletimData = {
      ...fullBoletim,
      ingressos: [],
    };
    // 2/3 checks → 0.67
    expect(scoreBoletim(partial)).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
});

// ─── CONFIDENCE_THRESHOLD ─────────────────────────────────────────────────────

describe('CONFIDENCE_THRESHOLD', () => {
  it('is 0.4', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.4);
  });
});
```

- [ ] **Step 2: Run — expect failure (module not found)**

```bash
npm run test:unit
```

Expected: `Cannot find module './cbfDocConfidence'`

- [ ] **Step 3: Implement the scorer**

Create `src/lib/cbfDocConfidence.ts`:

```typescript
import type { CbfBoletimData, CbfSumulaData } from '@/lib/cbfDocTypes';

export const CONFIDENCE_THRESHOLD = 0.4;

export function scoreSumula(data: CbfSumulaData): number {
  const checks = [
    data.mandante.titulares.length > 0,
    data.visitante.titulares.length > 0,
    Array.isArray(data.gols),
    Array.isArray(data.cartoes),
    data.arbitros.length > 0,
  ];
  return checks.filter(Boolean).length / checks.length;
}

export function scoreBoletim(data: CbfBoletimData): number {
  const checks = [
    data.publico.geral !== null,
    data.renda.bruta !== null,
    data.ingressos.length > 0,
  ];
  return checks.filter(Boolean).length / checks.length;
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
npm run test:unit
```

Expected: `✓ src/lib/cbfDocConfidence.test.ts (7 tests)`

- [ ] **Step 5: Commit**

```bash
git add src/lib/cbfDocConfidence.ts src/lib/cbfDocConfidence.test.ts
git commit -m "feat: add confidence scorer for CBF parsed PDF results"
```

---

## Task 4: PDF store module

**Files:**
- Create: `src/lib/cbfPdfStore.ts`

No unit tests for this module — it's a thin Postgres wrapper, tested via integration in later tasks.

- [ ] **Step 1: Create `src/lib/cbfPdfStore.ts`**

```typescript
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { pdfFiles } from '@/lib/db/schema';

export type PdfType = 'sumula' | 'boletim' | 'relatorio';

/**
 * Saves a PDF to Postgres. Silently ignores conflicts (already stored).
 */
export async function savePdf(
  idJogo: string,
  type: PdfType,
  content: ArrayBuffer,
  url?: string,
): Promise<void> {
  await db.insert(pdfFiles).values({
    idJogo,
    type,
    content: Buffer.from(content),
    url: url ?? null,
  }).onConflictDoNothing();
}

/**
 * Retrieves a stored PDF as ArrayBuffer, or null if not found.
 */
export async function getPdf(
  idJogo: string,
  type: PdfType,
): Promise<ArrayBuffer | null> {
  const rows = await db
    .select({ content: pdfFiles.content })
    .from(pdfFiles)
    .where(and(eq(pdfFiles.idJogo, idJogo), eq(pdfFiles.type, type)))
    .limit(1);

  if (rows.length === 0) return null;

  const buf = rows[0].content as Buffer;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Deletes all PDF entries for a match (used when busting admin cache).
 */
export async function deletePdfs(idJogo: string): Promise<void> {
  await db.delete(pdfFiles).where(eq(pdfFiles.idJogo, idJogo));
}

/**
 * Returns true if a PDF entry exists in Postgres for the given match + type.
 */
export async function hasPdf(idJogo: string, type: PdfType): Promise<boolean> {
  const rows = await db
    .select({ idJogo: pdfFiles.idJogo })
    .from(pdfFiles)
    .where(and(eq(pdfFiles.idJogo, idJogo), eq(pdfFiles.type, type)))
    .limit(1);
  return rows.length > 0;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors for `cbfPdfStore.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cbfPdfStore.ts
git commit -m "feat: add cbfPdfStore for Postgres PDF get/save/delete"
```

---

## Task 5: Gemini PDF parser (TDD)

**Files:**
- Create: `src/lib/cbfGeminiParser.ts`
- Create: `src/lib/cbfGeminiParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cbfGeminiParser.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @google/genai before importing the module under test
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

import { parseSumulaWithGemini, parseBoletimWithGemini } from './cbfGeminiParser';

const dummyBuffer = new ArrayBuffer(8);

const sumulaJson = {
  campeonato: 'Brasileirão Série A/2026', rodada: '1',
  data: '28/01/2026', hora: '19:00', estadio: 'Arena MRV', cidade: 'Belo Horizonte',
  mandante: {
    nome: 'Atlético Mineiro', gols: 2,
    titulares: [{ numero: 1, nome: 'Everson', apelido: 'Everson' }],
    reservas: [], substituicoes: [],
  },
  visitante: {
    nome: 'Flamengo', gols: 1,
    titulares: [{ numero: 1, nome: 'Rossi', apelido: 'Rossi' }],
    reservas: [], substituicoes: [],
  },
  arbitros: [{ funcao: 'Árbitro', nome: 'Bruno Arleu', uf: 'RJ' }],
  gols: [{ jogador: 'Hulk', minuto: '30', periodo: '1T', tipo: 'normal', time: 'mandante' }],
  cartoes: [],
};

const boletimJson = {
  estadio: 'Arena MRV', data: '28/01/2026',
  publico: { geral: 25770, pagante: 20000, naoPagente: 5770 },
  renda: { bruta: 1331907.88, liquida: 683891.75 },
  ingressos: [{ categoria: 'Inteira', quantidade: 20000, valorUnitario: null, valorTotal: 1331907.88 }],
};

describe('parseSumulaWithGemini', () => {
  beforeEach(() => { mockGenerateContent.mockReset(); });

  it('parses a valid Gemini response into CbfSumulaData', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(sumulaJson) });

    const result = await parseSumulaWithGemini(dummyBuffer, '999');

    expect(result).not.toBeNull();
    expect(result!.idJogo).toBe('999');
    expect(result!.mandante.nome).toBe('Atlético Mineiro');
    expect(result!.gols).toHaveLength(1);
    expect(result!.arbitros).toHaveLength(1);
  });

  it('returns null when Gemini response is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'não encontrei o documento' });
    const result = await parseSumulaWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });

  it('returns null when generateContent throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));
    const result = await parseSumulaWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });
});

describe('parseBoletimWithGemini', () => {
  beforeEach(() => { mockGenerateContent.mockReset(); });

  it('parses a valid Gemini response into CbfBoletimData', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(boletimJson) });

    const result = await parseBoletimWithGemini(dummyBuffer, '999');

    expect(result).not.toBeNull();
    expect(result!.idJogo).toBe('999');
    expect(result!.publico.geral).toBe(25770);
    expect(result!.renda.bruta).toBe(1331907.88);
    expect(result!.ingressos).toHaveLength(1);
  });

  it('returns null when Gemini response is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'error: no document found' });
    const result = await parseBoletimWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });

  it('returns null when generateContent throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('network error'));
    const result = await parseBoletimWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect failure (module not found)**

```bash
npm run test:unit
```

Expected: `Cannot find module './cbfGeminiParser'`

- [ ] **Step 3: Implement the Gemini parser**

Create `src/lib/cbfGeminiParser.ts`:

```typescript
import { GoogleGenAI } from '@google/genai';
import type { CbfBoletimData, CbfSumulaData } from '@/lib/cbfDocTypes';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const SUMULA_PROMPT = `Extract all data from this CBF "Súmula de Arbitragem" PDF and return ONLY a JSON object — no markdown, no extra text.

Required shape:
{
  "campeonato": "string",
  "rodada": "string",
  "data": "DD/MM/YYYY",
  "hora": "HH:MM",
  "estadio": "string",
  "cidade": "string",
  "mandante": {
    "nome": "string",
    "gols": 0,
    "titulares": [{"numero": 1, "nome": "string", "apelido": "string"}],
    "reservas":  [{"numero": 1, "nome": "string", "apelido": "string"}],
    "substituicoes": [{"saiuNumero": 1, "entrouNumero": 2, "minuto": "45", "periodo": "1T"}]
  },
  "visitante": { same shape as mandante },
  "arbitros": [{"funcao": "string", "nome": "string", "uf": "string"}],
  "gols": [{"jogador": "string", "minuto": "string", "periodo": "1T", "tipo": "normal", "time": "mandante"}],
  "cartoes": [{"jogador": "string", "minuto": "string", "periodo": "1T", "tipo": "amarelo", "time": "mandante"}]
}

Valid values — tipo (gols): "normal" | "penalti" | "contra". tipo (cartoes): "amarelo" | "vermelho" | "segundo_amarelo". time: "mandante" | "visitante". periodo: "1T" | "2T" | "PE".
Use [] for missing arrays. Use "" for missing strings. Do not use null.`;

const BOLETIM_PROMPT = `Extract all data from this CBF "Boletim Financeiro" or "Borderô" PDF and return ONLY a JSON object — no markdown, no extra text.

Required shape:
{
  "estadio": "string",
  "data": "DD/MM/YYYY",
  "publico": {
    "geral": number or null,
    "pagante": number or null,
    "naoPagente": number or null
  },
  "renda": {
    "bruta": number or null,
    "liquida": number or null
  },
  "ingressos": [
    {"categoria": "string", "quantidade": number, "valorUnitario": number or null, "valorTotal": number or null}
  ]
}

Return monetary values as plain numbers (e.g. 1331907.88, not "R$ 1.331.907,88").
Return quantities as plain integers. Use null for missing numbers, [] for missing arrays.`;

export async function parseSumulaWithGemini(
  buffer: ArrayBuffer,
  idJogo: string,
): Promise<CbfSumulaData | null> {
  try {
    const base64 = Buffer.from(buffer).toString('base64');
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            { text: SUMULA_PROMPT },
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
          ],
        },
      ],
    });

    const json = JSON.parse(response.text ?? '');

    return {
      idJogo,
      parsedAt: new Date().toISOString(),
      campeonato:  json.campeonato  ?? '',
      rodada:      json.rodada      ?? '',
      data:        json.data        ?? '',
      hora:        json.hora        ?? '',
      estadio:     json.estadio     ?? '',
      cidade:      json.cidade      ?? '',
      mandante:    json.mandante    ?? { nome: '', gols: 0, titulares: [], reservas: [], substituicoes: [] },
      visitante:   json.visitante   ?? { nome: '', gols: 0, titulares: [], reservas: [], substituicoes: [] },
      arbitros:    json.arbitros    ?? [],
      gols:        json.gols        ?? [],
      cartoes:     json.cartoes     ?? [],
    };
  } catch {
    return null;
  }
}

export async function parseBoletimWithGemini(
  buffer: ArrayBuffer,
  idJogo: string,
): Promise<CbfBoletimData | null> {
  try {
    const base64 = Buffer.from(buffer).toString('base64');
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            { text: BOLETIM_PROMPT },
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
          ],
        },
      ],
    });

    const json = JSON.parse(response.text ?? '');

    return {
      idJogo,
      parsedAt: new Date().toISOString(),
      estadio:   json.estadio ?? '',
      data:      json.data    ?? '',
      publico: {
        geral:      json.publico?.geral      ?? null,
        pagante:    json.publico?.pagante    ?? null,
        naoPagente: json.publico?.naoPagente ?? null,
      },
      renda: {
        bruta:   json.renda?.bruta   ?? null,
        liquida: json.renda?.liquida ?? null,
      },
      ingressos: json.ingressos ?? [],
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run all unit tests — expect all to pass**

```bash
npm run test:unit
```

Expected:
```
✓ src/lib/cbfDocConfidence.test.ts (7 tests)
✓ src/lib/cbfGeminiParser.test.ts (6 tests)
Test Files  2 passed (2)
Tests      13 passed (13)
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/cbfGeminiParser.ts src/lib/cbfGeminiParser.test.ts
git commit -m "feat: add Gemini PDF parser for sumula and boletim"
```

---

## Task 6: Integrate confidence check + PDF store + Gemini fallback into `processMatchDocuments()`

**Files:**
- Modify: `src/lib/cbfDocParser.ts`

This task rewrites the body of `processMatchDocuments()`. The function signature and Redis key helpers do not change. All existing parser functions (`parseSumula`, `parseBoletim`, etc.) are untouched.

- [ ] **Step 1: Add the new imports at the top of `cbfDocParser.ts`**

After the existing imports block (lines 1–36), add:

```typescript
import { CONFIDENCE_THRESHOLD, scoreBoletim, scoreSumula } from '@/lib/cbfDocConfidence';
import { parseBoletimWithGemini, parseSumulaWithGemini } from '@/lib/cbfGeminiParser';
import { getPdf } from '@/lib/cbfPdfStore';
import { deleteCache } from '@/lib/redisCache';
```

- [ ] **Step 2: Replace the body of `processMatchDocuments()` (starting at line 654)**

Replace everything from `export async function processMatchDocuments(` through the closing `}` with:

```typescript
export async function processMatchDocuments(
  match: CbfMatchDetail,
): Promise<CbfMatchDocsResult> {
  const { idJogo } = match;

  // ── 1. Sentinel check ───────────────────────────────────────────────────────
  const statusCached = await getCache<CbfDocStatus>(statusKey(idJogo));
  if (statusCached && !statusCached.available) {
    const ageMs = Date.now() - new Date(statusCached.checkedAt).getTime();
    if (ageMs < TTL_NOT_AVAILABLE * 1000) return { available: false };
  }

  // ── 2. Redis data check + confidence gate ───────────────────────────────────
  if (statusCached?.available) {
    const [sumula, boletim] = await Promise.all([
      getCache<CbfSumulaData>(sumulaKey(idJogo)),
      getCache<CbfBoletimData>(boletimKey(idJogo)),
    ]);

    if (sumula || boletim) {
      const badSumula  = sumula  !== null && scoreSumula(sumula)  < CONFIDENCE_THRESHOLD;
      const badBoletim = boletim !== null && scoreBoletim(boletim) < CONFIDENCE_THRESHOLD;

      if (!badSumula && !badBoletim) {
        return { available: true, sumula: sumula ?? undefined, boletim: boletim ?? undefined };
      }

      // Low-quality cached data — evict all keys and re-process
      await Promise.all([
        deleteCache(statusKey(idJogo)),
        deleteCache(sumulaKey(idJogo)),
        deleteCache(boletimKey(idJogo)),
      ]);
    }
  }

  // ── 3. Resolve PDF URLs ─────────────────────────────────────────────────────
  const urls = await resolvePdfUrls(match);

  // ── 4. Fetch PDFs: Postgres first, CBF URL fallback ─────────────────────────
  const [sumulaBuffer, boletimBuffer] = await Promise.all([
    getPdf(idJogo, 'sumula').then((buf) => buf ?? (urls.sumula  ? downloadPdf(urls.sumula)  : null)),
    getPdf(idJogo, 'boletim').then((buf) => buf ?? (urls.boletim ? downloadPdf(urls.boletim) : null)),
  ]);

  if (!sumulaBuffer && !boletimBuffer) {
    const sentinel: CbfDocStatus = { available: false, checkedAt: new Date().toISOString(), urls: {} };
    void setCache(statusKey(idJogo), sentinel, TTL_NOT_AVAILABLE);
    return { available: false };
  }

  // ── 5. Parse with regex ─────────────────────────────────────────────────────
  const [sumulaRegex, boletimRegex] = await Promise.all([
    sumulaBuffer  ? parseSumula(sumulaBuffer, idJogo)  : Promise.resolve(null),
    boletimBuffer ? parseBoletim(boletimBuffer, idJogo) : Promise.resolve(null),
  ]);

  // ── 6. Confidence check + Gemini fallback ───────────────────────────────────
  let finalSumula = sumulaRegex;
  if (sumulaRegex && scoreSumula(sumulaRegex) < CONFIDENCE_THRESHOLD && sumulaBuffer) {
    const geminiResult = await parseSumulaWithGemini(sumulaBuffer, idJogo);
    if (geminiResult) finalSumula = geminiResult;
  }

  let finalBoletim = boletimRegex;
  if (boletimRegex && scoreBoletim(boletimRegex) < CONFIDENCE_THRESHOLD && boletimBuffer) {
    const geminiResult = await parseBoletimWithGemini(boletimBuffer, idJogo);
    if (geminiResult) finalBoletim = geminiResult;
  }

  // ── 7. Only store permanently if at least one result passes confidence ───────
  const sumulaToStore  = finalSumula  && scoreSumula(finalSumula)   >= CONFIDENCE_THRESHOLD ? finalSumula  : null;
  const boletimToStore = finalBoletim && scoreBoletim(finalBoletim) >= CONFIDENCE_THRESHOLD ? finalBoletim : null;

  if (!sumulaToStore && !boletimToStore) {
    const sentinel: CbfDocStatus = { available: false, checkedAt: new Date().toISOString(), urls };
    void setCache(statusKey(idJogo), sentinel, TTL_NOT_AVAILABLE);
    return { available: false };
  }

  const sentinel: CbfDocStatus = { available: true, checkedAt: new Date().toISOString(), urls };
  const writes: Promise<void>[] = [setCachePermanent(statusKey(idJogo), sentinel)];
  if (sumulaToStore)  writes.push(setCachePermanent(sumulaKey(idJogo),  sumulaToStore));
  if (boletimToStore) writes.push(setCachePermanent(boletimKey(idJogo), boletimToStore));
  await Promise.all(writes);

  return {
    available: true,
    sumula:  sumulaToStore  ?? undefined,
    boletim: boletimToStore ?? undefined,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke-test locally against a real finished match**

```bash
npx tsx --env-file=.env.local scripts/debug-boletim-text.ts 1421
```

Expected: text dump of the boletim PDF (confirms URL resolution still works). No errors.

- [ ] **Step 5: Run all unit tests still pass**

```bash
npm run test:unit
```

Expected: `Tests 13 passed (13)`

- [ ] **Step 6: Commit**

```bash
git add src/lib/cbfDocParser.ts
git commit -m "feat: integrate confidence gate and Gemini fallback into processMatchDocuments"
```

---

## Task 7: Update `seed-match-docs.ts` — proactive PDF download to Postgres

**Files:**
- Modify: `scripts/seed-match-docs.ts`

The seed script now has one job: download PDFs and store them in Postgres. Parsing is removed from this script — it stays on-demand in `processMatchDocuments`.

- [ ] **Step 1: Replace the script content**

Replace the entire contents of `scripts/seed-match-docs.ts` with:

```typescript
/**
 * seed-match-docs.ts — Proactively download CBF PDFs into Postgres.
 *
 * For each finished round, downloads súmula + boletim PDFs and stores them in
 * the pdf_files Postgres table before the 2-month CBF expiry window.
 * Parsing is NOT done here — it happens on-demand in processMatchDocuments().
 *
 * Usage:
 *   npm run seed:match-docs                    # process all finished rounds (1–38)
 *   npm run seed:match-docs -- --rounds=5      # up to round 5
 *   npm run seed:match-docs -- --round=3       # only round 3
 *   npm run seed:match-docs -- --reset         # re-download even if already stored
 *
 * Requires: .env.local with DATABASE_URL + CBF API vars
 */

import { getCbfRound } from '@/lib/cbfApi';
import { downloadPdf, resolvePdfUrls } from '@/lib/cbfDocParser';
import { hasPdf, savePdf } from '@/lib/cbfPdfStore';
import type { CbfMatchDetail, CbfRoundData } from '@/lib/types';
import { getArg, hasReset } from './lib/args';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const roundStr  = getArg('round');
  const roundsStr = getArg('rounds');
  const force     = hasReset();

  if (roundStr) {
    const n = parseInt(roundStr, 10);
    return { from: n, to: n, force };
  }

  return { from: 1, to: parseInt(roundsStr ?? '38', 10), force };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type DownloadResult = 'stored' | 'already_stored' | 'unavailable' | 'error';

const ICONS: Record<DownloadResult, string> = {
  stored:         '✓',
  already_stored: '◎',
  unavailable:    '—',
  error:          '✗',
};

const LABELS: Record<DownloadResult, string> = {
  stored:         'baixado e salvo',
  already_stored: 'já no Postgres, ignorado',
  unavailable:    'PDF não publicado ainda',
  error:          'erro ao baixar',
};

// ─── Core ─────────────────────────────────────────────────────────────────────

async function downloadMatchPdfs(
  match: CbfMatchDetail,
  force: boolean,
): Promise<DownloadResult> {
  const { idJogo } = match;
  if (!idJogo) return 'error';

  if (!force) {
    const [hasSumula, hasBoletim] = await Promise.all([
      hasPdf(idJogo, 'sumula'),
      hasPdf(idJogo, 'boletim'),
    ]);
    if (hasSumula && hasBoletim) return 'already_stored';
  }

  try {
    const urls = await resolvePdfUrls(match);

    if (!urls.sumula && !urls.boletim) return 'unavailable';

    const [sumulaBuf, boletimBuf] = await Promise.all([
      urls.sumula  ? downloadPdf(urls.sumula)  : Promise.resolve(null),
      urls.boletim ? downloadPdf(urls.boletim) : Promise.resolve(null),
    ]);

    if (!sumulaBuf && !boletimBuf) return 'unavailable';

    await Promise.all([
      sumulaBuf  ? savePdf(idJogo, 'sumula',  sumulaBuf,  urls.sumula)  : Promise.resolve(),
      boletimBuf ? savePdf(idJogo, 'boletim', boletimBuf, urls.boletim) : Promise.resolve(),
    ]);

    return 'stored';
  } catch {
    return 'error';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { from, to, force } = parseArgs();

  console.log('');
  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║  CBF PDF Download Seed — Resenha Pré-Jogo  ║');
  console.log('  ╚════════════════════════════════════════════╝');
  console.log(`\n  Rodadas: ${from}–${to}  |  Force: ${force}\n`);

  const totals: Record<DownloadResult, number> = {
    stored: 0, already_stored: 0, unavailable: 0, error: 0,
  };
  const errors: string[] = [];

  for (let r = from; r <= to; r++) {
    let round: CbfRoundData;
    try {
      round = await getCbfRound(r);
    } catch {
      console.log(`  Rodada ${r.toString().padStart(2, '0')}  ✗  erro ao buscar no CBF`);
      continue;
    }

    if (round.status !== 'finished') {
      console.log(`  Rodada ${r.toString().padStart(2, '0')}  —  não finalizada, ignorada`);
      continue;
    }

    console.log(`\n  Rodada ${r.toString().padStart(2, '0')} — ${round.matches.length} jogo(s)`);

    for (const match of round.matches) {
      const id    = match.idJogo ?? '?';
      const label = `${match.mandante?.nome ?? '?'} x ${match.visitante?.nome ?? '?'}`;

      const result = await downloadMatchPdfs(match, force);
      totals[result]++;
      console.log(`    ${ICONS[result]}  ${id}  ${label}  — ${LABELS[result]}`);

      if (result === 'error') errors.push(`R${r} ${id} ${label}`);

      await sleep(800);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n  ─────────────────────────────────────────────');
  console.log(`  ✓  Baixados e salvos:  ${totals.stored}`);
  console.log(`  ◎  Já no Postgres:     ${totals.already_stored}`);
  console.log(`  —  Sem PDF:            ${totals.unavailable}`);
  console.log(`  ✗  Erros:              ${totals.error}`);

  if (errors.length > 0) {
    console.log('\n  Jogos com erro:');
    for (const e of errors) console.log(`    • ${e}`);
  }

  console.log('');
  process.exit(totals.error > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Dry-run against round 1 (reads only — no `--reset`)**

```bash
npx tsx --env-file=.env.local scripts/seed-match-docs.ts -- --round=1
```

Expected: output showing matches with `◎ já no Postgres, ignorado` (if already stored) or `✓ baixado e salvo` for new ones. No `✗` errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-match-docs.ts
git commit -m "feat: seed-match-docs now downloads PDFs to Postgres, parsing stays on-demand"
```

---

## Task 8: Update `bust-match-docs` admin route — also clear Postgres

**Files:**
- Modify: `src/app/api/admin/bust-match-docs/route.ts`

- [ ] **Step 1: Add the `deletePdfs` import**

At the top of `src/app/api/admin/bust-match-docs/route.ts`, add:

```typescript
import { deletePdfs } from '@/lib/cbfPdfStore';
```

- [ ] **Step 2: Update the single-match branch to also clear Postgres**

Replace this block (the `if (idJogo)` branch, lines 36–44):

```typescript
if (idJogo) {
  await Promise.all([
    deleteCache(`cbf:match:${idJogo}:docs:status`),
    deleteCache(`cbf:match:${idJogo}:sumula`),
    deleteCache(`cbf:match:${idJogo}:boletim`),
  ]);
  return NextResponse.json(
    { cleared: [idJogo] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
```

With:

```typescript
if (idJogo) {
  await Promise.all([
    deleteCache(`cbf:match:${idJogo}:docs:status`),
    deleteCache(`cbf:match:${idJogo}:sumula`),
    deleteCache(`cbf:match:${idJogo}:boletim`),
    deletePdfs(idJogo),
  ]);
  return NextResponse.json(
    { cleared: [idJogo] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
```

- [ ] **Step 3: Update the `all=true` branch to also clear Postgres**

After the existing `await Promise.all(deletes);` line, add:

```typescript
await Promise.all(idJogos.map((id) => deletePdfs(id)));
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all unit tests one final time**

```bash
npm run test:unit
```

Expected: `Tests 13 passed (13)`

- [ ] **Step 6: Final commit**

```bash
git add src/app/api/admin/bust-match-docs/route.ts
git commit -m "feat: bust-match-docs also clears Postgres pdf_files on cache invalidation"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 7 spec sections mapped to tasks: `pdf_files` table (T1), confidence scorer (T3), PDF store (T4), Gemini parser (T5), `processMatchDocuments` integration (T6), proactive cron seed (T7), admin bust update (T8).
- [x] **No placeholders:** All code blocks are complete. No TBD or "similar to above."
- [x] **Type consistency:** `PdfType`, `scoreSumula`, `scoreBoletim`, `CONFIDENCE_THRESHOLD`, `parseSumulaWithGemini`, `parseBoletimWithGemini`, `getPdf`, `savePdf`, `deletePdfs`, `hasPdf` — all defined in earlier tasks before use in later ones.
- [x] **Lazy backfill:** Handled in T6 — on cache hit with low confidence, Redis keys are evicted and the full pipeline re-runs using the PDF from Postgres.
- [x] **2-month expiry:** Addressed in T7 — seed script downloads to Postgres proactively, decoupling storage from user-triggered parsing.
- [x] **Gemini API pattern:** Matches existing `broadcasterSearch.ts` — same `gemini.models.generateContent` call, same `response.text` access.
