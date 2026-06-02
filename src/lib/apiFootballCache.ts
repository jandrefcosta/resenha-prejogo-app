/**
 * Caching/resilience helpers shared across the API-Football data paths.
 *
 * API-Football signals quota/plan/key problems with an `errors` field inside an
 * otherwise-200 response. Without a stale fallback, every such blip made
 * finished results disappear (or 502) instead of serving the last-good data.
 * These helpers implement the same stale-while-error guarantee `cbfApi.ts`
 * already has, plus the "never cache an empty/error result" rule.
 */

/** A timestamped backup of a previously-fetched payload. */
export interface StaleEntry<T> {
  fetchedAt: string;
  data: T;
}

/**
 * Return the backup's data only if it was fetched within `maxAgeMs`.
 * Prevents serving week-old data during a prolonged upstream outage.
 */
export function acceptStale<T>(
  entry: StaleEntry<T> | null | undefined,
  maxAgeMs: number,
  now: number = Date.now(),
): T | null {
  if (!entry) return null;
  const age = now - new Date(entry.fetchedAt).getTime();
  return age <= maxAgeMs ? entry.data : null;
}

/**
 * True when an API-Football `errors` field indicates the request was rejected
 * (quota, plan/season, invalid key, per-minute rate limit). The field is an
 * empty array on success and a populated object on failure.
 */
export function hasApiFootballErrors(
  errors: Record<string, string> | string[] | null | undefined,
): boolean {
  if (!errors) return false;
  return Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0;
}

/**
 * Whether a freshly-fetched standings payload is safe to cache.
 * Empty standings are legitimate only for knockout (mata-mata) competitions;
 * for league/group formats an empty table means the fetch failed, so caching
 * it would freeze the table as blank until the TTL expires.
 */
export function shouldCacheStandings(
  groupCount: number,
  format: string,
  hasErrors: boolean,
): boolean {
  if (hasErrors) return false;
  if (format === 'mata-mata') return true;
  return groupCount > 0;
}
