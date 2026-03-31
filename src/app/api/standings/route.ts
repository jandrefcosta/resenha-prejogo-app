import { NextResponse } from 'next/server';
import { getCache, setCache, TTL_6H } from '@/lib/redisCache';
import type { StandingEntry } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 71;
const CACHE_KEY = `standings:${LEAGUE_ID}`;

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

export const revalidate = 21600; // 6h CDN cache

export async function GET() {
  const cached = await getCache<StandingEntry[]>(CACHE_KEY);
  if (cached) return NextResponse.json(cached);

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

  const data = await res.json();

  // standings is nested: response[0].league.standings[0][...entries]
  const raw: RawStandingEntry[] =
    data?.response?.[0]?.league?.standings?.[0] ?? [];

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

  await setCache(CACHE_KEY, standings, TTL_6H);

  return NextResponse.json(standings);
}
