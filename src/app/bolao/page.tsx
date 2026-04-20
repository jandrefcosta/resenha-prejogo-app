import { getCurrentUser } from '@/lib/auth';
import {
  getUserBoloes,
  getBolaoMeta,
  getRanking,
  getUserRankPosition,
  getUserScore,
  getBolaoByCode,
  joinBolao,
} from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';
import { RankingTable } from '@/components/bolao/RankingTable';
import { BolaoCard } from '@/components/bolao/BolaoCard';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function getGlobalTop5() {
  const raw = await getRanking('bolao:global:ranking', 5);
  const userKeys = raw.map((e) => `user:${e.member}`);
  const records = userKeys.length > 0
    ? await redis.mget<({ username?: string; displayName?: string } | null)[]>(...userKeys)
    : [];
  return raw.map((entry, i) => {
    const record = records[i];
    return {
      userId: entry.member,
      username: record?.username ?? entry.member.slice(0, 8),
      displayName: record?.displayName ?? record?.username ?? 'Anônimo',
      totalPts: entry.score,
      position: i + 1,
    };
  });
}

async function joinBolaoAction(fd: FormData) {
  'use server';
  const codigo = (fd.get('codigo') as string)?.trim().toUpperCase();
  if (!codigo) return;
  const currentUser = await getCurrentUser();
  if (!currentUser) return;
  const bolaoId = await getBolaoByCode(codigo);
  if (bolaoId) {
    await joinBolao(bolaoId, currentUser.sub);
    redirect(`/bolao/${bolaoId}`);
  }
}

export default async function BolaoPage() {
  const user = await getCurrentUser();

  const top5 = await getGlobalTop5();
  const totalParticipants = await redis.zcard('bolao:global:ranking');

  let myBoloesMeta: Array<{
    id: string; nome: string; codigo: string;
    memberCount: number; position: number | null; totalPts: number;
  }> = [];
  let myGlobalPosition: number | null = null;
  let myGlobalPts = 0;
  let myPalpiteCount = 0;

  if (user) {
    const bolaoIds = await getUserBoloes(user.sub);
    const metas = await Promise.all(bolaoIds.map((id) => getBolaoMeta(id)));

    myBoloesMeta = await Promise.all(
      metas
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map(async (meta) => {
          const memberCount = await redis.scard(`bolao:${meta.id}:members`);
          const position = await redis.zrevrank(`bolao:${meta.id}:ranking`, user.sub);
          const totalPts = (await redis.zscore(`bolao:${meta.id}:ranking`, user.sub)) ?? 0;
          return { ...meta, memberCount, position: position !== null ? position + 1 : null, totalPts };
        }),
    );

    myGlobalPosition = await getUserRankPosition('bolao:global:ranking', user.sub);
    myGlobalPts = await getUserScore('bolao:global:ranking', user.sub);

    const fixtureSet = await redis.smembers<string[]>(`palpite:user:${user.sub}:fixtures`);
    myPalpiteCount = fixtureSet.length;
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🏆 Bolão Copa 2026</h1>

      {/* Ranking Global */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Ranking Global</h2>
          <span className="text-xs text-gray-400">{totalParticipants} participantes</span>
        </div>
        <RankingTable entries={top5} myUserId={user?.sub} />
        {user && myGlobalPosition && myGlobalPosition > 5 && (
          <div className="mt-2 flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl text-sm">
            <span className="text-blue-700 font-medium">Sua posição: {myGlobalPosition}º</span>
            <span className="text-blue-700 font-bold">{myGlobalPts} pts</span>
          </div>
        )}
      </section>

      {/* CTA palpites */}
      {user ? (
        <Link
          href="/bolao/palpites"
          className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-semibold py-3 rounded-xl transition-colors"
        >
          ✏️ Meus Palpites ({myPalpiteCount}/48 preenchidos)
        </Link>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
          <p className="font-semibold text-gray-900 mb-1">Quer participar?</p>
          <p className="text-sm text-gray-500 mb-4">Crie uma conta para palpitar e entrar no ranking</p>
          <Link
            href="/api/auth/login"
            className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg font-medium text-sm"
          >
            Criar conta / Entrar
          </Link>
        </div>
      )}

      {/* Meus bolões privados */}
      {user && (
        <section>
          <h2 className="font-semibold text-gray-900 mb-3">Meus Bolões Privados</h2>
          <div className="space-y-2">
            {myBoloesMeta.map((b) => (
              <BolaoCard key={b.id} {...b} />
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Link
              href="/bolao/novo"
              className="flex-1 border border-dashed border-gray-300 rounded-xl py-3 text-center text-sm text-gray-500 hover:border-gray-400 transition-colors"
            >
              + Criar bolão
            </Link>
            <form action={joinBolaoAction} className="flex-1">
              <input
                name="codigo"
                placeholder="Código (ex: TRAB42)"
                className="w-full border border-dashed border-gray-300 rounded-xl py-3 px-3 text-center text-sm text-gray-700 placeholder:text-gray-400"
              />
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
