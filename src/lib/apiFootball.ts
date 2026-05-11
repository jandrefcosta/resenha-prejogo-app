import { unstable_cache } from 'next/cache';
import clubsData from '@/data/clubs.json';
import { getCache, setCache, TTL_6H, TTL_15S, TTL_24H } from '@/lib/redisCache';
import { SERIE_A, getCompetitionByLeagueId, type Competition } from '@/data/competitions';
import type { ClubTheme, Match, MatchTeam, LineupData, LiveFixtureData, LiveEvent, LiveStats } from '@/lib/types';

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
    const cacheKey = `fixtures:${competitionId}:${season}`;
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
const TTL_FINISHED_RECENT = 60 * 10;   // 10 min — match just ended, scores may still be updating
const TTL_FINISHED_STABLE = 60 * 30;   // 30 min — stable, but short enough to catch newly-finished matches


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

    const nowMs = Date.now();
    const mostRecentKickoff = raw.length
      ? Math.max(...raw.map((f) => new Date(f.fixture.date).getTime()))
      : 0;
    // Short TTL when: (a) a match just finished (<2h ago), or (b) we have fewer
    // than the expected count, meaning another match might transition to FT soon.
    const likelyMoreSoon = raw.length < FINISHED_PER_COMPETITION;
    const ttl = likelyMoreSoon || nowMs - mostRecentKickoff < 2 * 60 * 60 * 1000
      ? TTL_FINISHED_RECENT
      : TTL_FINISHED_STABLE;

    await setCache(cacheKey, raw, ttl);
  }

  return raw
    .map(mapFixture)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // newest first
}

// ─── Lineups (/fixtures/lineups) ─────────────────────────────────────────────

interface ApiLineupPlayer {
  player: { id: number | null; name: string; number: number; pos: string; grid: string | null };
}

interface ApiLineupTeam {
  formation: string;
  startXI: ApiLineupPlayer[];
  substitutes: ApiLineupPlayer[];
  coach: { name: string | null };
}

interface ApiLineupResponse {
  team: { id: number; name: string };
  formation: string;
  startXI: ApiLineupPlayer[];
  substitutes: ApiLineupPlayer[];
  coach: { name: string | null };
}

function mapLineupTeam(raw: ApiLineupResponse): ApiLineupTeam {
  return {
    formation: raw.formation ?? '',
    startXI: raw.startXI ?? [],
    substitutes: raw.substitutes ?? [],
    coach: raw.coach ?? { name: null },
  };
}

/**
 * Fetches lineups for a fixture from API-Football.
 * Returns null when the fixture has no lineups published yet.
 * TTL strategy:
 *   - No data yet (< 1h before kickoff): 10 min
 *   - Data available: 24h (immutable once published)
 */
export async function fetchLineups(fixtureId: number): Promise<LineupData | null> {
  const cacheKey = `lineups:${fixtureId}`;
  const cached = await getCache<LineupData>(cacheKey);
  if (cached) return cached;

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not set');

  const url = new URL(`${BASE_URL}/fixtures/lineups`);
  url.searchParams.set('fixture', String(fixtureId));

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': key },
  });
  if (!res.ok) throw new Error(`API-Football lineups HTTP ${res.status}`);

  const data: ApiResponse<ApiLineupResponse> = await res.json();

  const hasErrors = Array.isArray(data.errors)
    ? data.errors.length > 0
    : Object.keys(data.errors).length > 0;
  if (hasErrors) throw new Error(`API-Football lineups error: ${JSON.stringify(data.errors)}`);

  if (data.response.length < 2) {
    // Lineups not yet published — cache briefly and return null
    await setCache(cacheKey, null, 60 * 10); // 10 min
    return null;
  }

  const [homeRaw, awayRaw] = data.response;
  const mapTeam = (raw: ApiLineupResponse) => ({
    formation: mapLineupTeam(raw).formation,
    startXI: raw.startXI.map((p) => ({
      id: p.player.id,
      name: p.player.name,
      number: p.player.number,
      pos: p.player.pos,
      grid: p.player.grid,
    })),
    substitutes: raw.substitutes.map((p) => ({
      id: p.player.id,
      name: p.player.name,
      number: p.player.number,
      pos: p.player.pos,
      grid: p.player.grid,
    })),
    coach: raw.coach?.name ?? null,
  });

  const result: LineupData = {
    home: mapTeam(homeRaw),
    away: mapTeam(awayRaw),
    fetchedAt: new Date().toISOString(),
  };

  await setCache(cacheKey, result, TTL_24H);
  return result;
}

