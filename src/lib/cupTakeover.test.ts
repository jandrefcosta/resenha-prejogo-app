import { describe, it, expect } from 'vitest';
import { isCupTakeover } from './cupTakeover';

describe('isCupTakeover', () => {
  it('returns false before the window starts', () => {
    expect(isCupTakeover(new Date('2026-06-10T23:59:59-03:00'))).toBe(false);
  });

  it('returns true at the exact start boundary', () => {
    expect(isCupTakeover(new Date('2026-06-11T00:00:00-03:00'))).toBe(true);
  });

  it('returns true during the Cup', () => {
    expect(isCupTakeover(new Date('2026-07-01T12:00:00-03:00'))).toBe(true);
  });

  it('returns true at the exact end boundary', () => {
    expect(isCupTakeover(new Date('2026-07-21T23:59:59-03:00'))).toBe(true);
  });

  it('returns false after the window ends', () => {
    expect(isCupTakeover(new Date('2026-07-22T00:00:00-03:00'))).toBe(false);
  });

  it('compares instants, not local wall-clock (UTC input)', () => {
    // 2026-06-11T03:00:00Z === 2026-06-11T00:00:00-03:00 → inside
    expect(isCupTakeover(new Date('2026-06-11T03:00:00Z'))).toBe(true);
    // one second earlier in UTC → outside
    expect(isCupTakeover(new Date('2026-06-11T02:59:59Z'))).toBe(false);
  });
});
