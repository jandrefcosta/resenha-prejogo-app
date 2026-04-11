import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache, TTL_1H, TTL_6H, TTL_30MIN } from '@/lib/redisCache';
import type { CopaBracketData, CopaBracketFixture, CopaBracketRound } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 73;
const CACHE_KEY = 'copa-bracket:2026:v1';

function apiHeaders(): HeadersInit {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY not set');
  return { 'x-apisports-key': key };
}

// Round name → Portuguese label
const ROUND_LABELS: Record<string, string> = {
  '1/256-finals':  'Fase Preliminar',
  '1/128-finals':  '1ª Fase',
  'Round of 128':  '2ª Fase',
  'Round of 64':   '3ª Fase',
  'Round of 32':   'Oitavas de Final',
  'Round of 16':   'Quartas de Final',
  'Quarter-finals': 'Quartas de Final',
  'Semi-finals':   'Semifinais',
  'Final':         'Final',
};

// Order rounds from earliest to latest
const ROUND_ORDER: Record<string, number> = {
  '1/256-finals':  0,
  '1/128-finals':  1,
  'Round of 128':  2,
  'Round of 64':   3,
  'Round of 32':   4,
  'Round of 16':   5,
  'Quarter-finals': 6,
  'Semi-finals':   7,
  'Final':         8,
};

interface RawFixture {
  fixture: {
    id: number;
    date: string | null;
    status: { short: string };
  };
  league: { round: string };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    penalty: { home: number | null; away: number | null };
  };
}

function mapStatus(short: string): CopaBracketFixture['status'] {
  if (short === 'FT' || short === 'AET' || short === 'PEN') return 'finished';
  if (['1H', '2H', 'ET', 'P', 'HT', 'BT', 'LIVE'].includes(short)) return 'live';
  return 'scheduled';
}

function mapWinner(
  status: CopaBracketFixture['status'],
  raw: RawFixture,
): 'home' | 'away' | null {
  if (status !== 'finished') return null;
  if (raw.teams.home.winner === true) return 'home';
  if (raw.teams.away.winner === true) return 'away';
  return null;
}

async function fetchRound(round: string): Promise<RawFixture[]> {
  const encoded = encodeURIComponent(round);
  const res = await fetch(
    `${BASE_URL}/fixtures?league=${LEAGUE_ID}&season=2026&round=${encoded}`,
    { headers: apiHeaders(), cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  const data = await res.json();
  return (data.response ?? []) as RawFixture[];
}

function computeTtl(rounds: CopaBracketRound[]): number {
  const allFixtures = rounds.flatMap((r) => r.fixtures);
  if (allFixtures.some((f) => f.status === 'live')) return TTL_30MIN;
  // Any fixture finished recently (within last 2h) → shorter TTL
  const anyRecent = allFixtures.some(
    (f) => f.status === 'finished' && f.date &&
      Date.now() - new Date(f.date).getTime() < 2 * 60 * 60 * 1000,
  );
  if (anyRecent) return TTL_1H;
  return TTL_6H;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';

  if (!force) {
    const cached = await getCache<CopaBracketData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': `public, max-age=${cached.ttlSeconds}` },
      });
    }
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 });

  // Fetch all known rounds in parallel
  const roundNames = Object.keys(ROUND_ORDER);
  const results = await Promise.allSettled(roundNames.map(fetchRound));

  const roundMap = new Map<string, CopaBracketFixture[]>();
  for (let i = 0; i < roundNames.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') continue;
    const fixtures = result.value;
    if (fixtures.length === 0) continue;

    const mapped: CopaBracketFixture[] = fixtures.map((raw) => {
      const status = mapStatus(raw.fixture.status.short);
      return {
        fixtureId: raw.fixture.id,
        date: raw.fixture.date,
        home: { id: raw.teams.home.id, name: raw.teams.home.name, logo: raw.teams.home.logo },
        away: { id: raw.teams.away.id, name: raw.teams.away.name, logo: raw.teams.away.logo },
        homeScore: raw.goals.home,
        awayScore: raw.goals.away,
        homePen: raw.score.penalty.home,
        awayPen: raw.score.penalty.away,
        status,
        winner: mapWinner(status, raw),
      };
    });

    // Sort fixtures within round by date
    mapped.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    roundMap.set(roundNames[i], mapped);
  }

  const rounds: CopaBracketRound[] = Array.from(roundMap.entries())
    .sort(([a], [b]) => (ROUND_ORDER[a] ?? 99) - (ROUND_ORDER[b] ?? 99))
    .map(([name, fixtures]) => ({
      name,
      label: ROUND_LABELS[name] ?? name,
      fixtures,
    }));

  const ttl = computeTtl(rounds);
  const payload: CopaBracketData = {
    rounds,
    updatedAt: new Date().toISOString(),
    ttlSeconds: ttl,
  };

  await setCache(CACHE_KEY, payload, ttl);

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': `public, max-age=${ttl}` },
  });
}
