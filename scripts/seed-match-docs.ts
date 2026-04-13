/**
 * seed-match-docs.ts — Populate Redis with parsed CBF PDF data for all finished matches.
 *
 * For each finished round:
 *   1. Fetches the round from CBF API (via cache)
 *   2. For each match in that round, calls processMatchDocuments
 *      → downloads súmula + boletim PDFs → parses → stores in Redis permanently
 *
 * Skips matches that already have valid cached docs (unless --reset is passed).
 * Matches without published PDFs get a "unavailable" sentinel (2h TTL) so the
 * app won't hammer CBF for documents that don't exist yet.
 *
 * Usage:
 *   npm run seed:match-docs                    # process all finished rounds (1–38)
 *   npm run seed:match-docs -- --rounds=5      # up to round 5
 *   npm run seed:match-docs -- --round=3       # only round 3
 *   npm run seed:match-docs -- --reset         # clear cache first, re-parse everything
 *
 * Requires: .env.local with UPSTASH_REDIS_* vars
 */

import { redis } from '@/lib/redisCache';
import { getCbfRound } from '@/lib/cbfApi';
import { processMatchDocuments } from '@/lib/cbfDocParser';
import { deleteAll } from './lib/deleteKeys';
import { hasReset, getArg } from './lib/args';
import type { CbfRoundData, CbfMatchDetail } from '@/lib/types';

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

type MatchResult = 'seeded' | 'already_seeded' | 'unavailable' | 'error';

const ICONS: Record<MatchResult, string> = {
  seeded:         '✓',
  already_seeded: '◎',
  unavailable:    '—',
  error:          '✗',
};

const LABELS: Record<MatchResult, string> = {
  seeded:         'parseado e salvo',
  already_seeded: 'já em cache, ignorado',
  unavailable:    'PDF não publicado ainda',
  error:          'erro ao processar',
};

// ─── Core ─────────────────────────────────────────────────────────────────────

async function processMatch(match: CbfMatchDetail, force: boolean): Promise<MatchResult> {
  const id = match.idJogo;
  if (!id) return 'error';

  if (!force) {
    // Fast check: if sumula or boletim already cached, skip
    const [sumula, boletim] = await Promise.all([
      redis.exists(`cbf:match:${id}:sumula`),
      redis.exists(`cbf:match:${id}:boletim`),
    ]);
    if (sumula || boletim) return 'already_seeded';
  }

  try {
    const result = await processMatchDocuments(match);
    if (!result.available) return 'unavailable';
    return 'seeded';
  } catch {
    return 'error';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { from, to, force } = parseArgs();

  console.log('');
  console.log('  ╔════════════════════════════════════════════╗');
  console.log('  ║  CBF Match Docs Seed — Resenha Pré-Jogo   ║');
  console.log('  ╚════════════════════════════════════════════╝');
  console.log(`\n  Rodadas: ${from}–${to}  |  Force: ${force}\n`);

  if (force) {
    // Collect all match-docs keys to delete via CBF round data
    const allKeys: string[] = [];
    for (let r = from; r <= to; r++) {
      let round: CbfRoundData;
      try { round = await getCbfRound(r); } catch { continue; }
      if (round.status !== 'finished') continue;
      for (const match of round.matches) {
        if (!match.idJogo) continue;
        allKeys.push(
          `cbf:match:${match.idJogo}:docs:status`,
          `cbf:match:${match.idJogo}:sumula`,
          `cbf:match:${match.idJogo}:boletim`,
        );
      }
    }
    if (allKeys.length > 0) {
      process.stdout.write(`  Deletando ${allKeys.length} chaves de match-docs ... `);
      await deleteAll(allKeys);
      console.log('pronto\n');
    }
  }

  const totals: Record<MatchResult, number> = {
    seeded: 0, already_seeded: 0, unavailable: 0, error: 0,
  };
  const errors: string[] = [];

  for (let r = from; r <= to; r++) {
    let round: CbfRoundData;
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
      const id = match.idJogo ?? '?';
      const label = `${match.mandante?.nome ?? '?'} x ${match.visitante?.nome ?? '?'}`;

      const result = await processMatch(match, force);
      totals[result]++;
      console.log(`    ${ICONS[result]}  ${id}  ${label}  — ${LABELS[result]}`);

      if (result === 'error') errors.push(`R${r} ${id} ${label}`);

      // Throttle: 1 match at a time, small pause to avoid hammering CBF/Upstash
      await sleep(800);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n  ─────────────────────────────────────────────');
  console.log(`  ✓  Parseados:      ${totals.seeded}`);
  console.log(`  ◎  Já em cache:    ${totals.already_seeded}`);
  console.log(`  —  Sem PDF:        ${totals.unavailable}`);
  console.log(`  ✗  Erros:          ${totals.error}`);

  if (errors.length > 0) {
    console.log('\n  Jogos com erro:');
    for (const e of errors) console.log(`    • ${e}`);
  }

  console.log('');
  process.exit(totals.error > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
