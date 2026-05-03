/**
 * migrate-redis-to-pg.ts — Migra dados persistentes do Redis para o PostgreSQL.
 *
 * Executa na ordem que respeita as FK constraints:
 *  1. users  2. boloes  3. bolao_members
 *  4. palpites  5. scores  6. bolao_rankings  7. global_rankings
 *  8. posts  9. post_likes  10. follows  11. suggestions
 *
 * Todos os inserts usam onConflictDoNothing() — idempotente, pode rodar N vezes.
 *
 * Usage:
 *   npx tsx scripts/migrate-redis-to-pg.ts
 *   npx tsx scripts/migrate-redis-to-pg.ts --only=users,boloes
 *   npx tsx scripts/migrate-redis-to-pg.ts --dry-run   # apenas conta, não insere
 *
 * Requires: DATABASE_URL + UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 */

import 'dotenv/config';
import { db } from '@/lib/db';
import {
  users, boloes, bolaoMembers, palpites, scores,
  bolaoRankings, globalRankings, posts, postLikes, follows, suggestions,
} from '@/lib/db/schema';
import { redis } from '@/lib/redisCache';
import type { UserRecord } from '@/lib/userIdentity';
import type { BolaoMeta, Palpite, Score } from '@/lib/bolaoRedis';
import type { Post } from '@/lib/socialRedis';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const dryRun     = args.includes('--dry-run');
const onlyArg    = args.find(a => a.startsWith('--only='))?.split('=')[1];
const onlyTables = onlyArg ? new Set(onlyArg.split(',')) : null;
const skip       = (name: string) => onlyTables !== null && !onlyTables.has(name);

function log(msg: string) { console.log(msg); }

// ─── SCAN helper (Upstash paginado) ──────────────────────────────────────────

async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
    keys.push(...(batch as string[]));
    cursor = Number(next);
  } while (cursor !== 0);
  return keys;
}

// ─── 1. Usuários ──────────────────────────────────────────────────────────────

