import { NextRequest, NextResponse } from 'next/server';
import { getCbfRound } from '@/lib/cbfApi';
import { processMatchDocuments } from '@/lib/cbfDocParser';
import { redis } from '@/lib/redisCache';
import { isValidCronRequest } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return isValidCronRequest(req, process.env.CRON_SECRET);
}

async function runCron(): Promise<{ seeded: number; skipped: number; unavailable: number; errors: number }> {
  const totals = { seeded: 0, skipped: 0, unavailable: 0, errors: 0 };

  for (let round = 1; round <= 38; round++) {
    let roundData;
    try {
      roundData = await getCbfRound(round);
    } catch {
      continue;
    }
    if (roundData.status !== 'finished') continue;

    for (const match of roundData.matches) {
      const id = match.idJogo;
      if (!id) continue;

      // Skip se já temos súmula ou boletim em cache
      const [hasSumula, hasBoletim] = await Promise.all([
        redis.exists(`cbf:match:${id}:sumula`),
        redis.exists(`cbf:match:${id}:boletim`),
      ]);
      if (hasSumula || hasBoletim) { totals.skipped++; continue; }

      try {
        const result = await processMatchDocuments(match);
        if (result.available) totals.seeded++;
        else totals.unavailable++;
      } catch {
        totals.errors++;
      }
    }
  }

  return totals;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const totals = await runCron();
  return NextResponse.json({ ok: true, ...totals });
}

/** Vercel Cron invoca via GET */
export const GET = handle;

/** Trigger manual via POST */
export const POST = handle;
