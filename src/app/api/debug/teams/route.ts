import { NextResponse } from 'next/server';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

const clubs = clubsData as ClubTheme[];

export async function GET() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ error: 'API_FOOTBALL_KEY not set' }, { status: 500 });

  const today = new Date();
  const url = new URL('https://v3.football.api-sports.io/teams');
  url.searchParams.set('league', '71');
  url.searchParams.set('season', String(today.getFullYear()));

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: `API HTTP ${res.status}` }, { status: 502 });
  }

  const data = await res.json();

  const apiTeams: { id: number; name: string }[] = data.response.map(
    (r: { team: { id: number; name: string } }) => r.team,
  );

  // Cross-reference with our clubs.json
  const ourIds = new Set(clubs.map((c) => c.apiFootballId));

  const matched = apiTeams
    .filter((t) => ourIds.has(t.id))
    .map((t) => {
      const club = clubs.find((c) => c.apiFootballId === t.id)!;
      return { apiId: t.id, apiName: t.name, ourId: club.id, ourName: club.name };
    });

  const missing = apiTeams
    .filter((t) => !ourIds.has(t.id))
    .map((t) => ({ apiId: t.id, apiName: t.name, ourId: null }));

  const notInLeague = clubs
    .filter((c) => c.apiFootballId !== null && !apiTeams.find((t) => t.id === c.apiFootballId))
    .map((c) => ({ ourId: c.id, ourName: c.name, apiFootballId: c.apiFootballId }));

  return NextResponse.json({
    season: today.getFullYear(),
    totalInLeague: apiTeams.length,
    matched,
    missingFromOurJson: missing,
    ourClubsNotInLeague: notInLeague,
  });
}
