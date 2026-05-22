/**
 * Pure helpers for merging finished-match results from multiple sources
 * (CONMEBOL live API, Postgres snapshot, API-Football). Kept free of I/O so
 * the source-selection logic can be unit-tested in isolation.
 */
import type { Match } from '@/lib/types';

/**
 * Merge match lists, keeping the first occurrence of each match id.
 * Earlier lists take precedence — pass the freshest source first.
 */
export function dedupeById(...lists: Match[][]): Match[] {
  const seen = new Set<string>();
  const out: Match[] = [];
  for (const list of lists) {
    for (const match of list) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      out.push(match);
    }
  }
  return out;
}

/**
 * Chooses which CONMEBOL results to display.
 *
 * `live` (CONMEBOL API, Redis-cached) and `db` (Postgres snapshot) are merged
 * with `live` preferred — it is always at least as fresh as the snapshot.
 * `apiFootball` is a last-resort fallback, used ONLY when both other sources
 * yield nothing.
 *
 * This deliberately replaces the previous source-priority chain, where the
 * API-Football fallback fired only when the snapshot was *empty*: a stale but
 * non-empty snapshot could silently win over fresher data. Here a stale or
 * empty snapshot can neither hide `live` data nor suppress the fallback.
 */
export function selectConmebolResults(
  live: Match[],
  db: Match[],
  apiFootball: Match[],
): Match[] {
  const merged = dedupeById(live, db);
  return merged.length > 0 ? merged : apiFootball;
}
