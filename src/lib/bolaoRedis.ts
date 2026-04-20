import { randomUUID } from 'crypto';
import { customAlphabet } from 'nanoid';
import { redis } from './redisCache';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BolaoMeta {
  id: string;
  nome: string;
  codigo: string;       // código de convite de 6 chars, ex: "TRAB42"
  adminId: string;
  criadoEm: string;     // ISO
}

export interface Palpite {
  home: number;
  away: number;
  locked: boolean;
  ts: string;           // ISO — quando foi salvo
}

export interface Score {
  pts: number;
  outcome: 'exact' | 'correct' | 'miss';
}

export interface RankingEntry {
  userId: string;
  username: string;
  displayName: string;
  totalPts: number;
  position: number;
}

// ─── Geração de código de convite ─────────────────────────────────────────────

const genCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

export function generateInviteCode(): string {
  return genCode();
}

// ─── Bolão CRUD ───────────────────────────────────────────────────────────────

export async function createBolao(
  nome: string,
  adminId: string,
): Promise<BolaoMeta> {
  const id = randomUUID();
  const codigo = generateInviteCode();
  const meta: BolaoMeta = { id, nome, codigo, adminId, criadoEm: new Date().toISOString() };

  const pipeline = redis.pipeline();
  pipeline.set(`bolao:${id}:meta`, meta);
  pipeline.set(`bolao:code:${codigo}`, id);
  pipeline.sadd(`bolao:${id}:members`, adminId);
  pipeline.sadd(`bolao:user:${adminId}:boloes`, id);
  // Seed o ranking do admin com 0 pts
  pipeline.zadd(`bolao:${id}:ranking`, { score: 0, member: adminId });
  await pipeline.exec();

  return meta;
}

export async function getBolaoMeta(id: string): Promise<BolaoMeta | null> {
  return redis.get<BolaoMeta>(`bolao:${id}:meta`);
}

export async function getBolaoByCode(codigo: string): Promise<string | null> {
  return redis.get<string>(`bolao:code:${codigo.toUpperCase()}`);
}

export async function joinBolao(bolaoId: string, userId: string): Promise<void> {
  const isMember = await redis.sismember(`bolao:${bolaoId}:members`, userId);
  if (isMember) return;

  const pipeline = redis.pipeline();
  pipeline.sadd(`bolao:${bolaoId}:members`, userId);
  pipeline.sadd(`bolao:user:${userId}:boloes`, bolaoId);
  // Seed ranking entry com pts atuais do global (ou 0 se novo)
  pipeline.zadd(`bolao:${bolaoId}:ranking`, { nx: true }, { score: 0, member: userId });
  await pipeline.exec();
}

export async function getUserBoloes(userId: string): Promise<string[]> {
  return redis.smembers<string[]>(`bolao:user:${userId}:boloes`);
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

/** Retorna top N entradas de um ranking (sorted set, score desc) */
export async function getRanking(
  key: string,
  limit = 50,
): Promise<Array<{ member: string; score: number }>> {
  return redis.zrange(key, 0, limit - 1, { rev: true, withScores: true }) as Promise<
    Array<{ member: string; score: number }>
  >;
}

export async function getUserRankPosition(key: string, userId: string): Promise<number | null> {
  const rank = await redis.zrevrank(key, userId);
  return rank !== null ? rank + 1 : null;
}

export async function getUserScore(key: string, userId: string): Promise<number> {
  return (await redis.zscore(key, userId)) ?? 0;
}

// ─── Palpites ─────────────────────────────────────────────────────────────────

export async function savePalpite(
  userId: string,
  fixtureId: string,
  home: number,
  away: number,
): Promise<void> {
  const palpite: Palpite = {
    home,
    away,
    locked: false,
    ts: new Date().toISOString(),
  };
  const pipeline = redis.pipeline();
  pipeline.set(`palpite:${userId}:${fixtureId}`, palpite);
  // Indexar userId por fixtureId para uso no cron
  pipeline.sadd(`palpite:fixture:${fixtureId}`, userId);
  // Indexar fixtureId por userId para GET /api/palpites
  pipeline.sadd(`palpite:user:${userId}:fixtures`, fixtureId);
  await pipeline.exec();
}

export async function getPalpite(userId: string, fixtureId: string): Promise<Palpite | null> {
  return redis.get<Palpite>(`palpite:${userId}:${fixtureId}`);
}

export async function getUserPalpites(
  userId: string,
): Promise<Record<string, Palpite>> {
  const fixtureIds = await redis.smembers<string[]>(`palpite:user:${userId}:fixtures`);
  if (fixtureIds.length === 0) return {};

  const keys = fixtureIds.map((id) => `palpite:${userId}:${id}`);
  const values = await redis.mget<(Palpite | null)[]>(...keys);

  const result: Record<string, Palpite> = {};
  fixtureIds.forEach((id, i) => {
    if (values[i]) result[id] = values[i]!;
  });
  return result;
}

export async function getFixtureParticipants(fixtureId: string): Promise<string[]> {
  return redis.smembers<string[]>(`palpite:fixture:${fixtureId}`);
}

// ─── Scores ───────────────────────────────────────────────────────────────────

export async function scoreExists(userId: string, fixtureId: string): Promise<boolean> {
  const exists = await redis.exists(`score:${userId}:${fixtureId}`);
  return exists === 1;
}

export async function saveScore(
  userId: string,
  fixtureId: string,
  pts: number,
  outcome: Score['outcome'],
): Promise<void> {
  await redis.set(`score:${userId}:${fixtureId}`, { pts, outcome } satisfies Score);
}

export async function getScore(userId: string, fixtureId: string): Promise<Score | null> {
  return redis.get<Score>(`score:${userId}:${fixtureId}`);
}

/** Incrementa pontos no ranking global e em todos os bolões do usuário */
export async function incrementUserPoints(userId: string, pts: number): Promise<void> {
  const bolaoIds = await redis.smembers<string[]>(`bolao:user:${userId}:boloes`);
  const pipeline = redis.pipeline();
  pipeline.zincrby('bolao:global:ranking', pts, userId);
  for (const bolaoId of bolaoIds) {
    pipeline.zincrby(`bolao:${bolaoId}:ranking`, pts, userId);
  }
  const results = await pipeline.exec();
  const failed = results.filter((r) => r instanceof Error);
  if (failed.length > 0) {
    throw new Error(`incrementUserPoints: ${failed.length} pipeline command(s) failed for userId=${userId}`);
  }
}

// ─── Pontuação ────────────────────────────────────────────────────────────────

export function calcPts(
  palpite: { home: number; away: number },
  resultado: { home: number; away: number },
): { pts: number; outcome: Score['outcome'] } {
  if (palpite.home === resultado.home && palpite.away === resultado.away) {
    return { pts: 10, outcome: 'exact' };
  }
  const pOutcome = Math.sign(palpite.home - palpite.away);
  const rOutcome = Math.sign(resultado.home - resultado.away);
  if (pOutcome === rOutcome) {
    return { pts: 5, outcome: 'correct' };
  }
  return { pts: 0, outcome: 'miss' };
}

// ─── Seed de participante no ranking global (primeiro palpite) ────────────────

export async function ensureGlobalParticipant(userId: string): Promise<void> {
  await redis.zadd('bolao:global:ranking', { nx: true }, { score: 0, member: userId });
}
