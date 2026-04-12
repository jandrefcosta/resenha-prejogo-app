/**
 * Admin endpoint to invalidate CBF document cache for one or all matches.
 *
 * This is needed after a parser bug fix to force re-parsing of documents
 * that were cached with incorrect (empty) data.
 *
 * Usage:
 *   DELETE /api/admin/bust-match-docs?idJogo=831894
 *   DELETE /api/admin/bust-match-docs?all=true   (scan + delete all cbf:match:*:docs:status keys)
 *
 * Protected by DEBUG_SECRET query param (same mechanism used by /api/debug/* routes).
 */

import { deleteCache, redis } from '@/lib/redisCache';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.DEBUG_SECRET;
  if (!secret) return false;
  return req.nextUrl.searchParams.get('secret') === secret;
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const idJogo = searchParams.get('idJogo');
  const all    = searchParams.get('all') === 'true';

  if (!idJogo && !all) {
    return NextResponse.json(
      { error: 'Provide idJogo=<id> or all=true' },
      { status: 400 },
    );
  }

  if (idJogo) {
    await Promise.all([
      deleteCache(`cbf:match:${idJogo}:docs:status`),
      deleteCache(`cbf:match:${idJogo}:sumula`),
      deleteCache(`cbf:match:${idJogo}:boletim`),
    ]);
    return NextResponse.json({ cleared: [idJogo] });
  }

  // all=true: scan for all status keys and delete associated sumula/boletim caches
  const pattern = 'cbf:match:*:docs:status';
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
    keys.push(...batch);
    cursor = Number(nextCursor);
  } while (cursor !== 0);

  const idJogos = keys.map((k) => k.split(':')[2]).filter(Boolean);

  const deletes = idJogos.flatMap((id) => [
    deleteCache(`cbf:match:${id}:docs:status`),
    deleteCache(`cbf:match:${id}:sumula`),
    deleteCache(`cbf:match:${id}:boletim`),
  ]);
  await Promise.all(deletes);

  return NextResponse.json({ cleared: idJogos, count: idJogos.length });
}
