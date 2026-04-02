import { NextResponse } from 'next/server';
import { getFixturesByClub } from '@/lib/apiFootball';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';
import type { Match } from '@/lib/types';

const DAYS_AHEAD_FOR_BROADCAST_SEARCH = 14;

export async function GET() {
  const byClub = await getFixturesByClub();

  // Deduplicate all fixtures across clubs
  const seen = new Set<string>();
  const all: Match[] = [];
  for (const matches of Object.values(byClub)) {
    for (const m of matches) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        all.push(m);
      }
    }
  }

  all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (all.length === 0) {
    return NextResponse.json({ round: null, matches: [] });
  }

  // Current round = the round that has the earliest upcoming match
  const currentRound = all[0].round;
  const roundMatches = all.filter((m) => m.round === currentRound);

  const now = Date.now();

  const matches = await Promise.all(
    roundMatches.map(async (m) => {
      const daysUntil = (new Date(m.date).getTime() - now) / 86_400_000;
      const broadcasters =
        daysUntil >= -0.08 && daysUntil <= DAYS_AHEAD_FOR_BROADCAST_SEARCH
          ? await getBroadcastersForFixture(
              m.id,
              m.homeTeam.name,
              m.awayTeam.name,
              m.round,
              m.date,
            ).catch(() => [] as string[])
          : [];
      return { ...m, broadcasters };
    }),
  );

  return NextResponse.json({ round: currentRound, matches });
}
