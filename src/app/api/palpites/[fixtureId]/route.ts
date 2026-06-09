import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { savePalpite, ensureGlobalParticipant, ensureBrazilParticipant, isBrazilMatch } from '@/lib/bolaoRedis';
import { getCache } from '@/lib/redisCache';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { fixtureId } = await params;

  // Verificar se o jogo ainda não começou
  const copa = await getCache<CopaFixturesPayload>('copa-fixtures:2026');
  if (!copa) {
    return NextResponse.json({ error: 'Dados da Copa indisponíveis. Tente novamente.' }, { status: 503 });
  }
  const allMatches = Object.values(copa.phases).flat();
  const match = allMatches.find((m) => m.id === fixtureId);
  // postponed matches have no confirmed kickoff date; allow edits until rescheduled and status reverts
  if (match && match.status !== 'postponed') {
    const kickoff = new Date(match.date);
    if (Date.now() >= kickoff.getTime()) {
      return NextResponse.json({ error: 'Palpite travado — jogo já começou' }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const home = Number(body.home);
  const away = Number(body.away);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return NextResponse.json({ error: 'home e away devem ser inteiros >= 0' }, { status: 400 });
  }

  await savePalpite(user.sub, fixtureId, home, away);
  await ensureGlobalParticipant(user.sub);
  // Also seed the "Só Brasil" ranking when this fixture involves Brazil.
  if (match && isBrazilMatch(match)) {
    await ensureBrazilParticipant(user.sub);
  }

  return NextResponse.json({ ok: true });
}
