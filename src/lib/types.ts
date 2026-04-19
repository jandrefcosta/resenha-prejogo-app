export interface ClubTheme {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  stadium: string;
  /** API-Football team ID (league 71 — Brasileirão Série A). Verify at api-sports.io. */
  apiFootballId: number | null;
  /** CBF internal club ID (gweb.cbf.com.br). Used to correlate with official match data. */
  cbfId?: number;
  /** CONMEBOL internal team ID (gol.conmebol.com). Used to filter Libertadores/Sul-Americana results. */
  conmebolId: number | null;
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
  /** Raw competition name from the API (e.g. "Campeonato Brasileiro") */
  competition: string;
  /** API-Football league ID (71=Série A, 13=Libertadores, 73=Copa do Brasil, 11=Sul-Americana) */
  leagueId: number;
  /** Human-readable competition label for display (e.g. "Brasileirão", "Libertadores") */
  competitionName: string;
  /** Competition phase for knockout/group-stage competitions (e.g. "Oitavas de Final") */
  competitionPhase?: string;
  round: string;
  /** Undefined when the API does not return broadcast data for this fixture */
  broadcasters?: string[];
  /** Undefined when not yet assigned by the federation */
  referee?: string;
  status: 'scheduled' | 'postponed' | 'finished';
  /** Populated for finished matches (status === 'finished') */
  score?: { home: number | null; away: number | null };
  /**
   * Extended score breakdown — populated by CONMEBOL source.
   * All fields are optional; only present when the competition provides them.
   */
  scoreDetail?: {
    ht?:        { home: number; away: number };
    et?:        { home: number; away: number };
    pen?:       { home: number; away: number };
    aggregate?: { home: number; away: number };
  };
  /** "home" | "away" | "draw" — explicit winner from CONMEBOL source */
  winner?: string;
  /** True when match went to extra time (matchLengthMin > 90) */
  hadExtraTime?: boolean;
  /** True when match was played at a neutral venue */
  isNeutralVenue?: boolean;
  /**
   * Group letter for Copa do Mundo group stage (A–L).
   * Not returned by the API — derived client-side by cross-referencing standings data.
   */
  group?: string;
  /**
   * API-Football fixture ID — present only when the primary source is API-Football.
   * Absent for CONMEBOL-sourced matches (where match.id is a CONMEBOL internal ID).
   * Used to safely call /api/match-events without hitting the wrong fixture.
   */
  apiFootballFixtureId?: number;
  /**
   * API-Football team IDs for home/away — needed to correctly assign goal sides
   * when the match source uses different IDs (e.g. CONMEBOL IDs in homeTeam.id).
   */
  apiFootballHomeId?: number;
  apiFootballAwayId?: number;
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
  /**
   * Accumulated yellow cards in the competition — sourced from CBF standings scraper.
   * Only populated for Série A (leagueId 71). Undefined for other competitions.
   */
  yellowCards?: number;
  /**
   * Accumulated red cards in the competition — sourced from CBF standings scraper.
   * Only populated for Série A (leagueId 71). Undefined for other competitions.
   */
  redCards?: number;
}

export interface BroadcasterInfo {
  name: string;
  /** Broadcaster website or stream page URL; empty string if unavailable */
  url: string;
}

export interface MatchPreview {
  homeForm: string[];
  awayForm: string[];
  broadcasters: BroadcasterInfo[];
}

// ─── CBF API types ────────────────────────────────────────────────────────────

export interface CbfGoal {
  /** CBF athlete ID */
  atletaId: string;
  atletaNome: string;
  atletaApelido: string;
  atletaCamisa: string;
  /** CBF club ID */
  clubeId: string;
  clube: string;
  /** 1 or 2 (first/second half), 'AC1', 'AC2', etc. */
  tempoJogo: string;
  minutos: string;
  /** 'CT' = contra-ataque/regular, 'NR' = normal */
  resultado: string;
}

export interface CbfCard {
  atletaId: string;
  atletaNome: string;
  atletaApelido: string;
  atletaCamisa: string;
  clubeId: string;
  clube: string;
  tempoJogo: string;
  minutos: string;
  /** 'AMARELO' | 'VERMELHO' | 'VERMELHO2AMARELO' */
  resultado: string;
}

export interface CbfReferee {
  id: number;
  nome: string;
  /** 'Arbitro' | 'Arbitro Assistente 1' | 'VAR' | 'AVAR' | … */
  funcao: string;
  uf: string;
  categoria: string;
}

export interface CbfAthlete {
  id: number;
  numeroCamisa: number;
  reserva: boolean;
  goleiro: boolean;
  entrouJogando: boolean;
  nome: string;
  apelido: string;
  foto: string;
}

export interface CbfSubstitution {
  codigoJogadorSaiu: number;
  codigoJogadorEntrou: number;
  tempoJogo: string;
  tempoSubs: string;
}

export interface CbfTeamDetail {
  /** CBF club ID */
  id: string;
  nome: string;
  urlEscudo: string;
  gols: string;
  panaltis: string;
  atletas: CbfAthlete[];
  alteracoes: CbfSubstitution[];
}

