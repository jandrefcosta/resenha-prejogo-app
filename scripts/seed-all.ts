/**
 * seed-all.ts — Orchestrates the full cache warm-up sequence.
 *
 * WHY THIS EXISTS
 * ---------------
 * Cache inconsistency root cause:
 *   All data fetching is on-demand with TTL-based expiry. After a cache miss,
 *   the first user request triggers a cold API call. Concurrent users during
 *   that window either see stale/empty data (if they hit before the write
 *   completes) or trigger redundant upstream requests (wasting quota).
 *
 * This script eliminates the cold-start window by running all seed scripts
 * in the optimal order before any user traffic reaches the app:
 *
 *   Step 1 — CBF rounds (finished, permanent TTL)
 *     Populates cbf:round:{N} and cbf:round:{N}:stale keys.
 *     These are permanent — run once at season start, re-run with --reset for corrections.
 *
 *   Step 2 — Upcoming fixtures (6-hour TTL)
 *     Populates fixtures:{competitionId}:{season} keys.
 *     Schedule every ~5 hours in CI/CD or a cron job.
 *
 *   Step 3 — Past results / match history (6-hour TTL)
 *     Populates conmebol:tournament:{id} and finished:{comp}:{teamId} keys.
 *     Schedule every ~5 hours alongside fixtures.
 *
 * Usage:
 *   npm run seed:all                  # full warm-up
 *   npm run seed:all -- --reset       # re-fetch everything
 *   npm run seed:all -- --skip-cbf    # skip CBF rounds (already seeded)
 *   npm run seed:all -- --skip-past   # skip past results
 *   npm run seed:all -- --skip-fixtures  # skip upcoming fixtures
 *   npm run seed:all -- --rounds=10   # limit CBF to rounds 1–10
 *
 * Exit code 0 = all steps succeeded or were already warm.
 * Exit code 1 = at least one step had errors (partial seed).
 *
 * Requires: .env.local with UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
 *           API_FOOTBALL_KEY
 */

import { execSync } from 'child_process';
import { hasFlag, hasReset, getArg } from './lib/args';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  return {
    force:        hasReset(),
    skipCbf:      hasFlag('skip-cbf'),
    skipFixtures: hasFlag('skip-fixtures'),
    skipForm:     hasFlag('skip-form'),
    skipPast:     hasFlag('skip-past'),
    rounds:       getArg('rounds'),
    cbfRound:     getArg('round'),
  };
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function run(label: string, cmd: string): boolean {
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  ▶  ${label}`);
  console.log(`${'─'.repeat(58)}\n`);

  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    console.error(`\n  ✗  ${label} falhou.\n`);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { force, skipCbf, skipFixtures, skipForm, skipPast, rounds, cbfRound } = parseArgs();

  const forceFlag   = force ? ' -- --reset' : '';
  const tsxEnv      = 'tsx --env-file=.env.local';

  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║   Full Cache Seed — Resenha Pré-Jogo                ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Sequência de aquecimento:');
  console.log(`    ${skipCbf      ? '[ skip ]' : '[  run ]'}  1. CBF rounds (Brasileirão — permanente)`);
  console.log(`    ${skipFixtures ? '[ skip ]' : '[  run ]'}  2. Upcoming fixtures (TTL 6h)`);
  console.log(`    ${skipForm     ? '[ skip ]' : '[  run ]'}  3. Team form / forma na temporada (TTL 6h)`);
  console.log(`    ${skipPast     ? '[ skip ]' : '[  run ]'}  4. Past results / histórico W-D-L (TTL 6h)`);
  console.log(`\n  Force: ${force}\n`);

  const results: { label: string; ok: boolean }[] = [];

  // ── Step 1: CBF rounds ───────────────────────────────────────────────────
  if (!skipCbf) {
    let cbfArgs = '';
    if (cbfRound)  cbfArgs += ` -- --round=${cbfRound}`;
    else if (rounds) cbfArgs += ` -- --rounds=${rounds}`;
    if (force)     cbfArgs = cbfArgs ? cbfArgs + ' --reset' : ' -- --reset';

    const ok = run(
      'CBF rounds (seed-cbf)',
      `${tsxEnv} scripts/seed-cbf.ts${cbfArgs}`,
    );
    results.push({ label: 'CBF rounds', ok });
  }

  // ── Step 2: Upcoming fixtures ────────────────────────────────────────────
  if (!skipFixtures) {
    const ok = run(
      'Upcoming fixtures (seed-fixtures)',
      `${tsxEnv} scripts/seed-fixtures.ts${forceFlag}`,
    );
    results.push({ label: 'Upcoming fixtures', ok });
  }

  // ── Step 3: Team form ────────────────────────────────────────────────────
  // Must run after fixtures so the season is confirmed active.
  // Fixes the bug where an API error cached an empty string for 6h,
  // hiding form data for all users during that window.
  if (!skipForm) {
    const ok = run(
      'Team form / forma na temporada (seed-form)',
      `${tsxEnv} scripts/seed-form.ts${forceFlag}`,
    );
    results.push({ label: 'Team form', ok });
  }

  // ── Step 4: Past results ─────────────────────────────────────────────────
  if (!skipPast) {
    const ok = run(
      'Past results / histórico (seed-past-results)',
      `${tsxEnv} scripts/seed-past-results.ts${forceFlag}`,
    );
    results.push({ label: 'Past results', ok });
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);

  console.log(`\n${'═'.repeat(58)}`);
  console.log('  RESUMO');
  console.log(`${'═'.repeat(58)}\n`);

  for (const { label, ok } of results) {
    console.log(`  ${ok ? '✓' : '✗'}  ${label}`);
  }

  console.log('');

  if (failed.length > 0) {
    console.log(`  ⚠  ${failed.length} etapa(s) com erro: ${failed.map((r) => r.label).join(', ')}`);
    console.log('     Execute novamente com --reset para tentar corrigir.\n');
    process.exit(1);
  }

  console.log('  Cache totalmente aquecido. Sem cold-starts para os usuários.\n');
  process.exit(0);
}

main();
