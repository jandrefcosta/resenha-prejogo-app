import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, hashEmail } from '@/lib/userIdentity';
import { redis, TTL_1H } from '@/lib/redisCache';
import { passwordResetLimiter } from '@/lib/rateLimiter';
import { sendPasswordResetEmail } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { email } = body as Record<string, string>;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
  }

  // Rate limit por email hash
  const emailHash = hashEmail(email);
  const { success } = await passwordResetLimiter.limit(emailHash);
  if (!success) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em 1 hora.' },
      { status: 429 },
    );
  }

  // Lookup silencioso — não revela se o email existe
  const found = await getUserByEmail(email);
  if (!found) {
    return NextResponse.json({ ok: true });
  }

  const { userId } = found;
  const token = randomBytes(32).toString('hex');

  try {
    await redis.set(`reset:${token}`, { userId }, { ex: TTL_1H });
  } catch (err) {
    console.error('[forgot-password] redis set failed:', err);
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 });
  }

  try {
    await sendPasswordResetEmail(email, token);
  } catch (err) {
    console.error('[forgot-password] email send failed:', err);
    // Limpar token órfão — usuário pode tentar de novo
    await redis.del(`reset:${token}`).catch(() => {});
    return NextResponse.json({ error: 'Erro ao enviar email. Tente novamente.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
