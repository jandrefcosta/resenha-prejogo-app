/**
 * File-based JSON cache that persists across server restarts.
 * Stored in <project-root>/.cache/<key>.json
 * Non-critical: read/write failures are silently ignored.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), '.cache');

/** Default TTL: 6 hours */
export const TTL_6H = 6 * 60 * 60 * 1000;
/** Broadcaster data changes rarely — 24 hours */
export const TTL_24H = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  fetchedAt: string;
  data: T;
}

/**
 * Returns the cached value, or `null` on cache miss / stale cache.
 * Note: a cached value of `null` is stored as `{ data: null }` and will
 * return `null` — indistinguishable from a miss. Use a wrapper object
 * `{ value: null }` if you need to cache an explicit null.
 */
export function readFileCache<T>(key: string, ttlMs = TTL_6H): T | null {
  const file = join(CACHE_DIR, `${key}.json`);
  try {
    const age = Date.now() - statSync(file).mtimeMs;
    if (age > ttlMs) return null;
    const entry: CacheEntry<T> = JSON.parse(readFileSync(file, 'utf-8'));
    return entry.data;
  } catch {
    return null;
  }
}

export function writeFileCache<T>(key: string, data: T): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), data };
    writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(entry), 'utf-8');
  } catch {
    // Non-critical — do not break the request if cache write fails
  }
}
