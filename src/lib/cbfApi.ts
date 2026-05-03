/**
 * CBF API client with TTL-aware caching.
 *
 * Cache strategy (Redis key: `cbf:round:{N}`):
 *  - Round finished          → 30 days  (immutable results — never changes)
 *  - Round live              → 5 min    (goals/cards updating)
 *  - Round post-match        → 10 min   (ended, waiting for CBF to publish scores)
 *  - Round future (tiered):
 *      > 48 h before match   → 12 h
 *      > 24 h                → 6 h
 *      > 12 h                → 2 h
 *      ≤ 12 h                → 1 h  (lineups may appear)
 *
 * Live window uses LIVE_WINDOW_MS from matchConstants to stay aligned with
 * the client-side filter in MatchSection.tsx.
 */

import { sql } from 'drizzle-orm';
import { getCache, setCache, setCachePermanent } from '@/lib/redisCache';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import { db } from '@/lib/db';
import { matchSnapshots } from '@/lib/db/schema';
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
  FINISHED:   60 * 60 * 24 * 30, // 30 days — results are immutable
  LIVE:       60 * 5,             // 5 min — goals/cards updating
  POST_MATCH: 60 * 10,            // 10 min — match ended, waiting for CBF to publish scores
  FUTURE_48H: 60 * 60 * 12,      // 12 h
  FUTURE_24H: 60 * 60 * 6,       // 6 h
  FUTURE_12H: 60 * 60 * 2,       // 2 h
  FUTURE_NOW: 60 * 60,            // 1 h
} as const;

/**
 * Maximum age (ms) for stale data to be served on CBF API errors.
 * Stale data older than this is discarded and the error is thrown instead,
 * preventing week-old data from silently appearing for the current round.
 */
const STALE_MAX_AGE_MS = 60 * 60 * 24 * 1000; // 24 h

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
  id: string;         // API returns string despite looking like a number
  numero_camisa: number;
  reserva: boolean | string;
  goleiro: boolean | string;
  entrou_jogando: boolean | string;
  nome: string;
  apelido: string;
  foto: string;
}

interface RawAlteracao {
  codigo_jogador_saiu: string;   // API returns string
  codigo_jogador_entrou: string; // API returns string
  tempo_jogo: string;            // actual minute e.g. "25:00" — use this
  tempo_subs: string;            // phase code e.g. "TN2" — not a minute
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
    id: Number(a.id),
    numeroCamisa: Number(a.numero_camisa),
    reserva: a.reserva === true || a.reserva === 'true',
    goleiro: a.goleiro === true || a.goleiro === 'true',
    entrouJogando: a.entrou_jogando === true || a.entrou_jogando === 'true',
    nome: a.nome,
    apelido: a.apelido,
    foto: a.foto,
  }));
}

