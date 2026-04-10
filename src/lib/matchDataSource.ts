/**
 * Determines the data source for finished match details based on league.
 *
 * - 'cbf'          → CBF API (gweb.cbf.com.br) — rich data: lineups, goals, cards, substitutions.
 *                    Only available for Brasileirão Série A (leagueId 71).
 * - 'api-football' → API-Football /fixtures endpoint — basic data: score, stats.
 *                    Used for Libertadores, Copa do Brasil, Sul-Americana, Copa do Mundo.
 */
export type MatchDataSource = 'cbf' | 'api-football';

export function getFinishedMatchSource(leagueId: number): MatchDataSource {
  return leagueId === 71 ? 'cbf' : 'api-football';
}
