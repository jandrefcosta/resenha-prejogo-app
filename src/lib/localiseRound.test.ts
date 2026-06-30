import { describe, it, expect } from 'vitest';
import { localiseRound } from './localiseRound';

describe('localiseRound', () => {
  it('translates the 2026 Round of 32 to "16 avos de Final"', () => {
    expect(localiseRound('Round of 32')).toBe('16 avos de Final');
  });

  it('still translates the Round of 16 to "Oitavas de Final"', () => {
    expect(localiseRound('Round of 16')).toBe('Oitavas de Final');
  });

  it('does not mangle "Round of 32" into the Round of 16 label', () => {
    // "Round of 16" is a substring concern; ensure 32 is handled distinctly.
    expect(localiseRound('Round of 32')).not.toContain('Oitavas');
  });
});
