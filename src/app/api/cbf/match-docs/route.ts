import { NextRequest, NextResponse } from 'next/server';
import { getCbfRound } from '@/lib/cbfApi';
import { getCache } from '@/lib/redisCache';
import { processMatchDocuments } from '@/lib/cbfDocParser';
import type { CbfMatchDocsResult } from '@/lib/cbfDocTypes';
import type { CbfMatchDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cbf/match-docs?matchId={idJogo}&round={N}
 *
 * Returns structured data extracted from official CBF PDFs for a finished match:
 *   - Súmula: lineups, referees, goals, cards
 *   - Boletim Financeiro: public attendance, gross/net revenue
 *
 * Cache strategy:
 *   - Cache hit (Redis): ~50ms response
 *   - Cache miss (first request): ~3–8s (download + parse + store)
 *   - Documents not published yet: { available: false }, 2h TTL
 *
 * The `round` param is required to look up the CbfMatchDetail (needed for
 * the `documentos` URLs field). Without it, we can still serve cached data.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const matchId = sp.get('matchId');
  const roundParam = sp.get('round');

  if (!matchId) {
    return NextResponse.json({ error: 'Param "matchId" is required.' }, { status: 400 });
  }

  // ── Fast path: check if we already have cached results ───────────────────
  const [sumulaCached, boletimCached] = await Promise.all([
    getCache<object>(`cbf:match:${matchId}:sumula`),
    getCache<object>(`cbf:match:${matchId}:boletim`),
  ]);

  if (sumulaCached || boletimCached) {
    const result: CbfMatchDocsResult = {
      available: true,
      sumula:  sumulaCached  as CbfMatchDocsResult['sumula']  ?? undefined,
      boletim: boletimCached as CbfMatchDocsResult['boletim'] ?? undefined,
    };
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=86400' }, // 1 day — data is immutable
    });
  }

  // ── Sentinel: documents not yet published ─────────────────────────────────
  const sentinel = await getCache<{ available: boolean; checkedAt: string }>(
    `cbf:match:${matchId}:docs:status`,
  );
  if (sentinel && !sentinel.available) {
    const ageMs = Date.now() - new Date(sentinel.checkedAt).getTime();
    const TTL_NOT_AVAILABLE = 60 * 60 * 2 * 1000; // 2h in ms
    if (ageMs < TTL_NOT_AVAILABLE) {
      return NextResponse.json(
        { available: false },
        { headers: { 'Cache-Control': 'public, max-age=7200' } },
      );
    }
  }

  // ── Need to download and parse — requires CbfMatchDetail ─────────────────
  if (!roundParam) {
    return NextResponse.json(
      { error: 'Param "round" is required when documents are not yet cached.' },
      { status: 400 },
    );
  }

  const round = parseInt(roundParam, 10);
  if (isNaN(round) || round < 1 || round > 38) {
    return NextResponse.json({ error: '"round" must be a number between 1 and 38.' }, { status: 400 });
  }

  let roundData;
  try {
    roundData = await getCbfRound(round);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch CBF round data.' }, { status: 502 });
  }

  const match: CbfMatchDetail | undefined = roundData.matches.find(
    (m) => m.idJogo === matchId,
  );

  if (!match) {
    return NextResponse.json(
      { error: `Match ${matchId} not found in round ${round}.` },
      { status: 404 },
    );
  }

  if (roundData.status !== 'finished') {
    return NextResponse.json(
      { available: false, reason: 'Match not finished yet.' },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  }

  // ── Download, parse, and cache ────────────────────────────────────────────
  const result = await processMatchDocuments(match);

  const maxAge = result.available ? 86400 : 7200; // 1d if found, 2h if not
  return NextResponse.json(result, {
    headers: { 'Cache-Control': `public, max-age=${maxAge}` },
  });
}
