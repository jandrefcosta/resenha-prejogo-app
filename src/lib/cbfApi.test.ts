import { describe, it, expect } from 'vitest';
import { computeTtl, TTL } from './cbfApi';
import type { CbfMatchDetail, CbfTeamDetail } from './types';

// ─── Fixture builders ─────────────────────────────────────────────────────────

function team(gols: string, hasLineup: boolean): CbfTeamDetail {
  return {
    id: '1',
    nome: 'Team',
    urlEscudo: '',
    gols,
    panaltis: '',
    atletas: hasLineup ? ([{ id: 1 }] as unknown as CbfTeamDetail['atletas']) : [],
    alteracoes: [],
  };
}

/**
 * Build a CbfMatchDetail with a kickoff `hoursFromNow` hours from now.
 * `data`/`hora` are emitted in Brasília wall-clock (UTC-3), which is what
 * parseCbfDatetime expects. A negative offset means the match already kicked off.
 */
function makeMatch(
  hoursFromNow: number,
  opts: { score?: [number, number]; lineup?: boolean } = {},
): CbfMatchDetail {
  const kickoffMs = Date.now() + hoursFromNow * 3_600_000;
  const brt = new Date(kickoffMs - 3 * 3_600_000); // shift to Brasília wall-clock
  const homeGols = opts.score ? String(opts.score[0]) : '';
  const awayGols = opts.score ? String(opts.score[1]) : '';
  const hasLineup = opts.lineup ?? false;

  return {
    idJogo: 'x',
    numJogo: '1',
    rodada: '1',
    grupo: '',
    local: '',
    campeonato: '',
    data: `${brt.getUTCDate()}/${brt.getUTCMonth() + 1}/${brt.getUTCFullYear()}`,
    hora: `${brt.getUTCHours()}:${brt.getUTCMinutes()}`,
    mandante: team(homeGols, hasLineup),
    visitante: team(awayGols, hasLineup),
    arbitros: [],
    gols: [],
    cartoes: [],
    documentos: [],
  };
}

// ─── computeTtl ───────────────────────────────────────────────────────────────

describe('computeTtl', () => {
  it('returns FINISHED for a finished round', () => {
    expect(computeTtl([makeMatch(-48, { score: [1, 0], lineup: true })], 'finished'))
      .toBe(TTL.FINISHED);
  });

  it('returns LIVE for a live round', () => {
    expect(computeTtl([makeMatch(-1)], 'live')).toBe(TTL.LIVE);
  });

  it('tiers an upcoming round by the next kickoff', () => {
    expect(computeTtl([makeMatch(72)], 'upcoming')).toBe(TTL.FUTURE_48H);
    expect(computeTtl([makeMatch(30)], 'upcoming')).toBe(TTL.FUTURE_24H);
    expect(computeTtl([makeMatch(18)], 'upcoming')).toBe(TTL.FUTURE_12H);
    expect(computeTtl([makeMatch(5)], 'upcoming')).toBe(TTL.FUTURE_NOW);
  });

  it('returns POST_MATCH when the whole round has ended (no future kickoffs)', () => {
    expect(computeTtl([makeMatch(-3), makeMatch(-2)], 'upcoming')).toBe(TTL.POST_MATCH);
  });

  // ── Regression: the missing-result bug ──────────────────────────────────────
  // A match that just ended without a published score, in a round that still
  // has matches days away, must NOT inherit the multi-hour future tier — that
  // froze the missing score (and hid the result) for up to 12 h.
  it('returns POST_MATCH when a just-ended match has no score yet, despite a far-future match', () => {
    const matches = [
      makeMatch(-2),                              // just ended, no score (CBF lag)
      makeMatch(72, { /* future */ }),            // other round match >48h away
    ];
    expect(computeTtl(matches, 'upcoming')).toBe(TTL.POST_MATCH);
  });

  it('returns POST_MATCH when a just-ended match has a score but no lineup yet', () => {
    const matches = [
      makeMatch(-2, { score: [2, 1], lineup: false }), // score in, lineup pending
      makeMatch(72),                                   // other round match >48h away
    ];
    expect(computeTtl(matches, 'upcoming')).toBe(TTL.POST_MATCH);
  });

  it('does NOT force POST_MATCH for a long-stale unscored match (likely postponed)', () => {
    const matches = [
      makeMatch(-10),               // kickoff 10h ago, still no score — beyond the window
      makeMatch(72),                // other round match >48h away
    ];
    expect(computeTtl(matches, 'upcoming')).toBe(TTL.FUTURE_48H);
  });
});
