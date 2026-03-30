import { NextRequest, NextResponse } from 'next/server';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('id');
  const home = searchParams.get('home');
  const away = searchParams.get('away');
  const round = searchParams.get('round');
  const date = searchParams.get('date');

  if (!id || !home || !away || !round || !date) {
    return NextResponse.json({ broadcasters: [] }, { status: 400 });
  }

  const broadcasters = await getBroadcastersForFixture(id, home, away, round, date);
  return NextResponse.json({ broadcasters });
}
