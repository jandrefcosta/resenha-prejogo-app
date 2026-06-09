import { describe, it, expect } from 'vitest';
import { calcPts, calcPtsBrazil, isBrazilMatch, BRAZIL_TEAM_ID } from './bolaoScoring';

// Brazil is home (id '6'), opponent away (id '99') unless a test says otherwise.
const HOME = '6';
const AWAY = '99';

describe('calcPts', () => {
  it('awards 10 for an exact score', () => {
    expect(calcPts({ home: 2, away: 1 }, { home: 2, away: 1 })).toEqual({ pts: 10, outcome: 'exact' });
  });

  it('awards 5 for the correct outcome with a wrong score', () => {
    expect(calcPts({ home: 3, away: 1 }, { home: 2, away: 0 })).toEqual({ pts: 5, outcome: 'correct' });
  });

  it('awards 5 for a correctly predicted draw with a wrong score', () => {
    expect(calcPts({ home: 1, away: 1 }, { home: 2, away: 2 })).toEqual({ pts: 5, outcome: 'correct' });
  });

  it('awards 0 for a wrong outcome', () => {
    expect(calcPts({ home: 2, away: 0 }, { home: 0, away: 1 })).toEqual({ pts: 0, outcome: 'miss' });
  });
});

describe('calcPtsBrazil', () => {
  it('awards 10 for an exact score in any phase', () => {
    const r = calcPtsBrazil({ home: 2, away: 1 }, { home: 2, away: 1, homeId: HOME, awayId: AWAY });
    expect(r).toEqual({ pts: 10, outcome: 'exact' });
  });

  it('awards 5 for the correct outcome decided in regulation', () => {
    const r = calcPtsBrazil({ home: 3, away: 1 }, { home: 2, away: 0, homeId: HOME, awayId: AWAY });
    expect(r).toEqual({ pts: 5, outcome: 'correct' });
  });

  it('collapses to calcPts when advancedTeamId is absent (group draw)', () => {
    // Predicted a home win, match was a 1-1 draw, no knockout qualifier → miss, like calcPts.
    const r = calcPtsBrazil({ home: 2, away: 1 }, { home: 1, away: 1, homeId: HOME, awayId: AWAY });
    expect(r).toEqual({ pts: 0, outcome: 'miss' });
  });

  it('awards 5 when the field is a draw but the predicted winner advanced on penalties', () => {
    // Predicted Brazil (home) to win; match drew 1-1; Brazil advanced on penalties.
    const r = calcPtsBrazil(
      { home: 2, away: 1 },
      { home: 1, away: 1, advancedTeamId: HOME, homeId: HOME, awayId: AWAY },
    );
    expect(r).toEqual({ pts: 5, outcome: 'correct' });
  });

  it('awards 5 when the predicted away winner advanced on penalties', () => {
    const r = calcPtsBrazil(
      { home: 0, away: 1 },
      { home: 1, away: 1, advancedTeamId: AWAY, homeId: HOME, awayId: AWAY },
    );
    expect(r).toEqual({ pts: 5, outcome: 'correct' });
  });

  it('awards 0 when the field is a draw but the predicted winner did NOT advance', () => {
    // Predicted Brazil (home) to win; drew 1-1; the away side advanced on penalties.
    const r = calcPtsBrazil(
      { home: 2, away: 1 },
      { home: 1, away: 1, advancedTeamId: AWAY, homeId: HOME, awayId: AWAY },
    );
    expect(r).toEqual({ pts: 0, outcome: 'miss' });
  });

  it('awards 5 for a correctly predicted (non-exact) draw on a field-draw, regardless of the qualifier', () => {
    // Predicted 0-0, field ended 1-1 (a draw) → correct field outcome = 5pts via
    // calcPts base. The penalty qualifier is irrelevant when the field result was
    // itself correctly predicted as a draw.
    const r = calcPtsBrazil(
      { home: 0, away: 0 },
      { home: 1, away: 1, advancedTeamId: HOME, homeId: HOME, awayId: AWAY },
    );
    expect(r).toEqual({ pts: 5, outcome: 'correct' });
  });

  it('awards 10 for an exact draw even on a penalty game, ignoring the qualifier', () => {
    // Decision note §5.1: exact score wins before the qualifier check.
    const r = calcPtsBrazil(
      { home: 1, away: 1 },
      { home: 1, away: 1, advancedTeamId: AWAY, homeId: HOME, awayId: AWAY },
    );
    expect(r).toEqual({ pts: 10, outcome: 'exact' });
  });
});

describe('isBrazilMatch', () => {
  it('is true when Brazil is the home team', () => {
    expect(isBrazilMatch({ homeTeam: { id: BRAZIL_TEAM_ID }, awayTeam: { id: AWAY } })).toBe(true);
  });

  it('is true when Brazil is the away team', () => {
    expect(isBrazilMatch({ homeTeam: { id: AWAY }, awayTeam: { id: BRAZIL_TEAM_ID } })).toBe(true);
  });

  it('is false when neither team is Brazil', () => {
    expect(isBrazilMatch({ homeTeam: { id: '10' }, awayTeam: { id: AWAY } })).toBe(false);
  });
});
