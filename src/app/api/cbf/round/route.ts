import { NextRequest, NextResponse } from 'next/server';
import { getCbfRound } from '@/lib/cbfApi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const round = Number(req.nextUrl.searchParams.get('round'));

  if (!round || round < 1 || round > 38) {
    return NextResponse.json(
      { error: 'Query param "round" must be a number between 1 and 38.' },
      { status: 400 },
    );
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  const data = await getCbfRound(round, force);

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': `public, s-maxage=${data.ttlSeconds}, stale-while-revalidate=60`,
    },
  });
}
