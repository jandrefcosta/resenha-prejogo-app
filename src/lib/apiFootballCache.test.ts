import { describe, it, expect } from 'vitest';
import {
  acceptStale,
  hasApiFootballErrors,
  shouldCacheStandings,
} from './apiFootballCache';

// ─── acceptStale ──────────────────────────────────────────────────────────────
// Serve a last-good backup on upstream failure, but only while it's recent
// enough — prevents an API-Football outage from surfacing week-old data.

describe('acceptStale', () => {
  const now = 1_700_000_000_000;

  it('returns null when there is no stale entry', () => {
    expect(acceptStale(null, 1000, now)).toBeNull();
  });

  it('returns the data when the entry is within max age', () => {
    const entry = { fetchedAt: new Date(now - 500).toISOString(), data: [1, 2] };
    expect(acceptStale(entry, 1000, now)).toEqual([1, 2]);
  });

  it('returns the data exactly at the max-age boundary', () => {
    const entry = { fetchedAt: new Date(now - 1000).toISOString(), data: 'x' };
    expect(acceptStale(entry, 1000, now)).toBe('x');
  });

  it('returns null when the entry is older than max age', () => {
    const entry = { fetchedAt: new Date(now - 1001).toISOString(), data: 'x' };
    expect(acceptStale(entry, 1000, now)).toBeNull();
  });
});

// ─── hasApiFootballErrors ───────────────────────────────────────────────────
// API-Football reports quota/plan/key problems in an `errors` field of an
// otherwise-200 body (array when empty, object when populated). Detecting it
// is what separates "real empty result" from "upstream rejected us".

describe('hasApiFootballErrors', () => {
  it('is false for an empty array', () => {
    expect(hasApiFootballErrors([])).toBe(false);
  });

  it('is false for an empty object', () => {
    expect(hasApiFootballErrors({})).toBe(false);
  });

  it('is false for null or undefined', () => {
    expect(hasApiFootballErrors(null)).toBe(false);
    expect(hasApiFootballErrors(undefined)).toBe(false);
  });

  it('is true for a non-empty array', () => {
    expect(hasApiFootballErrors(['boom'])).toBe(true);
  });

  it('is true for a free-plan season error', () => {
    expect(
      hasApiFootballErrors({ plan: 'Free plans do not have access to this season' }),
    ).toBe(true);
  });

  it('is true for a per-minute rate-limit error', () => {
    expect(hasApiFootballErrors({ rateLimit: 'Too many requests' })).toBe(true);
  });
});

// ─── shouldCacheStandings ────────────────────────────────────────────────────
// Caching an empty/error standings payload froze the table as blank for hours.
// Only cache when the data is genuinely valid for the competition format.

describe('shouldCacheStandings', () => {
  it('does NOT cache empty standings for a points-running league (the blackout bug)', () => {
    expect(shouldCacheStandings(0, 'pontos-corridos', false)).toBe(false);
  });

  it('does NOT cache empty group-stage standings', () => {
    expect(shouldCacheStandings(0, 'grupos', false)).toBe(false);
  });

  it('DOES cache empty knockout standings — legitimately has no table', () => {
    expect(shouldCacheStandings(0, 'mata-mata', false)).toBe(true);
  });

  it('caches a populated points-running table', () => {
    expect(shouldCacheStandings(1, 'pontos-corridos', false)).toBe(true);
  });

  it('never caches when the API returned errors, regardless of format', () => {
    expect(shouldCacheStandings(20, 'pontos-corridos', true)).toBe(false);
    expect(shouldCacheStandings(0, 'mata-mata', true)).toBe(false);
  });
});
