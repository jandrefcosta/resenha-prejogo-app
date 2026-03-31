export interface ClubTheme {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  stadium: string;
  /** API-Football team ID (league 71 — Brasileirão Série A). Verify at api-sports.io. */
  apiFootballId: number | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  textOnPrimary: 'white' | 'dark';
}

export interface MatchTeam {
  id: string;
  name: string;
  shortName: string;
  logo?: string;
}

export interface H2HMatch {
  id: string;
  date: string;
  homeTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  awayTeam: string;
  competition: string;
  season: number;
}

export interface H2HStats {
  totalGames: number;
  /** Wins by the team that is HOME in the upcoming fixture */
  homeTeamWins: number;
  draws: number;
  /** Wins by the team that is AWAY in the upcoming fixture */
  awayTeamWins: number;
}

export interface InjuredPlayer {
  name: string;
  /** e.g. "Missing Fixture", "Questionable" */
  type: string;
  /** e.g. "Knee Injury", "Suspension" */
  reason: string;
  teamName: string;
  teamId: string;
}

export interface H2HData {
  /** Last ≤5 results for home team in Série A, most recent first. Values: 'W' | 'D' | 'L' */
  homeForm: string[];
  /** Last ≤5 results for away team in Série A, most recent first. Values: 'W' | 'D' | 'L' */
  awayForm: string[];
  /** Last ≤5 direct encounters for display */
  h2h: H2HMatch[];
  /** Computed from last 10 encounters */
  stats: H2HStats;
  injuries: InjuredPlayer[];
}

export interface PlayerStat {
  name: string;
  appearances: number;
  goals: number;
  assists: number;
  minutes: number;
}

export interface TeamPlayersData {
  home: PlayerStat[];
  away: PlayerStat[];
}

export interface Match {
  id: string;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  /** ISO 8601 date-time string (UTC) */
  date: string;
  /** Null when API does not return venue data */
  stadium: string | null;
  /** Null when API does not return venue data */
  city: string | null;
  competition: string;
  round: string;
  /** Undefined when the API does not return broadcast data for this fixture */
  broadcasters?: string[];
  /** Undefined when not yet assigned by the federation */
  referee?: string;
  status: 'scheduled' | 'postponed';
}

export interface StandingEntry {
  rank: number;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  points: number;
  goalsDiff: number;
  form: string;
  /** 'same' | 'up' | 'down' */
  status: string;
  /** e.g. "Promotion - Libertadores", "Relegation" — may be null */
  description: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  home: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  away: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

export interface MatchPreview {
  homeForm: string[];
  awayForm: string[];
  broadcasters: string[];
}
