import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRanking, getUserRankPosition, getUserScore } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

// Retorna top 50 do ranking global + posição do usuário logado (se houver)
export async function GET() {
  const user = await getCurrentUser();

  const rawRanking = await getRanking('bolao:global:ranking', 50);

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
    myPosition = await getUserRankPosition('bolao:global:ranking', user.sub);
    myPts = await getUserScore('bolao:global:ranking', user.sub);
  }

  return NextResponse.json({
    ranking: enriched,
    total: await redis.zcard('bolao:global:ranking'),
    me: user ? { position: myPosition, totalPts: myPts } : null,
  });
}
