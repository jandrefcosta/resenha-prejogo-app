import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redisCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'suggestions';
const TOMBSTONE = '__deleted__';

interface SuggestionEntry {
  text: string;
  createdAt: string;
}

interface SuggestionItem extends SuggestionEntry {
  index: number;
}

function parse(raw: unknown): SuggestionEntry | null {
  if (raw === TOMBSTONE) return null;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as SuggestionEntry;
    if (typeof parsed.text !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const offset = Math.max(0, Number(sp.get('offset') ?? '0'));
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit') ?? '50')));

  const [total, raws] = await Promise.all([
    redis.llen(KEY),
    redis.lrange(KEY, offset, offset + limit - 1),
  ]);

  const items: SuggestionItem[] = [];
  raws.forEach((raw, i) => {
    const parsed = parse(raw);
    if (parsed) items.push({ ...parsed, index: offset + i });
  });

  return NextResponse.json(
    { items, total, offset, limit },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const indexParam = req.nextUrl.searchParams.get('index');
  if (indexParam === null) {
    return NextResponse.json({ error: 'index required' }, { status: 400 });
  }
  const index = Number(indexParam);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'invalid index' }, { status: 400 });
  }

  // Tombstone via LSET so the list indices remain stable.
  try {
    await redis.lset(KEY, index, TOMBSTONE);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'lset failed' },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
