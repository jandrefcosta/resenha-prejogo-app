import { NextRequest, NextResponse } from 'next/server';
import { fetchLineups } from '@/lib/apiFootball';

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
    console.error('[/api/lineups] error:', err);
    return NextResponse.json({ error: 'Failed to fetch lineups' }, { status: 500 });
  }
}
