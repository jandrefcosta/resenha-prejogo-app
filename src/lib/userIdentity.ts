import { createHash } from 'crypto';
import { redis } from './redisCache';

export interface UserRecord {
  email: string;
  emailHash: string;
  ip: string;
  createdAt: string;
  lastSeen: string;
  // Social profile fields (set on register, optional for legacy anonymous records)
  username?: string;
  displayName?: string;
  bio?: string;
  clubId?: string;
  passwordHash?: string;
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  return redis.get<UserRecord>(`user:${userId}`);
}

export async function getUserByEmail(email: string): Promise<{ userId: string; record: UserRecord } | null> {
  const emailHash = hashEmail(email);
  const userId = await redis.get<string>(`email:${emailHash}`);
  if (!userId) return null;
  const record = await redis.get<UserRecord>(`user:${userId}`);
  if (!record) return null;
  return { userId, record };
}
