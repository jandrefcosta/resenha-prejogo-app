import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { followUser, unfollowUser, isFollowing } from '@/lib/socialRedis';
import { getUserById } from '@/lib/userIdentity';

// POST /api/social/follow/:userId  → follow
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const payload = await getCurrentUser(req);
  if (!payload) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { userId: targetId } = await params;
  if (targetId === payload.sub)
    return NextResponse.json({ error: 'Você não pode seguir a si mesmo' }, { status: 400 });

  const target = await getUserById(targetId);
  if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  await followUser(payload.sub, targetId);
  return NextResponse.json({ following: true });
}

// DELETE /api/social/follow/:userId  → unfollow
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const payload = await getCurrentUser(req);
  if (!payload) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { userId: targetId } = await params;
  await unfollowUser(payload.sub, targetId);
  return NextResponse.json({ following: false });
}

// GET /api/social/follow/:userId  → check if current user follows target
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const payload = await getCurrentUser(req);
  if (!payload) return NextResponse.json({ following: false });

  const { userId: targetId } = await params;
  const following = await isFollowing(payload.sub, targetId);
  return NextResponse.json({ following });
}
