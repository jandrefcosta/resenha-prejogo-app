/**
 * seed-cbf.ts — Populate Redis with CBF round data for finished rounds.
 *
 * Finished rounds are immutable — their Redis stale key is stored with no TTL
 * so they survive cache misses and CBF API outages.
 *
 * Usage:
 *   npm run seed:cbf                   # seeds rounds 1–38
 *   npm run seed:cbf -- --rounds=15    # seeds rounds 1–15
 *   npm run seed:cbf -- --round=10     # seeds only round 10
 *   npm run seed:cbf -- --reset        # re-fetch even rounds already seeded
 *
 * Requires: .env.local with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 *           Node ≥ 20.6 (--env-file flag) or vars already in environment
 */

import { redis } from '@/lib/redisCache';
import { getCbfRound } from '@/lib/cbfApi';
import { deleteCbfRounds } from './lib/deleteKeys';
import { hasReset, getArg } from './lib/args';
import type { CbfRoundData } from '@/lib/types';

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

function pad(n: number) {
  return String(n).padStart(2, '0');
}

type SeedResult = 'seeded' | 'already_seeded' | 'not_finished' | 'error';

const ICONS: Record<SeedResult, string> = {
  seeded:         '✓',
  already_seeded: '◎',
  not_finished:   '—',
  error:          '✗',
};

const LABELS: Record<SeedResult, string> = {
  seeded:         'seeded (permanent)',
  already_seeded: 'já permanente, ignorada',
  not_finished:   'não finalizada, ignorada',
  error:          'erro ao buscar no CBF',
};

// ─── Core ─────────────────────────────────────────────────────────────────────

async function seedRound(round: number, force: boolean): Promise<SeedResult> {
  const staleKey = `cbf:round:${round}:stale`;

  if (!force) {
    // Check if already permanently seeded (TTL = -1 means no expiry)
    const [existing, ttl] = await Promise.all([
      redis.get<CbfRoundData>(staleKey),
      redis.ttl(staleKey),
    ]);
    if (existing?.status === 'finished' && ttl === -1) {
      return 'already_seeded';
    }
  }

  let data: CbfRoundData;
  try {
    // force=true bypasses the in-library cache check; keys were already deleted above
    data = await getCbfRound(round, /* force= */ true);
  } catch {
    return 'error';
  }

  if (data.status !== 'finished') {
    return 'not_finished';
  }

  // getCbfRound already wrote primary + stale as permanent for finished rounds.
  return 'seeded';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { from, to, force } = parseArgs();

  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   CBF Redis Seed — Resenha Pré-Jogo ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log(`\n  Rodadas: ${from}–${to}  |  Force: ${force}\n`);

  if (force) {
    process.stdout.write(`  Deletando chaves cbf:round:${from}–${to} (primary + stale) ... `);
    const deleted = await deleteCbfRounds(from, to);
    console.log(`${deleted} chaves removidas\n`);
  }

  const counts: Record<SeedResult, number> = {
    seeded: 0,
    already_seeded: 0,
    not_finished: 0,
    error: 0,
  };

  const errors: number[] = [];

  for (let round = from; round <= to; round++) {
    process.stdout.write(`  Rodada ${pad(round)}/${pad(to)} ... `);

    const result = await seedRound(round, force);
    counts[result]++;
    if (result === 'error') errors.push(round);

    console.log(`${ICONS[result]}  ${LABELS[result]}`);

    // Throttle: be polite to both CBF and Upstash APIs
    if (result !== 'already_seeded') await sleep(600);
  }

  console.log('\n  ─────────────────────────────────────────');
  console.log(`  ${counts.seeded} seeded`);
  console.log(`  ${counts.already_seeded} já permanentes (ignoradas)`);
  console.log(`  ${counts.not_finished} não finalizadas (ignoradas)`);
  console.log(`  ${counts.error} erros${errors.length ? ` (rodadas: ${errors.join(', ')})` : ''}`);
  console.log('  ─────────────────────────────────────────\n');

  if (errors.length > 0) {
    console.log(`  ⚠  Tente novamente com: npm run seed:cbf -- --round=N\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  Erro fatal:', err);
  process.exit(1);
});
