import { describe, it, expect } from 'vitest';
import { PHASE_ORDER, PHASE_LABELS, GROUP_ROUNDS, mapFixture } from './route';

// Minimal API-Football fixture builder for mapFixture tests.
function apiFixture(over: {
  round: string;
  short?: string;
  homeId?: number;
  awayId?: number;
  homeWinner?: boolean | null;
  awayWinner?: boolean | null;
  goalsHome?: number | null;
  goalsAway?: number | null;
  penHome?: number | null;
  penAway?: number | null;
}) {
  return {
    fixture: {
      id: 999,
      date: '2026-06-29T17:00:00+00:00',
      venue: { name: null, city: null },
      status: { short: over.short ?? 'NS' },
    },
    league: { id: 1, name: 'World Cup', round: over.round, season: 2026 },
    teams: {
      home: { id: over.homeId ?? 6, name: 'Brazil', logo: '', winner: over.homeWinner ?? null },
      away: { id: over.awayId ?? 12, name: 'Japan', logo: '', winner: over.awayWinner ?? null },
    },
    goals: { home: over.goalsHome ?? null, away: over.goalsAway ?? null },
    score: { penalty: { home: over.penHome ?? null, away: over.penAway ?? null } },
  };
}

// The 2026 World Cup is the first 48-team edition: 12 groups → top 2 + best 8
// third-placed = 32 teams → Round of 32 → Round of 16 → … The phase pipeline
// must recognise "Round of 32" or those fixtures get no tab and vanish from
// the UI (CopaMatchSection filters by PHASE_ORDER).

describe('Copa phase ordering', () => {
  it('includes "Round of 32" as a knockout phase', () => {
    expect(PHASE_ORDER).toContain('Round of 32');
  });

  it('orders "Round of 32" before "Round of 16"', () => {
    const r32 = PHASE_ORDER.indexOf('Round of 32');
    const r16 = PHASE_ORDER.indexOf('Round of 16');
    expect(r32).toBeGreaterThanOrEqual(0);
    expect(r16).toBeGreaterThan(r32);
  });

  it('places "Round of 32" right after the group stage', () => {
    const grupos = PHASE_ORDER.indexOf('Grupos');
    const r32 = PHASE_ORDER.indexOf('Round of 32');
    expect(r32).toBe(grupos + 1);
  });
});

describe('Copa phase labels', () => {
  it('labels "Round of 32" in pt-BR', () => {
    expect(PHASE_LABELS['Round of 32']).toBe('16 avos de Final');
  });

  it('every knockout phase in PHASE_ORDER has a pt-BR label', () => {
    for (const phase of PHASE_ORDER) {
      if (phase === 'Grupos') continue; // synthetic tab key, not an API round
      expect(PHASE_LABELS[phase], `missing label for ${phase}`).toBeTruthy();
    }
  });

  it('keeps the group-stage rounds collapsed under "Grupos"', () => {
    // Round of 32 must NOT be a group round — it is a knockout phase.
    expect(GROUP_ROUNDS.has('Round of 32')).toBe(false);
  });
});

describe('mapFixture — knockout enrichment', () => {
  it('exposes the penalty shootout score for a decided knockout tie', () => {
    const m = mapFixture(
      apiFixture({
        round: 'Round of 32',
        short: 'PEN',
        goalsHome: 1,
        goalsAway: 1,
        penHome: 4,
        penAway: 2,
        homeWinner: true,
      }),
    );
    expect(m.scoreDetail?.pen).toEqual({ home: 4, away: 2 });
  });

  it('omits the penalty block when there was no shootout', () => {
    const m = mapFixture(apiFixture({ round: 'Round of 32', short: 'FT', goalsHome: 2, goalsAway: 0, homeWinner: true }));
    expect(m.scoreDetail?.pen).toBeUndefined();
  });

  it('sets advancedTeamId to the side that progressed', () => {
    const m = mapFixture(
      apiFixture({ round: 'Round of 32', short: 'AET', goalsHome: 2, goalsAway: 1, homeId: 6, awayId: 12, homeWinner: true }),
    );
    expect(m.advancedTeamId).toBe('6');
  });

  it('never sets penalties or advancedTeamId for a group-stage game', () => {
    const m = mapFixture(apiFixture({ round: 'Group Stage - 1', short: 'FT', goalsHome: 1, goalsAway: 1 }));
    expect(m.scoreDetail?.pen).toBeUndefined();
    expect(m.advancedTeamId).toBeUndefined();
  });
});
