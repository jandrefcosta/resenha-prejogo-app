/**
 * seed-past-results.ts — Pre-warm Redis with finished match history for all clubs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Past results (vitórias, derrotas, empates) are loaded lazily — only when the user
 * opens the "Resultados" tab. The first user to open that tab after a 6-hour TTL
 * expiry triggers cold API calls to CONMEBOL and API-Football simultaneously.
 *
 * This creates two classes of inconsistency:
 *  1. RACE: concurrent requests from different users all miss the cache and hit
 *     the upstream APIs in parallel, wasting quota and racing to write the same key.
 *  2. PARTIAL MISS: CONMEBOL tournament cache (shared by all clubs) may be cold
 *     while per-team finished-fixture keys (API-Football) are still warm — or vice
 *     versa — producing mismatched result sets across users.
 *
 * This script resolves both by eagerly populating:
 *   conmebol:tournament:{id}            — shared tournament cache (Libertadores, Sul-Americana)
 *   finished:{competitionId}:{teamId}   — per-team finished fixtures (API-Football)
 *
 * It covers:
 *  • CONMEBOL tournaments (Libertadores + Sul-Americana) — 1 request each
 *  • API-Football finished fixtures for Copa do Brasil per club — 1 req per club
 *  • API-Football finished fixtures for CONMEBOL comps per club — for cross-reference enrichment
 *
 * Note: CBF (Série A) past fixtures are covered by seed-cbf.ts.
 *
 * Usage:
 *   npm run seed:past-results                # warm all clubs + tournaments
 *   npm run seed:past-results -- --reset     # re-fetch even if already cached
 *   npm run seed:past-results -- --club=flamengo   # single club
 *   npm run seed:past-results -- --tournament-only # only CONMEBOL tournaments
 *
 * Requires: .env.local with UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
 *           API_FOOTBALL_KEY
 */

import { redis } from '@/lib/redisCache';
import { getFinishedFixturesByClub } from '@/lib/apiFootball';
import { getConmebolTournament, CONMEBOL_TOURNAMENT_IDS } from '@/lib/conmebolApi';
import { deletePastResults } from './lib/deleteKeys';
import { hasReset, hasFlag, getArg } from './lib/args';
import { COMPETITIONS, type Competition } from '@/data/competitions';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

