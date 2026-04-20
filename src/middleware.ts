import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function middleware(req: NextRequest) {
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
  ],
};
