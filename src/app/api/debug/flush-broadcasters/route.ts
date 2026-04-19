import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedAdminResponse } from '@/lib/adminAuth';
import { redis } from '@/lib/redisCache';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return unauthorizedAdminResponse();
  }

  let cursor = 0;
  const deleted: string[] = [];

  do {
    const [next, keys] = await redis.scan(cursor, { match: 'broadcasters:*', count: 100 });
    cursor = Number(next);
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted.push(...keys);
    }
  } while (cursor !== 0);

  return NextResponse.json({ deleted: deleted.length, keys: deleted });
}
