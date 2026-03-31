import { getCache, setCache, TTL_6H } from '@/lib/redisCache';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 71;

function apiHeaders(): HeadersInit {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY not set');
  return { 'x-apisports-key': key };
}

async function fetchForm(teamId: number, season: number): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/teams/statistics?league=${LEAGUE_ID}&season=${season}&team=${teamId}`,
    { headers: apiHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.response?.form as string) ?? '';
}

export function parseForm(raw: string): string[] {
  if (!raw) return [];
  return raw.slice(-5).split('').reverse();
}

/** Returns the raw form string for a team, reading from Redis cache first. */
export async function getTeamForm(teamId: number, season: number): Promise<string> {
  const key = `form:${teamId}:${season}`;
  const cached = await getCache<string>(key);
  if (cached !== null) return cached;

  const raw = await fetchForm(teamId, season).catch(() => '');
  setCache(key, raw, TTL_6H);
  return raw;
}
