import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, signAdminToken } from '@/lib/adminSession';
import { adminLoginLimiter, getClientIp } from '@/lib/rateLimiter';

export const runtime = 'nodejs';

const TWELVE_HOURS = 60 * 60 * 12;

function safeEquals(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.DEBUG_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'DEBUG_SECRET not configured' }, { status: 500 });
  }

  const { success } = await adminLoginLimiter.limit(getClientIp(req));
  if (!success) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 });
  }

  let body: { secret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const received = body.secret;
  if (!received || !safeEquals(received, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = await signAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TWELVE_HOURS,
  });
  return res;
}
