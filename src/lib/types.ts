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
