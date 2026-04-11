/**
 * seed-form.ts — Pre-warm Redis with team form (last 5 results) for all clubs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Team form is shown in two places:
 *   1. FormStrip inside each upcoming MatchCard (via /api/previews)
 *   2. H2H modal "Forma na temporada" section (via /api/h2h)
 *
 * Both ultimately call getTeamForm(teamId, season, leagueId=71), which writes
 * to the key `form:{teamId}:71:{season}` with a 6-hour TTL.
 *
 * If this key is missing when a request arrives (cold start or expired), the
 * API-Football /teams/statistics endpoint is called on-demand. A transient
 * error on that call previously caused an empty string to be cached for 6h,
 * making form appear blank for all users during that window.
 *
 * This script pre-populates all form keys so every user gets a cache hit.
 * Run it every ~5 hours alongside seed:fixtures.
 *
 * Cache key written per club:
 *   form:{apiFootballId}:71:{season}   — 6-hour TTL (via getTeamForm)
 *
 * Usage:
 *   npm run seed:form                  # seed all clubs
 *   npm run seed:form -- --reset       # re-fetch even if already cached
 *   npm run seed:form -- --club=131    # single club by apiFootballId
 *
 * Requires: .env.local with UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
 *           API_FOOTBALL_KEY
 */

import { redis } from '@/lib/redisCache';
import { getTeamForm } from '@/lib/teamForm';
import { deleteForm } from './lib/deleteKeys';
import { hasReset, getArg } from './lib/args';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

const clubs = clubsData as ClubTheme[];

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const clubRaw = getArg('club');
  return {
    force:  hasReset(),
    clubId: clubRaw ? Number(clubRaw) : null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SeedResult = 'seeded' | 'already_warm' | 'empty' | 'skipped' | 'error';

const ICONS: Record<SeedResult, string> = {
  seeded:       '✓',
  already_warm: '◎',
  empty:        '⚠',
  skipped:      '—',
  error:        '✗',
};

const LABELS: Record<SeedResult, string> = {
  seeded:       'cache warm (6 h TTL)',
  already_warm: 'já em cache, ignorado',
  empty:        'API retornou vazio (temporada não iniciada?)',
  skipped:      'sem apiFootballId, ignorado',
  error:        'erro ao buscar na API',
};

// ─── Core ─────────────────────────────────────────────────────────────────────

async function seedClubForm(
  club: ClubTheme,
  season: number,
  force: boolean,
): Promise<SeedResult> {
  if (!club.apiFootballId) return 'skipped';

  const key = `form:${club.apiFootballId}:71:${season}`;

  if (!force) {
    const ttl = await redis.ttl(key);
    if (ttl > 0 || ttl === -1) return 'already_warm';
  }

  try {
    // Key was already deleted in batch before this loop when force=true.
    const raw = await getTeamForm(club.apiFootballId, season, 71);
    return raw ? 'seeded' : 'empty';
  } catch {
    return 'error';
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { force, clubId } = parseArgs();
  const season = new Date().getFullYear();

  const targets = clubs.filter(
    (c) => c.apiFootballId !== null && (!clubId || c.apiFootballId === clubId),
  );

  if (clubId && targets.length === 0) {
    console.error(`\n  ✗ Clube com apiFootballId=${clubId} não encontrado.\n`);
    process.exit(1);
  }

  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   Form Redis Seed — Resenha Pré-Jogo    ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log(`\n  Clubes:     ${clubId ? `apiFootballId=${clubId}` : `todos (${targets.length})`}`);
  console.log(`  Temporada:  ${season}`);
  console.log(`  Liga:       Série A (leagueId=71)`);
  console.log(`  Force:      ${force}\n`);

  if (force) {
    process.stdout.write(`  Deletando chaves form (${targets.length} clubes) ... `);
    const deleted = await deleteForm(clubId ?? undefined);
    console.log(`${deleted} chaves removidas\n`);
  }

  const counts: Record<SeedResult, number> = {
    seeded: 0, already_warm: 0, empty: 0, skipped: 0, error: 0,
  };
  const errors: string[] = [];

  for (const club of targets) {
    const label = `${club.shortName.padEnd(6)} ${club.name.padEnd(30)}`;
    process.stdout.write(`  ${label} ... `);

    const result = await seedClubForm(club, season, force);
    counts[result]++;
    if (result === 'error') errors.push(`${club.id} (id=${club.apiFootballId})`);

    console.log(`${ICONS[result]}  ${LABELS[result]}`);

    // Throttle — API-Football rate limit: 100 req/day on free tier
    if (result !== 'already_warm' && result !== 'skipped') await sleep(700);
  }

  console.log('\n  ─────────────────────────────────────────────');
  console.log(`  ${counts.seeded} aquecidos`);
  console.log(`  ${counts.already_warm} já em cache (ignorados)`);
  console.log(`  ${counts.empty} sem dados de forma (API vazia)`);
  console.log(`  ${counts.skipped} sem apiFootballId (ignorados)`);
  console.log(`  ${counts.error} erros${errors.length ? ` (${errors.slice(0, 5).join(', ')}${errors.length > 5 ? '...' : ''})` : ''}`);
  console.log('  ─────────────────────────────────────────────\n');

  if (errors.length > 0) {
    console.log('  ⚠  Tente novamente com: npm run seed:form -- --reset\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n  Erro fatal:', err);
  process.exit(1);
});
