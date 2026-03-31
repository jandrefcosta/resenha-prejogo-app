import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCache, setCache, TTL_6H } from '@/lib/redisCache';
import { getTeamForm, parseForm } from '@/lib/teamForm';
import type { H2HData, H2HMatch, H2HStats, InjuredPlayer } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const TTL_INJURIES = 60 * 60 * 3; // 3 h — injuries change closer to match

function apiHeaders(): HeadersInit {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY not set');
  return { 'x-apisports-key': key };
}

// ─── Raw API types ────────────────────────────────────────────────────────────

interface RawH2HFixture {
  fixture: { id: number; date: string };
  league: { name: string; season: number };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
}

interface RawInjury {
  player: { id: number; name: string; type: string; reason: string };
  team: { id: number; name: string };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchH2H(homeId: number, awayId: number): Promise<RawH2HFixture[]> {
  const res = await fetch(
    `${BASE_URL}/fixtures/headtohead?h2h=${homeId}-${awayId}&last=10`,
    { headers: apiHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  const data = await res.json();
  return (data.response ?? []) as RawH2HFixture[];
}

async function fetchInjuries(fixtureId: number): Promise<RawInjury[]> {
  const res = await fetch(
    `${BASE_URL}/injuries?fixture=${fixtureId}`,
    { headers: apiHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  const data = await res.json();
  return (data.response ?? []) as RawInjury[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStats(raw: RawH2HFixture[], homeId: number, awayId: number): H2HStats {
  let homeTeamWins = 0;
  let awayTeamWins = 0;
  let draws = 0;
  const played = raw.filter((f) => f.goals.home !== null);

  for (const f of played) {
    const { home, away } = f.teams;
    if (home.winner === null) {
      draws++;
    } else if (home.winner === true) {
      if (home.id === homeId) homeTeamWins++;
      else if (home.id === awayId) awayTeamWins++;
    } else {
      if (away.id === homeId) homeTeamWins++;
      else if (away.id === awayId) awayTeamWins++;
    }
  }

  return { totalGames: played.length, homeTeamWins, draws, awayTeamWins };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const homeStr = sp.get('home');
  const awayStr = sp.get('away');
  const fixtureStr = sp.get('fixture');

  if (!homeStr || !awayStr) {
    return NextResponse.json({ error: 'Missing home or away params' }, { status: 400 });
  }

  const homeId = Number(homeStr);
  const awayId = Number(awayStr);
  const fixtureId = fixtureStr ? Number(fixtureStr) : null;

  if (!Number.isInteger(homeId) || !Number.isInteger(awayId) || homeId <= 0 || awayId <= 0) {
    return NextResponse.json({ error: 'Invalid team IDs' }, { status: 400 });
  }

  const season = new Date().getFullYear();

  const h2hKey = `h2h:${Math.min(homeId, awayId)}-${Math.max(homeId, awayId)}`;
  const injuriesKey = fixtureId ? `injuries:${fixtureId}` : null;

  const [cachedH2H, cachedInjuries] = await Promise.all([
    getCache<RawH2HFixture[]>(h2hKey),
    injuriesKey ? getCache<RawInjury[]>(injuriesKey) : Promise.resolve(null),
  ]);

  const [rawH2H, homeFormRaw, awayFormRaw, rawInjuries] = await Promise.all([
    cachedH2H !== null
      ? Promise.resolve(cachedH2H)
      : fetchH2H(homeId, awayId).catch(() => [] as RawH2HFixture[]),
    getTeamForm(homeId, season),
    getTeamForm(awayId, season),
    (injuriesKey && cachedInjuries === null && fixtureId)
      ? fetchInjuries(fixtureId).catch(() => [] as RawInjury[])
      : Promise.resolve(cachedInjuries ?? [] as RawInjury[]),
  ]);

  // Fire-and-forget cache writes (form is handled by getTeamForm)
  if (cachedH2H === null) setCache(h2hKey, rawH2H, TTL_6H);
  if (injuriesKey && cachedInjuries === null) setCache(injuriesKey, rawInjuries, TTL_INJURIES);

  const h2hForDisplay: H2HMatch[] = rawH2H.slice(0, 5).map((f: RawH2HFixture) => ({
    id: String(f.fixture.id),
    date: f.fixture.date,
    homeTeam: f.teams.home.name,
    homeScore: f.goals.home,
    awayScore: f.goals.away,
    awayTeam: f.teams.away.name,
    competition: f.league.name,
    season: f.league.season,
  }));

  const injuries: InjuredPlayer[] = rawInjuries.map((i: RawInjury) => ({
    name: i.player.name,
    type: i.player.type,
    reason: i.player.reason,
    teamName: i.team.name,
    teamId: String(i.team.id),
  }));

  const result: H2HData = {
    homeForm: parseForm(homeFormRaw),
    awayForm: parseForm(awayFormRaw),
    h2h: h2hForDisplay,
    stats: computeStats(rawH2H, homeId, awayId),
    injuries,
  };

  return NextResponse.json(result);
}
