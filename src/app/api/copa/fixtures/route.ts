import { NextResponse } from 'next/server';
import { getCache, setCache, TTL_1H, TTL_30MIN, TTL_24H } from '@/lib/redisCache';
import { acceptStale, hasApiFootballErrors, type StaleEntry } from '@/lib/apiFootballCache';
import type { Match, MatchTeam } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 1;
const SEASON = 2026;
const CACHE_KEY = 'copa-fixtures:2026';
/** Serve last-good Copa fixtures up to 7 days old when a fresh fetch fails. */
const COPA_STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Phase grouping ───────────────────────────────────────────────────────────

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
  'Round of 16':     'Oitavas de Final',
  'Quarter-finals':  'Quartas de Final',
  'Semi-finals':     'Semifinais',
  '3rd Place Final': 'Disputa de 3º Lugar',
  'Final':           'Final',
};

/** Canonical tab order — used by CopaMatchSection */
export const PHASE_ORDER = [
  'Grupos',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  '3rd Place Final',
  'Final',
] as const;

// ─── Raw API types ────────────────────────────────────────────────────────────

interface ApiTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    venue: { name: string | null; city: string | null };
    status: { short: string };
  };
  league: {
    id: number;
    name: string;
    round: string;
    season: number;
  };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
}

interface ApiResponse<T> {
  response: T[];
  errors: Record<string, string> | string[];
}

// ─── Payload type (exported for use in CopaMatchSection) ──────────────────────

export interface CopaFixturesPayload {
  /**
   * Fixtures grouped by phase tab key.
   * Group stage rounds are collapsed under the key "Grupos".
   * Knockout rounds use their raw API round string as key.
   */
  phases: Record<string, Match[]>;
  /** Brazil's upcoming group fixture IDs for quick highlight lookup */
  brazilTeamId: number;
  updatedAt: string;
  ttlSeconds: number;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function toMatchTeam(t: ApiTeam): MatchTeam {
  return {
    id: String(t.id),
    name: t.name,
    shortName: t.name.substring(0, 3).toUpperCase(),
    logo: t.logo,
  };
}

function mapFixture(f: ApiFixture): Match {
  const round = f.league.round;
  const isGroup = GROUP_ROUNDS.has(round);
  const isFinished = ['FT', 'AET', 'PEN'].includes(f.fixture.status.short);

  // advancedTeamId: the side that progressed from a finished KNOCKOUT tie. Gated
  // to non-group phases so a group winner never sets it (the "Só Brasil" hybrid
  // penalty rule keys off this). teams.X.winner reflects the shootout winner for
  // PEN games; it can populate a tick after status flips to finished, so it may
  // be absent on a just-finished tie — the score cron skips those until it lands.
  let advancedTeamId: string | undefined;
  if (!isGroup && isFinished) {
    if (f.teams.home.winner === true) advancedTeamId = String(f.teams.home.id);
    else if (f.teams.away.winner === true) advancedTeamId = String(f.teams.away.id);
  }

  return {
    id: String(f.fixture.id),
    homeTeam: toMatchTeam(f.teams.home),
    awayTeam: toMatchTeam(f.teams.away),
    date: f.fixture.date,
    stadium: f.fixture.venue.name ?? null,
    city: f.fixture.venue.city ?? null,
    competition: f.league.name,
    leagueId: f.league.id,
    competitionName: 'Copa 2026',
    // competitionPhase: the group stage tab key or the raw knockout round
    competitionPhase: isGroup ? 'Grupos' : round,
    round: PHASE_LABELS[round] ?? round,
    status:
      f.fixture.status.short === 'PST'
        ? 'postponed'
        : isFinished
          ? 'finished'
          : 'scheduled',
    score:
      f.goals.home !== null || f.goals.away !== null
        ? { home: f.goals.home, away: f.goals.away }
        : undefined,
    ...(advancedTeamId ? { advancedTeamId } : {}),
  };
}

// ─── TTL ──────────────────────────────────────────────────────────────────────

/**
 * During the Copa (June–July 2026) games are played every day.
 * Use 30min TTL during likely match hours (12h–24h UTC), 1h otherwise.
 */
function getCopaTTL(): number {
  const hour = new Date().getUTCHours();
  return hour >= 12 && hour <= 23 ? TTL_30MIN : TTL_1H;
}

// ─── Payload loader ───────────────────────────────────────────────────────────

/**
 * Returns the Copa 2026 fixtures payload — from the Redis cache when warm, or
 * by fetching API-Football on a miss (repopulating the cache). Throws on a
 * hard upstream failure.
 *
 * Exported so server-side callers (e.g. the bolão score cron) can obtain the
 * payload without depending on the cache having been pre-warmed by organic
 * traffic to GET /api/copa/fixtures.
 */
export async function getCopaFixtures(): Promise<CopaFixturesPayload> {
  const cached = await getCache<CopaFixturesPayload>(CACHE_KEY);
  if (cached) return cached;

  const staleKey = `${CACHE_KEY}:stale`;
  try {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) throw new Error('API_FOOTBALL_KEY not set');

    const url = new URL(`${BASE_URL}/fixtures`);
    url.searchParams.set('league', String(LEAGUE_ID));
    url.searchParams.set('season', String(SEASON));

    const res = await fetch(url.toString(), {
      headers: { 'x-apisports-key': key },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);

    const data: ApiResponse<ApiFixture> = await res.json();

    if (hasApiFootballErrors(data.errors)) {
      throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
    }
    // An empty fixtures list is never legitimate for the World Cup — treat it
    // as a soft failure so we don't cache an empty payload over good data.
    if (data.response.length === 0) {
      throw new Error('API-Football returned no Copa fixtures');
    }

    // Group by phase tab key, sorted chronologically within each group
    const phases: Record<string, Match[]> = {};

    for (const f of data.response) {
      const match = mapFixture(f);
      const tab = match.competitionPhase ?? 'Grupos';
      if (!phases[tab]) phases[tab] = [];
      phases[tab].push(match);
    }

    for (const tab in phases) {
      phases[tab].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    const ttl = getCopaTTL();
    const payload: CopaFixturesPayload = {
      phases,
      brazilTeamId: 6,
      updatedAt: new Date().toISOString(),
      ttlSeconds: ttl,
    };

    await setCache(CACHE_KEY, payload, ttl);
    const backup: StaleEntry<CopaFixturesPayload> = {
      fetchedAt: payload.updatedAt,
      data: payload,
    };
    await setCache(staleKey, backup, TTL_24H * 30);
    return payload;
  } catch (err) {
    // Serve last-good fixtures rather than 502 on a transient upstream failure.
    const stale = acceptStale(
      await getCache<StaleEntry<CopaFixturesPayload>>(staleKey),
      COPA_STALE_MAX_AGE_MS,
    );
    if (stale) return stale;
    throw err;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = await getCopaFixtures();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, s-maxage=${payload.ttlSeconds}, stale-while-revalidate=120`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
