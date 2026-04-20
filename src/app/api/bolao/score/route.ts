import { NextRequest, NextResponse } from 'next/server';
import {
  getFixtureParticipants,
  getPalpite,
  scoreExists,
  calcPts,
} from '@/lib/bolaoRedis';
import { getCache, redis } from '@/lib/redisCache';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Autenticar cron via secret header
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
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
  const errors: string[] = [];

  for (const match of finishedMatches) {
    const participants = await getFixtureParticipants(match.id);

    for (const userId of participants) {
      try {
        if (await scoreExists(userId, match.id)) {
          skipped++;
          continue;
        }

        const palpite = await getPalpite(userId, match.id);
        if (!palpite) continue;

        const resultado = { home: match.score!.home!, away: match.score!.away! };
        const { pts, outcome } = calcPts(palpite, resultado);

        const bolaoIds = await redis.smembers<string[]>(`bolao:user:${userId}:boloes`);
        const pipeline = redis.pipeline();
        pipeline.set(`score:${userId}:${match.id}`, { pts, outcome });
        pipeline.zincrby('bolao:global:ranking', pts, userId);
        for (const bolaoId of bolaoIds) {
          pipeline.zincrby(`bolao:${bolaoId}:ranking`, pts, userId);
        }
        await pipeline.exec();

        processed++;
      } catch (err) {
        errors.push(`${userId}:${match.id} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    finishedMatches: finishedMatches.length,
    processed,
    skipped,
    errors,
  });
}
