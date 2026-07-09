import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redisCache';
import { hashEmail, getUserByEmail, UserRecord } from '@/lib/userIdentity';
import { hashPassword } from '@/lib/passwordUtils';
import { signToken, saveSession, AUTH_COOKIE } from '@/lib/auth';
import { registerLimiter, getClientIp } from '@/lib/rateLimiter';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TTL_1Y = 60 * 60 * 24 * 365;
const TTL_30D = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { username, email, password } = body as Record<string, string>;

  if (!EMAIL_RE.test(email ?? ''))
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  if (!USERNAME_RE.test(username ?? ''))
    return NextResponse.json({ error: 'Username deve ter 3-20 caracteres (letras, números, _)' }, { status: 400 });
  if (!password || password.length < 8)
    return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres' }, { status: 400 });

  const { success } = await registerLimiter.limit(getClientIp(req));
  if (!success)
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 });

  // Uniqueness checks
  const [existingByEmail, existingByUsername] = await Promise.all([
    getUserByEmail(email),
    redis.get<string>(`username:${username.toLowerCase()}`),
  ]);

  if (existingByEmail)
    return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
  if (existingByUsername)
    return NextResponse.json({ error: 'Username já em uso' }, { status: 409 });

  const emailHash = hashEmail(email);
  const ip = getClientIp(req);
  const now = new Date().toISOString();

  // Always generate a fresh userId for registered accounts.
  // sc_uid is an anonymous session cookie and must not be reused as a social identity —
  // multiple users registering on the same device would collide on the same key.
  const userId = randomUUID();

  const passwordHash = await hashPassword(password);

  const record: UserRecord = {
    email,
    emailHash,
    ip,
    createdAt: now,
    lastSeen: now,
    username: username.toLowerCase(),
    displayName: username,
    passwordHash,
  };

  await Promise.all([
    redis.set(`user:${userId}`, record, { ex: TTL_1Y }),
    redis.set(`email:${emailHash}`, userId, { ex: TTL_1Y }),
    redis.set(`username:${username.toLowerCase()}`, userId, { ex: TTL_1Y }),
  ]);

  const jti = randomUUID();
  const token = await signToken(userId, jti);
  await saveSession(jti, userId);

  const res = NextResponse.json({
    user: {
      id: userId,
      username: record.username,
      displayName: record.displayName,
      email: record.email,
      clubId: record.clubId ?? null,
      bio: record.bio ?? null,
    },
  }, { status: 201 });

  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TTL_30D,
    path: '/',
  });

  // sc_uid is the anonymous identity cookie — do not overwrite it with the
  // registered userId. They are independent identifiers.

  return res;
}
