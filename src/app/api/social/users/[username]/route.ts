import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redisCache';
import { getUserByEmail } from '@/lib/userIdentity';
import { getFollowerCount, getFollowingCount, getUserPostCount, isFollowing } from '@/lib/socialRedis';
import { getCurrentUser } from '@/lib/auth';

// GET /api/social/users/:username
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  const userId = await redis.get<string>(`username:${username.toLowerCase()}`);
  if (!userId) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const record = await redis.get<{
    username?: string;
    displayName?: string;
    bio?: string;
    clubId?: string;
    email: string;
  }>(`user:${userId}`);

  if (!record) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const [followerCount, followingCount, postCount] = await Promise.all([
    getFollowerCount(userId),
    getFollowingCount(userId),
    getUserPostCount(userId),
  ]);

  // Check if the requesting user follows this profile
  const payload = await getCurrentUser(req);
  const viewerFollows = payload ? await isFollowing(payload.sub, userId) : false;

  return NextResponse.json({
    profile: {
      id: userId,
      username: record.username ?? username,
      displayName: record.displayName ?? username,
      bio: record.bio ?? null,
      clubId: record.clubId ?? null,
      followerCount,
      followingCount,
      postCount,
      viewerFollows,
    },
  });
}
