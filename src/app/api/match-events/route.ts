import { NextRequest, NextResponse } from 'next/server';
import { getCache, setCache, TTL_24H, TTL_3H } from '@/lib/redisCache';
import type { MatchCardEvent, MatchEventsData, MatchGoalEvent } from '@/lib/types';

const BASE_URL = 'https://v3.football.api-sports.io';

function apiHeaders(): HeadersInit {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY not set');
  return { 'x-apisports-key': key };
}

interface RawEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { name: string };
  assist: { name: string | null };
  type: string;
  detail: string;
}

async function fetchEvents(fixtureId: number): Promise<RawEvent[]> {
  const res = await fetch(`${BASE_URL}/fixtures/events?fixture=${fixtureId}`, {
    headers: apiHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
  const data = await res.json();
  return (data.response ?? []) as RawEvent[];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fixtureStr = sp.get('fixture');
  const homeIdStr = sp.get('home');
  const awayIdStr = sp.get('away');
  const finishedStr = sp.get('finished');

  if (!fixtureStr || !homeIdStr || !awayIdStr) {
    return NextResponse.json({ error: 'Missing params: fixture, home, away' }, { status: 400 });
  }

  const fixtureId = Number(fixtureStr);
  const homeId = Number(homeIdStr);
  // awayIdStr validated at call site; goal side is inferred as !home in the mapping below

  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 });
  }

  // Finished matches get 24h TTL; post-match gets 3h to pick up late score publishing
  const isFinished = finishedStr === '1';
  const ttl = isFinished ? TTL_24H : TTL_3H;
  const cacheKey = `events:v2:${fixtureId}`;

  const cached = await getCache<MatchEventsData>(cacheKey);
  if (cached !== null) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': `public, max-age=${ttl}` },
    });
  }

  const rawEvents = await fetchEvents(fixtureId).catch(() => [] as RawEvent[]);

  const goals: MatchGoalEvent[] = rawEvents
    .filter((e) => e.type === 'Goal')
    .map((e) => ({
      playerName: e.player.name,
      assistName: e.assist.name ?? null,
      minute: e.time.elapsed,
      minuteExtra: e.time.extra ?? null,
      side: e.team.id === homeId ? 'home' : 'away',
      type: e.detail, // 'Normal Goal' | 'Own Goal' | 'Penalty'
    }));

  const cards: MatchCardEvent[] = rawEvents
    .filter((e) => e.type === 'Card')
    .map((e) => ({
      playerName: e.player.name,
      minute: e.time.elapsed,
      minuteExtra: e.time.extra ?? null,
      side: e.team.id === homeId ? 'home' : 'away',
      type: e.detail, // 'Yellow Card' | 'Red Card' | 'Yellow Red Card'
    }));

  const result: MatchEventsData = { goals, cards };

  // Only cache when there are events — empty result on a finished match may mean
  // the API hasn't published them yet; retry on next request.
  if (goals.length > 0 || cards.length > 0 || isFinished) {
    void setCache(cacheKey, result, ttl);
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': `public, max-age=${ttl}` },
  });
}
