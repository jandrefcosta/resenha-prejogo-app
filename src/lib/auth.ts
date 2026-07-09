import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { redis } from './redisCache';

export const AUTH_COOKIE = 'sc_auth';
const TTL_30D = 60 * 60 * 24 * 30;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required');
}
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export interface JwtPayload {
  sub: string;  // userId
  jti: string;  // session id — used for server-side revocation
}

export async function signToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ sub: userId, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.jti) return null;

    // Check server-side revocation
    const valid = await redis.exists(`session:${payload.jti}`);
    if (!valid) return null;

    return { sub: payload.sub as string, jti: payload.jti as string };
  } catch {
    return null;
  }
}

export async function saveSession(jti: string, userId: string): Promise<void> {
  await redis.set(`session:${jti}`, userId, { ex: TTL_30D });
  await redis.sadd(`user-sessions:${userId}`, jti);
  await redis.expire(`user-sessions:${userId}`, TTL_30D);
}

export async function revokeSession(jti: string): Promise<void> {
  const userId = await redis.get<string>(`session:${jti}`);
  await redis.del(`session:${jti}`);
  if (userId) await redis.srem(`user-sessions:${userId}`, jti);
}

/** Revoke every active session for a user (e.g. after a password reset). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const jtis = await redis.smembers(`user-sessions:${userId}`);
  if (jtis.length === 0) return;
  await Promise.all(jtis.map((jti) => redis.del(`session:${jti}`)));
  await redis.del(`user-sessions:${userId}`);
}

/** Use inside Server Components and Route Handlers (reads Next.js cookie store). */
export async function getCurrentUser(req?: NextRequest): Promise<JwtPayload | null> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(AUTH_COOKIE)?.value;
  } else {
    const jar = await cookies();
    token = jar.get(AUTH_COOKIE)?.value;
  }

  if (!token) return null;
  return verifyToken(token);
}
