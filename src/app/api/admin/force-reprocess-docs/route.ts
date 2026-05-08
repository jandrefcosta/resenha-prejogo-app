import { NextRequest, NextResponse } from 'next/server';
import { getCbfRound } from '@/lib/cbfApi';
import { downloadPdf, processMatchDocuments, resolvePdfUrls } from '@/lib/cbfDocParser';
import { deletePdfs, savePdf } from '@/lib/cbfPdfStore';
import { deleteCache } from '@/lib/redisCache';
import { isAdminRequest, unauthorizedAdminResponse } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export interface ReprocessResult {
  ok: boolean;
  rounds: number;
  processed: number;
  errors: number;
  unavailable: number;
  durationMs: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest(req))) return unauthorizedAdminResponse();

  const start = Date.now();
  const totals = { rounds: 0, processed: 0, errors: 0, unavailable: 0 };

  for (let r = 1; r <= 38; r++) {
    const round = await getCbfRound(r).catch(() => null);
    if (!round || round.status !== 'finished') continue;
    totals.rounds++;

    for (const match of round.matches) {
      const { idJogo } = match;
      if (!idJogo) continue;

      try {
        const urls = await resolvePdfUrls(match);

        await deletePdfs(idJogo);
        await Promise.all([
          deleteCache(`cbf:match:${idJogo}:docs:status`),
          deleteCache(`cbf:match:${idJogo}:sumula`),
          deleteCache(`cbf:match:${idJogo}:boletim`),
        ]);

        const [sumulaBuf, boletimBuf] = await Promise.all([
          urls.sumula  ? downloadPdf(urls.sumula)  : Promise.resolve(null),
          urls.boletim ? downloadPdf(urls.boletim) : Promise.resolve(null),
        ]);

        if (!sumulaBuf && !boletimBuf) {
          totals.unavailable++;
          continue;
        }

        await Promise.all([
          sumulaBuf  ? savePdf(idJogo, 'sumula',  sumulaBuf,  urls.sumula  ?? undefined) : Promise.resolve(),
          boletimBuf ? savePdf(idJogo, 'boletim', boletimBuf, urls.boletim ?? undefined) : Promise.resolve(),
        ]);

        const result = await processMatchDocuments(match);
        if (result.available) totals.processed++;
        else totals.unavailable++;
      } catch {
        totals.errors++;
      }
    }
  }

  const result: ReprocessResult = {
    ok: totals.rounds > 0,
    ...totals,
    durationMs: Date.now() - start,
  };

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
