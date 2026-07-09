/**
 * CONMEBOL API client with TTL-aware caching.
 *
 * Source: gol.conmebol.com/api/v2/tournament-fixtures/{tournamentId}
 * No authentication required — public API used by the CONMEBOL website.
 *
 * Cache strategy (Redis key: `conmebol:tournament:{id}`):
 *  - All matches finished      → 6 hours  (tournament data is batch — recheck periodically)
 *  - Any match live            → 5 min
 *  - Any match post-match      → 10 min   (scores may still be publishing)
 *  - Upcoming (default)        → 6 hours
 *
 * Stale-while-error: if the CONMEBOL API fails, stale data up to 24 h old is
 * served rather than throwing, keeping the UI functional during outages.
 */

import { sql } from 'drizzle-orm';
import { getCache, setCache } from '@/lib/redisCache';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import { db } from '@/lib/db';
import { matchSnapshots } from '@/lib/db/schema';
import type {
  ConmebolMatchDetail,
  ConmebolMatchStatus,
  ConmebolScoreEntries,
  ConmebolTournamentData,
} from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONMEBOL_BASE = 'https://gol.conmebol.com';

/** Tournament calendar IDs for the current season */
export const CONMEBOL_TOURNAMENT_IDS = {
  libertadores:   15,
  'sul-americana': 104,
} as const;

export type ConmebolCompetitionSlug = keyof typeof CONMEBOL_TOURNAMENT_IDS;

const TTL = {
  FINISHED:   60 * 60 * 6,   // 6 h — batch endpoint; re-check periodically
  LIVE:       60 * 5,         // 5 min — scores updating
  POST_MATCH: 60 * 10,        // 10 min — waiting for final score publication
  DEFAULT:    60 * 60 * 6,    // 6 h
} as const;

/**
 * Maximum age (ms) for stale data to be served on CONMEBOL API errors.
 * Prevents week-old data appearing during prolonged outages.
 */
const STALE_MAX_AGE_MS = 60 * 60 * 24 * 1000; // 24 h

const CONMEBOL_HEADERS: HeadersInit = {
  'accept': '*/*',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent':
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
};

// ─── Raw API types ────────────────────────────────────────────────────────────

interface RawCrest {
  uri_1x: string;
}

interface RawContestant {
  id: number;
  name: string;
  shortName: string;
  code: string;
  position: 'home' | 'away';
  crest: RawCrest;
}

interface RawScoreEntries {
  ht?:        { home_score: number; away_score: number };
  ft?:        { home_score: number; away_score: number };
  et?:        { home_score: number; away_score: number };
  pen?:       { home_score: number; away_score: number };
  aggregate?: { home_score: number; away_score: number };
  total?:     { home_score: number; away_score: number };
}

interface RawLiveData {
  matchStatus:      string;
  isLive:           boolean;
  showScores:       boolean;
  home_score?:      number;
  away_score?:      number;
  match_winner?:    string | null;
  match_length_min?: number | null;
  scoreEntries?:    RawScoreEntries;
}

interface RawMatch {
  matchInfo: {
    id: number;
    date: number;
    description: string;
    tbc: boolean;
    isNeutralVenue: boolean;
    contestant: RawContestant[];
    venue: { longName: string } | null;
    stage: { name: string };
  };
  liveData: RawLiveData;
}

