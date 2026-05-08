import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redisCache';
import { CACHE_GROUPS, isDestructivePattern } from '@/lib/admin/cacheGroups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_KEYS_PER_REQUEST = 5000;
const SCAN_BATCH = 200;

async function scanPattern(
  pattern: string,
  startCursor: number,
  limit: number,
): Promise<{ cursor: number; keys: string[] }> {
  const keys: string[] = [];
  let cursor = startCursor;
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: SCAN_BATCH });
    keys.push(...(batch as string[]));
    cursor = Number(next);
    if (keys.length >= limit) break;
  } while (cursor !== 0);
  return { cursor, keys: keys.slice(0, limit) };
}

async function countPattern(pattern: string): Promise<number> {
  let total = 0;
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: SCAN_BATCH });
    total += (batch as string[]).length;
    cursor = Number(next);
    if (total >= MAX_KEYS_PER_REQUEST) break;
  } while (cursor !== 0);
  return total;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;

  if (sp.get('summary') === '1') {
    const groups = await Promise.all(
      CACHE_GROUPS.map(async (g) => {
        const counts = await Promise.all(g.patterns.map((p) => countPattern(p)));
        const total = counts.reduce((a, b) => a + b, 0);
        return { label: g.label, total, patterns: g.patterns, destructive: g.destructive };
      }),
    );
    return NextResponse.json({ groups }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const pattern = sp.get('pattern');
  if (!pattern) {
    return NextResponse.json({ error: 'pattern required' }, { status: 400 });
  }
  const cursor = Number(sp.get('cursor') ?? '0');
  const result = await scanPattern(pattern, cursor, MAX_KEYS_PER_REQUEST);
  return NextResponse.json(
    { cursor: result.cursor, keys: result.keys, done: result.cursor === 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const pattern = req.nextUrl.searchParams.get('pattern');
  if (!pattern) {
    return NextResponse.json({ error: 'pattern required' }, { status: 400 });
  }
  if (pattern === '*' || pattern.trim() === '') {
    return NextResponse.json({ error: 'bare * is blocked' }, { status: 400 });
  }

  let body: { confirm?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body for non-destructive patterns */
  }

  if (isDestructivePattern(pattern) && body.confirm !== true) {
    return NextResponse.json(
      { error: 'destructive pattern requires { confirm: true }' },
      { status: 403 },
    );
  }

  let deleted = 0;
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: SCAN_BATCH });
    cursor = Number(next);
    const keys = batch as string[];
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
    if (deleted >= MAX_KEYS_PER_REQUEST) break;
  } while (cursor !== 0);

  return NextResponse.json(
    { deleted, truncated: deleted >= MAX_KEYS_PER_REQUEST },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
