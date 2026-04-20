import { NextRequest, NextResponse } from 'next/server';
import {
  getFixtureParticipants,
  getPalpite,
  scoreExists,
  saveScore,
  calcPts,
  incrementUserPoints,
} from '@/lib/bolaoRedis';
import { getCache } from '@/lib/redisCache';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Autenticar cron via secret header
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!auth || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const copa = await getCache<CopaFixturesPayload>('copa-fixtures:2026');
  if (!copa) {
    return NextResponse.json({ error: 'Copa fixtures not cached yet' }, { status: 503 });
  }

  // Apenas fase de grupos (48 jogos)
  const groupMatches = copa.phases['Grupos'] ?? [];
  const finishedMatches = groupMatches.filter(
    (m) => m.status === 'finished' && m.score?.home !== null && m.score?.away !== null,
  );

  let processed = 0;
  let skipped = 0;

  for (const match of finishedMatches) {
    const participants = await getFixtureParticipants(match.id);

    for (const userId of participants) {
      if (await scoreExists(userId, match.id)) {
        skipped++;
        continue;
      }

      const palpite = await getPalpite(userId, match.id);
      if (!palpite) continue;

      const resultado = { home: match.score!.home!, away: match.score!.away! };
      const { pts, outcome } = calcPts(palpite, resultado);

      await saveScore(userId, match.id, pts, outcome);
      await incrementUserPoints(userId, pts);
      processed++;
    }
  }

  return NextResponse.json({
    ok: true,
    finishedMatches: finishedMatches.length,
    processed,
    skipped,
  });
}
