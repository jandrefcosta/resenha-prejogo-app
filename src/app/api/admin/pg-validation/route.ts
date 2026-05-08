/**
 * GET /api/admin/pg-validation
 *
 * Compares entity counts between Redis and Postgres.
 * Auth gated by middleware (admin cookie OR DEBUG_SECRET Bearer).
 *
 * Returns { ok: boolean, checks: Record<string, { redis: number; pg: number; match: boolean }> }
 */

import { NextResponse } from 'next/server';
import { count } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users, boloes, bolaoMembers, palpites, scores,
  globalRankings, posts, follows,
  matchSnapshots,
} from '@/lib/db/schema';
import { redis } from '@/lib/redisCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function scanCount(pattern: string, filter?: RegExp): Promise<number> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
    keys.push(...(batch as string[]));
    cursor = Number(next);
  } while (cursor !== 0);
  return filter ? keys.filter(k => filter.test(k)).length : keys.length;
}

async function pgCount(table: Parameters<typeof db.select>[0] extends undefined ? never : unknown): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await db.select({ n: count() }).from(table as any);
  return Number(row?.n ?? 0);
}

export async function GET() {
  // Auth handled by middleware (admin cookie OR DEBUG_SECRET Bearer).
  const [
    redisUsers, pgUsers,
    redisBoloes, pgBoloes,
    redisBolaoMembers, pgBolaoMembers,
    redisPalpites, pgPalpites,
    redisScores, pgScores,
    redisGlobalRanking, pgGlobalRankings,
    redisPosts, pgPosts,
    redisFollows, pgFollows,
    pgMatchSnapshots,
  ] = await Promise.all([
    scanCount('user:*', /^user:[^:]+$/),
    pgCount(users),
    scanCount('bolao:*:meta'),
    pgCount(boloes),
    scanCount('bolao:*:members').then(async () => {
      // Count individual members by iterating member sets
      let total = 0;
      let cursor = 0;
      do {
        const [next, batch] = await redis.scan(cursor, { match: 'bolao:*:members', count: 200 });
        for (const key of batch as string[]) {
          total += await redis.scard(key);
        }
        cursor = Number(next);
      } while (cursor !== 0);
      return total;
    }),
    pgCount(bolaoMembers),
    // Palpites: count index keys to avoid double-counting
    scanCount('palpite:user:*:fixtures').then(async () => {
      let total = 0;
      let cursor = 0;
      do {
        const [next, batch] = await redis.scan(cursor, { match: 'palpite:user:*:fixtures', count: 200 });
        for (const key of batch as string[]) {
          total += await redis.scard(key);
        }
        cursor = Number(next);
      } while (cursor !== 0);
      return total;
    }),
    pgCount(palpites),
    scanCount('score:*', /^score:[^:]+:[^:]+$/),
    pgCount(scores),
    redis.zcard('bolao:global:ranking'),
    pgCount(globalRankings),
    scanCount('post:*', /^post:[^:]+$/),
    pgCount(posts),
    // Follows: count following sets
    scanCount('following:*').then(async () => {
      let total = 0;
      let cursor = 0;
      do {
        const [next, batch] = await redis.scan(cursor, { match: 'following:*', count: 200 });
        for (const key of batch as string[]) {
          total += await redis.scard(key);
        }
        cursor = Number(next);
      } while (cursor !== 0);
      return total;
    }),
    pgCount(follows),
    pgCount(matchSnapshots),
  ]);

  type Check = { redis: number; pg: number; match: boolean };
  const checks: Record<string, Check> = {
    users:          { redis: redisUsers,         pg: pgUsers,         match: pgUsers >= redisUsers * 0.95 },
    boloes:         { redis: redisBoloes,         pg: pgBoloes,         match: pgBoloes >= redisBoloes * 0.95 },
    bolao_members:  { redis: redisBolaoMembers,   pg: pgBolaoMembers,   match: pgBolaoMembers >= redisBolaoMembers * 0.95 },
    palpites:       { redis: redisPalpites,        pg: pgPalpites,       match: pgPalpites >= redisPalpites * 0.95 },
    scores:         { redis: redisScores,          pg: pgScores,         match: pgScores >= redisScores * 0.95 },
    global_ranking: { redis: redisGlobalRanking,   pg: pgGlobalRankings, match: pgGlobalRankings >= redisGlobalRanking * 0.95 },
    posts:          { redis: redisPosts,           pg: pgPosts,          match: pgPosts >= redisPosts * 0.95 },
    follows:        { redis: redisFollows,          pg: pgFollows,        match: pgFollows >= redisFollows * 0.95 },
  };

  const ok = Object.values(checks).every(c => c.match);

  return NextResponse.json({
    ok,
    checks,
    matchSnapshots: pgMatchSnapshots,
    timestamp: new Date().toISOString(),
  });
}
