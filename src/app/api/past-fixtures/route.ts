import { NextRequest, NextResponse } from 'next/server';
import { getCbfRound } from '@/lib/cbfApi';
import clubsData from '@/data/clubs.json';
import type { ClubTheme, CbfMatchDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

const clubs = clubsData as ClubTheme[];

export interface PastFixtureEntry {
  round: number;
  match: CbfMatchDetail;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const clubSlug = searchParams.get('club');
  const beforeRound = Number(searchParams.get('beforeRound'));
  const limit = Math.min(Number(searchParams.get('limit') ?? '3'), 10);

  if (!clubSlug || !beforeRound || beforeRound < 1) {
    return NextResponse.json(
      { error: 'Params "club" (slug) and "beforeRound" (≥1) are required.' },
      { status: 400 },
    );
  }

  const club = clubs.find((c) => c.id === clubSlug);
  if (!club?.cbfId) {
    return NextResponse.json(
      { error: 'Club not found or missing CBF ID.' },
      { status: 422 },
    );
  }

  const cbfId = String(club.cbfId);

  // Rounds to fetch: [beforeRound-1, beforeRound-2, …] clipped to ≥1
  const rounds = Array.from({ length: limit }, (_, i) => beforeRound - 1 - i).filter(
    (r) => r >= 1,
  );

  if (rounds.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch all rounds in parallel — each is likely a cache hit
  const results = await Promise.allSettled(rounds.map((r) => getCbfRound(r)));

  const pastFixtures: PastFixtureEntry[] = [];

  for (let i = 0; i < rounds.length; i++) {
    const result = results[i];
    if (result.status !== 'fulfilled') continue;

    const match = result.value.matches.find((m) => {
      if (m.mandante.id !== cbfId && m.visitante.id !== cbfId) return false;
      // Only include matches whose kickoff has already passed
      const [day, month, year] = m.data.split('/').map(Number);
      const [hours, minutes] = m.hora.split(':').map(Number);
      const kickoff = new Date(Date.UTC(year, month - 1, day, hours + 3, minutes));
      return kickoff.getTime() <= Date.now();
    });

    if (match) {
      pastFixtures.push({ round: rounds[i], match });
    }
  }

  return NextResponse.json(pastFixtures);
}
