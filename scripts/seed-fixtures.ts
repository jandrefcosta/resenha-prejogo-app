/**
 * seed-fixtures.ts — Pre-warm Redis with upcoming fixtures for all club competitions.
 *
 * WHY THIS EXISTS
 * ---------------
 * The app fetches fixtures on-demand: the first user to visit after the 6-hour TTL
 * expires triggers a cold API call. During that window, concurrent requests hit
 * API-Football in parallel, burning quota and causing inconsistent responses across
 * users (some see data, others see a loading skeleton or an error).
 *
 * This script pre-populates the Redis keys for all club competitions so every user
 * gets a warm cache hit.
 *
 * Cache keys written (one per competition):
 *   fixtures:{competitionId}:{season}   — 6-hour TTL (via getFixturesByClub)
 *
 * Usage:
 *   npm run seed:fixtures                  # warm all 4 club competitions
 *   npm run seed:fixtures -- --reset       # re-fetch even if already cached
 *   npm run seed:fixtures -- --comp=serie-a   # single competition
 *
 * Requires: .env.local with UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
 *           and API_FOOTBALL_KEY
 */

import { redis, setCache, TTL_6H } from '@/lib/redisCache';
import { deleteFixtures } from './lib/deleteKeys';
import { hasReset, getArg } from './lib/args';
import { COMPETITIONS, type Competition } from '@/data/competitions';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  return {
    force: hasReset(),
    comp:  getArg('comp'),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SeedResult = 'seeded' | 'already_warm' | 'error';

const ICONS: Record<SeedResult, string> = {
  seeded:       '✓',
  already_warm: '◎',
  error:        '✗',
};

const LABELS: Record<SeedResult, string> = {
  seeded:       'cache warm (6 h TTL)',
  already_warm: 'já em cache, ignorado',
  error:        'erro ao buscar na API',
};

// ─── Core ─────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://v3.football.api-sports.io';

/**
 * Fetches upcoming fixtures directly from API-Football and writes to Redis.
 * Does NOT use unstable_cache (Next.js-only) — safe to call from tsx scripts.
 */
async function fetchAndCache(comp: Competition): Promise<void> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY not set');

  const today = new Date();
  const to = new Date(today);
  to.setDate(to.getDate() + 90);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const url = new URL(`${BASE_URL}/fixtures`);
  url.searchParams.set('league', String(comp.apiFootballLeagueId));
  url.searchParams.set('season', String(comp.season));
  url.searchParams.set('from', fmt(today));
  url.searchParams.set('to', fmt(to));

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': key },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const hasErrors = Array.isArray(data.errors)
    ? data.errors.length > 0
    : Object.keys(data.errors ?? {}).length > 0;
  if (hasErrors) throw new Error(`API error: ${JSON.stringify(data.errors)}`);

  const fixtures = (data.response ?? []).filter(
    (f: { fixture: { status: { short: string } } }) =>
      f.fixture.status.short === 'NS' || f.fixture.status.short === 'PST',
  );

  await setCache(`fixtures:${comp.id}:${comp.season}`, fixtures, TTL_6H);
}

async function seedCompetition(
  comp: Competition,
  force: boolean,
): Promise<SeedResult> {
  const cacheKey = `fixtures:${comp.id}:${comp.season}`;

  if (!force) {
    const ttl = await redis.ttl(cacheKey);
    if (ttl > 0 || ttl === -1) return 'already_warm';
  }

  try {
    await fetchAndCache(comp);
    return 'seeded';
  } catch {
    return 'error';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { force, comp: compFilter } = parseArgs();

  const targets = COMPETITIONS.filter(
    (c) => c.scope === 'club' && (!compFilter || c.id === compFilter),
  );

  if (targets.length === 0) {
    console.error(`\n  ✗ Nenhuma competição encontrada${compFilter ? ` para "--comp=${compFilter}"` : ''}.\n`);
    process.exit(1);
  }

  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║  Fixtures Redis Seed — Resenha Pré-Jogo ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log(`\n  Competições: ${targets.map((c) => c.id).join(', ')}`);
  console.log(`  Temporada:   ${targets[0].season}`);
  console.log(`  Force:       ${force}\n`);

  if (force) {
    process.stdout.write(`  Deletando chaves fixtures (${targets.length} competições) ... `);
    const deleted = await deleteFixtures(compFilter);
    console.log(`${deleted} chaves removidas\n`);
  }

  const counts: Record<SeedResult, number> = { seeded: 0, already_warm: 0, error: 0 };
  const errors: string[] = [];

  for (const comp of targets) {
    process.stdout.write(`  ${comp.shortName.padEnd(20)} ... `);

    const result = await seedCompetition(comp, force);
    counts[result]++;
    if (result === 'error') errors.push(comp.id);

    console.log(`${ICONS[result]}  ${LABELS[result]}`);

    // Throttle — be polite to API-Football (rate limit: 100 req/day on free plan)
    if (result !== 'already_warm') await sleep(800);
  }

  console.log('\n  ─────────────────────────────────────────────');
  console.log(`  ${counts.seeded} aquecidos`);
  console.log(`  ${counts.already_warm} já em cache (ignorados)`);
  console.log(`  ${counts.error} erros${errors.length ? ` (${errors.join(', ')})` : ''}`);
  console.log('  ─────────────────────────────────────────────\n');

  if (errors.length > 0) {
    console.log(`  ⚠  Tente novamente com: npm run seed:fixtures -- --comp=COMP_ID\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  Erro fatal:', err);
  process.exit(1);
});