interface RawTournamentResponse {
  match: RawMatch[];
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function parseMatch(raw: RawMatch, fetchedAt: string): ConmebolMatchDetail {
  const mi = raw.matchInfo;
  const ld = raw.liveData;

  const home = mi.contestant.find((c) => c.position === 'home')!;
  const away = mi.contestant.find((c) => c.position === 'away')!;

  const scoreEntries: ConmebolScoreEntries | null = ld.scoreEntries
    ? {
        ht:        ld.scoreEntries.ht,
        ft:        ld.scoreEntries.ft,
        et:        ld.scoreEntries.et,
        pen:       ld.scoreEntries.pen,
        aggregate: ld.scoreEntries.aggregate,
        total:     ld.scoreEntries.total,
      }
    : null;

  return {
    id:              mi.id,
    date:            mi.date,
    description:     mi.description,
    stage:           mi.stage?.name ?? '',
    tbc:             mi.tbc,
    isNeutralVenue:  mi.isNeutralVenue,
    venue:           mi.venue?.longName ?? null,
    home: {
      id:        home.id,
      name:      home.name,
      shortName: home.shortName,
      code:      home.code,
      crestUrl:  home.crest.uri_1x,
    },
    away: {
      id:        away.id,
      name:      away.name,
      shortName: away.shortName,
      code:      away.code,
      crestUrl:  away.crest.uri_1x,
    },
    matchStatus:     ld.matchStatus,
    isLive:          ld.isLive,
    homeScore:       ld.home_score ?? null,
    awayScore:       ld.away_score ?? null,
    winner:          ld.match_winner ?? null,
    matchLengthMin:  ld.match_length_min ?? null,
    scoreEntries,
    fetchedAt,
  };
}

/**
 * Extra buffer after the estimated match end to wait for the final score to be
 * published. The CONMEBOL API typically reflects the final result within
 * ~150 min of kickoff, so we add 35 min on top of LIVE_WINDOW_MS (115 min).
 */
const SCORE_PUBLISH_BUFFER_MS = 35 * 60 * 1000; // 35 min
const POST_MATCH_WINDOW_MS = LIVE_WINDOW_MS + SCORE_PUBLISH_BUFFER_MS; // ~150 min after kickoff

// ─── TTL computation ──────────────────────────────────────────────────────────

function inferStatus(matches: ConmebolMatchDetail[]): ConmebolMatchStatus {
  const now = Date.now();

  // 1. Live: either CONMEBOL flags it or we're within the estimated live window
  for (const m of matches) {
    if (m.isLive) return 'live';
    const kickoff = m.date * 1000;
    const estimatedEnd = kickoff + LIVE_WINDOW_MS;
    if (now >= kickoff && now <= estimatedEnd && m.matchStatus !== 'Played') {
      return 'live';
    }
  }

  const anyUnplayed = matches.some((m) => m.matchStatus !== 'Played');
  if (!anyUnplayed) return 'finished';

  // 2. Post-match: match has ended but the score hasn't been published yet.
  //    Window: from estimated end (kickoff + 115 min) up to kickoff + 150 min.
  //    During this period we poll every TTL.POST_MATCH (10 min) so we pick up
  //    the final result as soon as the CONMEBOL API reflects it.
  const anyInOptaPublishWindow = matches.some((m) => {
    if (m.matchStatus === 'Played') return false;
    const kickoff = m.date * 1000;
    const estimatedEnd = kickoff + LIVE_WINDOW_MS;
    const optaDeadline = kickoff + POST_MATCH_WINDOW_MS;
    return now > estimatedEnd && now <= optaDeadline;
  });
  if (anyInOptaPublishWindow) return 'post-match';

  return 'upcoming';
}

function computeTtl(status: ConmebolMatchStatus): number {
  if (status === 'live')       return TTL.LIVE;
  if (status === 'post-match') return TTL.POST_MATCH;
  if (status === 'finished')   return TTL.FINISHED;
  return TTL.DEFAULT;
}

// ─── Stale-while-error ────────────────────────────────────────────────────────

function acceptStale(stale: ConmebolTournamentData | null): ConmebolTournamentData | null {
  if (!stale) return null;
  const age = Date.now() - new Date(stale.fetchedAt).getTime();
  return age <= STALE_MAX_AGE_MS ? stale : null;
}

// ─── Cache keys ───────────────────────────────────────────────────────────────

function cacheKey(tournamentId: number): string {
  return `conmebol:tournament:${tournamentId}`;
}

function staleKey(tournamentId: number): string {
  return `conmebol:tournament:${tournamentId}:stale`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the competition slug for the referer header.
 */
function competitionSlug(tournamentId: number): string {
  return tournamentId === CONMEBOL_TOURNAMENT_IDS.libertadores
    ? 'libertadores'
    : 'sudamericana';
}

/**
 * Fetches (or returns cached) all matches for a CONMEBOL tournament.
 * Automatically determines TTL based on the current match status across
 * all fixtures in the tournament.
 */
export async function getConmebolTournament(
  tournamentId: number,
  force = false,
): Promise<ConmebolTournamentData> {
  const key = cacheKey(tournamentId);

  if (!force) {
    const cached = await getCache<ConmebolTournamentData>(key);
    if (cached) return cached;
  }

  const slug = competitionSlug(tournamentId);
  const url = `${CONMEBOL_BASE}/${slug}/es/api/v2/tournament-fixtures/${tournamentId}`;

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        ...CONMEBOL_HEADERS,
        referer: `${CONMEBOL_BASE}/${slug}/es/tournament/${tournamentId}`,
      },
      cache: 'no-store',
    });
  } catch (networkErr) {
    const stale = acceptStale(await getCache<ConmebolTournamentData>(staleKey(tournamentId)));
    if (stale) return stale;
    throw networkErr;
  }

  if (!res.ok) {
    const stale = acceptStale(await getCache<ConmebolTournamentData>(staleKey(tournamentId)));
    if (stale) return stale;
    throw new Error(`CONMEBOL API error: ${res.status} ${res.statusText}`);
  }

  const raw: RawTournamentResponse = await res.json();
  const fetchedAt = new Date().toISOString();

  const matches = (raw.match ?? []).map((m) => parseMatch(m, fetchedAt));
  const status = inferStatus(matches);
  const ttlSeconds = computeTtl(status);

  const data: ConmebolTournamentData = {
    tournamentId,
    fetchedAt,
    ttlSeconds,
    matches,
  };

  // Fire-and-forget — failure here is non-critical
  void setCache(key, data, ttlSeconds);
  void setCache(staleKey(tournamentId), data, TTL.FINISHED); // 6 h backup

  // Persist played matches to Postgres as source of truth.
  const leagueId = tournamentId === CONMEBOL_TOURNAMENT_IDS.libertadores ? 13 : 11;
  const played = matches.filter(m => m.matchStatus === 'Played');
  if (played.length > 0) {
    const pgRows = played.map(m => {
      const se = m.scoreEntries;
      return {
        fixtureId:    `conmebol_${m.id}`,
        source:       'conmebol' as const,
        leagueId,
        season:       2026,
        round:        m.stage,
        status:       'finished' as const,
        matchDate:    new Date(m.date * 1000),
        homeTeamId:   String(m.home.id),
        homeTeamName: m.home.name,
        awayTeamId:   String(m.away.id),
        awayTeamName: m.away.name,
        homeScore:    m.homeScore,
        awayScore:    m.awayScore,
        scoreHtHome:  se?.ht?.home_score  ?? null,
        scoreHtAway:  se?.ht?.away_score  ?? null,
        scoreEtHome:  se?.et?.home_score  ?? null,
        scoreEtAway:  se?.et?.away_score  ?? null,
        scorePenHome: se?.pen?.home_score ?? null,
        scorePenAway: se?.pen?.away_score ?? null,
        scoreAggHome: se?.aggregate?.home_score ?? null,
        scoreAggAway: se?.aggregate?.away_score ?? null,
        winner:       m.winner,
        matchLengthMin: m.matchLengthMin,
        venue:        m.venue,
        hasHomeLineup: false,
        hasAwayLineup: false,
        rawPayload:   m as unknown as Record<string, unknown>,
      };
    });
    void db.insert(matchSnapshots).values(pgRows)
      .onConflictDoUpdate({
        target: matchSnapshots.fixtureId,
        set: {
          homeScore:    sql`excluded.home_score`,
          awayScore:    sql`excluded.away_score`,
          rawPayload:   sql`excluded.raw_payload`,
          updatedAt:    sql`now()`,
        },
      })
      .catch(err => console.error('[pg-write-through] conmebol tournament:', err));
  }

  return data;
}

/**
 * Returns finished matches for a specific CONMEBOL team ID within a tournament,
 * sorted newest-first. Returns up to `limit` matches.
 */
export async function getConmebolFinishedByTeam(
  tournamentId: number,
  conmebolTeamId: number,
  limit = 5,
): Promise<ConmebolMatchDetail[]> {
  const data = await getConmebolTournament(tournamentId);

  return data.matches
    .filter(
      (m) =>
        m.matchStatus === 'Played' &&
        (m.home.id === conmebolTeamId || m.away.id === conmebolTeamId),
    )
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);
}
