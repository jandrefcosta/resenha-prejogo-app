import { NextRequest, NextResponse } from 'next/server';
import { getFixturesByClub } from '@/lib/apiFootball';
import { getTeamForm, parseForm } from '@/lib/teamForm';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';
import { COMPETITIONS } from '@/data/competitions';
import type { Match, MatchPreview } from '@/lib/types';

const DAYS_AHEAD_FOR_BROADCAST_SEARCH = 14;
const CLUB_COMPETITIONS = COMPETITIONS.filter((c) => c.scope === 'club');

/**
 * Simple semaphore to cap concurrent Gemini calls.
 * Without this, 20 fixtures → 20 simultaneous Gemini requests → 429 throttling.
 * Cached fixtures hit Redis and return immediately, so the semaphore only
 * matters on cold-cache bursts.
 */
function makeSemaphore(concurrency: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            if (queue.length > 0) queue.shift()!();
          });
      };
      if (running < concurrency) run();
      else queue.push(run);
    });
  };
}

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  }

  // 20 = up to 5 matches × 4 competitions per club
  const requestedIds = new Set(idsParam.split(',').filter(Boolean).slice(0, 20));
  if (requestedIds.size === 0) {
    return NextResponse.json({});
  }

  // Build flat fixture map from all club competitions — individual calls hit the
  // in-memory unstable_cache (6 h) so this is cheap after the first warm-up.
  const results = await Promise.allSettled(
    CLUB_COMPETITIONS.map((c) => getFixturesByClub(c)),
  );
  const fixtureMap = new Map<string, Match>();
  for (const result of results) {
    if (result.status === 'rejected') continue;
    for (const matches of Object.values(result.value)) {
      for (const m of matches) {
        if (requestedIds.has(m.id) && !fixtureMap.has(m.id)) {
          fixtureMap.set(m.id, m);
        }
      }
    }
  }

  const season = new Date().getFullYear();
  const now = Date.now();

  // Max 3 concurrent Gemini calls — avoids 429 on cold-cache bursts.
  const withSemaphore = makeSemaphore(3);

  // All Redis reads run in parallel across every fixture; Gemini calls are throttled.
  const entries = await Promise.all(
    Array.from(fixtureMap.values()).map(async (m) => {
      const homeId = Number(m.homeTeam.id);
      const awayId = Number(m.awayTeam.id);
      const daysUntil = (new Date(m.date).getTime() - now) / 86_400_000;
      const searchBroadcasters = daysUntil >= -0.08 && daysUntil <= DAYS_AHEAD_FOR_BROADCAST_SEARCH;

      // Form is a visual trend indicator — always fetch from Série A (71) to
      // avoid 4× calls per team when a club plays multiple competitions.
      const [homeFormRaw, awayFormRaw, broadcasters] = await Promise.all([
        getTeamForm(homeId, season, 71),
        getTeamForm(awayId, season, 71),
        searchBroadcasters
          ? withSemaphore(() =>
              getBroadcastersForFixture(m.id, m.homeTeam.name, m.awayTeam.name, m.round, m.date, m.competitionName)
                .catch(() => [] as string[]),
            )
          : Promise.resolve([] as string[]),
      ]);

      const preview: MatchPreview = {
        homeForm: parseForm(homeFormRaw),
        awayForm: parseForm(awayFormRaw),
        broadcasters,
      };

      return [m.id, preview] as const;
    }),
  );

  // Preview data is public and fixture-specific — safe to cache at CDN level.
  // TTL 1h: broadcasters can be updated during the day; form changes rarely.
  return NextResponse.json(Object.fromEntries(entries), {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' },
  });
}
