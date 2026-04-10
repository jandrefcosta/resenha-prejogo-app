import { unstable_cache } from 'next/cache';
import clubsData from '@/data/clubs.json';
import { getCache, setCache, TTL_6H } from '@/lib/redisCache';
import { SERIE_A, getCompetitionByLeagueId, type Competition } from '@/data/competitions';
import type { ClubTheme, Match, MatchTeam } from '@/lib/types';

const clubs = clubsData as ClubTheme[];
const BASE_URL = 'https://v3.football.api-sports.io';
const MATCHES_PER_CLUB = 5;
const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 h

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
  league: { id: number; name: string; round: string; season: number };
  teams: { home: ApiTeam; away: ApiTeam };
  goals?: { home: number | null; away: number | null };
}

interface ApiResponse<T> {
  response: T[];
  errors: Record<string, string> | string[];
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
    logo: `https://media.api-sports.io/football/teams/${t.id}.png`,
  };
}

/**
 * Normalises a raw round string from API-Football.
 * - Série A (71): "Regular Season - 12" → "Rodada 12"
 * - Other competitions: returned as-is; Phase 1 handles display formatting.
 */
function normaliseRound(raw: string, leagueId: number): string {
  if (leagueId === 71) {
    const m = raw.match(/(\d+)$/);
    return m ? `Rodada ${m[1]}` : raw;
  }
  return raw;
}

function mapFixture(f: ApiFixtureItem): Match {
  const homeClub = idToClub.get(f.teams.home.id);
  const stadium = f.fixture.venue.name ?? homeClub?.stadium ?? null;
  const city = f.fixture.venue.city ?? homeClub?.city ?? null;
  const competition = getCompetitionByLeagueId(f.league.id);

  return {
    id: String(f.fixture.id),
    homeTeam: toMatchTeam(f.teams.home),
    awayTeam: toMatchTeam(f.teams.away),
    date: f.fixture.date,
    stadium,
    city,
    competition: f.league.name,
    leagueId: f.league.id,
    competitionName: competition?.shortName ?? f.league.name,
    round: normaliseRound(f.league.round, f.league.id),
    referee: f.fixture.referee ?? undefined,
    status: f.fixture.status.short === 'PST'
      ? 'postponed'
      : ['FT', 'AET', 'PEN'].includes(f.fixture.status.short)
        ? 'finished'
        : 'scheduled',
    score: f.goals ? { home: f.goals.home, away: f.goals.away } : undefined,
  };
}

// ─── Network fetch (wrapped in two cache layers) ──────────────────────────────

/**
 * Layer 1 — unstable_cache (in-memory, 6 h)
 *   Deduplicates concurrent requests within the same server process.
 * Layer 2 — Redis cache (key: fixtures:{competition.id}, 6 h)
 *   Persists across server restarts and cold starts.
 * Layer 3 — API-Football (fallback when both caches are cold/stale)
 */
const fetchLeagueFixturesRaw = unstable_cache(
  async (leagueId: number, competitionId: string, season: number): Promise<ApiFixtureItem[]> => {
    const cacheKey = `fixtures:${competitionId}`;
    const cached = await getCache<ApiFixtureItem[]>(cacheKey);
    if (cached) return cached;

    const key = process.env.API_FOOTBALL_KEY;
    if (!key) throw new Error('API_FOOTBALL_KEY is not set');

    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + 90);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const url = new URL(`${BASE_URL}/fixtures`);
    url.searchParams.set('league', String(leagueId));
    url.searchParams.set('season', String(season));
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

    await setCache(cacheKey, fixtures, TTL_6H);
    return fixtures;
  },
  ['league-upcoming-fixtures'],
  { revalidate: CACHE_TTL_SECONDS },
);

async function fetchLeagueFixtures(competition: Competition): Promise<ApiFixtureItem[]> {
  return fetchLeagueFixturesRaw(
    competition.apiFootballLeagueId,
    competition.id,
    competition.season,
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns upcoming fixtures grouped by club slug.
 * Defaults to Série A — pass a different Competition for other leagues.
 * Retrocompatível: existing callers without arguments continue to work.
 */
export async function getFixturesByClub(
  competition: Competition = SERIE_A,
): Promise<Record<string, Match[]>> {
  const raw = await fetchLeagueFixtures(competition);

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

const FINISHED_PER_COMPETITION = 5;
// Finished scores are immutable after ~2h post-match (stats finalization window).
// 6h TTL avoids redundant API calls for data that never changes after that point.
// The 30-min window of the previous TTL was unnecessarily aggressive.
const TTL_FINISHED = 60 * 60 * 6; // 6h

/**
 * Returns the last N finished fixtures for a specific team in a competition.
 * Uses `?last=N` API param to avoid a date-range scan of the full season.
 * Cached per competition+team pair.
 */
export async function getFinishedFixturesByClub(
  competition: Competition,
  teamApiId: number,
): Promise<Match[]> {
  const cacheKey = `finished:${competition.id}:${teamApiId}`;
  const cached = await getCache<ApiFixtureItem[]>(cacheKey);

  let raw: ApiFixtureItem[];

  if (cached) {
    raw = cached;
  } else {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) throw new Error('API_FOOTBALL_KEY is not set');

    const url = new URL(`${BASE_URL}/fixtures`);
    url.searchParams.set('league', String(competition.apiFootballLeagueId));
    url.searchParams.set('season', String(competition.season));
    url.searchParams.set('team', String(teamApiId));
    url.searchParams.set('last', String(FINISHED_PER_COMPETITION));

    const res = await fetch(url.toString(), {
      headers: { 'x-apisports-key': key },
    });
    if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);

    const data: ApiResponse<ApiFixtureItem> = await res.json();

    const hasErrors = Array.isArray(data.errors)
      ? data.errors.length > 0
      : Object.keys(data.errors).length > 0;
    if (hasErrors) throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);

    // Filter to genuinely finished statuses only
    raw = data.response.filter((f) =>
      ['FT', 'AET', 'PEN'].includes(f.fixture.status.short),
    );

    await setCache(cacheKey, raw, TTL_FINISHED);
  }

  return raw
    .map(mapFixture)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // newest first
}
