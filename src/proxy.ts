import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/adminSession';

const ADMIN_PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login']);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // run-docs-cron self-authenticates via CRON_SECRET (separate from admin's
  // DEBUG_SECRET) — same pattern as bolao/score, excluded from the admin gate below.
  if (pathname === '/api/admin/run-docs-cron') return NextResponse.next();

  // Admin paths (skip user gate entirely)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (ADMIN_PUBLIC_PATHS.has(pathname)) return NextResponse.next();

    const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
    const ok = await verifyAdminToken(cookie);
    if (ok) return NextResponse.next();

    // Bearer fallback for cron/scripts on /api/admin/*
    if (pathname.startsWith('/api/admin')) {
      const auth = req.headers.get('authorization');
      const expected = process.env.DEBUG_SECRET;
      if (expected && auth === `Bearer ${expected}`) return NextResponse.next();
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Page redirect to login
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // User gate (existing)
  const payload = await getCurrentUser(req);
  if (!payload) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/social/:path*',
    // Bolão — excluir rotas públicas (global, score usa auth próprio via CRON_SECRET)
    '/api/bolao/((?!global|score).*)',
    '/api/palpites/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
