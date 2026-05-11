import { NextRequest, NextResponse } from 'next/server';
import { getLiveFixtureData } from '@/lib/apiFootball';
import { liveFixtureLimiter, getClientIp } from '@/lib/rateLimiter';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> },
) {
  const ip = getClientIp(req);
  const { success } = await liveFixtureLimiter.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 },
    );
  }

  const { fixtureId } = await params;
  const id = Number(fixtureId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(
      { error: 'Invalid fixture id' },
      { status: 400 },
    );
  }

  try {
    const data = await getLiveFixtureData(id);
    if (!data) {
      return NextResponse.json(
        { error: 'Fixture not found or not live' },
        { status: 404 },
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch live data' },
      { status: 502 },
    );
  }
}
