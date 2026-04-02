/**
 * CBF API client with TTL-aware caching.
 *
 * Cache strategy (Redis key: `cbf:round:{N}`):
 *  - Round finished   → 7 days   (immutable results)
 *  - Round live       → 5 min    (goals/cards change)
 *  - Round future     → tiered:
 *      > 48 h before first match → 12 h
 *      > 24 h                    → 6 h
 *      > 12 h                    → 2 h
 *      ≤ 12 h                    → 1 h  (lineup may appear)
 */

import { getCache, setCache } from '@/lib/redisCache';
import type {
  CbfAthlete,
  CbfCard,
  CbfGoal,
  CbfMatchDetail,
  CbfReferee,
  CbfRoundData,
  CbfRoundStatus,
  CbfSubstitution,
  CbfTeamDetail,
} from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CBF_BASE = 'https://gweb.cbf.com.br/api/site/v1';
const CHAMPIONSHIP_ID = 1260611;

const TTL = {
  FINISHED: 60 * 60 * 24 * 7, // 7 days
  LIVE: 60 * 5,                // 5 min
  FUTURE_48H: 60 * 60 * 12,   // 12 h
  FUTURE_24H: 60 * 60 * 6,    // 6 h
  FUTURE_12H: 60 * 60 * 2,    // 2 h
  FUTURE_NOW: 60 * 60,         // 1 h
} as const;

