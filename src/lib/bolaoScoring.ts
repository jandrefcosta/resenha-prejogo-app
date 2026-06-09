// Pure scoring & team-identity logic for the bolão — no Redis/Postgres imports,
// so it stays unit-testable in isolation (mirrors src/lib/teamIdentity.ts).
// bolaoRedis.ts re-exports these to preserve its public API.

export type ScoreOutcome = 'exact' | 'correct' | 'miss';

/**
 * API-Football team id for the Brazilian national team, as a string (Copa
 * fixtures carry string team ids — see mapFixture in api/copa/fixtures/route.ts).
 * Single source of truth, mirrored by competitions.ts → world-cup-2026
 * (defaultHighlightTeamId: 6) and CopaFixturesPayload.brazilTeamId.
 */
export const BRAZIL_TEAM_ID = '6';

/** Standard bolão scoring: exact score = 10, correct outcome = 5, else 0. */
export function calcPts(
  palpite: { home: number; away: number },
  resultado: { home: number; away: number },
): { pts: number; outcome: ScoreOutcome } {
  if (palpite.home === resultado.home && palpite.away === resultado.away) {
    return { pts: 10, outcome: 'exact' };
  }
  const pOutcome = Math.sign(palpite.home - palpite.away);
  const rOutcome = Math.sign(resultado.home - resultado.away);
  if (pOutcome === rOutcome) {
    return { pts: 5, outcome: 'correct' };
  }
  return { pts: 0, outcome: 'miss' };
}

/**
 * "Só Brasil" scoring, valid in every phase.
 *
 * - Exact score always wins (10pts), before any qualifier check.
 * - Otherwise the standard outcome rule applies (5pts for a correct field result).
 * - Hybrid penalty rule: when the field ended in a draw and the match was decided
 *   on penalties (`advancedTeamId` set), a palpite that picked the side which
 *   actually advanced earns the 5pt "correct" award.
 *
 * Collapses to `calcPts` when `advancedTeamId` is absent (group games), so a
 * Brazil group fixture scores identically in the global and "Só Brasil" rankings.
 */
export function calcPtsBrazil(
  palpite: { home: number; away: number },
  match: { home: number; away: number; advancedTeamId?: string; homeId: string; awayId: string },
): { pts: number; outcome: ScoreOutcome } {
  // Placar exato sempre vale 10, em qualquer fase.
  if (palpite.home === match.home && palpite.away === match.away) {
    return { pts: 10, outcome: 'exact' };
  }

  const base = calcPts(palpite, { home: match.home, away: match.away });
  if (base.pts > 0) return base; // acertou o resultado em campo

  // Híbrido: empate em campo decidido nos pênaltis num mata-mata. Se o palpite
  // previu vitória do time que de fato classificou, vale 5pts de "resultado".
  if (match.advancedTeamId && match.home === match.away) {
    const palpitouHomeWin = palpite.home > palpite.away;
    const palpitouAwayWin = palpite.away > palpite.home;
    const homeAdvanced = match.advancedTeamId === match.homeId;
    const awayAdvanced = match.advancedTeamId === match.awayId;
    if ((palpitouHomeWin && homeAdvanced) || (palpitouAwayWin && awayAdvanced)) {
      return { pts: 5, outcome: 'correct' };
    }
  }

  return { pts: 0, outcome: 'miss' };
}

/** True when either side of a match is the Brazilian national team. */
export function isBrazilMatch(m: {
  homeTeam: { id: string };
  awayTeam: { id: string };
}): boolean {
  return m.homeTeam.id === BRAZIL_TEAM_ID || m.awayTeam.id === BRAZIL_TEAM_ID;
}
