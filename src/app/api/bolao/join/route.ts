import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBolaoByCode, joinBolao, getBolaoMeta } from '@/lib/bolaoRedis';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.codigo || typeof body.codigo !== 'string') {
    return NextResponse.json({ error: 'codigo é obrigatório' }, { status: 400 });
  }

  const bolaoId = await getBolaoByCode(body.codigo.trim());
  if (!bolaoId) {
    return NextResponse.json({ error: 'Código de convite inválido' }, { status: 404 });
  }

  await joinBolao(bolaoId, user.sub);
  const meta = await getBolaoMeta(bolaoId);
  return NextResponse.json({ bolao: meta });
}
