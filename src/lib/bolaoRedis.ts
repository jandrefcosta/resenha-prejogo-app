import { randomUUID } from 'crypto';
import { customAlphabet } from 'nanoid';
import { sql } from 'drizzle-orm';
import { redis } from './redisCache';
import { db } from './db';
import { boloes, bolaoMembers, palpites, scores as scoresTable, bolaoRankings, globalRankings, brazilRankings } from './db/schema';
import type { ScoreOutcome } from './bolaoScoring';

// Pure scoring & identity logic lives in bolaoScoring.ts (no I/O imports, so it
// stays unit-testable). Re-exported here to preserve this module's public API.
export { calcPts, calcPtsBrazil, isBrazilMatch, BRAZIL_TEAM_ID } from './bolaoScoring';
export type { ScoreOutcome } from './bolaoScoring';

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
  outcome: ScoreOutcome;
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

  const createdAt = new Date(meta.criadoEm);
  db.insert(boloes).values({ id, adminId, nome, codigo, createdAt })
    .onConflictDoNothing()
    .then(() => db.insert(bolaoMembers).values({ bolaoId: id, userId: adminId, joinedAt: createdAt }).onConflictDoNothing())
    .catch(err => console.error('[pg-shadow-write] createBolao:', err));

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

  db.insert(bolaoMembers).values({ bolaoId, userId })
    .onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] joinBolao:', err));
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
  const flat = (await redis.zrange(key, 0, limit - 1, { rev: true, withScores: true })) as (string | number)[];
  const result: Array<{ member: string; score: number }> = [];
  for (let i = 0; i < flat.length; i += 2) {
    result.push({ member: flat[i] as string, score: flat[i + 1] as number });
  }
  return result;
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
  const now = new Date();
  const palpite: Palpite = {
    home,
    away,
    locked: false,
    ts: now.toISOString(),
  };
  const pipeline = redis.pipeline();
  pipeline.set(`palpite:${userId}:${fixtureId}`, palpite);
  // Indexar userId por fixtureId para uso no cron
  pipeline.sadd(`palpite:fixture:${fixtureId}`, userId);
  // Indexar fixtureId por userId para GET /api/palpites
  pipeline.sadd(`palpite:user:${userId}:fixtures`, fixtureId);
  await pipeline.exec();

  db.insert(palpites).values({ userId, fixtureId, homeGoals: home, awayGoals: away, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [palpites.userId, palpites.fixtureId],
      set: { homeGoals: home, awayGoals: away, updatedAt: now },
    })
    .catch(err => console.error('[pg-shadow-write] savePalpite:', err));
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

  db.insert(scoresTable).values({ userId, fixtureId, points: pts, outcome })
    .onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] saveScore:', err));
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

  const now = new Date();
  const pgWrites = [
    db.insert(globalRankings).values({ userId, totalPoints: pts })
      .onConflictDoUpdate({
        target: globalRankings.userId,
        set: { totalPoints: sql`${globalRankings.totalPoints} + ${pts}`, updatedAt: now },
      }),
    ...bolaoIds.map(bolaoId =>
      db.insert(bolaoRankings).values({ bolaoId, userId, totalPoints: pts })
        .onConflictDoUpdate({
          target: [bolaoRankings.bolaoId, bolaoRankings.userId],
          set: { totalPoints: sql`${bolaoRankings.totalPoints} + ${pts}`, updatedAt: now },
        })
    ),
  ];
  Promise.all(pgWrites).catch(err => console.error('[pg-shadow-write] incrementUserPoints:', err));
}

// ─── Seed de participante nos rankings (primeiro palpite) ─────────────────────

export async function ensureGlobalParticipant(userId: string): Promise<void> {
  await redis.zadd('bolao:global:ranking', { nx: true }, { score: 0, member: userId });
}

/**
 * Seeds a user into the "Só Brasil" ranking with 0 pts. Cosmetic only — zincrby
 * in the score cron auto-creates the member when points land, so scoring is
 * correct without this; the seed just shows 0-pt users before any Brazil game
 * finishes. Called from PUT /api/palpites when the fixture is a Brazil match.
 */
export async function ensureBrazilParticipant(userId: string): Promise<void> {
  await redis.zadd('bolao:brazil:ranking', { nx: true }, { score: 0, member: userId });

  db.insert(brazilRankings).values({ userId, totalPoints: 0 })
    .onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] ensureBrazilParticipant:', err));
}
