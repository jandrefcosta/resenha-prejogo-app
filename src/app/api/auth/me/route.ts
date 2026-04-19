import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserById } from '@/lib/userIdentity';

export async function GET(req: NextRequest) {
  const payload = await getCurrentUser(req);
  if (!payload) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const record = await getUserById(payload.sub);
  if (!record) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  return NextResponse.json({
    user: {
      id: payload.sub,
      username: record.username,
      displayName: record.displayName,
      email: record.email,
      clubId: record.clubId ?? null,
      bio: record.bio ?? null,
    },
  });
}