const CBF_HEADERS = {
  Accept: '*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Authorization: 'Bearer Cbf@2022!',
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
  Origin: 'https://www.cbf.com.br',
  Referer: 'https://www.cbf.com.br/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// ─── Raw response types (CBF API shape) ───────────────────────────────────────

interface RawPenalidade {
  id: string;
  tipo: 'GOL' | 'PENALIDADE';
  resultado: string;
  clube: string;
  clube_id: string;
  atleta_nome: string;
  atleta_apelido: string;
  atleta_camisa: string;
  atleta_id: string;
  tempo_jogo: string;
  minutos: string;
}

interface RawArbitro {
  id: number;
  nome: string;
  funcao: string;
  uf: string;
  categoria: string;
}

interface RawAtleta {
  id: number;
  numero_camisa: number;
  reserva: boolean;
  goleiro: boolean;
  entrou_jogando: boolean;
  nome: string;
  apelido: string;
  foto: string;
}

interface RawAlteracao {
  codigo_jogador_saiu: number;
  codigo_jogador_entrou: number;
  tempo_jogo: string;
  tempo_subs: string;
}

interface RawTime {
  id: string;
  nome: string;
  url_escudo: string;
  gols: string;
  panaltis: string;
  atletas: RawAtleta[] | string;
  alteracoes: RawAlteracao[] | string;
}

interface RawJogo {
  id_jogo: string;
  num_jogo: string;
  rodada: string;
  grupo: string;
  local: string;
  campeonato: string;
  data: string;
  hora: string;
  mandante: RawTime;
  visitante: RawTime;
  arbitros: RawArbitro[] | string;
  penalidades: RawPenalidade[] | string;
  documentos: Array<{ url: string; title: string }> | string;
  qtd_alteracoes_jogo: number;
}

interface RawGrupo {
  grupo: string;
  jogo: RawJogo[];
}

interface RawFase {
  grupos: string[];
  jogos: RawGrupo[];
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * PowerShell's Invoke-RestMethod collapses nested arrays into strings when
 * depth is limited. On the server we always get proper JSON, so arrays will
 * be real arrays. Guard both shapes just in case.
 */
function asArray<T>(value: T[] | string | undefined | null): T[] {
  if (!value || typeof value === 'string') return [];
  return value;
}

function parseAtletas(raw: RawAtleta[] | string): CbfAthlete[] {
  return asArray(raw as RawAtleta[]).map((a) => ({
    id: a.id,
    numeroCamisa: a.numero_camisa,
    reserva: a.reserva,
    goleiro: a.goleiro,
    entrouJogando: a.entrou_jogando,
    nome: a.nome,
    apelido: a.apelido,
    foto: a.foto,
  }));
}

function parseAlteracoes(raw: RawAlteracao[] | string): CbfSubstitution[] {
  return asArray(raw as RawAlteracao[]).map((a) => ({
    codigoJogadorSaiu: a.codigo_jogador_saiu,
    codigoJogadorEntrou: a.codigo_jogador_entrou,
    tempoJogo: a.tempo_jogo,
    tempoSubs: a.tempo_subs,
  }));
}

function parseTime(raw: RawTime): CbfTeamDetail {
  return {
    id: raw.id,
    nome: raw.nome,
    urlEscudo: raw.url_escudo,
    gols: raw.gols,
    panaltis: raw.panaltis,
    atletas: parseAtletas(raw.atletas as RawAtleta[]),
    alteracoes: parseAlteracoes(raw.alteracoes as RawAlteracao[]),
  };
}

function parseArbitros(raw: RawArbitro[] | string): CbfReferee[] {
  return asArray(raw as RawArbitro[]).map((a) => ({
    id: a.id,
    nome: a.nome,
    funcao: a.funcao,
    uf: a.uf,
    categoria: a.categoria,
  }));
}

function parsePenalidades(raw: RawPenalidade[] | string): {
  gols: CbfGoal[];
  cartoes: CbfCard[];
} {
  const penalidades = asArray(raw as RawPenalidade[]);
  const gols: CbfGoal[] = [];
  const cartoes: CbfCard[] = [];

  for (const p of penalidades) {
    const base = {
      atletaId: p.atleta_id,
      atletaNome: p.atleta_nome,
      atletaApelido: p.atleta_apelido,
      atletaCamisa: p.atleta_camisa,
      clubeId: p.clube_id,
      clube: p.clube,
      tempoJogo: p.tempo_jogo,
      minutos: p.minutos,
      resultado: p.resultado,
    };
    if (p.tipo === 'GOL') {
      gols.push(base);
    } else {
      cartoes.push(base);
    }
  }

  return { gols, cartoes };
}

function parseJogo(raw: RawJogo): CbfMatchDetail {
  const { gols, cartoes } = parsePenalidades(raw.penalidades);
  const documentos = asArray(
    raw.documentos as Array<{ url: string; title: string }>,
  );

  return {
    idJogo: raw.id_jogo,
    numJogo: raw.num_jogo,
    rodada: raw.rodada,
    grupo: raw.grupo,
    local: raw.local,
    campeonato: raw.campeonato,
    data: raw.data.trim(),
    hora: raw.hora.trim(),
    mandante: parseTime(raw.mandante),
    visitante: parseTime(raw.visitante),
    arbitros: parseArbitros(raw.arbitros),
    gols,
    cartoes,
    documentos,
  };
}

// ─── TTL computation ──────────────────────────────────────────────────────────

/**
 * Parse "DD/MM/YYYY HH:mm" (CBF format, Brasília time UTC-3) → Date
 */
function parseCbfDatetime(data: string, hora: string): Date {
  const [day, month, year] = data.split('/').map(Number);
  const [hours, minutes] = hora.split(':').map(Number);
  // Brasília = UTC-3
  return new Date(Date.UTC(year, month - 1, day, hours + 3, minutes));
}

function inferRoundStatus(matches: CbfMatchDetail[]): CbfRoundStatus {
  const now = Date.now();
  let allFinished = true;
  let anyLive = false;

  for (const m of matches) {
    const hasScore = m.mandante.gols !== null && m.mandante.gols !== '' &&
                     m.visitante.gols !== null && m.visitante.gols !== '';
    const kickoff = parseCbfDatetime(m.data, m.hora).getTime();
    const estimatedEnd = kickoff + 2 * 60 * 60 * 1000; // +2h

    if (!hasScore) {
      allFinished = false;
      if (now >= kickoff && now <= estimatedEnd) {
        anyLive = true;
      }
    }
  }

  if (anyLive) return 'live';
  if (allFinished) return 'finished';
  return 'upcoming';
}

function computeTtl(matches: CbfMatchDetail[], status: CbfRoundStatus): number {
  if (status === 'finished') return TTL.FINISHED;
  if (status === 'live') return TTL.LIVE;

  // Upcoming: use time until the NEXT unplayed match
  const now = Date.now();
  const unplayed = matches
    .filter((m) => !m.mandante.gols || !m.visitante.gols)
    .map((m) => parseCbfDatetime(m.data, m.hora).getTime())
    .filter((t) => t > now)
    .sort((a, b) => a - b);

  if (unplayed.length === 0) return TTL.LIVE; // edge case

  const hoursUntil = (unplayed[0] - now) / (1000 * 60 * 60);

  if (hoursUntil > 48) return TTL.FUTURE_48H;
  if (hoursUntil > 24) return TTL.FUTURE_24H;
  if (hoursUntil > 12) return TTL.FUTURE_12H;
  return TTL.FUTURE_NOW;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function cacheKey(round: number): string {
  return `cbf:round:${round}`;
}

/**
 * Fetch (or return cached) CBF data for a given round.
 * Automatically determines TTL based on round status.
 */
export async function getCbfRound(round: number, force = false): Promise<CbfRoundData> {
  const key = cacheKey(round);

  if (!force) {
    const cached = await getCache<CbfRoundData>(key);
    if (cached) return cached;
  }

  const url = `${CBF_BASE}/jogos/campeonato/${CHAMPIONSHIP_ID}/rodada/${round}/fase`;
  const res = await fetch(url, { headers: CBF_HEADERS, cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`CBF API error: ${res.status} ${res.statusText}`);
  }

  const raw: RawFase | RawFase[] = await res.json();

  // The endpoint returns either a single RawFase object or an array of them
  const rawFases: RawFase[] = Array.isArray(raw) ? raw : [raw];

  const matches: CbfMatchDetail[] = rawFases.flatMap((fase) =>
    fase.jogos.flatMap((grupo) => grupo.jogo.map(parseJogo)),
  );

  const status = inferRoundStatus(matches);
  const ttlSeconds = computeTtl(matches, status);

  const data: CbfRoundData = {
    round,
    status,
    fetchedAt: new Date().toISOString(),
    ttlSeconds,
    matches,
  };

  await setCache(key, data, ttlSeconds);
  return data;
}

/**
 * Force a cache refresh for a round (e.g. after a match finishes).
 */
export async function invalidateCbfRound(round: number): Promise<void> {
  // Upstash Redis doesn't expose delete directly via the helper, so we
  // overwrite with TTL 1s to effectively expire it immediately.
  const key = cacheKey(round);
  await setCache(key, null, 1);
}
