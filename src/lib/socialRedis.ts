import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { redis } from './redisCache';
import { db } from './db';
import { posts as postsTable, postLikes, follows } from './db/schema';

const TTL_1Y = 60 * 60 * 24 * 365;
const MAX_FEED_SIZE = 500; // trim sorted sets to avoid unbounded growth

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  clubId: string;
  content: string;
  likeCount: number;
  createdAt: string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createPost(
  authorId: string,
  authorUsername: string,
  authorDisplayName: string,
  clubId: string,
  content: string,
): Promise<Post> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const score = Date.now();

  const post: Post = {
    id,
    authorId,
    authorUsername,
    authorDisplayName,
    clubId,
    content,
    likeCount: 0,
    createdAt: now,
  };

  // Gather follower IDs for fan-out
  const followerIds = await redis.smembers<string[]>(`followers:${authorId}`);

  const pipeline = redis.pipeline();

  // Store post hash
  pipeline.set(`post:${id}`, post, { ex: TTL_1Y });

  // Club feed sorted set (score = ms timestamp)
  pipeline.zadd(`club:posts:${clubId}`, { score, member: id });

  // Author's own post list
  pipeline.zadd(`user:posts:${authorId}`, { score, member: id });

  // Fan-out to followers' personal feeds (synchronous for MVP, <500 followers)
  for (const followerId of followerIds.slice(0, 500)) {
    pipeline.zadd(`feed:${followerId}`, { score, member: id });
    pipeline.zremrangebyrank(`feed:${followerId}`, 0, -(MAX_FEED_SIZE + 1));
  }

  // Trim club feed
  pipeline.zremrangebyrank(`club:posts:${clubId}`, 0, -(MAX_FEED_SIZE + 1));

  await pipeline.exec();

  db.insert(postsTable).values({
    id,
    authorId,
    clubId,
    content,
    likeCount: 0,
    createdAt: new Date(now),
  }).onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] createPost:', err));

  return post;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getClubFeed(
  clubId: string,
  cursor: number = Date.now(),
  limit: number = 20,
): Promise<{ posts: Post[]; nextCursor: number | null }> {
  return fetchFeed(`club:posts:${clubId}`, cursor, limit);
}

export async function getPersonalFeed(
  userId: string,
  cursor: number = Date.now(),
  limit: number = 20,
): Promise<{ posts: Post[]; nextCursor: number | null }> {
  return fetchFeed(`feed:${userId}`, cursor, limit);
}

async function fetchFeed(
  key: string,
  cursor: number,
  limit: number,
): Promise<{ posts: Post[]; nextCursor: number | null }> {
  // Upstash zrange with REV + BYSCORE: descending, scores from (cursor-1) down to 0
  const ids = await redis.zrange<string[]>(key, cursor - 1, 0, {
    rev: true,
    byScore: true,
    offset: 0,
    count: limit,
  });

  if (!ids || ids.length === 0) return { posts: [], nextCursor: null };

  const posts = await fetchPostsByIds(ids);
  const lastId = ids[ids.length - 1];
  const lastScore = await redis.zscore(key, lastId);
  const nextCursor = posts.length === limit && lastScore !== null ? Number(lastScore) : null;

  return { posts, nextCursor };
}

async function fetchPostsByIds(ids: string[]): Promise<Post[]> {
  if (ids.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.get(`post:${id}`);
  const results = await pipeline.exec();
  return (results ?? [])
    .map((r) => r as Post | null)
    .filter((p): p is Post => p !== null);
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function likePost(
  postId: string,
  userId: string,
): Promise<{ likeCount: number; alreadyLiked: boolean }> {
  const added = await redis.sadd(`post:likes:${postId}`, userId);
  if (!added) return { likeCount: await getLikeCount(postId), alreadyLiked: true };

  await redis.sadd(`user:liked:${userId}`, postId);

  const post = await redis.get<Post>(`post:${postId}`);
  if (post) {
    const likeCount = (post.likeCount ?? 0) + 1;
    await redis.set(`post:${postId}`, { ...post, likeCount }, { ex: TTL_1Y });
    db.insert(postLikes).values({ postId, userId })
      .onConflictDoNothing()
      .catch(err => console.error('[pg-shadow-write] likePost:', err));
    return { likeCount, alreadyLiked: false };
  }
  return { likeCount: await getLikeCount(postId), alreadyLiked: false };
}

export async function unlikePost(
  postId: string,
  userId: string,
): Promise<{ likeCount: number }> {
  await Promise.all([
    redis.srem(`post:likes:${postId}`, userId),
    redis.srem(`user:liked:${userId}`, postId),
  ]);

  const post = await redis.get<Post>(`post:${postId}`);
  if (post) {
    const likeCount = Math.max(0, (post.likeCount ?? 0) - 1);
    await redis.set(`post:${postId}`, { ...post, likeCount }, { ex: TTL_1Y });
    db.delete(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
      .catch(err => console.error('[pg-shadow-write] unlikePost:', err));
    return { likeCount };
  }
  return { likeCount: 0 };
}

export async function hasUserLiked(postId: string, userId: string): Promise<boolean> {
  return (await redis.sismember(`post:likes:${postId}`, userId)) === 1;
}

async function getLikeCount(postId: string): Promise<number> {
  return (await redis.scard(`post:likes:${postId}`)) ?? 0;
}

// ─── Follows ──────────────────────────────────────────────────────────────────

export async function followUser(followerId: string, followingId: string): Promise<boolean> {
  if (followerId === followingId) return false;
  const added = await redis.sadd(`following:${followerId}`, followingId);
  if (!added) return false; // already following
  await redis.sadd(`followers:${followingId}`, followerId);

  db.insert(follows).values({ followerId, followingId })
    .onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] followUser:', err));

  return true;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await Promise.all([
    redis.srem(`following:${followerId}`, followingId),
    redis.srem(`followers:${followingId}`, followerId),
  ]);

  db.delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    .catch(err => console.error('[pg-shadow-write] unfollowUser:', err));
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  return (await redis.sismember(`following:${followerId}`, followingId)) === 1;
}

export async function getFollowerCount(userId: string): Promise<number> {
  return (await redis.scard(`followers:${userId}`)) ?? 0;
}

export async function getFollowingCount(userId: string): Promise<number> {
  return (await redis.scard(`following:${userId}`)) ?? 0;
}

export async function getUserPostCount(userId: string): Promise<number> {
  return (await redis.zcard(`user:posts:${userId}`)) ?? 0;
}

export async function getUserPosts(
  userId: string,
  cursor: number = Date.now(),
  limit: number = 20,
): Promise<{ posts: Post[]; nextCursor: number | null }> {
  return fetchFeed(`user:posts:${userId}`, cursor, limit);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deletePost(postId: string, authorId: string, clubId: string): Promise<boolean> {
  const post = await redis.get<Post>(`post:${postId}`);
  if (!post || post.authorId !== authorId) return false;

  const pipeline = redis.pipeline();
  pipeline.del(`post:${postId}`);
  pipeline.zrem(`club:posts:${clubId}`, postId);
  pipeline.zrem(`user:posts:${authorId}`, postId);
  await pipeline.exec();
  return true;
}
