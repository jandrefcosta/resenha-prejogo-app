import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache, TTL_30MIN, TTL_3H } from '@/lib/redisCache';
import { getCompetitionById, SERIE_A } from '@/data/competitions';
import type { StandingEntry } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';

export const dynamic = 'force-dynamic';

// ─── Payload type ─────────────────────────────────────────────────────────────

export interface StandingsPayload {
  /**
   * Array of groups. Série A has one group of 20 teams.
   * Libertadores / Sul-Americana have one array per group (A, B, C…).
   * Copa do Brasil (knockout) returns an empty array — no traditional standings.
   */
  groups: StandingEntry[][];
  /** UI hint — consumer decides how to render */
  format: 'pontos-corridos' | 'grupos' | 'mata-mata';
  updatedAt: string;
  /** TTL in seconds used when this payload was written — used for Cache-Control on cache hits */
  ttlSeconds: number;
}

// ─── Raw API types ────────────────────────────────────────────────────────────

interface RawStandingEntry {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  form: string;
  status: string;
  description: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  home: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  away: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
}

function mapEntry(e: RawStandingEntry): StandingEntry {
  return {
    rank: e.rank,
    team: { id: e.team.id, name: e.team.name, logo: e.team.logo },
    points: e.points,
    goalsDiff: e.goalsDiff,
    form: e.form ?? '',
    status: e.status ?? 'same',
    description: e.description ?? null,
    all: e.all,
    home: e.home,
    away: e.away,
  };
}

/**
 * Returns a shorter TTL during Brasileirão match windows.
 * Brasileirão rounds are typically played Wed–Thu evenings and Fri–Sun.
 * Brasília = UTC-3.
 */
function getSmartTTL(): number {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const day  = brt.getUTCDay();
  const hour = brt.getUTCHours();

  const isWeekendWindow =
    (day === 5 && hour >= 16) || day === 6 || day === 0 || (day === 1 && hour < 2);
  const isMidWeekWindow =
    (day === 3 && hour >= 16) || (day === 4 && hour < 2);

  return isWeekendWindow || isMidWeekWindow ? TTL_30MIN : TTL_3H;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const force = sp.get('force') === '1';

  const competitionParam = sp.get('competition') ?? 'serie-a';
  const competition = getCompetitionById(competitionParam) ?? SERIE_A;
  const leagueId = competition.apiFootballLeagueId;
  const season = competition.season;
  const cacheKey = `standings:${leagueId}:v2`;

  if (!force) {
    const cached = await getCache<StandingsPayload>(cacheKey);
    if (cached) {
      // Use the TTL recorded at write time, not a freshly-computed value,
      // to avoid serving a Cache-Control header inconsistent with the cache entry.
      const cachedTtl = cached.ttlSeconds ?? TTL_3H;
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': `public, max-age=${cachedTtl}` },
      });
    }
  }

  // Compute TTL once at write time so cache hits reuse the same value.
  const ttl = leagueId === 71 ? getSmartTTL() : TTL_3H;

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 });

  const res = await fetch(`${BASE_URL}/standings?league=${leagueId}&season=${season}`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: `API HTTP ${res.status}` }, { status: 502 });
  }

  const apiData = await res.json();

  // API-Football returns standings as an array of groups.
  // Série A: [[team1..team20]]  (one group)
  // Libertadores: [[groupA...], [groupB...], ...]  (multiple groups)
  // Copa do Brasil (knockout): [] or no standings data
  const rawGroups: RawStandingEntry[][] = apiData?.response?.[0]?.league?.standings ?? [];
  const groups: StandingEntry[][] = rawGroups.map((group) => group.map(mapEntry));

  const payload: StandingsPayload = {
    groups,
    format: competition.format === 'pontos-corridos' ? 'pontos-corridos'
      : competition.format === 'mata-mata' ? 'mata-mata'
      : 'grupos',
    updatedAt: new Date().toISOString(),
    ttlSeconds: ttl,
  };

  await setCache(cacheKey, payload, ttl);

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': `public, max-age=${ttl}` },
  });
}
