import { createHash, randomUUID } from 'crypto';
import { redis } from './redisCache';
import { db } from './db';
import { users } from './db/schema';

export const IDENTITY_COOKIE = 'sc_uid';

const TTL_1Y = 60 * 60 * 24 * 365;

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

/**
 * Registers a new user or updates an existing one.
 * Returns the userId to be stored in the cookie.
 */
export async function registerOrUpdateUser(
  email: string,
  ip: string,
  existingUserId?: string,
): Promise<string> {
  const emailHash = hashEmail(email);
  const now = new Date().toISOString();

  // If this email is already registered, update metadata and return the userId
  const existingByEmail = await redis.get<string>(`email:${emailHash}`);
  if (existingByEmail) {
    const existing = await redis.get<UserRecord>(`user:${existingByEmail}`);
    await Promise.all([
      redis.set(`user:${existingByEmail}`, { ...existing, ip, lastSeen: now }, { ex: TTL_1Y }),
      redis.set(`email:${emailHash}`, existingByEmail, { ex: TTL_1Y }),
    ]);
    if (existing) {
      db.insert(users).values({
        id:           existingByEmail,
        email:        existing.email,
        emailHash,
        username:     existing.username ?? null,
        displayName:  existing.displayName ?? null,
        bio:          existing.bio ?? null,
        clubId:       existing.clubId ?? null,
        passwordHash: existing.passwordHash ?? null,
        ip,
        createdAt:    new Date(existing.createdAt),
        lastSeen:     new Date(now),
      }).onConflictDoUpdate({
        target: users.id,
        set: { ip, lastSeen: new Date(now) },
      }).catch(err => console.error('[pg-shadow-write] userIdentity update:', err));
    }
    return existingByEmail;
  }

  // New user — preserve existing cookie userId or generate a fresh one
  const userId = existingUserId?.length ? existingUserId : randomUUID();

  const record: UserRecord = { email, emailHash, ip, createdAt: now, lastSeen: now };

  await Promise.all([
    redis.set(`user:${userId}`, record, { ex: TTL_1Y }),
    redis.set(`email:${emailHash}`, userId, { ex: TTL_1Y }),
  ]);

  db.insert(users).values({
    id: userId,
    email,
    emailHash,
    ip,
    createdAt: new Date(now),
    lastSeen:  new Date(now),
  }).onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] userIdentity insert:', err));

  return userId;
}
