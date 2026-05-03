import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getBolaoMeta, getRanking, getUserRankPosition, joinBolao } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';
import { RankingTable } from '@/components/bolao/RankingTable';
import { TrophyIcon, PencilIcon, ChevronLeftIcon } from '@heroicons/react/20/solid';
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
  if (!user) {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
        <TrophyIcon className="h-12 w-12 text-yellow-400 mx-auto" />
        <h1 className="text-xl font-bold text-zinc-100">{meta.nome}</h1>
        <p className="text-zinc-400 text-sm">Faça login para ver o ranking e fazer seus palpites neste bolão.</p>
        <Link
          href={`/login?returnTo=/bolao/${id}`}
          className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
        >
          Entrar / Criar conta
        </Link>
      </main>
    );
  }

  // Check membership
  const isMember = await redis.sismember(`bolao:${id}:members`, user.sub);
  if (!isMember) {
    async function joinAction() {
      'use server';
      await joinBolao(id, user!.sub);
      redirect(`/bolao/${id}`);
    }

    const memberCount = await redis.scard(`bolao:${id}:members`);

    return (
      <main className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
        <TrophyIcon className="h-12 w-12 text-yellow-400 mx-auto" />
        <h1 className="text-xl font-bold text-zinc-100">{meta.nome}</h1>
        <p className="text-zinc-400 text-sm">
          {memberCount} participante{memberCount !== 1 ? 's' : ''} · Você foi convidado para este bolão.
        </p>
        <form action={joinAction}>
          <button
            type="submit"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Entrar no bolão
          </button>
        </form>
        <Link href="/bolao" className="block text-xs text-zinc-500 hover:text-zinc-300">
          Ver ranking global
        </Link>
      </main>
    );
  }

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
  const myPosition = await getUserRankPosition(`bolao:${id}:ranking`, user.sub);

  return (
    <main className="max-w-lg mx-auto w-full px-4 py-6 space-y-6 flex-1">
      <div>
        <Link
          href="/bolao"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 mb-2 transition-colors"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Ranking
        </Link>
        <h1 className="text-xl font-bold text-zinc-100">{meta.nome}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Código:{' '}
          <span className="font-mono font-bold text-zinc-300">{meta.codigo}</span> ·{' '}
          {memberCount} participante{memberCount !== 1 ? 's' : ''}
          {myPosition && ` · você está em ${myPosition}º`}
        </p>
      </div>

      <RankingTable entries={entries} myUserId={user.sub} />

      <div className="flex gap-3">
        <Link
          href="/bolao/palpites"
          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-center font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          <span className="flex items-center justify-center gap-1.5">
            <PencilIcon className="h-4 w-4" />
            Meus Palpites
          </span>
        </Link>
        <ShareBolaoButton nome={meta.nome} codigo={meta.codigo} id={id} />
      </div>
    </main>
  );
}
