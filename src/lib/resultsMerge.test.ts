import { describe, it, expect } from 'vitest';
import { dedupeById, selectConmebolResults } from './resultsMerge';
import type { Match } from '@/lib/types';

// ─── Fixture builder ──────────────────────────────────────────────────────────

function match(id: string, extra: Partial<Match> = {}): Match {
  return {
    id,
    homeTeam: { id: 'h', name: 'Home', shortName: 'HOM' },
    awayTeam: { id: 'a', name: 'Away', shortName: 'AWY' },
    date: '2026-05-01T00:00:00.000Z',
    stadium: null,
    city: null,
    competition: 'Libertadores',
    leagueId: 13,
    competitionName: 'Libertadores',
    round: 'Fase de grupos',
    status: 'finished',
    ...extra,
  };
}

// ─── dedupeById ───────────────────────────────────────────────────────────────

describe('dedupeById', () => {
  it('keeps the first occurrence of each id across lists', () => {
    const a = [match('1'), match('2')];
    const b = [match('2'), match('3')];
    expect(dedupeById(a, b).map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('prefers the earlier list when an id appears in both', () => {
    const fresh = [match('1', { score: { home: 2, away: 1 } })];
    const stale = [match('1', { score: { home: 0, away: 0 } })];
    expect(dedupeById(fresh, stale)).toHaveLength(1);
    expect(dedupeById(fresh, stale)[0].score).toEqual({ home: 2, away: 1 });
  });

  it('returns an empty list when all inputs are empty', () => {
    expect(dedupeById([], [])).toEqual([]);
  });
});

// ─── selectConmebolResults ────────────────────────────────────────────────────

describe('selectConmebolResults', () => {
  it('returns live data merged over the db snapshot', () => {
    const live = [match('a'), match('b')];
    const db = [match('b'), match('c')];
    expect(selectConmebolResults(live, db, []).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  // Regression: a stale-but-non-empty snapshot must not hide fresh live data.
  it('prefers live data over a stale snapshot for the same match', () => {
    const live = [match('x', { score: { home: 3, away: 0 } })];
    const staleDb = [match('x', { score: { home: 0, away: 0 } })];
    const result = selectConmebolResults(live, staleDb, []);
    expect(result).toHaveLength(1);
    expect(result[0].score).toEqual({ home: 3, away: 0 });
  });

  it('falls back to the db snapshot when live is empty', () => {
    const db = [match('only-in-db')];
    expect(selectConmebolResults([], db, []).map((m) => m.id)).toEqual(['only-in-db']);
  });

  // Regression: API-Football must not be discarded just because it is the
  // only source with data — the original bug gated it on the db being empty.
  it('falls back to API-Football when both live and db are empty', () => {
    const apiFootball = [match('af-1')];
    expect(selectConmebolResults([], [], apiFootball).map((m) => m.id)).toEqual(['af-1']);
  });

  it('does NOT append API-Football when live/db already have data', () => {
    const live = [match('live-1')];
    const apiFootball = [match('af-1')];
    expect(selectConmebolResults(live, [], apiFootball).map((m) => m.id)).toEqual(['live-1']);
  });

  it('returns empty when every source is empty', () => {
    expect(selectConmebolResults([], [], [])).toEqual([]);
  });
});
