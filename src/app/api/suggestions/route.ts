import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { suggestionsLimiter, getClientIp } from '@/lib/rateLimiter';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const MAX_LENGTH = 500;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { success } = await suggestionsLimiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente mais tarde.' }, { status: 429 });
  }

  let text: string;
  try {
    const body = await request.json();
    text = String(body.text ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (!text || text.length > MAX_LENGTH) {
    return NextResponse.json({ error: 'Invalid text' }, { status: 400 });
  }

  await redis.lpush('suggestions', JSON.stringify({ text, createdAt: new Date().toISOString() }));

  return NextResponse.json({ ok: true });
}
