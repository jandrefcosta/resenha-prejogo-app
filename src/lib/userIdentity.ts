import { createHash, randomUUID } from 'crypto';
import { redis } from './redisCache';

export const IDENTITY_COOKIE = 'sc_uid';

const TTL_1Y = 60 * 60 * 24 * 365;

interface UserRecord {
  email: string;    // plaintext email
  emailHash: string; // SHA-256 of email
  ip: string;
  createdAt: string;
  lastSeen: string;
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
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
    return existingByEmail;
  }

  // New user — preserve existing cookie userId or generate a fresh one
  const userId = existingUserId?.length ? existingUserId : randomUUID();

  const record: UserRecord = { email, emailHash, ip, createdAt: now, lastSeen: now };

  await Promise.all([
    redis.set(`user:${userId}`, record, { ex: TTL_1Y }),
    redis.set(`email:${emailHash}`, userId, { ex: TTL_1Y }),
  ]);

  return userId;
}
