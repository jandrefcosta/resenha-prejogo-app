import { describe, it, expect } from 'vitest';
import { isKnockoutDecided, qualificationState } from './copaQualification';

// API-Football stamps every team that advanced from the group stage with
// description "Round of 32" (top-2 of each group + the 8 best third-placed).
// Eliminated teams have description null. Once any team carries that mark the
// knockout field is "decided" and we colour by the real outcome; before that
// (group stage still running) we fall back to the rank-based hint.

describe('isKnockoutDecided', () => {
  it('is true when at least one team carries a knockout qualification', () => {
    expect(isKnockoutDecided([
      { description: 'Round of 32' },
      { description: null },
    ])).toBe(true);
  });

  it('is false during the group stage (no qualification marks yet)', () => {
    expect(isKnockoutDecided([
      { description: null },
      { description: null },
    ])).toBe(false);
  });
});

describe('qualificationState — decided (knockout set)', () => {
  it('marks a team with a Round of 32 mark as qualified, regardless of rank', () => {
    // A best-third-placed team (rank 3) that actually advanced.
    expect(qualificationState({ rank: 3, description: 'Round of 32' }, true)).toBe('qualified');
  });

  it('marks an unmarked team as eliminated (none), even at rank 2', () => {
    // Defensive: once decided, only the description decides — not the rank.
    expect(qualificationState({ rank: 2, description: null }, true)).toBe('none');
  });
});

describe('qualificationState — undecided (group stage running)', () => {
  it('treats the top two as qualified', () => {
    expect(qualificationState({ rank: 1, description: null }, false)).toBe('qualified');
    expect(qualificationState({ rank: 2, description: null }, false)).toBe('qualified');
  });

  it('treats third place as a possible qualifier', () => {
    expect(qualificationState({ rank: 3, description: null }, false)).toBe('possible');
  });

  it('treats fourth place as out', () => {
    expect(qualificationState({ rank: 4, description: null }, false)).toBe('none');
  });
});
