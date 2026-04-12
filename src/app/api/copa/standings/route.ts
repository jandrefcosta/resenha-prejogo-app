import { NextResponse } from 'next/server';
import { getCache, setCache, TTL_30MIN, TTL_1H } from '@/lib/redisCache';
import type { StandingEntry } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 1;
const SEASON = 2026;
const CACHE_KEY = 'copa-standings:2026';

/** Group name returned by the API for the virtual third-place ranking */
const THIRD_PLACE_GROUP = 'Ranking of third-placed teams';

// ─── Raw API types ────────────────────────────────────────────────────────────

interface RawEntry {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  form: string | null;
  status: string | null;
  description: string | null;
  group: string;
  all: {
    played: number; win: number; draw: number; lose: number;
    goals: { for: number; against: number };
  };
  home: {
    played: number; win: number; draw: number; lose: number;
    goals: { for: number; against: number };
  };
  away: {
    played: number; win: number; draw: number; lose: number;
    goals: { for: number; against: number };
  };
}

// ─── Payload type (exported for components) ───────────────────────────────────

export interface CopaStandingsPayload {
  /**
   * 12 groups keyed by letter: { "A": [...4 teams], ..., "L": [...4 teams] }
   * Only contains the 12 real competition groups (A–L).
   */
  groups: Record<string, StandingEntry[]>;
  /**
   * Separate ranking of third-placed teams.
   * In Copa 2026, top 8 of 12 third-placed teams advance.
   */
  thirdPlaceRanking: StandingEntry[];
  updatedAt: string;
  ttlSeconds: number;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function mapEntry(e: RawEntry): StandingEntry {
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

// ─── TTL ──────────────────────────────────────────────────────────────────────

function getCopaTTL(): number {
  const hour = new Date().getUTCHours();
  return hour >= 12 && hour <= 23 ? TTL_30MIN : TTL_1H;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export async function GET() {
  const cached = await getCache<CopaStandingsPayload>(CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': `public, s-maxage=${cached.ttlSeconds}, stale-while-revalidate=120` },
    });
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 });
  }

  const res = await fetch(
    `${BASE_URL}/standings?league=${LEAGUE_ID}&season=${SEASON}`,
    { headers: { 'x-apisports-key': key }, cache: 'no-store' },
  );

  if (!res.ok) {
    return NextResponse.json({ error: `API-Football HTTP ${res.status}` }, { status: 502 });
  }

  const apiData = await res.json();

  // API returns an array of arrays — each inner array is one group's teams.
  // Copa 2026: 12 real groups (A–L) + 1 virtual group (Ranking of third-placed teams)
  const rawGroups: RawEntry[][] = apiData?.response?.[0]?.league?.standings ?? [];

  const groups: Record<string, StandingEntry[]> = {};
  let thirdPlaceRanking: StandingEntry[] = [];

  for (const group of rawGroups) {
    if (!group.length) continue;
    const groupName = group[0].group;

    if (groupName === THIRD_PLACE_GROUP) {
      thirdPlaceRanking = group.map(mapEntry);
    } else {
      // "Group A" → "A"
      const letter = groupName.replace('Group ', '').trim();
      groups[letter] = group.map(mapEntry);
    }
  }

  const ttl = getCopaTTL();
  const payload: CopaStandingsPayload = {
    groups,
    thirdPlaceRanking,
    updatedAt: new Date().toISOString(),
    ttlSeconds: ttl,
  };

  await setCache(CACHE_KEY, payload, ttl);

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': `public, s-maxage=${ttl}, stale-while-revalidate=120` },
  });
}
