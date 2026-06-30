// Pure phase constants for the Copa do Mundo, with no server/runtime imports —
// so both the API route and client components (CopaMatchSection, the bracket)
// can share them without dragging next/server or Upstash into the client bundle.

/** Rounds that belong to the group stage — collapsed into a single "Grupos" tab */
export const GROUP_ROUNDS = new Set([
  'Group Stage - 1',
  'Group Stage - 2',
  'Group Stage - 3',
]);

/** Display labels in pt-BR for each API-Football round value */
export const PHASE_LABELS: Record<string, string> = {
  'Group Stage - 1': 'Rodada 1',
  'Group Stage - 2': 'Rodada 2',
  'Group Stage - 3': 'Rodada 3',
  'Round of 32':     '16 avos de Final',
  'Round of 16':     'Oitavas de Final',
  'Quarter-finals':  'Quartas de Final',
  'Semi-finals':     'Semifinais',
  '3rd Place Final': 'Disputa de 3º Lugar',
  'Final':           'Final',
};

/** Canonical tab order — group stage first, then each knockout round. */
export const PHASE_ORDER = [
  'Grupos',
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  '3rd Place Final',
  'Final',
] as const;

/** Knockout phases only, in order (excludes the synthetic "Grupos" tab). */
export const KNOCKOUT_PHASE_ORDER = PHASE_ORDER.filter((p) => p !== 'Grupos');
