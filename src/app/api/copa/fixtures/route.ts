import { NextResponse } from 'next/server';
import { getCache, setCache, TTL_1H, TTL_30MIN } from '@/lib/redisCache';
import type { Match, MatchTeam } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 1;
const SEASON = 2026;
const CACHE_KEY = 'copa-fixtures:2026';

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
        : ['FT', 'AET', 'PEN'].includes(f.fixture.status.short)
          ? 'finished'
          : 'scheduled',
    score:
      f.goals.home !== null || f.goals.away !== null
        ? { home: f.goals.home, away: f.goals.away }
        : undefined,
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

  const hasErrors = Array.isArray(data.errors)
    ? data.errors.length > 0
    : Object.keys(data.errors).length > 0;
  if (hasErrors) {
    throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
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
  return payload;
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
