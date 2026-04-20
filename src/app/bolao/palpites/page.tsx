import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getUserPalpites, getScore } from '@/lib/bolaoRedis';
import { getCache } from '@/lib/redisCache';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';
import { RodadaTabsWrapper } from '@/components/bolao/RodadaTabsWrapper';

export const dynamic = 'force-dynamic';

// Map round display labels (from PHASE_LABELS in fixtures route) to 1|2|3
const ROUND_KEYS: Record<string, 1 | 2 | 3> = {
  'Rodada 1': 1,
  'Rodada 2': 2,
  'Rodada 3': 3,
};

export default async function PalpitesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');

  const copa = await getCache<CopaFixturesPayload>('copa-fixtures:2026');
  const groupMatches = copa?.phases['Grupos'] ?? [];

  const now = Date.now();
  const palpites = await getUserPalpites(user.sub);

  const matchesWithData = await Promise.all(
    groupMatches.map(async (m) => {
      const palpite = palpites[m.id];
      const score = palpite ? await getScore(user.sub, m.id) : null;
      const isLocked = m.status !== 'postponed' && now >= new Date(m.date).getTime();
      return { match: m, palpite: palpite ?? null, score: score ?? null, isLocked };
    }),
  );

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

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">✏️ Meus Palpites</h1>
      <RodadaTabsWrapper counts={counts} byRound={byRound} />
    </main>
  );
}
