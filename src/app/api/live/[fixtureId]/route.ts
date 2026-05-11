import { NextRequest, NextResponse } from 'next/server';
import { liveLimiter, getClientIp } from '@/lib/rateLimiter';
import { getLiveFixtureData } from '@/lib/apiFootball';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> },
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const { success } = await liveLimiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente mais tarde.' }, { status: 429 });
  }

  const { fixtureId: fixtureIdStr } = await params;
  const fixtureId = Number(fixtureIdStr);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: 'Invalid fixture ID' }, { status: 400 });
  }

  try {
    const data = await getLiveFixtureData(fixtureId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch live data' }, { status: 500 });
  }
}
