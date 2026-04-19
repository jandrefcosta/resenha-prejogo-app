import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redisCache';
import { getCurrentUser } from '@/lib/auth';
import { likePost, unlikePost } from '@/lib/socialRedis';

const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:likes',
});

// POST /api/social/posts/[id]/like
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await getCurrentUser(req);
  if (!payload) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { success } = await rateLimiter.limit(payload.sub);
  if (!success) return NextResponse.json({ error: 'Muitas ações. Aguarde um momento.' }, { status: 429 });

  const { id } = await params;
  const result = await likePost(id, payload.sub);
  return NextResponse.json(result);
}

// DELETE /api/social/posts/[id]/like
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await getCurrentUser(req);
  if (!payload) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await params;
  const result = await unlikePost(id, payload.sub);
  return NextResponse.json(result);
}
