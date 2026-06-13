export interface Competition {
  /** Unique slug used as URL param and cache key prefix */
  id: string;
  /** Full display name, e.g. "Brasileirão Série A" */
  name: string;
  /** Short display name for labels and tabs, e.g. "Brasileirão" */
  shortName: string;
  /** API-Football league ID */
  apiFootballLeagueId: number;
  season: number;
  /** CBF championship ID — only for competitions with CBF data */
  cbfChampionshipId?: number;
  /** Whether CBF API is used as the source for finished match details */
  hasCbfData: boolean;
  /** 'club' competitions filter by selected team; 'national' highlight by country */
  scope: 'club' | 'national';
  format: 'pontos-corridos' | 'mata-mata' | 'grupos-mata-mata';
  /** For 'national' scope: API-Football team ID highlighted by default (e.g. Brazil = 6) */
  defaultHighlightTeamId?: number;
}

const CURRENT_SEASON = new Date().getFullYear();

export const COMPETITIONS: Competition[] = [
  {
    id: 'serie-a',
    name: 'Brasileirão Série A',
    shortName: 'Brasileirão',
    apiFootballLeagueId: 71,
    season: CURRENT_SEASON,
    cbfChampionshipId: 1260611,
    hasCbfData: true,
    scope: 'club',
    format: 'pontos-corridos',
  },
  {
    id: 'libertadores',
    name: 'Copa Libertadores',
    shortName: 'Libertadores',
    apiFootballLeagueId: 13,
    season: CURRENT_SEASON,
    hasCbfData: false,
    scope: 'club',
    format: 'grupos-mata-mata',
  },
  {
    id: 'copa-brasil',
    name: 'Copa do Brasil',
    shortName: 'Copa do Brasil',
    apiFootballLeagueId: 73,
    season: CURRENT_SEASON,
    hasCbfData: false,
    scope: 'club',
    format: 'mata-mata',
  },
  {
    id: 'sul-americana',
    name: 'Copa Sul-Americana',
    shortName: 'Sul-Americana',
    apiFootballLeagueId: 11,
    season: CURRENT_SEASON,
    hasCbfData: false,
    scope: 'club',
    format: 'grupos-mata-mata',
  },
  {
    id: 'world-cup-2026',
    name: 'Copa do Mundo 2026',
    shortName: 'Copa 2026',
    apiFootballLeagueId: 1,
    season: 2026,
    hasCbfData: false,
    scope: 'national',
    format: 'grupos-mata-mata',
    defaultHighlightTeamId: 6, // Seleção Brasileira
  },
];

/**
 * Period in which the Copa 2026 takes over the homepage (redirect + tab bar).
 * Final is Jul 19 + 2 days of afterglow. Auto-reverts after `end`.
 * See docs/superpowers/specs/2026-06-12-copa-homepage-takeover-design.md
 */
export const WORLD_CUP_2026_WINDOW = {
  start: new Date('2026-06-11T00:00:00-03:00'),
  end: new Date('2026-07-21T23:59:59-03:00'),
} as const;

/** Shortcut for the default competition used throughout the app */
export const SERIE_A = COMPETITIONS.find((c) => c.id === 'serie-a')!;

export function getCompetitionById(id: string): Competition | undefined {
  return COMPETITIONS.find((c) => c.id === id);
}

export function getCompetitionByLeagueId(leagueId: number): Competition | undefined {
  return COMPETITIONS.find((c) => c.apiFootballLeagueId === leagueId);
}