function parseAlteracoes(raw: RawAlteracao[] | string): CbfSubstitution[] {
  return asArray(raw as RawAlteracao[]).map((a) => ({
    codigoJogadorSaiu: Number(a.codigo_jogador_saiu),
    codigoJogadorEntrou: Number(a.codigo_jogador_entrou),
    tempoJogo: a.tempo_jogo,
    // tempo_subs is a phase code (e.g. "TN2"), not a minute — use tempo_jogo instead
    tempoSubs: a.tempo_jogo,
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
    const estimatedEnd = kickoff + LIVE_WINDOW_MS; // aligned with client-side LIVE_WINDOW_MS

    if (!hasScore) {
      allFinished = false;
      if (now >= kickoff && now <= estimatedEnd) {
        anyLive = true;
      }
    } else {
      // Has a score, but if atletas are missing the CBF hasn't fully published yet.
      // Don't mark the round as finished until lineup data is present — otherwise
      // we'd cache the round permanently with empty atletas arrays.
      const hasLineup = m.mandante.atletas.length > 0 && m.visitante.atletas.length > 0;
      if (!hasLineup) {
        allFinished = false;
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

  // All unplayed matches have kickoffs in the past: round just ended.
  // This also covers the transitional state where scores are published but
  // lineup data (atletas) hasn't appeared yet — poll frequently.
  if (unplayed.length === 0) return TTL.POST_MATCH;

  const hoursUntil = (unplayed[0] - now) / (1000 * 60 * 60);

  if (hoursUntil > 48) return TTL.FUTURE_48H;
  if (hoursUntil > 24) return TTL.FUTURE_24H;
  if (hoursUntil > 12) return TTL.FUTURE_12H;
  return TTL.FUTURE_NOW;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the stale entry only if it was fetched within STALE_MAX_AGE_MS.
 * Prevents serving week-old data when CBF has a prolonged outage.
 */
function acceptStale(stale: CbfRoundData | null): CbfRoundData | null {
  if (!stale) return null;
  const age = Date.now() - new Date(stale.fetchedAt).getTime();
  return age <= STALE_MAX_AGE_MS ? stale : null;
}

function cacheKey(round: number): string {
  return `cbf:round:${round}`;
}

/** Long-lived backup key — survives primary TTL expiry so we can serve stale data on CBF errors. */
function staleKey(round: number): string {
  return `cbf:round:${round}:stale`;
}

/**
 * Fetch (or return cached) CBF data for a given round.
 * Automatically determines TTL based on round status.
 *
 * Stale-while-error: if the CBF API fails and we have a previously-fetched
 * snapshot (backup key, 30-day TTL), we return that rather than throwing.
 * This prevents recently-finished rounds from disappearing when CBF has a
 * transient error or when scores haven't been published yet.
 */
export async function getCbfRound(round: number, force = false): Promise<CbfRoundData> {
  const key = cacheKey(round);

  if (!force) {
    const cached = await getCache<CbfRoundData>(key);
    if (cached) return cached;
  }

  const url = `${CBF_BASE}/jogos/campeonato/${CHAMPIONSHIP_ID}/rodada/${round}/fase`;

  let res: Response;
  try {
    res = await fetch(url, { headers: CBF_HEADERS, cache: 'no-store' });
  } catch (networkErr) {
    const stale = acceptStale(await getCache<CbfRoundData>(staleKey(round)));
    if (stale) return stale;
    throw networkErr;
  }

  if (!res.ok) {
    const stale = acceptStale(await getCache<CbfRoundData>(staleKey(round)));
    if (stale) return stale;
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

  // Write primary key (TTL-aware) and backup key.
  // Finished rounds: backup is permanent (data is immutable).
  // Other states: backup uses 30-day TTL (partial data may change).
  // Both writes are fire-and-forget; a failure here is non-critical.
  void setCache(key, data, ttlSeconds);
  if (status === 'finished') {
    void setCachePermanent(staleKey(round), data);
    // Persist finished matches to Postgres as source of truth.
    const pgRows = matches
      .filter(m =>
        m.mandante.gols !== null && m.mandante.gols !== '' &&
        m.visitante.gols !== null && m.visitante.gols !== '' &&
        m.mandante.atletas.length > 0 && m.visitante.atletas.length > 0,
      )
      .map(m => {
        const mainRef = m.arbitros.find(a => a.funcao === 'Arbitro');
        return {
          fixtureId:    `cbf_${m.idJogo}`,
          source:       'cbf' as const,
          leagueId:     71,
          season:       2026,
          round:        String(round),
          status:       'finished' as const,
          matchDate:    parseCbfDatetime(m.data, m.hora),
          homeTeamId:   m.mandante.id,
          homeTeamName: m.mandante.nome,
          awayTeamId:   m.visitante.id,
          awayTeamName: m.visitante.nome,
          homeScore:    parseInt(m.mandante.gols, 10),
          awayScore:    parseInt(m.visitante.gols, 10),
          venue:        m.local || null,
          referee:      mainRef?.nome ?? null,
          hasHomeLineup: m.mandante.atletas.length > 0,
          hasAwayLineup: m.visitante.atletas.length > 0,
          rawPayload:   m as unknown as Record<string, unknown>,
        };
      });
    if (pgRows.length > 0) {
      void db.insert(matchSnapshots).values(pgRows)
        .onConflictDoUpdate({
          target: matchSnapshots.fixtureId,
          set: {
            homeScore:     sql`excluded.home_score`,
            awayScore:     sql`excluded.away_score`,
            hasHomeLineup: sql`excluded.has_home_lineup`,
            hasAwayLineup: sql`excluded.has_away_lineup`,
            rawPayload:    sql`excluded.raw_payload`,
            updatedAt:     sql`now()`,
          },
        })
        .catch(err => console.error('[pg-write-through] cbf round:', err));
    }
  } else {
    void setCache(staleKey(round), data, TTL.FINISHED);
  }

  return data;
}

/**
 * Force a cache refresh for a round (e.g. after a match finishes).
 * Clears both the primary key and the stale backup key.
 */
export async function invalidateCbfRound(round: number): Promise<void> {
  // Upstash Redis doesn't expose delete directly via the helper, so we
  // overwrite with TTL 1s to effectively expire it immediately.
  await Promise.all([
    setCache(cacheKey(round), null, 1),
    setCache(staleKey(round), null, 1),
  ]);
}