export interface CbfMatchDetail {
  /** CBF match ID */
  idJogo: string;
  numJogo: string;
  rodada: string;
  grupo: string;
  local: string;
  campeonato: string;
  data: string;
  hora: string;
  mandante: CbfTeamDetail;
  visitante: CbfTeamDetail;
  arbitros: CbfReferee[];
  gols: CbfGoal[];
  cartoes: CbfCard[];
  /** Document links from the CBF internal API (gweb.cbf.com.br) — may be empty for recent matches. Used by cbfDocParser to resolve PDF URLs. */
  documentos: Array<{ url: string; title: string }>;
}

// ─── CONMEBOL API types (gol.conmebol.com) ────────────────────────────────────

export interface ConmebolScoreEntries {
  /** Half-time score */
  ht?: { home_score: number; away_score: number };
  /** Full-time score (90 min) */
  ft?: { home_score: number; away_score: number };
  /** Extra time score */
  et?: { home_score: number; away_score: number };
  /** Penalty shootout score */
  pen?: { home_score: number; away_score: number };
  /** Aggregate score (two-legged ties) */
  aggregate?: { home_score: number; away_score: number };
  /** Final result considering all periods */
  total?: { home_score: number; away_score: number };
}

export interface ConmebolMatchDetail {
  /** CONMEBOL internal match ID */
  id: number;
  /** Unix timestamp (seconds) */
  date: number;
  /** "Home Team vs Away Team" */
  description: string;
  /** Phase/stage name e.g. "Group Stage", "1st Round" */
  stage: string;
  /** Whether the date is unconfirmed */
  tbc: boolean;
  /** Whether the match is at a neutral venue */
  isNeutralVenue: boolean;
  venue: string | null;
  home: {
    id: number;
    name: string;
    shortName: string;
    code: string;
    /** CDN crest URL (light theme, 1x) */
    crestUrl: string;
  };
  away: {
    id: number;
    name: string;
    shortName: string;
    code: string;
    crestUrl: string;
  };
  /** "Played" | "Fixture" | "Live" */
  matchStatus: string;
  isLive: boolean;
  homeScore: number | null;
  awayScore: number | null;
  /** "home" | "away" | "draw" | null */
  winner: string | null;
  /** Actual match duration in minutes (includes extra time) */
  matchLengthMin: number | null;
  scoreEntries: ConmebolScoreEntries | null;
  /** ISO timestamp of when this data was fetched */
  fetchedAt: string;
}

export interface ConmebolTournamentData {
  /** CONMEBOL tournament calendar ID (e.g. 15 for Libertadores 2026) */
  tournamentId: number;
  /** ISO timestamp of when this data was fetched */
  fetchedAt: string;
  /** Seconds until stale */
  ttlSeconds: number;
  matches: ConmebolMatchDetail[];
}

export type ConmebolMatchStatus = 'finished' | 'live' | 'post-match' | 'upcoming';

// ─── Copa do Brasil bracket ───────────────────────────────────────────────────

export interface CopaBracketFixture {
  fixtureId: number;
  date: string | null;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  /** null = not yet played */
  homeScore: number | null;
  awayScore: number | null;
  /** penalty score, if applicable */
  homePen: number | null;
  awayPen: number | null;
  /** 'finished' | 'scheduled' | 'live' */
  status: 'finished' | 'scheduled' | 'live';
  winner: 'home' | 'away' | null;
}

export interface CopaBracketRound {
  /** e.g. "Round of 32", "1/128-finals" */
  name: string;
  /** Display label in pt-BR */
  label: string;
  fixtures: CopaBracketFixture[];
}

export interface CopaBracketData {
  rounds: CopaBracketRound[];
  updatedAt: string;
  ttlSeconds: number;
}

// ─── API-Football lineups (/fixtures/lineups) ─────────────────────────────────

export interface AfPlayer {
  id: number | null;
  name: string;
  number: number;
  pos: string; // "G" | "D" | "M" | "F"
  grid: string | null; // "1:1" format
}

export interface AfLineupTeam {
  formation: string;
  startXI: AfPlayer[];
  substitutes: AfPlayer[];
  coach: string | null;
}

export interface LineupData {
  home: AfLineupTeam;
  away: AfLineupTeam;
  fetchedAt: string;
}

// ─── Match events (API-Football /fixtures/events) ─────────────────────────────

export interface MatchGoalEvent {
  /** Player who scored */
  playerName: string;
  /** Assist player name, if available */
  assistName: string | null;
  /** Minute of the goal */
  minute: number;
  /** Extra time minute, if applicable */
  minuteExtra: number | null;
  /** 'home' | 'away' */
  side: 'home' | 'away';
  /** 'Normal Goal' | 'Own Goal' | 'Penalty' */
  type: string;
}

export interface MatchEventsData {
  goals: MatchGoalEvent[];
}

/** State used to compute cache TTL */
export type CbfRoundStatus = 'finished' | 'live' | 'upcoming';

export interface CbfRoundData {
  round: number;
  status: CbfRoundStatus;
  /** ISO timestamp of when this data was fetched */
  fetchedAt: string;
  /** Seconds until stale — caller should re-fetch after this */
  ttlSeconds: number;
  matches: CbfMatchDetail[];
}
