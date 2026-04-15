/**
 * Static match document data accessor.
 *
 * Data is pre-built from offline PDF parsing and stored in src/data/match-docs.json.
 * Update with: npm run docs:update
 */

import matchDocsData from '@/data/match-docs.json';
import type { CbfMatchDocsResult } from '@/lib/cbfDocTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const matchesIndex = matchDocsData.matches as Record<string, any>;

export function getMatchDocs(idJogo: string): CbfMatchDocsResult | null {
  const entry = matchesIndex[idJogo];
  if (!entry) return null;
  if (!entry.boletim && !entry.sumula) return null;
  return {
    available: true,
    boletim: entry.boletim ?? undefined,
    sumula:  entry.sumula  ?? undefined,
  } as CbfMatchDocsResult;
}
