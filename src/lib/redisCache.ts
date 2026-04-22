import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const TTL_30MIN = 60 * 30;
export const TTL_1H   = 60 * 60;
export const TTL_3H   = 60 * 60 * 3;
export const TTL_6H   = 60 * 60 * 6;
export const TTL_24H  = 60 * 60 * 24;
export const TTL_1Y   = 60 * 60 * 24 * 365;

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    return await redis.get<T>(key);
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    // Non-critical — do not break the request if cache write fails
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // Non-critical
  }
}

/**
 * Store a value with no TTL — it persists until explicitly deleted.
 * Use only for truly immutable data (e.g. finished match rounds).
 */
export async function setCachePermanent<T>(key: string, value: T): Promise<void> {
  try {
    await redis.set(key, value);
  } catch {
    // Non-critical
  }
}
