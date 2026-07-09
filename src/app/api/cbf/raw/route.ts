import { NextRequest, NextResponse } from 'next/server';
import { invalidateCbfRound } from '@/lib/cbfApi';
import { isAdminRequest, unauthorizedAdminResponse } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const CBF_BASE = 'https://gweb.cbf.com.br/api/site/v1';
const CHAMPIONSHIP_ID = 1260611;

const CBF_HEADERS = {
  Accept: '*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Authorization: `Bearer ${process.env.CBF_API_TOKEN ?? 'Cbf@2022!'}`,
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
  Origin: 'https://www.cbf.com.br',
  Referer: 'https://www.cbf.com.br/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/** GET /api/cbf/raw?round=N — retorna a resposta crua da CBF sem cache nem parse */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return unauthorizedAdminResponse();

  const round = Number(req.nextUrl.searchParams.get('round'));
  if (!round || round < 1 || round > 38) {
    return NextResponse.json({ error: 'round param required (1–38)' }, { status: 400 });
  }

  if (req.nextUrl.searchParams.get('invalidateAll') === '1') {
    await Promise.all(Array.from({ length: 38 }, (_, i) => invalidateCbfRound(i + 1)));
  } else if (req.nextUrl.searchParams.get('invalidate') === '1') {
    await invalidateCbfRound(round);
  }

  const url = `${CBF_BASE}/jogos/campeonato/${CHAMPIONSHIP_ID}/rodada/${round}/fase`;
  const res = await fetch(url, { headers: CBF_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8000) });

  if (!res.ok) {
    return NextResponse.json({ error: `CBF returned ${res.status}` }, { status: 502 });
  }

  const raw = await res.json();

  // Extract just the first jogo with alteracoes for inspection
  const fases = Array.isArray(raw) ? raw : [raw];
  const jogos = fases.flatMap((f: { jogos: { jogo: unknown[] }[] }) =>
    f.jogos.flatMap((g) => g.jogo)
  ) as Record<string, unknown>[];

  const comAlteracoes = jogos.find((j) => {
    const m = j.mandante as Record<string, unknown> | undefined;
    const v = j.visitante as Record<string, unknown> | undefined;
    return (Array.isArray(m?.alteracoes) && (m.alteracoes as unknown[]).length > 0) ||
           (Array.isArray(v?.alteracoes) && (v.alteracoes as unknown[]).length > 0);
  });

  return NextResponse.json({
    totalJogos: jogos.length,
    jogoComAlteracoes: comAlteracoes
      ? {
          id_jogo: comAlteracoes.id_jogo,
          mandante_id: (comAlteracoes.mandante as Record<string, unknown>)?.id,
          mandante_nome: (comAlteracoes.mandante as Record<string, unknown>)?.nome,
          visitante_id: (comAlteracoes.visitante as Record<string, unknown>)?.id,
          visitante_nome: (comAlteracoes.visitante as Record<string, unknown>)?.nome,
          mandante_alteracoes: (comAlteracoes.mandante as Record<string, unknown>)?.alteracoes,
          mandante_atletas_sample: ((comAlteracoes.mandante as Record<string, unknown>)?.atletas as unknown[] | undefined)?.slice(0, 2),
          visitante_alteracoes: (comAlteracoes.visitante as Record<string, unknown>)?.alteracoes,
        }
      : null,
    allJogos: jogos.map((j) => ({
      id_jogo: j.id_jogo,
      mandante: (j.mandante as Record<string, unknown>)?.nome,
      visitante: (j.visitante as Record<string, unknown>)?.nome,
      mandante_id: (j.mandante as Record<string, unknown>)?.id,
      visitante_id: (j.visitante as Record<string, unknown>)?.id,
    })),
    allJogosIds: jogos.map((j) => j.id_jogo),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
