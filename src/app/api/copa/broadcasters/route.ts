import { NextRequest, NextResponse } from 'next/server';
import { getCopaFixtures } from '@/app/api/copa/fixtures/route';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';
import { makeSemaphore } from '@/lib/semaphore';
import type { BroadcasterInfo, Match } from '@/lib/types';

/** Cap de ids por requisição — limita a rajada de chamadas Gemini. */
const MAX_IDS = 32;
/** Nome de competição enviado ao motor (foca a busca do Gemini). */
const COPA_COMPETITION_NAME = 'Copa do Mundo 2026';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) return NextResponse.json({});

  const requestedIds = Array.from(
    new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean)),
  ).slice(0, MAX_IDS);
  if (requestedIds.length === 0) return NextResponse.json({});

  let fixtureMap: Map<string, Match>;
  try {
    const payload = await getCopaFixtures();
    fixtureMap = new Map(
      Object.values(payload.phases)
        .flat()
        .map((m) => [m.id, m] as const),
    );
  } catch {
    // Sem fixtures não há o que buscar — devolve vazio em vez de 502.
    return NextResponse.json({});
  }

  const withSemaphore = makeSemaphore(3);

  const entries = await Promise.all(
    requestedIds
      .map((id) => fixtureMap.get(id))
      .filter((m): m is Match => m !== undefined)
      .map(async (m) => {
        const broadcasters = await withSemaphore(() =>
          getBroadcastersForFixture(
            m.id,
            m.homeTeam.name,
            m.awayTeam.name,
            m.round,
            m.date,
            COPA_COMPETITION_NAME,
          ).catch(() => [] as BroadcasterInfo[]),
        );
        return [m.id, broadcasters] as const;
      }),
  );

  return NextResponse.json(Object.fromEntries(entries), {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' },
  });
}
