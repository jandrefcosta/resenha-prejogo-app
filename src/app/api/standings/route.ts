import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache, TTL_30MIN, TTL_3H, TTL_24H } from '@/lib/redisCache';
import { getCompetitionById, SERIE_A } from '@/data/competitions';
import { getCbfSerieACards } from '@/lib/cbfStandingsScraper';
import { isAdminRequest } from '@/lib/adminAuth';
import {
  acceptStale,
  hasApiFootballErrors,
  shouldCacheStandings,
  type StaleEntry,
} from '@/lib/apiFootballCache';
import type { StandingEntry } from '@/lib/types';

/** Serve last-good standings up to 7 days old when a fresh fetch fails. */
const STANDINGS_STALE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  const force = sp.get('force') === '1' && (await isAdminRequest(req));

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

  const staleKey = `${cacheKey}:stale`;
  const format: StandingsPayload['format'] =
    competition.format === 'pontos-corridos' ? 'pontos-corridos'
    : competition.format === 'mata-mata' ? 'mata-mata'
    : 'grupos';

  // Serve last-good standings rather than blank on a transient upstream failure.
  const serveStaleOr502 = async (detail: string): Promise<NextResponse> => {
    const stale = acceptStale(
      await getCache<StaleEntry<StandingsPayload>>(staleKey),
      STANDINGS_STALE_MAX_AGE_MS,
    );
    if (stale) {
      return NextResponse.json(stale, {
        headers: { 'Cache-Control': `public, max-age=${stale.ttlSeconds ?? TTL_3H}` },
      });
    }
    return NextResponse.json({ error: detail }, { status: 502 });
  };

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return serveStaleOr502('API_FOOTBALL_KEY not set');

  const res = await fetch(`${BASE_URL}/standings?league=${leagueId}&season=${season}`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  });

  if (!res.ok) {
    return serveStaleOr502(`API HTTP ${res.status}`);
  }

  const apiData = await res.json();

  // API-Football reports quota/plan/key/rate-limit failures in an `errors`
  // body of an otherwise-200 response — treat that as a failure, not "no data".
  const apiHasErrors = hasApiFootballErrors(apiData?.errors);

  // API-Football returns standings as an array of groups.
  // Série A: [[team1..team20]]  (one group)
  // Libertadores: [[groupA...], [groupB...], ...]  (multiple groups)
  // Copa do Brasil (knockout): [] or no standings data
  const rawGroups: RawStandingEntry[][] = apiData?.response?.[0]?.league?.standings ?? [];
  const groups: StandingEntry[][] = rawGroups.map((group) => group.map(mapEntry));

  if (!shouldCacheStandings(groups.length, format, apiHasErrors)) {
    // Empty/errored result for a format that should have a table — don't cache
    // it (that froze the table as blank for hours); serve last-good if we have it.
    return serveStaleOr502(
      apiHasErrors ? `API-Football error: ${JSON.stringify(apiData.errors)}` : 'Empty standings',
    );
  }

  // For Série A, enrich standings with accumulated yellow/red cards from CBF.
  // This runs concurrently with the api-football fetch but we await before building the payload.
  // Non-critical: if CBF is unavailable, card fields are simply undefined.
  if (leagueId === 71) {
    const cardMap = await getCbfSerieACards(competition.season);
    if (cardMap.size > 0) {
      for (const group of groups) {
        for (const entry of group) {
          const cards = cardMap.get(entry.team.id);
          if (cards) {
            entry.yellowCards = cards.yellowCards;
            entry.redCards = cards.redCards;
          }
        }
      }
    }
  }

  const payload: StandingsPayload = {
    groups,
    format,
    updatedAt: new Date().toISOString(),
    ttlSeconds: ttl,
  };

  await setCache(cacheKey, payload, ttl);
  // Long-lived backup for stale-while-error on a future fetch failure.
  const backup: StaleEntry<StandingsPayload> = {
    fetchedAt: payload.updatedAt,
    data: payload,
  };
  await setCache(staleKey, backup, TTL_24H * 30);

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': `public, max-age=${ttl}` },
  });
}
