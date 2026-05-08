import { NextResponse } from 'next/server';
import { count } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users, boloes, bolaoMembers, palpites, scores,
  posts, follows, matchSnapshots,
} from '@/lib/db/schema';
import { redis } from '@/lib/redisCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function pgCount(table: Parameters<typeof db.select>[0] extends undefined ? never : unknown): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await db.select({ n: count() }).from(table as any);
  return Number(row?.n ?? 0);
}

export async function GET() {
  // Auth handled by middleware.
  const [
    usersCount,
    boloesCount,
    bolaoMembersCount,
    palpitesCount,
    scoresCount,
    postsCount,
    followsCount,
    matchSnapshotsCount,
    suggestionsCount,
    globalRankingTop,
  ] = await Promise.all([
    pgCount(users),
    pgCount(boloes),
    pgCount(bolaoMembers),
    pgCount(palpites),
    pgCount(scores),
    pgCount(posts),
    pgCount(follows),
    pgCount(matchSnapshots),
    redis.llen('suggestions'),
    redis.zcard('bolao:global:ranking'),
  ]);

  return NextResponse.json(
    {
      pg: {
        users: usersCount,
        boloes: boloesCount,
        bolaoMembers: bolaoMembersCount,
        palpites: palpitesCount,
        scores: scoresCount,
        posts: postsCount,
        follows: followsCount,
        matchSnapshots: matchSnapshotsCount,
      },
      redis: {
        suggestions: suggestionsCount,
        globalRanking: globalRankingTop,
      },
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
