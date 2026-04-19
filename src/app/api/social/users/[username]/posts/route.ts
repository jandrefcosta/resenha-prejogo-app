import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redisCache';
import { getUserPosts } from '@/lib/socialRedis';

// GET /api/social/users/:username/posts?cursor=&limit=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const { searchParams } = req.nextUrl;
  const cursor = Number(searchParams.get('cursor') ?? Date.now());
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50);

  const userId = await redis.get<string>(`username:${username.toLowerCase()}`);
  if (!userId) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const result = await getUserPosts(userId, cursor, limit);
  return NextResponse.json(result);
}
