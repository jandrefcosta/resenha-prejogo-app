import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserPalpites } from '@/lib/bolaoRedis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const palpites = await getUserPalpites(user.sub);
  return NextResponse.json({ palpites });
}
