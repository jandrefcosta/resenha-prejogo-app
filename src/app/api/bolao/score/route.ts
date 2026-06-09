import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import {
  getFixtureParticipants,
  getPalpite,
  calcPts,
  calcPtsBrazil,
  isBrazilMatch,
} from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';
import { db } from '@/lib/db';
import { scores as scoresTable, bolaoRankings, globalRankings, brazilRankings } from '@/lib/db/schema';
import { getCopaFixtures, type CopaFixturesPayload } from '@/app/api/copa/fixtures/route';

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

  // getCopaFixtures serves the Redis cache when warm and fetches API-Football
  // on a miss — so a cold cache (nobody browsed Copa fixtures) no longer
  // silently skips a scoring run.
  let copa: CopaFixturesPayload;
  try {
    copa = await getCopaFixtures();
  } catch (err) {
    return NextResponse.json(
      { error: `Copa fixtures unavailable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
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

  // ─── Passo 2 — Ranking "Só Brasil" (todas as fases) ──────────────────────────
  // Independente do passo 1: nunca toca bolao:global:ranking nem bolões privados,
  // então o mata-mata do Brasil não vaza para o ranking global (que segue
  // grupos-only). Idempotência própria via brscore: — pode rodar N vezes sem
  // duplicar, e faz backfill dos jogos do Brasil já encerrados no 1º deploy.
  const allMatches = Object.values(copa.phases).flat();
  const brazilFinished = allMatches.filter(
    (m) =>
      isBrazilMatch(m) &&
      m.status === 'finished' &&
      m.score?.home != null &&
      m.score?.away != null,
  );

  let brazilProcessed = 0;
  let brazilSkipped = 0;

  for (const match of brazilFinished) {
    const isKnockout = match.competitionPhase !== 'Grupos';
    const isDraw = match.score!.home === match.score!.away;
    // Guard anti-freeze: um mata-mata empatado é decidido nos pênaltis e depende
    // de advancedTeamId (derivado de winner), que pode chegar depois do status
    // virar finished. Pontuar agora congelaria pts=0 (via brscore: nx) para quem
    // acertou o classificado. Então pula sem gravar até winner aparecer.
    if (isKnockout && isDraw && !match.advancedTeamId) {
      brazilSkipped++;
      continue;
    }

    const resultado = { home: match.score!.home!, away: match.score!.away! };
    const participants = await getFixtureParticipants(match.id);

    for (const userId of participants) {
      try {
        // Curto-circuito antes do getPalpite: evita reler o palpite de todo
        // participante já pontuado a cada execução do cron.
        if (await redis.exists(`brscore:${userId}:${match.id}`)) {
          brazilSkipped++;
          continue;
        }

        const palpite = await getPalpite(userId, match.id);
        if (!palpite) continue;

        const { pts, outcome } = calcPtsBrazil(palpite, {
          home: resultado.home,
          away: resultado.away,
          advancedTeamId: match.advancedTeamId,
          homeId: match.homeTeam.id,
          awayId: match.awayTeam.id,
        });

        const scored = await redis.set(
          `brscore:${userId}:${match.id}`,
          { pts, outcome },
          { nx: true },
        );
        if (scored === null) {
          // Corrida: pontuado entre o exists e o set.
          brazilSkipped++;
          continue;
        }

        await redis.zincrby('bolao:brazil:ranking', pts, userId);

        const now = new Date();
        const pgWrites = [
          db.insert(scoresTable).values({ userId, fixtureId: match.id, points: pts, outcome })
            .onConflictDoNothing(),
          db.insert(brazilRankings).values({ userId, totalPoints: pts })
            .onConflictDoUpdate({
              target: brazilRankings.userId,
              set: { totalPoints: sql`${brazilRankings.totalPoints} + ${pts}`, updatedAt: now },
            }),
        ];
        Promise.all(pgWrites).catch(err => console.error('[pg-shadow-write] brazil score cron:', err));

        brazilProcessed++;
      } catch (err) {
        errors.push(`brazil ${userId}:${match.id} — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    finishedMatches: finishedMatches.length,
    processed,
    skipped,
    brazilFinishedMatches: brazilFinished.length,
    brazilProcessed,
    brazilSkipped,
    errors,
  });
}
