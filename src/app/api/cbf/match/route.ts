import { NextRequest, NextResponse } from 'next/server';
import { getCbfRound } from '@/lib/cbfApi';
import clubsData from '@/data/clubs.json';
import type { ClubTheme, CbfMatchDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

const clubs = clubsData as ClubTheme[];

/** apiFootballId → cbfId */
const apiToCbf = new Map<number, number>(
  clubs
    .filter((c) => c.apiFootballId !== null && c.cbfId != null)
    .map((c) => [c.apiFootballId as number, c.cbfId as number]),
);

function parseRound(roundStr: string): number | null {
  const m = roundStr.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const homeId = Number(searchParams.get('home'));
  const awayId = Number(searchParams.get('away'));
  const roundParam = searchParams.get('round') ?? '';

  const round = /^\d+$/.test(roundParam)
    ? Number(roundParam)
    : parseRound(roundParam);

  if (!homeId || !awayId || !round || round < 1 || round > 38) {
    return NextResponse.json(
      { error: 'Params "home" (apiFootballId), "away" (apiFootballId) and "round" (1–38 or "Rodada N") are required.' },
      { status: 400 },
    );
  }

  const homeCbfId = apiToCbf.get(homeId);
  const awayCbfId = apiToCbf.get(awayId);

  if (!homeCbfId || !awayCbfId) {
    return NextResponse.json(
      { error: 'One or both teams could not be mapped to a CBF ID.' },
      { status: 422 },
    );
  }

  const roundData = await getCbfRound(round);

  const match: CbfMatchDetail | undefined = roundData.matches.find(
    (m) => m.mandante.id === String(homeCbfId) && m.visitante.id === String(awayCbfId),
  );

  if (!match) {
    return NextResponse.json(
      { error: 'Match not found in CBF round data.' },
      { status: 404 },
    );
  }

  return NextResponse.json(match, {
    headers: {
      'Cache-Control': `public, s-maxage=${roundData.ttlSeconds}, stale-while-revalidate=60`,
    },
  });
}
