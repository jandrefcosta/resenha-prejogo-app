/**
 * Translates API-Football round strings to Portuguese.
 *
 * Série A rounds are already localised upstream in apiFootball.ts
 * (e.g. "Regular Season - 12" → "Rodada 12"), so they pass through unchanged.
 *
 * Order matters: multi-word patterns must come before their substrings
 * (e.g. "Round of 16" before a hypothetical bare "Round").
 */
export function localiseRound(round: string): string {
  return round
    .replace('Group Stage', 'Fase de Grupos')
    .replace('Round of 16', 'Oitavas de Final')
    .replace('Round of 8', 'Quartas de Final')
    .replace('Quarter-finals', 'Quartas de Final')
    .replace('Semi-finals', 'Semifinais')
    .replace('3rd Place Final', '3º Lugar')
    .replace('1st Leg', 'Jogo de Ida')
    .replace('2nd Leg', 'Jogo de Volta')
    .replace(/\bFinal\b/, 'Final'); // bare word only, avoids mangling "Semi-finals" if order changes
}
