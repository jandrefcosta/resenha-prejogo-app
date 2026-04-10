import { NextRequest, NextResponse } from 'next/server';
import { getFinishedFixturesByClub } from '@/lib/apiFootball';
import { COMPETITIONS } from '@/data/competitions';
import clubsData from '@/data/clubs.json';
import type { ClubTheme, Match } from '@/lib/types';

export const dynamic = 'force-dynamic';

const clubs = clubsData as ClubTheme[];

// All club competitions that use API-Football as the results source (non-CBF)
const RESULTS_COMPETITIONS = COMPETITIONS.filter(
  (c) => c.scope === 'club' && !c.hasCbfData,
);

export async function GET(req: NextRequest) {
  const clubSlug = req.nextUrl.searchParams.get('club');
  if (!clubSlug) {
    return NextResponse.json({ error: 'Missing "club" param' }, { status: 400 });
  }

  const club = clubs.find((c) => c.id === clubSlug);
  if (!club?.apiFootballId) {
    return NextResponse.json({ error: 'Club not found or missing apiFootballId' }, { status: 422 });
  }

  const teamApiId = club.apiFootballId;

  // Fetch finished fixtures for each competition in parallel; tolerate individual failures
  const results = await Promise.allSettled(
    RESULTS_COMPETITIONS.map((comp) => getFinishedFixturesByClub(comp, teamApiId)),
  );

  const matches: Match[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      matches.push(...result.value);
    }
  }

  // Sort all matches newest first
  matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Past results are public — cache at CDN for 30min (matches Redis TTL).
  return NextResponse.json(matches, {
    headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=120' },
  });
}
