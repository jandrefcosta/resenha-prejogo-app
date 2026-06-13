import { getCurrentUser } from '@/lib/auth';
import { getUserPalpites, isBrazilMatch } from '@/lib/bolaoRedis';
import { PencilIcon, ChevronLeftIcon } from '@heroicons/react/20/solid';
import Link from 'next/link';
import type { Score } from '@/lib/bolaoRedis';
import { getCache, redis } from '@/lib/redisCache';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';
import { RodadaTabsWrapper } from '@/components/bolao/RodadaTabsWrapper';
import { PalpiteRow } from '@/components/bolao/PalpiteRow';

export const dynamic = 'force-dynamic';

// Map round display labels (from PHASE_LABELS in fixtures route) to 1|2|3
const ROUND_KEYS: Record<string, 1 | 2 | 3> = {
  'Rodada 1': 1,
  'Rodada 2': 2,
  'Rodada 3': 3,
};

async function getCopaFixtures(): Promise<CopaFixturesPayload | null> {
  const cached = await getCache<CopaFixturesPayload>('copa-fixtures:2026');
  if (cached) return cached;

  // Cache miss — populate via internal API
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/copa/fixtures`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function PalpitesPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 text-center space-y-4">
        <PencilIcon className="h-12 w-12 text-zinc-400 mx-auto" />
        <h1 className="text-xl font-bold text-zinc-100">Meus Palpites</h1>
        <p className="text-zinc-400 text-sm">Faça login para ver e preencher seus palpites da Copa 2026.</p>
        <Link
          href="/login?returnTo=/bolao/palpites"
          className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
        >
          Entrar / Criar conta
        </Link>
      </main>
    );
  }

  const copa = await getCopaFixtures();
  const groupMatches = copa?.phases['Grupos'] ?? [];

  const now = Date.now();
  const palpites = await getUserPalpites(user.sub);

  // Batch-fetch scores for all fixtures that have a palpite
  const fixtureIdsWithPalpite = groupMatches.map((m) => m.id).filter((id) => palpites[id]);
  const scoreKeys = fixtureIdsWithPalpite.map((id) => `score:${user.sub}:${id}`);
  const rawScores = scoreKeys.length > 0
    ? await redis.mget<(Score | null)[]>(...scoreKeys)
    : [];
  const scoreMap: Record<string, Score | null> = {};
  fixtureIdsWithPalpite.forEach((id, i) => { scoreMap[id] = rawScores[i] ?? null; });

  const matchesWithData = groupMatches.map((m) => {
    const palpite = palpites[m.id] ?? null;
    const score = scoreMap[m.id] ?? null;
    const isLocked = m.status !== 'postponed' && now >= new Date(m.date).getTime();
    return { match: m, palpite, score, isLocked };
  });

  // Separate by round
  const byRound: Record<1 | 2 | 3, typeof matchesWithData> = { 1: [], 2: [], 3: [] };
  for (const item of matchesWithData) {
    const r = ROUND_KEYS[item.match.round];
    if (r) byRound[r].push(item);
  }

  const counts = {
    r1: { filled: byRound[1].filter((i) => i.palpite).length, total: byRound[1].length },
    r2: { filled: byRound[2].filter((i) => i.palpite).length, total: byRound[2].length },
    r3: { filled: byRound[3].filter((i) => i.palpite).length, total: byRound[3].length },
  };

  // Mata-mata do Brasil — jogos da Seleção nas fases de knockout, ordenados por
  // data. Vazio (seção oculta) até o Brasil se classificar. Scores vêm do
  // namespace brscore: (não score:), pois o mata-mata só pontua o ranking Brasil.
  const knockoutMatches = Object.entries(copa?.phases ?? {})
    .filter(([phase]) => phase !== 'Grupos')
    .flatMap(([, matches]) => matches);
  const brazilKnockout = knockoutMatches
    .filter((m) => isBrazilMatch(m))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const brKnockoutIds = brazilKnockout.map((m) => m.id).filter((id) => palpites[id]);
  const brScoreKeys = brKnockoutIds.map((id) => `brscore:${user.sub}:${id}`);
  const brRawScores = brScoreKeys.length > 0
    ? await redis.mget<(Score | null)[]>(...brScoreKeys)
    : [];
  const brScoreMap: Record<string, Score | null> = {};
  brKnockoutIds.forEach((id, i) => { brScoreMap[id] = brRawScores[i] ?? null; });

  const brazilKnockoutItems = brazilKnockout.map((m) => {
    const palpite = palpites[m.id] ?? null;
    const score = brScoreMap[m.id] ?? null;
    const isLocked = m.status !== 'postponed' && now >= new Date(m.date).getTime();
    return { match: m, palpite, score, isLocked };
  });

  return (
    <main className="max-w-lg mx-auto w-full px-4 py-6 flex-1">
      <Link
        href="/bolao"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Ranking
      </Link>
      <h1 className="text-xl font-bold text-zinc-100 mb-4 flex items-center gap-2">
        <PencilIcon className="h-5 w-5 text-zinc-400 shrink-0" />
        Meus Palpites
      </h1>
      <div className="mb-4 rounded-xl border border-green-800/60 bg-green-950/20 px-4 py-3 text-sm text-zinc-300">
        🇧🇷 Jogos do Brasil também valem pro ranking{' '}
        <span className="font-semibold text-zinc-100">Só Brasil</span> — em todas
        as fases.{' '}
        <Link
          href="/bolao"
          className="font-medium text-green-400 hover:text-green-300 whitespace-nowrap"
        >
          Ver ranking →
        </Link>
      </div>
      <RodadaTabsWrapper counts={counts} byRound={byRound} />

      {brazilKnockoutItems.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold text-zinc-100 mb-1 flex items-center gap-2">
            🇧🇷 Mata-mata do Brasil
          </h2>
          <p className="text-xs text-zinc-500 mb-3">
            Vale para o ranking Só Brasil. Em empate decidido nos pênaltis, acertar
            quem se classificou vale 5 pts.
          </p>
          <div className="space-y-2">
            {brazilKnockoutItems.map((item) => (
              <PalpiteRow
                key={item.match.id}
                fixtureId={item.match.id}
                homeTeam={item.match.homeTeam.name}
                awayTeam={item.match.awayTeam.name}
                date={item.match.date}
                palpite={item.palpite ?? undefined}
                score={item.score ?? undefined}
                actualScore={item.match.score ?? undefined}
                isLocked={item.isLocked}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
