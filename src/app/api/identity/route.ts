import { type NextRequest, NextResponse } from 'next/server';
import { registerOrUpdateUser, IDENTITY_COOKIE } from '@/lib/userIdentity';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 422 });
  }

  const ip = getClientIp(req);
  const existingUserId = req.cookies.get(IDENTITY_COOKIE)?.value;

  const userId = await registerOrUpdateUser(email, ip, existingUserId);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(IDENTITY_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });

  return res;
}