const clubs = clubsData as ClubTheme[];

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  return {
    force:          hasReset(),
    clubFilter:     getArg('club'),
    tournamentOnly: hasFlag('tournament-only'),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SeedResult = 'seeded' | 'already_warm' | 'skipped' | 'error';

const ICONS: Record<SeedResult, string> = {
  seeded:       '✓',
  already_warm: '◎',
  skipped:      '—',
  error:        '✗',
};

const LABELS: Record<SeedResult, string> = {
  seeded:       'cache warm',
  already_warm: 'já em cache, ignorado',
  skipped:      'sem ID, ignorado',
  error:        'erro ao buscar na API',
};

// ─── Competitions used as past-result sources ─────────────────────────────────

// API-Football competitions that are NOT backed by CBF data or CONMEBOL:
// (CBF is handled by seed-cbf.ts; CONMEBOL is fetched tournament-wide below)
const API_FOOTBALL_ONLY_COMPS = COMPETITIONS.filter(
  (c) => c.scope === 'club' && !c.hasCbfData &&
  c.id !== 'libertadores' && c.id !== 'sul-americana',
);

// CONMEBOL competitions — we also fetch per-team from API-Football for cross-reference
const CONMEBOL_COMPS = COMPETITIONS.filter(
  (c) => c.id === 'libertadores' || c.id === 'sul-americana',
);

// ─── Seed CONMEBOL tournament-wide cache ──────────────────────────────────────

async function seedConmebolTournament(
  name: string,
  tournamentId: number,
  force: boolean,
): Promise<SeedResult> {
  const key = `conmebol:tournament:${tournamentId}`;

  if (!force) {
    const ttl = await redis.ttl(key);
    if (ttl > 0 || ttl === -1) return 'already_warm';
  }

  try {
    // Keys were already deleted in batch before this loop when force=true.
    await getConmebolTournament(tournamentId, force);
    return 'seeded';
  } catch {
    return 'error';
  }
}

// ─── Seed per-team API-Football finished fixtures ─────────────────────────────

async function seedFinishedForClub(
  club: ClubTheme,
  comp: Competition,
  force: boolean,
): Promise<SeedResult> {
  if (!club.apiFootballId) return 'skipped';

  const key = `finished:${comp.id}:${club.apiFootballId}`;

  if (!force) {
    const ttl = await redis.ttl(key);
    if (ttl > 0 || ttl === -1) return 'already_warm';
  }

  try {
    // Keys were already deleted in batch before this loop when force=true.
    await getFinishedFixturesByClub(comp, club.apiFootballId);
    return 'seeded';
  } catch {
    return 'error';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { force, clubFilter, tournamentOnly } = parseArgs();

  const targetClubs = clubs.filter(
    (c) => c.apiFootballId !== null && (!clubFilter || c.id === clubFilter),
  );

  if (clubFilter && targetClubs.length === 0) {
    console.error(`\n  ✗ Clube "${clubFilter}" não encontrado ou sem apiFootballId.\n`);
    process.exit(1);
  }

  console.log('');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║  Past-Results Redis Seed — Resenha Pré-Jogo      ║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log(`\n  Clubes:     ${clubFilter ?? `todos (${targetClubs.length})`}`);
  console.log(`  Force:      ${force}`);
  console.log(`  Torneios:   Libertadores + Sul-Americana`);
  console.log(`  Comps:      ${[...CONMEBOL_COMPS, ...API_FOOTBALL_ONLY_COMPS].map((c) => c.shortName).join(', ')}\n`);

  if (force) {
    process.stdout.write(`  Deletando chaves past-results (torneios + ${targetClubs.length} clubes) ... `);
    const deleted = await deletePastResults(clubFilter ?? undefined);
    console.log(`${deleted} chaves removidas\n`);
  }

  const counts: Record<SeedResult, number> = {
    seeded: 0, already_warm: 0, skipped: 0, error: 0,
  };
  const errors: string[] = [];

  // ── 1. CONMEBOL tournament-wide cache ────────────────────────────────────
  console.log('  [ CONMEBOL Tournaments ]\n');

  for (const [slug, tid] of Object.entries(CONMEBOL_TOURNAMENT_IDS)) {
    const label = slug.padEnd(16);
    process.stdout.write(`  ${label} (id=${tid}) ... `);

    const result = await seedConmebolTournament(slug, tid, force);
    counts[result]++;
    if (result === 'error') errors.push(`conmebol:${slug}`);

    console.log(`${ICONS[result]}  ${LABELS[result]}`);
    if (result !== 'already_warm') await sleep(800);
  }

  if (tournamentOnly) {
    printSummary(counts, errors);
    return;
  }

  // ── 2. Per-club, per-competition finished fixtures ────────────────────────
  // Covers: Copa do Brasil (API-Football only) + CONMEBOL comps (for cross-reference)
  const perClubComps = [...CONMEBOL_COMPS, ...API_FOOTBALL_ONLY_COMPS];

  console.log(`\n  [ Per-Club Finished Fixtures (${perClubComps.map((c) => c.shortName).join(', ')}) ]\n`);

  for (const club of targetClubs) {
    process.stdout.write(`  ${club.shortName.padEnd(6)} ${club.name.padEnd(28)} `);

    const clubErrors: string[] = [];
    let anySeeded = false;
    let anyWarm   = false;

    for (const comp of perClubComps) {
      const result = await seedFinishedForClub(club, comp, force);
      counts[result]++;

      if (result === 'error')        clubErrors.push(comp.shortName);
      else if (result === 'seeded')  anySeeded = true;
      else if (result === 'already_warm') anyWarm = true;

      if (result !== 'already_warm' && result !== 'skipped') await sleep(500);
    }

    if (clubErrors.length > 0) {
      errors.push(`${club.id}:${clubErrors.join(',')}`);
      console.log(`✗  erro em: ${clubErrors.join(', ')}`);
    } else if (anySeeded) {
      console.log('✓  cache warm');
    } else if (anyWarm) {
      console.log('◎  já em cache');
    } else {
      console.log('—  ignorado');
    }
  }

  printSummary(counts, errors);
}

function printSummary(counts: Record<SeedResult, number>, errors: string[]) {
  console.log('\n  ─────────────────────────────────────────────────────');
  console.log(`  ${counts.seeded} aquecidos`);
  console.log(`  ${counts.already_warm} já em cache (ignorados)`);
  console.log(`  ${counts.skipped} sem ID (ignorados)`);
  console.log(`  ${counts.error} erros${errors.length ? ` (${errors.slice(0, 5).join(', ')}${errors.length > 5 ? '...' : ''})` : ''}`);
  console.log('  ─────────────────────────────────────────────────────\n');

  if (errors.length > 0) {
    console.log('  ⚠  Tente novamente com: npm run seed:past-results -- --reset\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  Erro fatal:', err);
  process.exit(1);
});
