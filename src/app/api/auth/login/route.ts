import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/userIdentity';
import { verifyPassword } from '@/lib/passwordUtils';
import { signToken, saveSession, AUTH_COOKIE } from '@/lib/auth';

const TTL_30D = 60 * 60 * 24 * 30;
const TTL_1Y = 60 * 60 * 24 * 365;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { email, password } = body as Record<string, string>;
  if (!email || !password)
    return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 });

  const found = await getUserByEmail(email);
  if (!found || !found.record.passwordHash)
    return NextResponse.json({ error: 'Email ou senha incorretos' }, { status: 401 });

  const valid = await verifyPassword(password, found.record.passwordHash);
  if (!valid)
    return NextResponse.json({ error: 'Email ou senha incorretos' }, { status: 401 });

  const { userId, record } = found;

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
  });

  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TTL_30D,
    path: '/',
  });

  return res;
}
