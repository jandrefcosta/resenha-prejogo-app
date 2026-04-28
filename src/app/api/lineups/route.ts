import { NextRequest, NextResponse } from 'next/server';
import { fetchLineups } from '@/lib/apiFootball';

function isUnavailableLineupsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return error.message === 'API_FOOTBALL_KEY is not set'
    || error.message.includes('API-Football lineups HTTP 401')
    || error.message.includes('API-Football lineups HTTP 403')
    || error.message.includes('Error/Missing application key');
}

export async function GET(req: NextRequest) {
  const fixtureParam = req.nextUrl.searchParams.get('fixture');
  const fixtureId = fixtureParam ? parseInt(fixtureParam, 10) : NaN;

  if (isNaN(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: 'Missing or invalid fixture param' }, { status: 400 });
  }

  try {
    const data = await fetchLineups(fixtureId);
    if (!data) {
      return NextResponse.json(null, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60' },
    });
  } catch (err) {
    if (isUnavailableLineupsError(err)) {
      console.warn('[/api/lineups] unavailable:', err);
      return NextResponse.json(null, {
        status: 404,
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
      });
    }

    console.error('[/api/lineups] error:', err);
    return NextResponse.json({ error: 'Failed to fetch lineups' }, { status: 500 });
  }
}
