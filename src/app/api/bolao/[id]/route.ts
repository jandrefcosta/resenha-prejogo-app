import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBolaoMeta, getRanking, getUserRankPosition } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const meta = await getBolaoMeta(id);
  if (!meta) return NextResponse.json({ error: 'Bolão não encontrado' }, { status: 404 });

  const isMember = await redis.sismember(`bolao:${id}:members`, user.sub);
  if (!isMember) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const rawRanking = await getRanking(`bolao:${id}:ranking`, 100);
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

  const memberCount = await redis.scard(`bolao:${id}:members`);

  const myPosition = await getUserRankPosition(`bolao:${id}:ranking`, user.sub);

  return NextResponse.json({
    bolao: { ...meta, memberCount },
    ranking: enriched,
    myPosition,
  });
}
