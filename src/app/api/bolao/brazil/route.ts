import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRanking, getUserRankPosition, getUserScore } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

const BRAZIL_RANKING_KEY = 'bolao:brazil:ranking';

// Retorna top 50 do ranking "Só Brasil" + posição do usuário logado (se houver).
// Espelha GET /api/bolao/global trocando a key do ZSet.
export async function GET() {
  const user = await getCurrentUser();

  const rawRanking = await getRanking(BRAZIL_RANKING_KEY, 50);

  // Enriquecer com username/displayName — buscar user records
  const userKeys = rawRanking.map((e) => `user:${e.member}`);
  const records = userKeys.length > 0
    ? await redis.mget<({ username?: string; displayName?: string } | null)[]>(...userKeys)
    : [];

  const enriched = rawRanking.map((entry, i) => {
    const record = records[i];
    return {
      userId: entry.member,
      username: record?.username ?? entry.member.slice(0, 8),
      displayName: record?.displayName ?? record?.username ?? 'Anônimo',
      totalPts: entry.score,
      position: i + 1,
    };
  });

  let myPosition: number | null = null;
  let myPts = 0;

  if (user) {
    myPosition = await getUserRankPosition(BRAZIL_RANKING_KEY, user.sub);
    myPts = await getUserScore(BRAZIL_RANKING_KEY, user.sub);
  }

  return NextResponse.json({
    ranking: enriched,
    total: await redis.zcard(BRAZIL_RANKING_KEY),
    me: user ? { position: myPosition, totalPts: myPts } : null,
  });
}
