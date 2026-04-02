import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache, TTL_30MIN, TTL_3H } from '@/lib/redisCache';
import type { StandingEntry } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 71;
const CACHE_KEY = `standings:${LEAGUE_ID}:v2`;

export const dynamic = 'force-dynamic';

interface StandingsPayload {
  data: StandingEntry[];
  updatedAt: string;
}

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

/**
 * Returns a shorter TTL during Brasileirão match windows.
 * Brasileirão rounds are typically played Wed–Thu evenings and Fri–Sun.
 * Brasília = UTC-3.
 */
function getSmartTTL(): number {
  const now = new Date();
  // Shift to Brasília time (UTC-3)
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const day  = brt.getUTCDay();  // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const hour = brt.getUTCHours();

  // Weekend window: Fri 16h → Mon 02h
  const isWeekendWindow =
    (day === 5 && hour >= 16) ||
    day === 6 ||
    day === 0 ||
    (day === 1 && hour < 2);

  // Mid-week window: Wed 16h → Thu 02h
  const isMidWeekWindow =
    (day === 3 && hour >= 16) ||
    (day === 4 && hour < 2);

  return isWeekendWindow || isMidWeekWindow ? TTL_30MIN : TTL_3H;
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';

  if (!force) {
    const cached = await getCache<StandingsPayload>(CACHE_KEY);
    if (cached) {
      const ttl = getSmartTTL();
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': `public, max-age=${ttl}` },
      });
    }
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 });

  const season = new Date().getFullYear();
  const res = await fetch(`${BASE_URL}/standings?league=${LEAGUE_ID}&season=${season}`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: `API HTTP ${res.status}` }, { status: 502 });
  }

  const apiData = await res.json();
  const raw: RawStandingEntry[] = apiData?.response?.[0]?.league?.standings?.[0] ?? [];

  const standings: StandingEntry[] = raw.map((e) => ({
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
  }));

  const ttl = getSmartTTL();
  const payload: StandingsPayload = { data: standings, updatedAt: new Date().toISOString() };
  await setCache(CACHE_KEY, payload, ttl);

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': `public, max-age=${ttl}` },
  });
}
