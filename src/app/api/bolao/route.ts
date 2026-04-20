import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createBolao, getUserBoloes, getBolaoMeta } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.nome || typeof body.nome !== 'string') {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 });
  }

  const nome = body.nome.trim().slice(0, 50);
  if (!nome) return NextResponse.json({ error: 'nome inválido' }, { status: 400 });

  const meta = await createBolao(nome, user.sub);
  return NextResponse.json({ bolao: meta }, { status: 201 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const bolaoIds = await getUserBoloes(user.sub);
  if (bolaoIds.length === 0) return NextResponse.json({ boloes: [] });

  const metas = await Promise.all(bolaoIds.map((id) => getBolaoMeta(id)));

  const boloes = await Promise.all(
    metas
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map(async (meta) => {
        const p = redis.pipeline();
        p.scard(`bolao:${meta.id}:members`);
        p.zrevrank(`bolao:${meta.id}:ranking`, user.sub);
        p.zscore(`bolao:${meta.id}:ranking`, user.sub);
        const [memberCount, position, totalPtsRaw] = await p.exec() as [number, number | null, number | null];
        return {
          ...meta,
          memberCount,
          position: position !== null ? position + 1 : null,
          totalPts: totalPtsRaw ?? 0,
        };
      }),
  );

  return NextResponse.json({ boloes });
}