// ─── Live fixture (/fixtures?id + /fixtures/events + /fixtures/statistics) ────

interface ApiLiveFixture {
  fixture: { id: number; status: { short: string; elapsed: number | null } };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
}

interface ApiLiveEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { name: string };
  assist: { name: string | null };
  type: string;
  detail: string;
}

interface ApiStatEntry {
  type: string;
  value: string | number | null;
}

interface ApiTeamStats {
  team: { id: number };
  statistics: ApiStatEntry[];
}

function findStat(stats: ApiStatEntry[], type: string): number | null {
  const entry = stats.find((s) => s.type === type);
  if (entry === undefined || entry.value === null) return null;
  const v = String(entry.value).replace('%', '');
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function mapLiveEvent(e: ApiLiveEvent, homeId: number): LiveEvent {
  const side = e.team.id === homeId ? 'home' : 'away';
  let type: LiveEvent['type'] = 'Goal';
  if (e.type === 'Card') type = 'Card';
  else if (e.type === 'subst') type = 'subst';
  return {
    minute: e.time.elapsed,
    minuteExtra: e.time.extra ?? null,
    team: side,
    playerName: e.player.name,
    assistName: e.assist?.name ?? null,
    type,
    detail: e.detail,
  };
}

/**
 * Fetches live fixture data: score, status, events, and stats from API-Football.
 * Cached in Redis for 15 seconds to deduplicate concurrent client polls.
 * Called exclusively by /api/live/[fixtureId].
 */
export async function getLiveFixtureData(fixtureId: number): Promise<LiveFixtureData> {
  const cacheKey = `live:${fixtureId}`;
  const cached = await getCache<LiveFixtureData>(cacheKey);
  if (cached) return cached;

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not set');

  const headers = { 'x-apisports-key': key };

  const [fixtureRes, eventsRes, statsRes] = await Promise.all([
    fetch(`${BASE_URL}/fixtures?id=${fixtureId}`, { headers }),
    fetch(`${BASE_URL}/fixtures/events?fixture=${fixtureId}`, { headers }),
    fetch(`${BASE_URL}/fixtures/statistics?fixture=${fixtureId}`, { headers }),
  ]);

  if (!fixtureRes.ok) throw new Error(`API-Football fixture HTTP ${fixtureRes.status}`);

  const fixtureJson: ApiResponse<ApiLiveFixture> = await fixtureRes.json();
  const raw = fixtureJson.response[0];
  if (!raw) throw new Error(`API-Football: fixture ${fixtureId} not found`);

  const homeId = raw.teams.home.id;
  const awayId = raw.teams.away.id;

  const eventsJson: ApiResponse<ApiLiveEvent> = eventsRes.ok ? await eventsRes.json() : { response: [], errors: {} };
  const statsJson: ApiResponse<ApiTeamStats> = statsRes.ok ? await statsRes.json() : { response: [], errors: {} };

  const events: LiveEvent[] = (eventsJson.response ?? []).map((e) => mapLiveEvent(e, homeId));

  let stats: LiveStats | null = null;
  if (statsJson.response && statsJson.response.length >= 2) {
    const homeStats = statsJson.response.find((s) => s.team.id === homeId)?.statistics ?? [];
    const awayStats = statsJson.response.find((s) => s.team.id === awayId)?.statistics ?? [];
    stats = {
      possession: { home: findStat(homeStats, 'Ball Possession'), away: findStat(awayStats, 'Ball Possession') },
      shotsOnTarget: { home: findStat(homeStats, 'Shots on Goal'), away: findStat(awayStats, 'Shots on Goal') },
      shots: { home: findStat(homeStats, 'Total Shots'), away: findStat(awayStats, 'Total Shots') },
      corners: { home: findStat(homeStats, 'Corner Kicks'), away: findStat(awayStats, 'Corner Kicks') },
      fouls: { home: findStat(homeStats, 'Fouls'), away: findStat(awayStats, 'Fouls') },
    };
  }

  const result: LiveFixtureData = {
    fixtureId,
    status: raw.fixture.status.short,
    elapsed: raw.fixture.status.elapsed,
    homeScore: raw.goals.home ?? 0,
    awayScore: raw.goals.away ?? 0,
    homeTeamId: homeId,
    awayTeamId: awayId,
    events,
    stats,
    fetchedAt: new Date().toISOString(),
  };

  await setCache(cacheKey, result, TTL_15S);
  return result;
}
