import { WORLD_CUP_2026_WINDOW } from '@/data/competitions';

/**
 * True while the Copa 2026 homepage takeover is active (boundaries inclusive).
 * Pure date comparison — no I/O, no env reads — so it is unit-testable and
 * safe to call from both Server and Client Components.
 */
export function isCupTakeover(now: Date = new Date()): boolean {
  const t = now.getTime();
  return (
    t >= WORLD_CUP_2026_WINDOW.start.getTime() &&
    t <= WORLD_CUP_2026_WINDOW.end.getTime()
  );
}
