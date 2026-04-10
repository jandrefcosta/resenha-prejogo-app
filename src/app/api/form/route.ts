import { NextRequest, NextResponse } from 'next/server';
import { getTeamForm, parseForm } from '@/lib/teamForm';

export async function GET(req: NextRequest) {
  const homeStr = req.nextUrl.searchParams.get('home');
  const awayStr = req.nextUrl.searchParams.get('away');

  if (!homeStr || !awayStr) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const homeId = Number(homeStr);
  const awayId = Number(awayStr);

  if (!Number.isInteger(homeId) || !Number.isInteger(awayId) || homeId <= 0 || awayId <= 0) {
    return NextResponse.json({ error: 'Invalid team IDs' }, { status: 400 });
  }

  const season = new Date().getFullYear();
  const leagueId = req.nextUrl.searchParams.get('leagueId')
    ? Number(req.nextUrl.searchParams.get('leagueId'))
    : 71;

  const [homeRaw, awayRaw] = await Promise.all([
    getTeamForm(homeId, season, leagueId),
    getTeamForm(awayId, season, leagueId),
  ]);

  return NextResponse.json({
    homeForm: parseForm(homeRaw),
    awayForm: parseForm(awayRaw),
  });
}
