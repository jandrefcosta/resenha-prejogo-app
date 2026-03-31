import { NextRequest, NextResponse } from 'next/server';
import { getFixturesByClub } from '@/lib/apiFootball';
import { getTeamForm, parseForm } from '@/lib/teamForm';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';
import type { Match, MatchPreview } from '@/lib/types';

const DAYS_AHEAD_FOR_BROADCAST_SEARCH = 14;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 });
  }

  const requestedIds = new Set(idsParam.split(',').filter(Boolean));
  if (requestedIds.size === 0) {
    return NextResponse.json({});
  }

  // Build flat fixture map from the in-memory unstable_cache — no network call
  const byClub = await getFixturesByClub();
  const fixtureMap = new Map<string, Match>();
  for (const matches of Object.values(byClub)) {
    for (const m of matches) {
      if (requestedIds.has(m.id) && !fixtureMap.has(m.id)) {
        fixtureMap.set(m.id, m);
      }
    }
  }

  const season = new Date().getFullYear();
  const now = Date.now();

  // All Redis reads run in parallel across every fixture
  const entries = await Promise.all(
    Array.from(fixtureMap.values()).map(async (m) => {
      const homeId = Number(m.homeTeam.id);
      const awayId = Number(m.awayTeam.id);
      const daysUntil = (new Date(m.date).getTime() - now) / 86_400_000;
      const searchBroadcasters = daysUntil >= 0 && daysUntil <= DAYS_AHEAD_FOR_BROADCAST_SEARCH;

      const [homeFormRaw, awayFormRaw, broadcasters] = await Promise.all([
        getTeamForm(homeId, season),
        getTeamForm(awayId, season),
        searchBroadcasters
          ? getBroadcastersForFixture(m.id, m.homeTeam.name, m.awayTeam.name, m.round, m.date)
              .catch(() => [] as string[])
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

  return NextResponse.json(Object.fromEntries(entries));
}
