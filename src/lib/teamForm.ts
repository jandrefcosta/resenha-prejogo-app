import { getCache, setCache, TTL_6H } from '@/lib/redisCache';

const BASE_URL = 'https://v3.football.api-sports.io';

function apiHeaders(): HeadersInit {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY not set');
  return { 'x-apisports-key': key };
}

async function fetchForm(teamId: number, season: number, leagueId: number): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/teams/statistics?league=${leagueId}&season=${season}&team=${teamId}`,
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

/**
 * Returns the raw form string for a team in a given league, reading from Redis cache first.
 * Defaults to leagueId 71 (Série A) for backward compatibility.
 */
export async function getTeamForm(
  teamId: number,
  season: number,
  leagueId: number = 71,
): Promise<string> {
  const key = `form:${teamId}:${leagueId}:${season}`;
  const cached = await getCache<string>(key);
  if (cached !== null) return cached;

  const raw = await fetchForm(teamId, season, leagueId).catch(() => '');
  await setCache(key, raw, TTL_6H);
  return raw;
}
