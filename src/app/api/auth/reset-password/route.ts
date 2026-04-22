import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redisCache';
import { getUserById } from '@/lib/userIdentity';
import { hashPassword } from '@/lib/passwordUtils';

const TTL_1Y = 60 * 60 * 24 * 365;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { token, password } = body as Record<string, string>;

  if (!token || typeof token !== 'string' || token.length !== 64) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
  }

  const data = await redis.get<{ userId: string }>(`reset:${token}`);
  if (!data?.userId) {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
  }

  const { userId } = data;

  const record = await getUserById(userId);
  if (!record) {
    await redis.del(`reset:${token}`);
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);
  await redis.set(`user:${userId}`, { ...record, passwordHash }, { ex: TTL_1Y });
  await redis.del(`reset:${token}`);

  return NextResponse.json({ ok: true });
}
