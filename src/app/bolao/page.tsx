import { getCurrentUser } from "@/lib/auth";
import {
  getUserBoloes,
  getBolaoMeta,
  getRanking,
  getUserRankPosition,
  getUserScore,
  getBolaoByCode,
  joinBolao,
} from "@/lib/bolaoRedis";
import { redis } from "@/lib/redisCache";
import { RankingTable } from "@/components/bolao/RankingTable";
import { BolaoCard } from "@/components/bolao/BolaoCard";
import {
  TrophyIcon,
  PencilIcon,
  PlusIcon,
  ChevronLeftIcon,
  GlobeAmericasIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getGlobalTop5() {
  const raw = await getRanking("bolao:global:ranking", 5);
  const userKeys = raw.map((e) => `user:${e.member}`);
  const records =
    userKeys.length > 0
      ? await redis.mget<
          ({ username?: string; displayName?: string } | null)[]
        >(...userKeys)
      : [];
  return raw.map((entry, i) => {
    const record = records[i];
    return {
      userId: entry.member,
      username: record?.username ?? entry.member.slice(0, 8),
      displayName: record?.displayName ?? record?.username ?? "Anônimo",
      totalPts: entry.score,
      position: i + 1,
    };
  });
}

async function joinBolaoAction(fd: FormData) {
  "use server";
  const codigo = (fd.get("codigo") as string)?.trim().toUpperCase();
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
  const totalParticipants = await redis.zcard("bolao:global:ranking");

  let myBoloesMeta: Array<{
    id: string;
    nome: string;
    codigo: string;
    memberCount: number;
    position: number | null;
    totalPts: number;
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
          const position = await redis.zrevrank(
            `bolao:${meta.id}:ranking`,
            user.sub,
          );
          const totalPts =
            (await redis.zscore(`bolao:${meta.id}:ranking`, user.sub)) ?? 0;
          return {
            ...meta,
            memberCount,
            position: position !== null ? position + 1 : null,
            totalPts,
          };
        }),
    );

    myGlobalPosition = await getUserRankPosition(
      "bolao:global:ranking",
      user.sub,
    );
    myGlobalPts = await getUserScore("bolao:global:ranking", user.sub);

    const fixtureSet = await redis.smembers<string[]>(
      `palpite:user:${user.sub}:fixtures`,
    );
    myPalpiteCount = fixtureSet.length;
  }

  return (
    <main className="max-w-lg mx-auto w-full px-4 py-6 space-y-6 flex-1">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Início
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <TrophyIcon className="h-6 w-6 text-yellow-400 shrink-0" />
          Bolão Copa 2026
        </h1>
        <Link
          href="/copa-2026"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          <GlobeAmericasIcon className="h-3.5 w-3.5" />
          Ver competição
        </Link>
      </div>

      {/* Ranking Global */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-zinc-100">Ranking Global</h2>
          <span className="text-xs text-zinc-500">
            {totalParticipants} participantes
          </span>
        </div>
        <RankingTable entries={top5} myUserId={user?.sub} />
        {user && myGlobalPosition && myGlobalPosition > 5 && (
          <div className="mt-2 flex items-center justify-between px-4 py-3 bg-blue-950/40 border border-blue-800 rounded-xl text-sm">
            <span className="text-blue-400 font-medium">
              Sua posição: {myGlobalPosition}º
            </span>
            <span className="text-blue-400 font-bold">{myGlobalPts} pts</span>
          </div>
        )}
      </section>

      {/* CTA palpites */}
      {user ? (
        <Link
          href="/bolao/palpites"
          className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-semibold py-3 rounded-xl transition-colors"
        >
          <span className="flex items-center justify-center gap-1.5">
            <PencilIcon className="h-4 w-4" />
            Meus Palpites ({myPalpiteCount}/48 preenchidos)
          </span>
        </Link>
      ) : (
        <div className="border-2 border-dashed border-zinc-700 rounded-xl p-6 text-center">
          <p className="font-semibold text-zinc-100 mb-1">Quer participar?</p>
          <p className="text-sm text-zinc-400 mb-4">
            Crie uma conta para palpitar e entrar no ranking
          </p>
          <Link
            href="/login"
            className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg font-medium text-sm"
          >
            Criar conta / Entrar
          </Link>
        </div>
      )}

      {/* Meus bolões privados */}
      {user && (
        <section>
          <h2 className="font-semibold text-zinc-100 mb-3">
            Meus Bolões Privados
          </h2>
          <div className="space-y-2">
            {myBoloesMeta.map((b) => (
              <BolaoCard key={b.id} {...b} />
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <Link
              href="/bolao/novo"
              className="flex-1 border border-dashed border-zinc-700 rounded-xl py-3 text-center text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <span className="flex items-center justify-center gap-1">
                <PlusIcon className="h-4 w-4" />
                Criar bolão
              </span>
            </Link>
            <form action={joinBolaoAction} className="flex-1">
              <input
                name="codigo"
                placeholder="Código de convite (ex: TRAB42)"
                className="w-full border border-dashed border-zinc-700 rounded-xl py-3 px-3 text-center text-sm text-zinc-100 bg-transparent placeholder:text-zinc-500"
              />
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
