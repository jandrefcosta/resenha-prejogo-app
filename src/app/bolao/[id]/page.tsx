import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getBolaoMeta, getRanking, getUserRankPosition } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';
import { RankingTable } from '@/components/bolao/RankingTable';
import Link from 'next/link';
import type { RankingEntry } from '@/components/bolao/RankingTable';
import { ShareBolaoButton } from '@/components/bolao/ShareBolaoButton';

export const dynamic = 'force-dynamic';

export default async function BolaoPrivadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meta = await getBolaoMeta(id);
  if (!meta) notFound();

  const user = await getCurrentUser();

  const rawRanking = await getRanking(`bolao:${id}:ranking`, 100);
  const userKeys = rawRanking.map((e) => `user:${e.member}`);
  const records = userKeys.length > 0
    ? await redis.mget<({ username?: string; displayName?: string } | null)[]>(...userKeys)
    : [];

  const entries: RankingEntry[] = rawRanking.map((entry, i) => {
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
  let myPosition: number | null = null;
  if (user) {
    myPosition = await getUserRankPosition(`bolao:${id}:ranking`, user.sub);
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{meta.nome}</h1>
        <p className="text-sm text-gray-400 mt-1">
          Código:{' '}
          <span className="font-mono font-bold text-gray-700">{meta.codigo}</span> ·{' '}
          {memberCount} participante{memberCount !== 1 ? 's' : ''}
          {myPosition && ` · você está em ${myPosition}º`}
        </p>
      </div>

      <RankingTable entries={entries} myUserId={user?.sub} />

      <div className="flex gap-3">
        <Link
          href="/bolao/palpites"
          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-center font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          ✏️ Meus Palpites
        </Link>
        <ShareBolaoButton nome={meta.nome} codigo={meta.codigo} id={id} />
      </div>
    </main>
  );
}
