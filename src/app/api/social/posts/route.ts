import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redisCache';
import { getCurrentUser } from '@/lib/auth';
import { getUserById } from '@/lib/userIdentity';
import { createPost, getClubFeed, getPersonalFeed } from '@/lib/socialRedis';
import clubsData from '@/data/clubs.json';

const MAX_CONTENT = 280;
const VALID_CLUB_IDS = new Set(clubsData.map((c) => c.id));

const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix: 'rl:posts',
});

// GET /api/social/posts?clubId=&cursor=&limit=&feed=personal
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const clubId = searchParams.get('clubId') ?? '';
  const cursor = Number(searchParams.get('cursor') ?? Date.now());
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50);
  const feedType = searchParams.get('feed'); // 'personal' | null

  if (feedType === 'personal') {
    const payload = await getCurrentUser(req);
    if (!payload) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const result = await getPersonalFeed(payload.sub, cursor, limit);
    return NextResponse.json(result);
  }

  if (!clubId) return NextResponse.json({ error: 'clubId obrigatório' }, { status: 400 });
  const result = await getClubFeed(clubId, cursor, limit);
  return NextResponse.json(result);
}

// POST /api/social/posts  { content, clubId }
export async function POST(req: NextRequest) {
  const payload = await getCurrentUser(req);
  if (!payload) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { success } = await rateLimiter.limit(payload.sub);
  if (!success) return NextResponse.json({ error: 'Limite de posts atingido. Tente em 1 hora.' }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { content, clubId } = body as Record<string, string>;

  if (!content?.trim()) return NextResponse.json({ error: 'Conteúdo obrigatório' }, { status: 400 });
  if (content.length > MAX_CONTENT)
    return NextResponse.json({ error: `Máximo ${MAX_CONTENT} caracteres` }, { status: 400 });
  if (!clubId || !VALID_CLUB_IDS.has(clubId))
    return NextResponse.json({ error: 'clubId inválido' }, { status: 400 });

  const user = await getUserById(payload.sub);
  if (!user?.username) return NextResponse.json({ error: 'Perfil incompleto' }, { status: 400 });

  const post = await createPost(
    payload.sub,
    user.username,
    user.displayName ?? user.username,
    clubId,
    content.trim(),
  );

  return NextResponse.json({ post }, { status: 201 });
}
