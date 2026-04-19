import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { redis } from './redisCache';

export const AUTH_COOKIE = 'sc_auth';
const TTL_30D = 60 * 60 * 24 * 30;

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
);

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

export async function verifyToken(token: string): Promise<JwtPayload | null> {
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
}

export async function revokeSession(jti: string): Promise<void> {
  await redis.del(`session:${jti}`);
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
