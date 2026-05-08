/**
 * seed-match-docs.ts — Proactively download CBF PDFs into Postgres.
 *
 * Downloads súmula + boletim PDFs for each finished Série A round and stores
 * them in the pdf_files Postgres table before the 2-month CBF expiry window.
 * Parsing is NOT done here — it happens on-demand in processMatchDocuments().
 *
 * Usage:
 *   npm run seed:match-docs                    # process all finished rounds (1–38)
 *   npm run seed:match-docs -- --rounds=5      # up to round 5
 *   npm run seed:match-docs -- --round=3       # only round 3
 *   npm run seed:match-docs -- --reset         # re-download even if already stored
 *
 * Requires: .env.local with DATABASE_URL + CBF API vars
 */

import { getCbfRound } from '@/lib/cbfApi';
import { downloadPdf, resolvePdfUrls } from '@/lib/cbfDocParser';
import { hasPdf, savePdf } from '@/lib/cbfPdfStore';
import { getArg, hasReset } from './lib/args';
import type { CbfMatchDetail } from '@/lib/types';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const roundStr  = getArg('round');
  const roundsStr = getArg('rounds');
  const force     = hasReset();

  if (roundStr) {
    const n = parseInt(roundStr, 10);
    return { from: n, to: n, force };
  }

  return { from: 1, to: parseInt(roundsStr ?? '38', 10), force };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type DownloadResult = 'stored' | 'already_stored' | 'unavailable' | 'error';

const ICONS: Record<DownloadResult, string> = {
  stored:         '✓',
  already_stored: '◎',
  unavailable:    '—',
  error:          '✗',
};

const LABELS: Record<DownloadResult, string> = {
  stored:         'baixado e salvo',
  already_stored: 'já no Postgres, ignorado',
  unavailable:    'PDF não publicado ainda',
  error:          'erro ao baixar',
};

// ─── Core ─────────────────────────────────────────────────────────────────────

async function downloadMatchPdfs(
  match: CbfMatchDetail,
  force: boolean,
): Promise<DownloadResult> {
  const idJogo = match.idJogo;
  if (!idJogo) return 'error';

  if (!force) {
    const [hasSumula, hasBoletim] = await Promise.all([
      hasPdf(idJogo, 'sumula'),
      hasPdf(idJogo, 'boletim'),
    ]);
    if (hasSumula && hasBoletim) return 'already_stored';
  }

  try {
    const urls = await resolvePdfUrls(match);

    if (!urls.sumula && !urls.boletim) return 'unavailable';

    const [sumulaBuf, boletimBuf] = await Promise.all([
      urls.sumula  ? downloadPdf(urls.sumula)  : Promise.resolve(null),
      urls.boletim ? downloadPdf(urls.boletim) : Promise.resolve(null),
    ]);

    if (!sumulaBuf && !boletimBuf) return 'unavailable';

    await Promise.all([
      sumulaBuf  ? savePdf(idJogo, 'sumula',  sumulaBuf,  urls.sumula  ?? undefined) : Promise.resolve(),
      boletimBuf ? savePdf(idJogo, 'boletim', boletimBuf, urls.boletim ?? undefined) : Promise.resolve(),
    ]);

    return 'stored';
  } catch {
    return 'error';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { from, to, force } = parseArgs();

  console.log('');
  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║  CBF PDF Download Seed — Resenha Pré-Jogo  ║');
  console.log('  ╚════════════════════════════════════════════╝');
  console.log(`\n  Rodadas: ${from}–${to}  |  Force: ${force}\n`);

  const totals: Record<DownloadResult, number> = {
    stored: 0, already_stored: 0, unavailable: 0, error: 0,
  };
  const errors: string[] = [];

  for (let r = from; r <= to; r++) {
    let round: Awaited<ReturnType<typeof getCbfRound>>;
    try {
      round = await getCbfRound(r);
    } catch {
      console.log(`  Rodada ${r.toString().padStart(2, '0')}  ✗  erro ao buscar no CBF`);
      continue;
    }

    if (round.status !== 'finished') {
      console.log(`  Rodada ${r.toString().padStart(2, '0')}  —  não finalizada, ignorada`);
      continue;
    }

    const matches = round.matches;
    console.log(`\n  Rodada ${r.toString().padStart(2, '0')} — ${matches.length} jogo(s)`);

    for (const match of matches) {
      const id    = match.idJogo ?? '?';
      const label = `${match.mandante?.nome ?? '?'} x ${match.visitante?.nome ?? '?'}`;

      const result = await downloadMatchPdfs(match, force);
      totals[result]++;
      console.log(`    ${ICONS[result]}  ${id}  ${label}  — ${LABELS[result]}`);

      if (result === 'error') errors.push(`R${r} ${id} ${label}`);

      await sleep(800);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n  ─────────────────────────────────────────────');
  console.log(`  ✓  Baixados e salvos:  ${totals.stored}`);
  console.log(`  ◎  Já no Postgres:     ${totals.already_stored}`);
  console.log(`  —  Sem PDF:            ${totals.unavailable}`);
  console.log(`  ✗  Erros:              ${totals.error}`);

  if (errors.length > 0) {
    console.log('\n  Jogos com erro:');
    for (const e of errors) console.log(`    • ${e}`);
  }

  console.log('');
  process.exit(totals.error > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
