import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache, TTL_24H } from '@/lib/redisCache';
import type { PlayerStat, TeamPlayersData } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 71;
const TOP_N = 6;

function apiHeaders(): HeadersInit {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY not set');
  return { 'x-apisports-key': key };
}

interface RawPlayerEntry {
  player: { id: number; name: string };
  statistics: Array<{
    league: { id: number };
    games: { appearances: number; minutes: number | null };
    goals: { total: number | null; assists: number | null };
  }>;
}

async function fetchTeamPlayers(teamId: number, season: number): Promise<PlayerStat[]> {
  const res = await fetch(
    `${BASE_URL}/players?team=${teamId}&season=${season}&league=${LEAGUE_ID}&page=1`,
    { headers: apiHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const entries = (data.response ?? []) as RawPlayerEntry[];

  // Deduplicate by player ID — the API can return the same player across
  // multiple entries (e.g. different seasons/leagues in the same response).
  const seen = new Set<number>();
  const unique = entries.filter((e) => {
    if (seen.has(e.player.id)) return false;
    seen.add(e.player.id);
    return true;
  });

  return unique
    .map((e) => {
      const stats = e.statistics.find((s) => s.league.id === LEAGUE_ID) ?? e.statistics[0];
      if (!stats) return null;
      return {
        name: e.player.name,
        appearances: stats.games.appearances ?? 0,
        goals: stats.goals.total ?? 0,
        assists: stats.goals.assists ?? 0,
        minutes: stats.games.minutes ?? 0,
      } satisfies PlayerStat;
    })
    .filter((p): p is PlayerStat => p !== null)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, TOP_N);
}

export async function GET(req: NextRequest) {
  const homeStr = req.nextUrl.searchParams.get('home');
  const awayStr = req.nextUrl.searchParams.get('away');

  if (!homeStr || !awayStr) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const homeId = Number(homeStr);
  const awayId = Number(awayStr);

  if (!Number.isInteger(homeId) || !Number.isInteger(awayId) || homeId <= 0 || awayId <= 0) {
    return NextResponse.json({ error: 'Invalid team IDs' }, { status: 400 });
  }

  const season = new Date().getFullYear();
  const homeKey = `players:v2:${homeId}:${season}`;
  const awayKey = `players:v2:${awayId}:${season}`;

  const [cachedHome, cachedAway] = await Promise.all([
    getCache<PlayerStat[]>(homeKey),
    getCache<PlayerStat[]>(awayKey),
  ]);

  const [home, away] = await Promise.all([
    cachedHome !== null ? Promise.resolve(cachedHome) : fetchTeamPlayers(homeId, season).catch(() => [] as PlayerStat[]),
    cachedAway !== null ? Promise.resolve(cachedAway) : fetchTeamPlayers(awayId, season).catch(() => [] as PlayerStat[]),
  ]);

  if (cachedHome === null) setCache(homeKey, home, TTL_24H);
  if (cachedAway === null) setCache(awayKey, away, TTL_24H);

  const result: TeamPlayersData = { home, away };
  return NextResponse.json(result);
}
