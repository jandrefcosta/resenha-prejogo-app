import { unstable_cache } from 'next/cache';
import clubsData from '@/data/clubs.json';
import { getCache, setCache, TTL_6H } from '@/lib/redisCache';
import type { ClubTheme, Match, MatchTeam } from '@/lib/types';

const clubs = clubsData as ClubTheme[];
const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 71; // Brasileirão Série A
const MATCHES_PER_CLUB = 5;
const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 h
const REDIS_CACHE_KEY = 'fixtures:serie-a';

// ─── Lookup maps (built once at module init) ──────────────────────────────────

/** apiFootballId → ClubTheme — used for venue and short-name fallbacks */
const idToClub = new Map<number, ClubTheme>(
  clubs
    .filter((c) => c.apiFootballId !== null)
    .map((c) => [c.apiFootballId as number, c]),
);

// ─── Raw API types ────────────────────────────────────────────────────────────

interface ApiTeam {
  id: number;
  name: string;
}

interface ApiFixtureItem {
  fixture: {
    id: number;
    referee: string | null;
    date: string;
    venue: { name: string | null; city: string | null };
    status: { short: string };
  };
  league: { name: string; round: string };
  teams: { home: ApiTeam; away: ApiTeam };
}

interface ApiResponse<T> {
  response: T[];
  errors: Record<string, string> | string[];
}

// ─── Broadcaster inference ────────────────────────────────────────────────────
/**
 * Infers likely broadcasters from kick-off time (BRT).
 * Based on Brasileirão 2025/2026 TV rights:
 *   - Premiere (PPV): all matches
 *   - Globo (open TV) + SporTV: Sunday prime-time slots (16h / 18h30 BRT)
 *   - SporTV: Saturday matches
 */
function inferBroadcasters(dateISO: string): string[] {
  const brt = new Date(
    new Date(dateISO).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
  );
  const day = brt.getDay();   // 0 = Sunday … 6 = Saturday
  const hour = brt.getHours();

  if (day === 0 && (hour === 16 || hour === 18)) {
    return ['Globo', 'SporTV', 'Premiere'];
  }
  if (day === 6) {
    return ['SporTV', 'Premiere'];
  }
  return ['Premiere'];
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function toMatchTeam(t: ApiTeam): MatchTeam {
  const known = idToClub.get(t.id);
  return {
    id: String(t.id),
    name: known?.name ?? t.name,
    shortName:
      known?.shortName ??
      t.name
        .replace(/^(Clube |Esporte Clube |Sport Club |Sociedade Esportiva )/i, '')
        .substring(0, 3)
        .toUpperCase(),
  };
}

function normaliseRound(raw: string): string {
  const m = raw.match(/(\d+)$/);
  return m ? `Rodada ${m[1]}` : raw;
}

function mapFixture(f: ApiFixtureItem): Match {
  // Venue: prefer API data; fall back to home club's known stadium/city
  const homeClub = idToClub.get(f.teams.home.id);
  const stadium = f.fixture.venue.name ?? homeClub?.stadium ?? null;
  const city = f.fixture.venue.city ?? homeClub?.city ?? null;

  return {
    id: String(f.fixture.id),
    homeTeam: toMatchTeam(f.teams.home),
    awayTeam: toMatchTeam(f.teams.away),
    date: f.fixture.date,
    stadium,
    city,
    competition: f.league.name,
    round: normaliseRound(f.league.round),
    broadcasters: inferBroadcasters(f.fixture.date),
    // Referee is assigned by CBF ~48h before kick-off; null until then
    referee: f.fixture.referee ?? undefined,
    status: f.fixture.status.short === 'PST' ? 'postponed' : 'scheduled',
  };
}

// ─── Network fetch (wrapped in two cache layers) ──────────────────────────────

/**
 * Layer 1 — unstable_cache (in-memory, 6 h)
 *   Deduplicates concurrent requests within the same server process.
 * Layer 2 — file cache (.cache/serie-a-fixtures.json, 6 h)
 *   Persists across server restarts and cold starts.
 * Layer 3 — API-Football (fallback when both caches are cold/stale)
 */
const fetchLeagueFixtures = unstable_cache(
  async (): Promise<ApiFixtureItem[]> => {
    // Check Redis cache first
    const cached = await getCache<ApiFixtureItem[]>(REDIS_CACHE_KEY);
    if (cached) return cached;

    // Cold fetch from API-Football
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) throw new Error('API_FOOTBALL_KEY is not set');

    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + 90);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const url = new URL(`${BASE_URL}/fixtures`);
    url.searchParams.set('league', String(LEAGUE_ID));
    url.searchParams.set('season', String(today.getFullYear()));
    url.searchParams.set('from', fmt(today));
    url.searchParams.set('to', fmt(to));

    const res = await fetch(url.toString(), {
      headers: { 'x-apisports-key': key },
    });
    if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);

    const data: ApiResponse<ApiFixtureItem> = await res.json();

    const hasErrors = Array.isArray(data.errors)
      ? data.errors.length > 0
      : Object.keys(data.errors).length > 0;
    if (hasErrors) throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);

    const fixtures = data.response.filter(
      (f) => f.fixture.status.short === 'NS' || f.fixture.status.short === 'PST',
    );

    // Persist to Redis for cross-restart durability
    await setCache(REDIS_CACHE_KEY, fixtures, TTL_6H);

    return fixtures;
  },
  ['serie-a-upcoming-fixtures'],
  { revalidate: CACHE_TTL_SECONDS },
);

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getFixturesByClub(): Promise<Record<string, Match[]>> {
  const raw = await fetchLeagueFixtures();

  const idToSlug = new Map<number, string>(
    clubs
      .filter((c) => c.apiFootballId !== null)
      .map((c) => [c.apiFootballId as number, c.id]),
  );

  const grouped: Record<string, Match[]> = {};

  for (const f of raw) {
    const match = mapFixture(f);
    const homeSlug = idToSlug.get(f.teams.home.id);
    const awaySlug = idToSlug.get(f.teams.away.id);
    if (homeSlug) (grouped[homeSlug] ??= []).push(match);
    if (awaySlug) (grouped[awaySlug] ??= []).push(match);
  }

  for (const slug in grouped) {
    grouped[slug] = grouped[slug]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, MATCHES_PER_CLUB);
  }

  return grouped;
}
