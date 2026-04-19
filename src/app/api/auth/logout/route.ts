import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, revokeSession, AUTH_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const payload = await getCurrentUser(req);
  if (payload) {
    await revokeSession(payload.jti);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
