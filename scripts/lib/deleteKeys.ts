/**
 * deleteKeys.ts — Batch-delete Redis keys for each seed domain.
 *
 * Each exported function deletes ALL keys (primary + stale/derived) that belong
 * to a given seed domain. Called at the start of every --reset run so the
 * subsequent seed always writes fresh data, regardless of what was cached before.
 *
 * Upstash REST does not support SCAN or wildcard DEL, so keys are derived
 * deterministically from the same inputs used to create them.
 */

import { redis } from '@/lib/redisCache';
import { COMPETITIONS } from '@/data/competitions';
import { CONMEBOL_TOURNAMENT_IDS } from '@/lib/conmebolApi';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

const clubs = clubsData as ClubTheme[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Delete all given keys using Upstash pipeline — one HTTP request per batch.
 * Pipeline batches multiple commands into a single REST call, avoiding per-key
 * round trips and staying well under Upstash rate limits.
 * Returns the total number of keys sent for deletion.
 */
export async function deleteAll(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;

  // Upstash recommends batches ≤ 200 commands per pipeline call.
  const BATCH = 200;

  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    const p = redis.pipeline();
    for (const key of batch) p.del(key);
    await p.exec();
  }

  return keys.length;
}

// ─── CBF ──────────────────────────────────────────────────────────────────────

/**
 * Deletes CBF round keys for a range of rounds.
 * Removes both primary key and stale backup.
 *   cbf:round:{N}
 *   cbf:round:{N}:stale
 */
export async function deleteCbfRounds(from: number, to: number): Promise<number> {
  const keys: string[] = [];
  for (let r = from; r <= to; r++) {
    keys.push(`cbf:round:${r}`);
    keys.push(`cbf:round:${r}:stale`);
  }
  return deleteAll(keys);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Deletes upcoming-fixture keys for all (or a filtered) club competition.
 *   fixtures:{comp.id}:{season}
 */
export async function deleteFixtures(compId?: string): Promise<number> {
  const season = new Date().getFullYear();
  const comps = COMPETITIONS.filter(
    (c) => c.scope === 'club' && (!compId || c.id === compId),
  );
  const keys = comps.map((c) => `fixtures:${c.id}:${season}`);
  return deleteAll(keys);
}

// ─── Form ─────────────────────────────────────────────────────────────────────

/**
 * Deletes team-form keys for all (or a single) club.
 *   form:{apiFootballId}:71:{season}
 */
export async function deleteForm(apiFootballId?: number): Promise<number> {
  const season = new Date().getFullYear();
  const targets = clubs.filter(
    (c) => c.apiFootballId !== null && (!apiFootballId || c.apiFootballId === apiFootballId),
  );
  const keys = targets.map((c) => `form:${c.apiFootballId}:71:${season}`);
  return deleteAll(keys);
}

// ─── Past results ─────────────────────────────────────────────────────────────

const CONMEBOL_COMPS = COMPETITIONS.filter(
  (c) => c.id === 'libertadores' || c.id === 'sul-americana',
);
const API_FOOTBALL_ONLY_COMPS = COMPETITIONS.filter(
  (c) => c.scope === 'club' && !c.hasCbfData &&
  c.id !== 'libertadores' && c.id !== 'sul-americana',
);

/**
 * Deletes all past-result keys:
 *  - CONMEBOL tournament caches (primary + stale)
 *  - Per-club finished fixtures for CONMEBOL + API-Football-only competitions
 *
 * Optionally restrict to a single club slug.
 *   conmebol:tournament:{id}
 *   conmebol:tournament:{id}:stale
 *   finished:{comp.id}:{apiFootballId}
 */
export async function deletePastResults(clubSlug?: string): Promise<number> {
  const keys: string[] = [];

  // CONMEBOL tournament-wide (not club-specific — always delete both)
  if (!clubSlug) {
    for (const tid of Object.values(CONMEBOL_TOURNAMENT_IDS)) {
      keys.push(`conmebol:tournament:${tid}`);
      keys.push(`conmebol:tournament:${tid}:stale`);
    }
  }

  // Per-club finished fixtures
  const perClubComps = [...CONMEBOL_COMPS, ...API_FOOTBALL_ONLY_COMPS];
  const targets = clubs.filter(
    (c) => c.apiFootballId !== null && (!clubSlug || c.id === clubSlug),
  );

  for (const club of targets) {
    for (const comp of perClubComps) {
      keys.push(`finished:${comp.id}:${club.apiFootballId}`);
    }
  }

  return deleteAll(keys);
}
