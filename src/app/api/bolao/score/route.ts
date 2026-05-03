import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import {
  getFixtureParticipants,
  getPalpite,
  calcPts,
} from '@/lib/bolaoRedis';
import { getCache, redis } from '@/lib/redisCache';
import { db } from '@/lib/db';
import { scores as scoresTable, bolaoRankings, globalRankings } from '@/lib/db/schema';
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
        const palpite = await getPalpite(userId, match.id);
        if (!palpite) continue;

        const resultado = { home: match.score!.home!, away: match.score!.away! };
        const { pts, outcome } = calcPts(palpite, resultado);

        // Atomic NX write — if null is returned, key already existed (already scored)
        const scored = await redis.set(
          `score:${userId}:${match.id}`,
          { pts, outcome },
          { nx: true }
        );
        if (scored === null) {
          skipped++;
          continue;
        }

        const bolaoIds = await redis.smembers<string[]>(`bolao:user:${userId}:boloes`);
        const pipeline = redis.pipeline();
        pipeline.zincrby('bolao:global:ranking', pts, userId);
        for (const bolaoId of bolaoIds) {
          pipeline.zincrby(`bolao:${bolaoId}:ranking`, pts, userId);
        }
        const results = await pipeline.exec();
        if (results.some((r) => r instanceof Error)) {
          throw new Error(`Pipeline failed for user ${userId} match ${match.id}`);
        }

        const now = new Date();
        const pgWrites = [
          db.insert(scoresTable).values({ userId, fixtureId: match.id, points: pts, outcome })
            .onConflictDoNothing(),
          db.insert(globalRankings).values({ userId, totalPoints: pts })
            .onConflictDoUpdate({
              target: globalRankings.userId,
              set: { totalPoints: sql`${globalRankings.totalPoints} + ${pts}`, updatedAt: now },
            }),
          ...bolaoIds.map(bolaoId =>
            db.insert(bolaoRankings).values({ bolaoId, userId, totalPoints: pts })
              .onConflictDoUpdate({
                target: [bolaoRankings.bolaoId, bolaoRankings.userId],
                set: { totalPoints: sql`${bolaoRankings.totalPoints} + ${pts}`, updatedAt: now },
              })
          ),
        ];
        Promise.all(pgWrites).catch(err => console.error('[pg-shadow-write] score cron:', err));

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