async function migrateUsers() {
  if (skip('users')) return;
  log('\n── 1. users ──');
  const keys = await scanKeys('user:*');
  const userKeys = keys.filter(k => /^user:[^:]+$/.test(k));
  log(`  Encontrados ${userKeys.length} registros no Redis`);
  if (dryRun || userKeys.length === 0) return;

  let inserted = 0;
  // Processar em lotes de 50
  for (let i = 0; i < userKeys.length; i += 50) {
    const batch = userKeys.slice(i, i + 50);
    const records = await redis.mget<(UserRecord | null)[]>(...batch);

    const rows = batch
      .map((key, idx) => {
        const r = records[idx];
        if (!r) return null;
        const id = key.replace('user:', '');
        return {
          id,
          email:        r.email,
          emailHash:    r.emailHash,
          username:     r.username ?? null,
          displayName:  r.displayName ?? null,
          bio:          r.bio ?? null,
          clubId:       r.clubId ?? null,
          passwordHash: r.passwordHash ?? null,
          ip:           r.ip,
          createdAt:    new Date(r.createdAt),
          lastSeen:     new Date(r.lastSeen),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      await db.insert(users).values(rows).onConflictDoNothing();
      inserted += rows.length;
    }
  }
  log(`  ✓ ${inserted} usuários inseridos`);
}

// ─── 2. Bolões ────────────────────────────────────────────────────────────────

async function migrateBoloes() {
  if (skip('boloes')) return;
  log('\n── 2. boloes ──');
  const keys = await scanKeys('bolao:*:meta');
  log(`  Encontrados ${keys.length} bolões no Redis`);
  if (dryRun || keys.length === 0) return;

  let inserted = 0;
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const records = await redis.mget<(BolaoMeta | null)[]>(...batch);

    const rows = records
      .filter((r): r is BolaoMeta => r !== null)
      .map(r => ({
        id:        r.id,
        adminId:   r.adminId,
        nome:      r.nome,
        codigo:    r.codigo,
        createdAt: new Date(r.criadoEm),
      }));

    if (rows.length > 0) {
      await db.insert(boloes).values(rows).onConflictDoNothing();
      inserted += rows.length;
    }
  }
  log(`  ✓ ${inserted} bolões inseridos`);
}

// ─── 3. Membros de bolão ──────────────────────────────────────────────────────

async function migrateBolaoMembers() {
  if (skip('bolao_members')) return;
  log('\n── 3. bolao_members ──');
  const memberKeys = await scanKeys('bolao:*:members');
  log(`  Encontrados ${memberKeys.length} sets de membros`);
  if (dryRun || memberKeys.length === 0) return;

  let inserted = 0;
  for (const key of memberKeys) {
    const bolaoId = key.replace('bolao:', '').replace(':members', '');
    const memberIds = await redis.smembers<string[]>(key);
    if (memberIds.length === 0) continue;

    const rows = memberIds.map(userId => ({ bolaoId, userId, joinedAt: new Date() }));
    await db.insert(bolaoMembers).values(rows).onConflictDoNothing();
    inserted += rows.length;
  }
  log(`  ✓ ${inserted} membros inseridos`);
}

// ─── 4. Palpites ──────────────────────────────────────────────────────────────

async function migratePalpites() {
  if (skip('palpites')) return;
  log('\n── 4. palpites ──');
  // Iteramos por usuário usando o índice palpite:user:{userId}:fixtures
  const indexKeys = await scanKeys('palpite:user:*:fixtures');
  log(`  Encontrados ${indexKeys.length} usuários com palpites`);
  if (dryRun || indexKeys.length === 0) return;

  let inserted = 0;
  for (const indexKey of indexKeys) {
    const userId    = indexKey.replace('palpite:user:', '').replace(':fixtures', '');
    const fixtureIds = await redis.smembers<string[]>(indexKey);
    if (fixtureIds.length === 0) continue;

    const palpiteKeys = fixtureIds.map(fid => `palpite:${userId}:${fid}`);
    for (let i = 0; i < palpiteKeys.length; i += 100) {
      const batchKeys  = palpiteKeys.slice(i, i + 100);
      const batchFids  = fixtureIds.slice(i, i + 100);
      const records = await redis.mget<(Palpite | null)[]>(...batchKeys);

      const rows = batchFids
        .map((fixtureId, idx) => {
          const p = records[idx];
          if (!p) return null;
          return {
            userId,
            fixtureId,
            homeGoals: p.home,
            awayGoals: p.away,
            locked:    p.locked,
            createdAt: new Date(p.ts),
            updatedAt: new Date(p.ts),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        await db.insert(palpites).values(rows).onConflictDoNothing();
        inserted += rows.length;
      }
    }
  }
  log(`  ✓ ${inserted} palpites inseridos`);
}

// ─── 5. Scores ────────────────────────────────────────────────────────────────

async function migrateScores() {
  if (skip('scores')) return;
  log('\n── 5. scores ──');
  const keys = await scanKeys('score:*');
  const scoreKeys = keys.filter(k => /^score:[^:]+:[^:]+$/.test(k));
  log(`  Encontrados ${scoreKeys.length} scores no Redis`);
  if (dryRun || scoreKeys.length === 0) return;

  let inserted = 0;
  for (let i = 0; i < scoreKeys.length; i += 100) {
    const batch = scoreKeys.slice(i, i + 100);
    const records = await redis.mget<(Score | null)[]>(...batch);

    const rows = batch
      .map((key, idx) => {
        const s = records[idx];
        if (!s) return null;
        const parts     = key.replace('score:', '').split(':');
        const fixtureId = parts.pop()!;
        const userId    = parts.join(':');
        return { userId, fixtureId, points: s.pts, outcome: s.outcome };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      await db.insert(scores).values(rows).onConflictDoNothing();
      inserted += rows.length;
    }
  }
  log(`  ✓ ${inserted} scores inseridos`);
}

// ─── 6. Rankings por bolão ────────────────────────────────────────────────────

async function migrateBolaoRankings() {
  if (skip('bolao_rankings')) return;
  log('\n── 6. bolao_rankings ──');
  const rankingKeys = await scanKeys('bolao:*:ranking');
  const validKeys   = rankingKeys.filter(k =>
    /^bolao:[^:]+:ranking$/.test(k) && k !== 'bolao:global:ranking',
  );
  log(`  Encontrados ${validKeys.length} rankings de bolão`);
  if (dryRun || validKeys.length === 0) return;

  let inserted = 0;
  for (const key of validKeys) {
    const bolaoId = key.replace('bolao:', '').replace(':ranking', '');
    const flat    = (await redis.zrange(key, 0, -1, { rev: true, withScores: true })) as (string | number)[];
    const rows: { bolaoId: string; userId: string; totalPoints: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      rows.push({ bolaoId, userId: flat[i] as string, totalPoints: flat[i + 1] as number });
    }
    if (rows.length > 0) {
      await db.insert(bolaoRankings).values(rows).onConflictDoNothing();
      inserted += rows.length;
    }
  }
  log(`  ✓ ${inserted} entradas de ranking inseridas`);
}

// ─── 7. Ranking global ────────────────────────────────────────────────────────

async function migrateGlobalRankings() {
  if (skip('global_rankings')) return;
  log('\n── 7. global_rankings ──');
  const flat = (await redis.zrange('bolao:global:ranking', 0, -1, { rev: true, withScores: true })) as (string | number)[];
  log(`  Encontradas ${flat.length / 2} entradas no ranking global`);
  if (dryRun || flat.length === 0) return;

  const rows: { userId: string; totalPoints: number }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    rows.push({ userId: flat[i] as string, totalPoints: flat[i + 1] as number });
  }

  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(globalRankings).values(rows.slice(i, i + 100)).onConflictDoNothing();
  }
  log(`  ✓ ${rows.length} entradas inseridas`);
}

// ─── 8. Posts ─────────────────────────────────────────────────────────────────

async function migratePosts() {
  if (skip('posts')) return;
  log('\n── 8. posts ──');
  const keys = await scanKeys('post:*');
  const postKeys = keys.filter(k => /^post:[^:]+$/.test(k));
  log(`  Encontrados ${postKeys.length} posts no Redis`);
  if (dryRun || postKeys.length === 0) return;

  let inserted = 0;
  for (let i = 0; i < postKeys.length; i += 50) {
    const batch   = postKeys.slice(i, i + 50);
    const records = await redis.mget<(Post | null)[]>(...batch);

    const rows = records
      .filter((r): r is Post => r !== null)
      .map(r => ({
        id:        r.id,
        authorId:  r.authorId,
        clubId:    r.clubId,
        content:   r.content,
        likeCount: r.likeCount ?? 0,
        createdAt: new Date(r.createdAt),
      }));

    if (rows.length > 0) {
      await db.insert(posts).values(rows).onConflictDoNothing();
      inserted += rows.length;
    }
  }
  log(`  ✓ ${inserted} posts inseridos`);
}

// ─── 9. Post likes ────────────────────────────────────────────────────────────

async function migratePostLikes() {
  if (skip('post_likes')) return;
  log('\n── 9. post_likes ──');
  const keys     = await scanKeys('post:likes:*');
  log(`  Encontrados ${keys.length} sets de likes`);
  if (dryRun || keys.length === 0) return;

  let inserted = 0;
  let skipped = 0;
  for (const key of keys) {
    const postId  = key.replace('post:likes:', '');
    const userIds = await redis.smembers<string[]>(key);
    if (userIds.length === 0) continue;

    const rows = userIds.map(userId => ({ postId, userId }));
    try {
      await db.insert(postLikes).values(rows).onConflictDoNothing();
      inserted += rows.length;
    } catch (e: unknown) {
      // FK violation — post was deleted but likes set remained (orphaned)
      if ((e as { cause?: { code?: string } }).cause?.code === '23503') {
        skipped += rows.length;
      } else {
        throw e;
      }
    }
  }
  log(`  ✓ ${inserted} likes inseridos${skipped > 0 ? `, ${skipped} órfãos ignorados` : ''}`);
}

// ─── 10. Follows ──────────────────────────────────────────────────────────────

async function migrateFollows() {
  if (skip('follows')) return;
  log('\n── 10. follows ──');
  const keys = await scanKeys('following:*');
  log(`  Encontrados ${keys.length} sets de following`);
  if (dryRun || keys.length === 0) return;

  let inserted = 0;
  for (const key of keys) {
    const followerId  = key.replace('following:', '');
    const followingIds = await redis.smembers<string[]>(key);
    if (followingIds.length === 0) continue;

    const rows = followingIds.map(followingId => ({ followerId, followingId }));
    await db.insert(follows).values(rows).onConflictDoNothing();
    inserted += rows.length;
  }
  log(`  ✓ ${inserted} follows inseridos`);
}

// ─── 11. Sugestões ────────────────────────────────────────────────────────────

async function migrateSuggestions() {
  if (skip('suggestions')) return;
  log('\n── 11. suggestions ──');
  const items = await redis.lrange<string>('suggestions', 0, -1);
  log(`  Encontradas ${items.length} sugestões no Redis`);
  if (dryRun || items.length === 0) return;

  const { randomUUID } = await import('crypto');
  const rows = items.map(content => ({ id: randomUUID(), content }));
  await db.insert(suggestions).values(rows).onConflictDoNothing();
  log(`  ✓ ${rows.length} sugestões inseridas`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== migrate-redis-to-pg ===');
  if (dryRun) console.log('  [DRY RUN — nenhum dado será inserido]');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✓' : '✗ AUSENTE'}`);
  console.log(`  UPSTASH_REDIS_REST_URL: ${process.env.UPSTASH_REDIS_REST_URL ? '✓' : '✗ AUSENTE'}`);
  if (!process.env.DATABASE_URL || !process.env.UPSTASH_REDIS_REST_URL) {
    console.error('  Variáveis obrigatórias ausentes — abortando');
    process.exit(1);
  }

  await migrateUsers();
  await migrateBoloes();
  await migrateBolaoMembers();
  await migratePalpites();
  await migrateScores();
  await migrateBolaoRankings();
  await migrateGlobalRankings();
  await migratePosts();
  await migratePostLikes();
  await migrateFollows();
  await migrateSuggestions();

  console.log('\n=== Migração concluída ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
