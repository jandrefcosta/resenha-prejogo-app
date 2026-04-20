# Bolão Copa 2026 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o Bolão Copa 2026 — feature de palpites com ranking global público e bolões privados por convite, sobre os dados de jogos já existentes em `/copa-2026`.

**Architecture:** Redis como único data store (Sorted Sets para rankings, Sets para membros, JSON para meta/palpites/scores). Auth reutiliza o JWT `sc_auth` existente via `getCurrentUser()`. Cron Vercel a cada 30min calcula pontos idempotentemente para jogos finalizados.

**Tech Stack:** Next.js App Router, TypeScript, Upstash Redis (`@upstash/redis`), `nanoid` (novo), `jose` (existente), Tailwind CSS 4.

---

## Mapa de Arquivos

**Criar:**
- `src/lib/bolaoRedis.ts` — todos os helpers Redis do bolão (tipos + funções)
- `src/app/api/bolao/route.ts` — POST criar bolão + GET `/api/bolao/me`
- `src/app/api/bolao/join/route.ts` — POST entrar por código
- `src/app/api/bolao/global/route.ts` — GET ranking global
- `src/app/api/bolao/[id]/route.ts` — GET meta + ranking privado
- `src/app/api/bolao/score/route.ts` — POST cron de pontuação
- `src/app/api/palpites/route.ts` — GET todos palpites do usuário
- `src/app/api/palpites/[fixtureId]/route.ts` — PUT salvar palpite
- `src/components/bolao/RankingTable.tsx` — tabela de ranking (global e privado)
- `src/components/bolao/BolaoCard.tsx` — card de bolão privado na lista
- `src/components/bolao/PalpiteRow.tsx` — linha de palpite com inputs
- `src/components/bolao/RodadaTabs.tsx` — tabs R1/R2/R3 com contadores
- `src/app/bolao/page.tsx` — hub principal
- `src/app/bolao/palpites/page.tsx` — grid de palpites
- `src/app/bolao/novo/page.tsx` — criar bolão privado
- `src/app/bolao/[id]/page.tsx` — bolão privado individual

**Modificar:**
- `vercel.json` — adicionar cron `/api/bolao/score`
- `src/middleware.ts` — proteger rotas `/api/bolao/*` (exceto global) e `/api/palpites/*`
- `src/app/layout.tsx` — adicionar link "Bolão" na navegação

---

## Task 1: Instalar nanoid e criar bolaoRedis.ts

**Files:**
- Create: `src/lib/bolaoRedis.ts`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Instalar nanoid**

```bash
cd c:\Projetos\Pessoal\sports-compile
npm install nanoid
```

Expected: `added 1 package` sem erros.

- [ ] **Step 2: Criar src/lib/bolaoRedis.ts com tipos e helpers**

```typescript
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
  const { randomUUID } = await import('crypto');
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
  pipeline.zadd(`bolao:${bolaoId}:ranking`, { score: 0, member: userId, nx: true });
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
  if (pts === 0) return;
  const bolaoIds = await redis.smembers<string[]>(`bolao:user:${userId}:boloes`);
  const pipeline = redis.pipeline();
  pipeline.zincrby('bolao:global:ranking', pts, userId);
  for (const bolaoId of bolaoIds) {
    pipeline.zincrby(`bolao:${bolaoId}:ranking`, pts, userId);
  }
  await pipeline.exec();
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
  await redis.zadd('bolao:global:ranking', { score: 0, member: userId, nx: true });
}
```

- [ ] **Step 3: Verificar que o TypeScript compila**

```bash
cd c:\Projetos\Pessoal\sports-compile
npx tsc --noEmit 2>&1 | head -30
```

Expected: sem erros relacionados a `bolaoRedis.ts`.

- [ ] **Step 4: Commit**

```bash
rtk git add src/lib/bolaoRedis.ts package.json package-lock.json
rtk git commit -m "feat: add bolaoRedis helpers and install nanoid"
```

---

## Task 2: API — PUT /api/palpites/[fixtureId] e GET /api/palpites

**Files:**
- Create: `src/app/api/palpites/route.ts`
- Create: `src/app/api/palpites/[fixtureId]/route.ts`

- [ ] **Step 1: Criar src/app/api/palpites/route.ts**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserPalpites } from '@/lib/bolaoRedis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const palpites = await getUserPalpites(user.sub);
  return NextResponse.json({ palpites });
}
```

- [ ] **Step 2: Criar src/app/api/palpites/[fixtureId]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { savePalpite, ensureGlobalParticipant } from '@/lib/bolaoRedis';
import { getCache, TTL_1H } from '@/lib/redisCache';
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
  if (copa) {
    const allMatches = Object.values(copa.phases).flat();
    const match = allMatches.find((m) => m.id === fixtureId);
    if (match && match.status !== 'postponed') {
      const kickoff = new Date(match.date);
      if (Date.now() >= kickoff.getTime()) {
        return NextResponse.json({ error: 'Palpite travado — jogo já começou' }, { status: 403 });
      }
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

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Testar manualmente com curl (desenvolvimento)**

```bash
# Sem auth → espera 401
curl -X PUT http://localhost:3000/api/palpites/123456 \
  -H "Content-Type: application/json" \
  -d '{"home":2,"away":0}'
```

Expected: `{"error":"Não autenticado"}`

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/api/palpites/
rtk git commit -m "feat: add PUT /api/palpites/[fixtureId] and GET /api/palpites"
```

---

## Task 3: API — Bolão CRUD (criar, join, me, global, privado)

**Files:**
- Create: `src/app/api/bolao/route.ts`
- Create: `src/app/api/bolao/join/route.ts`
- Create: `src/app/api/bolao/global/route.ts`
- Create: `src/app/api/bolao/[id]/route.ts`

- [ ] **Step 1: Criar src/app/api/bolao/route.ts (POST criar + GET me)**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createBolao, getUserBoloes, getBolaoMeta } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.nome || typeof body.nome !== 'string') {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 });
  }

  const nome = body.nome.trim().slice(0, 50);
  if (!nome) return NextResponse.json({ error: 'nome inválido' }, { status: 400 });

  const meta = await createBolao(nome, user.sub);
  return NextResponse.json({ bolao: meta }, { status: 201 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const bolaoIds = await getUserBoloes(user.sub);
  if (bolaoIds.length === 0) return NextResponse.json({ boloes: [] });

  const metas = await Promise.all(bolaoIds.map((id) => getBolaoMeta(id)));

  const boloes = await Promise.all(
    metas
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map(async (meta) => {
        const memberCount = await redis.scard(`bolao:${meta.id}:members`);
        const position = await redis.zrevrank(`bolao:${meta.id}:ranking`, user.sub);
        const totalPts = (await redis.zscore(`bolao:${meta.id}:ranking`, user.sub)) ?? 0;
        return {
          ...meta,
          memberCount,
          position: position !== null ? position + 1 : null,
          totalPts,
        };
      }),
  );

  return NextResponse.json({ boloes });
}
```

- [ ] **Step 2: Criar src/app/api/bolao/join/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBolaoByCode, joinBolao, getBolaoMeta } from '@/lib/bolaoRedis';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.codigo || typeof body.codigo !== 'string') {
    return NextResponse.json({ error: 'codigo é obrigatório' }, { status: 400 });
  }

  const bolaoId = await getBolaoByCode(body.codigo.trim());
  if (!bolaoId) {
    return NextResponse.json({ error: 'Código de convite inválido' }, { status: 404 });
  }

  await joinBolao(bolaoId, user.sub);
  const meta = await getBolaoMeta(bolaoId);
  return NextResponse.json({ bolao: meta });
}
```

- [ ] **Step 3: Criar src/app/api/bolao/global/route.ts**

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getRanking, getUserRankPosition, getUserScore } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

// Retorna top 50 do ranking global + posição do usuário logado (se houver)
export async function GET() {
  const user = await getCurrentUser();

  const rawRanking = await getRanking('bolao:global:ranking', 50);

  // Enriquecer com username/displayName — buscar user records
  const enriched = await Promise.all(
    rawRanking.map(async (entry, i) => {
      const record = await redis.get<{ username?: string; displayName?: string }>(
        `user:${entry.member}`,
      );
      return {
        userId: entry.member,
        username: record?.username ?? entry.member.slice(0, 8),
        displayName: record?.displayName ?? record?.username ?? 'Anônimo',
        totalPts: entry.score,
        position: i + 1,
      };
    }),
  );

  let myPosition: number | null = null;
  let myPts = 0;

  if (user) {
    myPosition = await getUserRankPosition('bolao:global:ranking', user.sub);
    myPts = await getUserScore('bolao:global:ranking', user.sub);
  }

  return NextResponse.json({
    ranking: enriched,
    total: await redis.zcard('bolao:global:ranking'),
    me: user ? { position: myPosition, totalPts: myPts } : null,
  });
}
```

- [ ] **Step 4: Criar src/app/api/bolao/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBolaoMeta, getRanking, getUserRankPosition } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const meta = await getBolaoMeta(id);
  if (!meta) return NextResponse.json({ error: 'Bolão não encontrado' }, { status: 404 });

  const user = await getCurrentUser();

  const rawRanking = await getRanking(`bolao:${id}:ranking`, 100);
  const enriched = await Promise.all(
    rawRanking.map(async (entry, i) => {
      const record = await redis.get<{ username?: string; displayName?: string }>(
        `user:${entry.member}`,
      );
      return {
        userId: entry.member,
        username: record?.username ?? entry.member.slice(0, 8),
        displayName: record?.displayName ?? record?.username ?? 'Anônimo',
        totalPts: entry.score,
        position: i + 1,
      };
    }),
  );

  const memberCount = await redis.scard(`bolao:${id}:members`);

  let myPosition: number | null = null;
  if (user) {
    myPosition = await getUserRankPosition(`bolao:${id}:ranking`, user.sub);
  }

  return NextResponse.json({
    bolao: { ...meta, memberCount },
    ranking: enriched,
    myPosition,
  });
}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: sem erros nos novos arquivos.

- [ ] **Step 6: Commit**

```bash
rtk git add src/app/api/bolao/ src/app/api/palpites/
rtk git commit -m "feat: add bolao CRUD API routes (create, join, me, global, private)"
```

---

## Task 4: API — Cron de pontuação POST /api/bolao/score

**Files:**
- Create: `src/app/api/bolao/score/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Criar src/app/api/bolao/score/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  getFixtureParticipants,
  getPalpite,
  scoreExists,
  saveScore,
  calcPts,
  incrementUserPoints,
} from '@/lib/bolaoRedis';
import { getCache } from '@/lib/redisCache';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Autenticar cron via secret header
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!auth || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const copa = await getCache<CopaFixturesPayload>('copa-fixtures:2026');
  if (!copa) {
    return NextResponse.json({ error: 'Copa fixtures not cached yet' }, { status: 503 });
  }

  // Apenas fase de grupos (48 jogos)
  const groupMatches = copa.phases['Grupos'] ?? [];
  const finishedMatches = groupMatches.filter(
    (m) => m.status === 'finished' && m.score?.home !== null && m.score?.away !== null,
  );

  let processed = 0;
  let skipped = 0;

  for (const match of finishedMatches) {
    const participants = await getFixtureParticipants(match.id);

    for (const userId of participants) {
      if (await scoreExists(userId, match.id)) {
        skipped++;
        continue;
      }

      const palpite = await getPalpite(userId, match.id);
      if (!palpite) continue;

      const resultado = { home: match.score!.home!, away: match.score!.away! };
      const { pts, outcome } = calcPts(palpite, resultado);

      await saveScore(userId, match.id, pts, outcome);
      await incrementUserPoints(userId, pts);
      processed++;
    }
  }

  return NextResponse.json({
    ok: true,
    finishedMatches: finishedMatches.length,
    processed,
    skipped,
  });
}
```

- [ ] **Step 2: Adicionar cron no vercel.json**

Arquivo atual:
```json
{
  "crons": [
    {
      "path": "/api/admin/run-docs-cron",
      "schedule": "0 13 * * *"
    }
  ]
}
```

Substituir por:
```json
{
  "crons": [
    {
      "path": "/api/admin/run-docs-cron",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/bolao/score",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Adicionar CRON_SECRET ao .env.local**

```bash
# Adicionar ao .env.local (se não existir)
echo "CRON_SECRET=your-secret-here" >> .env.local
```

Gerar um secret forte: `openssl rand -base64 32`

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/api/bolao/score/route.ts vercel.json
rtk git commit -m "feat: add score cron endpoint and vercel schedule"
```

---

## Task 5: Middleware — proteger rotas autenticadas

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Atualizar src/middleware.ts**

Arquivo atual:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const payload = await getCurrentUser(req);
  if (!payload) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/social/:path*'],
};
```

Substituir por:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const payload = await getCurrentUser(req);
  if (!payload) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/social/:path*',
    // Bolão — excluir rotas públicas (global, score-cron usa auth próprio)
    '/api/bolao/((?!global|score).*)',
    '/api/palpites/:path*',
  ],
};
```

- [ ] **Step 2: Verificar que /api/bolao/global ainda é acessível sem auth**

```bash
curl http://localhost:3000/api/bolao/global
```

Expected: JSON com `ranking: []` (ou dados se existirem), sem 401.

- [ ] **Step 3: Commit**

```bash
rtk git add src/middleware.ts
rtk git commit -m "feat: extend middleware to protect bolao and palpites routes"
```

---

## Task 6: Componentes — RankingTable, BolaoCard, PalpiteRow, RodadaTabs

**Files:**
- Create: `src/components/bolao/RankingTable.tsx`
- Create: `src/components/bolao/BolaoCard.tsx`
- Create: `src/components/bolao/PalpiteRow.tsx`
- Create: `src/components/bolao/RodadaTabs.tsx`

- [ ] **Step 1: Criar src/components/bolao/RankingTable.tsx**

```typescript
'use client';

export interface RankingEntry {
  userId: string;
  username: string;
  displayName: string;
  totalPts: number;
  position: number;
}

interface Props {
  entries: RankingEntry[];
  myUserId?: string;
}

export function RankingTable({ entries, myUserId }: Props) {
  if (entries.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-6">Nenhum participante ainda.</p>;
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.userId === myUserId;
        return (
          <div
            key={entry.userId}
            className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 ${
              isMe ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-400 w-6 text-right">
                {entry.position}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {entry.displayName}
                  {isMe && <span className="ml-1 text-blue-600 text-xs">(você)</span>}
                </p>
                <p className="text-xs text-gray-400">@{entry.username}</p>
              </div>
            </div>
            <span className="text-sm font-bold text-gray-900">{entry.totalPts} pts</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Criar src/components/bolao/BolaoCard.tsx**

```typescript
'use client';
import Link from 'next/link';

interface Props {
  id: string;
  nome: string;
  codigo: string;
  memberCount: number;
  position: number | null;
  totalPts: number;
}

export function BolaoCard({ id, nome, codigo, memberCount, position, totalPts }: Props) {
  return (
    <Link
      href={`/bolao/${id}`}
      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <div>
        <p className="font-semibold text-gray-900">{nome}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Código: <span className="font-mono font-bold">{codigo}</span> · {memberCount} participante
          {memberCount !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="text-right">
        {position !== null ? (
          <>
            <p className="text-sm font-bold text-gray-900">{totalPts} pts</p>
            <p className="text-xs text-gray-400">{position}º lugar</p>
          </>
        ) : (
          <p className="text-xs text-gray-400">Sem palpites</p>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Criar src/components/bolao/PalpiteRow.tsx**

```typescript
'use client';
import { useState, useCallback } from 'react';

export interface PalpiteData {
  home: number;
  away: number;
  locked: boolean;
  ts: string;
}

export interface ScoreData {
  pts: number;
  outcome: 'exact' | 'correct' | 'miss';
}

interface Props {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  palpite?: PalpiteData;
  score?: ScoreData;
  actualScore?: { home: number | null; away: number | null };
  isLocked: boolean;
}

const outcomeColors = {
  exact: 'bg-green-50 border-green-200',
  correct: 'bg-blue-50 border-blue-200',
  miss: 'bg-gray-50 border-gray-200',
};

export function PalpiteRow({
  fixtureId,
  homeTeam,
  awayTeam,
  date,
  palpite,
  score,
  actualScore,
  isLocked,
}: Props) {
  const [homeVal, setHomeVal] = useState(palpite?.home?.toString() ?? '');
  const [awayVal, setAwayVal] = useState(palpite?.away?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (h: string, a: string) => {
      const home = parseInt(h, 10);
      const away = parseInt(a, 10);
      if (isNaN(home) || isNaN(away) || home < 0 || away < 0) return;
      setSaving(true);
      try {
        await fetch(`/api/palpites/${fixtureId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ home, away }),
        });
      } finally {
        setSaving(false);
      }
    },
    [fixtureId],
  );

  const dateStr = new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const containerClass = score
    ? `border rounded-xl p-3 ${outcomeColors[score.outcome]}`
    : !palpite && !isLocked
    ? 'border border-dashed border-amber-300 bg-amber-50 rounded-xl p-3'
    : 'border border-gray-200 rounded-xl p-3';

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{dateStr}</span>
        {score && (
          <span className={`text-xs font-bold ${score.pts > 0 ? 'text-green-700' : 'text-gray-400'}`}>
            +{score.pts} pts
            {score.outcome === 'exact' ? ' · Acerto exato!' : score.outcome === 'correct' ? ' · Resultado certo' : ' · Errou'}
          </span>
        )}
        {saving && <span className="text-xs text-gray-400">Salvando…</span>}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-right text-sm font-medium truncate">{homeTeam}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={99}
            value={homeVal}
            disabled={isLocked || !!score}
            onChange={(e) => setHomeVal(e.target.value)}
            onBlur={() => save(homeVal, awayVal)}
            className="w-9 text-center border border-gray-300 rounded-md p-1 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500"
          />
          <span className="text-gray-400 text-sm">×</span>
          <input
            type="number"
            min={0}
            max={99}
            value={awayVal}
            disabled={isLocked || !!score}
            onChange={(e) => setAwayVal(e.target.value)}
            onBlur={() => save(homeVal, awayVal)}
            className="w-9 text-center border border-gray-300 rounded-md p-1 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>
        <span className="flex-1 text-sm font-medium truncate">{awayTeam}</span>
      </div>

      {score && actualScore && (
        <p className="text-xs text-center text-gray-400 mt-1.5">
          Resultado real: {actualScore.home} × {actualScore.away}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Criar src/components/bolao/RodadaTabs.tsx**

```typescript
'use client';

interface Props {
  rodada: 1 | 2 | 3;
  counts: { r1: { filled: number; total: number }; r2: { filled: number; total: number }; r3: { filled: number; total: number } };
  onChange: (r: 1 | 2 | 3) => void;
}

export function RodadaTabs({ rodada, counts, onChange }: Props) {
  const tabs: Array<{ key: 1 | 2 | 3; label: string; count: { filled: number; total: number } }> = [
    { key: 1, label: 'Rodada 1', count: counts.r1 },
    { key: 2, label: 'Rodada 2', count: counts.r2 },
    { key: 3, label: 'Rodada 3', count: counts.r3 },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const active = rodada === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              active
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}{' '}
            <span className={`text-xs ${active ? 'opacity-80' : 'opacity-60'}`}>
              ({tab.count.filled}/{tab.count.total})
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: sem erros nos componentes novos.

- [ ] **Step 6: Commit**

```bash
rtk git add src/components/bolao/
rtk git commit -m "feat: add bolao UI components (RankingTable, BolaoCard, PalpiteRow, RodadaTabs)"
```

---

## Task 7: Página /bolao — Hub principal

**Files:**
- Create: `src/app/bolao/page.tsx`

- [ ] **Step 1: Criar src/app/bolao/page.tsx**

```typescript
import { getCurrentUser } from '@/lib/auth';
import { getUserBoloes, getBolaoMeta, getRanking, getUserRankPosition, getUserScore } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';
import { RankingTable } from '@/components/bolao/RankingTable';
import { BolaoCard } from '@/components/bolao/BolaoCard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getGlobalTop5() {
  const raw = await getRanking('bolao:global:ranking', 5);
  return Promise.all(
    raw.map(async (entry, i) => {
      const record = await redis.get<{ username?: string; displayName?: string }>(`user:${entry.member}`);
      return {
        userId: entry.member,
        username: record?.username ?? entry.member.slice(0, 8),
        displayName: record?.displayName ?? record?.username ?? 'Anônimo',
        totalPts: entry.score,
        position: i + 1,
      };
    }),
  );
}

export default async function BolaoPage() {
  const user = await getCurrentUser();

  const top5 = await getGlobalTop5();
  const totalParticipants = await redis.zcard('bolao:global:ranking');

  let myBoloes: Awaited<ReturnType<typeof getBolaoMeta>>[] = [];
  let myBoloesMeta: Array<{
    id: string; nome: string; codigo: string;
    memberCount: number; position: number | null; totalPts: number;
  }> = [];
  let myGlobalPosition: number | null = null;
  let myGlobalPts = 0;
  let myPalpiteCount = 0;

  if (user) {
    const bolaoIds = await getUserBoloes(user.sub);
    myBoloes = await Promise.all(bolaoIds.map((id) => getBolaoMeta(id)));

    myBoloesMeta = await Promise.all(
      myBoloes
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map(async (meta) => {
          const memberCount = await redis.scard(`bolao:${meta.id}:members`);
          const position = await redis.zrevrank(`bolao:${meta.id}:ranking`, user.sub);
          const totalPts = (await redis.zscore(`bolao:${meta.id}:ranking`, user.sub)) ?? 0;
          return { ...meta, memberCount, position: position !== null ? position + 1 : null, totalPts };
        }),
    );

    myGlobalPosition = await getUserRankPosition('bolao:global:ranking', user.sub);
    myGlobalPts = await getUserScore('bolao:global:ranking', user.sub);

    const fixtureSet = await redis.smembers<string[]>(`palpite:user:${user.sub}:fixtures`);
    myPalpiteCount = fixtureSet.length;
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🏆 Bolão Copa 2026</h1>

      {/* Ranking Global */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Ranking Global</h2>
          <span className="text-xs text-gray-400">{totalParticipants} participantes</span>
        </div>
        <RankingTable entries={top5} myUserId={user?.sub} />
        {user && myGlobalPosition && myGlobalPosition > 5 && (
          <div className="mt-2 flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl text-sm">
            <span className="text-blue-700 font-medium">Sua posição: {myGlobalPosition}º</span>
            <span className="text-blue-700 font-bold">{myGlobalPts} pts</span>
          </div>
        )}
      </section>

      {/* CTA palpites */}
      {user ? (
        <Link
          href="/bolao/palpites"
          className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-semibold py-3 rounded-xl transition-colors"
        >
          ✏️ Meus Palpites ({myPalpiteCount}/48 preenchidos)
        </Link>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
          <p className="font-semibold text-gray-900 mb-1">Quer participar?</p>
          <p className="text-sm text-gray-500 mb-4">Crie uma conta para palpitar e entrar no ranking</p>
          <Link
            href="/api/auth/login"
            className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg font-medium text-sm"
          >
            Criar conta / Entrar
          </Link>
        </div>
      )}

      {/* Meus bolões privados */}
      {user && (
        <section>
          <h2 className="font-semibold text-gray-900 mb-3">Meus Bolões Privados</h2>
          <div className="space-y-2">
            {myBoloesMeta.map((b) => (
              <BolaoCard key={b.id} {...b} />
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Link
              href="/bolao/novo"
              className="flex-1 border border-dashed border-gray-300 rounded-xl py-3 text-center text-sm text-gray-500 hover:border-gray-400 transition-colors"
            >
              + Criar bolão
            </Link>
            <JoinBolaoButton />
          </div>
        </section>
      )}
    </main>
  );
}

// Botão client para entrar por código (inline para evitar arquivo extra)
function JoinBolaoButton() {
  'use client';
  // Renderizado no servidor — redirect via form action
  return (
    <form
      action={async (fd: FormData) => {
        'use server';
        const codigo = (fd.get('codigo') as string)?.trim().toUpperCase();
        if (!codigo) return;
        const { redirect } = await import('next/navigation');
        const user = await getCurrentUser();
        if (!user) return;
        const { getBolaoByCode, joinBolao } = await import('@/lib/bolaoRedis');
        const bolaoId = await getBolaoByCode(codigo);
        if (bolaoId) {
          await joinBolao(bolaoId, user.sub);
          redirect(`/bolao/${bolaoId}`);
        }
      }}
      className="flex-1"
    >
      <input
        name="codigo"
        placeholder="Código (ex: TRAB42)"
        className="w-full border border-dashed border-gray-300 rounded-xl py-3 px-3 text-center text-sm text-gray-700 placeholder:text-gray-400"
      />
    </form>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
rtk git add src/app/bolao/page.tsx
rtk git commit -m "feat: add /bolao hub page"
```

---

## Task 8: Página /bolao/palpites — Grid de palpites

**Files:**
- Create: `src/app/bolao/palpites/page.tsx`

- [ ] **Step 1: Criar src/app/bolao/palpites/page.tsx**

```typescript
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getUserPalpites, getScore } from '@/lib/bolaoRedis';
import { getCache } from '@/lib/redisCache';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';
import { PalpiteRow } from '@/components/bolao/PalpiteRow';
import { RodadaTabsWrapper } from '@/components/bolao/RodadaTabsWrapper';
import type { Match } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ROUND_KEYS: Record<string, 1 | 2 | 3> = {
  'Rodada 1': 1,
  'Rodada 2': 2,
  'Rodada 3': 3,
};

export default async function PalpitesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');

  const copa = await getCache<CopaFixturesPayload>('copa-fixtures:2026');
  const groupMatches: Match[] = copa?.phases['Grupos'] ?? [];

  const now = Date.now();

  // Enriquecer com palpites e scores
  const palpites = await getUserPalpites(user.sub);

  const matchesWithData = await Promise.all(
    groupMatches.map(async (m) => {
      const palpite = palpites[m.id];
      const score = palpite ? await getScore(user.sub, m.id) : null;
      const isLocked = m.status !== 'postponed' && now >= new Date(m.date).getTime();
      return { match: m, palpite: palpite ?? null, score: score ?? null, isLocked };
    }),
  );

  // Separar por rodada
  const byRound: Record<1 | 2 | 3, typeof matchesWithData> = { 1: [], 2: [], 3: [] };
  for (const item of matchesWithData) {
    const r = ROUND_KEYS[item.match.round];
    if (r) byRound[r].push(item);
  }

  const counts = {
    r1: { filled: byRound[1].filter((i) => i.palpite).length, total: byRound[1].length },
    r2: { filled: byRound[2].filter((i) => i.palpite).length, total: byRound[2].length },
    r3: { filled: byRound[3].filter((i) => i.palpite).length, total: byRound[3].length },
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">✏️ Meus Palpites</h1>
      <RodadaTabsWrapper counts={counts} byRound={byRound} />
    </main>
  );
}
```

- [ ] **Step 2: Criar src/components/bolao/RodadaTabsWrapper.tsx (Client Component)**

```typescript
'use client';
import { useState } from 'react';
import { RodadaTabs } from './RodadaTabs';
import { PalpiteRow } from './PalpiteRow';
import type { PalpiteData, ScoreData } from './PalpiteRow';
import type { Match } from '@/lib/types';

interface MatchItem {
  match: Match;
  palpite: PalpiteData | null;
  score: ScoreData | null;
  isLocked: boolean;
}

interface Props {
  counts: {
    r1: { filled: number; total: number };
    r2: { filled: number; total: number };
    r3: { filled: number; total: number };
  };
  byRound: Record<1 | 2 | 3, MatchItem[]>;
}

export function RodadaTabsWrapper({ counts, byRound }: Props) {
  const [rodada, setRodada] = useState<1 | 2 | 3>(1);
  const items = byRound[rodada];

  return (
    <div className="space-y-4">
      <RodadaTabs rodada={rodada} counts={counts} onChange={setRodada} />
      <div className="space-y-2">
        {items.map((item) => (
          <PalpiteRow
            key={item.match.id}
            fixtureId={item.match.id}
            homeTeam={item.match.homeTeam.name}
            awayTeam={item.match.awayTeam.name}
            date={item.match.date}
            palpite={item.palpite ?? undefined}
            score={item.score ?? undefined}
            actualScore={item.match.score}
            isLocked={item.isLocked}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/bolao/palpites/ src/components/bolao/RodadaTabsWrapper.tsx
rtk git commit -m "feat: add /bolao/palpites page with round tabs and auto-save"
```

---

## Task 9: Páginas /bolao/novo e /bolao/[id]

**Files:**
- Create: `src/app/bolao/novo/page.tsx`
- Create: `src/app/bolao/[id]/page.tsx`

- [ ] **Step 1: Criar src/app/bolao/novo/page.tsx**

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NovoBolaoPage() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!nome.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bolao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Erro ao criar bolão');
        return;
      }
      const { bolao } = await res.json();
      router.push(`/bolao/${bolao.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Criar Bolão Privado</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do bolão
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Bolão do Trabalho"
            maxLength={50}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={loading || !nome.trim()}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? 'Criando…' : 'Criar Bolão'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-4 text-center">
        Um código de convite será gerado automaticamente.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Criar src/app/bolao/[id]/page.tsx**

```typescript
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getBolaoMeta, getRanking, getUserRankPosition } from '@/lib/bolaoRedis';
import { redis } from '@/lib/redisCache';
import { RankingTable } from '@/components/bolao/RankingTable';
import Link from 'next/link';
import type { RankingEntry } from '@/components/bolao/RankingTable';

export const dynamic = 'force-dynamic';

export default async function BolaoPrivadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meta = await getBolaoMeta(id);
  if (!meta) notFound();

  const user = await getCurrentUser();

  const rawRanking = await getRanking(`bolao:${id}:ranking`, 100);
  const entries: RankingEntry[] = await Promise.all(
    rawRanking.map(async (entry, i) => {
      const record = await redis.get<{ username?: string; displayName?: string }>(
        `user:${entry.member}`,
      );
      return {
        userId: entry.member,
        username: record?.username ?? entry.member.slice(0, 8),
        displayName: record?.displayName ?? record?.username ?? 'Anônimo',
        totalPts: entry.score,
        position: i + 1,
      };
    }),
  );

  const memberCount = await redis.scard(`bolao:${id}:members`);
  let myPosition: number | null = null;
  if (user) {
    myPosition = await getUserRankPosition(`bolao:${id}:ranking`, user.sub);
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{meta.nome}</h1>
        <p className="text-sm text-gray-400 mt-1">
          Código:{' '}
          <span className="font-mono font-bold text-gray-700">{meta.codigo}</span> ·{' '}
          {memberCount} participante{memberCount !== 1 ? 's' : ''}
          {myPosition && ` · você está em ${myPosition}º`}
        </p>
      </div>

      <RankingTable entries={entries} myUserId={user?.sub} />

      <div className="flex gap-3">
        <Link
          href="/bolao/palpites"
          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-center font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          ✏️ Meus Palpites
        </Link>
        <ShareButton nome={meta.nome} codigo={meta.codigo} id={id} />
      </div>
    </main>
  );
}

function ShareButton({ nome, codigo, id }: { nome: string; codigo: string; id: string }) {
  'use client';
  async function handleShare() {
    const url = `${window.location.origin}/bolao/${id}`;
    const text = `Participe do meu bolão da Copa 2026: "${nome}"\nCódigo: ${codigo}\n${url}`;
    if (navigator.share) {
      await navigator.share({ title: nome, text, url });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Link copiado!');
    }
  }

  return (
    <button
      onClick={handleShare}
      className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm transition-colors"
    >
      Compartilhar 📤
    </button>
  );
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/bolao/novo/ src/app/bolao/\[id\]/
rtk git commit -m "feat: add /bolao/novo and /bolao/[id] pages"
```

---

## Task 10: Navegação — link Bolão no layout

**Files:**
- Modify: `src/app/layout.tsx` (ou componente de nav existente)

- [ ] **Step 1: Verificar estrutura do layout atual**

```bash
grep -n "copa\|nav\|href\|Link" src/app/layout.tsx | head -20
```

- [ ] **Step 2: Adicionar link "Bolão" na navegação**

Localizar onde o link para `/copa-2026` está no layout e adicionar ao lado:

```typescript
// Antes (exemplo):
<Link href="/copa-2026">Copa 2026</Link>

// Depois:
<Link href="/copa-2026">Copa 2026</Link>
<Link href="/bolao">Bolão</Link>
```

O local exato depende do layout atual. Procurar por `copa-2026` no arquivo.

- [ ] **Step 3: Verificar visualmente no browser**

```bash
npm run dev
```

Abrir http://localhost:3000 e confirmar que o link "Bolão" aparece na navegação.

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/layout.tsx
rtk git commit -m "feat: add Bolão link to navigation"
```

---

## Task 11: Verificação end-to-end

- [ ] **Step 1: Rodar o app em desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Testar fluxo completo (cheklist manual)**

1. Acessar http://localhost:3000/bolao sem login → ranking global visível, CTA "Criar conta"
2. Fazer login com conta existente → ver "Meus Palpites (0/48)" e seção de bolões privados
3. Acessar /bolao/palpites → ver tabs R1/R2/R3, jogos sem palpite em amarelo
4. Preencher 2-3 palpites → confirmar salvamento automático (sem botão)
5. Acessar /bolao/novo → criar bolão "Teste" → redireciona para /bolao/[id] com código gerado
6. Entrar no bolão pelo código na tela /bolao
7. Testar PUT após kickoff simulado: mudar data no banco ou testar com fixture já passado → esperar 403

- [ ] **Step 3: Verificar TypeScript final**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit final**

```bash
rtk git add -A
rtk git commit -m "feat: Bolão Copa 2026 MVP complete"
```

---

## Variáveis de Ambiente Necessárias

```env
# Já existentes
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
JWT_SECRET=...
API_FOOTBALL_KEY=...

# Nova
CRON_SECRET=...   # gerar com: openssl rand -base64 32
```

---

## Self-Review — Cobertura da Spec

| Requisito da Spec | Task que implementa |
|---|---|
| Ranking global público | Task 3 (GET global), Task 7 (hub page) |
| Bolões privados por convite | Task 1 (bolaoRedis), Task 3 (create/join), Task 9 (novo/[id]) |
| Auth existente (sc_auth) | Task 2, 3 — usam `getCurrentUser()` |
| Rota `/bolao` primeiro nível | Task 7 |
| 48 jogos fase de grupos | Task 8 (filtra `phases['Grupos']`) |
| Layout por rodada R1/R2/R3 | Task 6 (RodadaTabs), Task 8 |
| Opt-in global automático | Task 1 (`ensureGlobalParticipant`) + Task 2 (PUT chama) |
| Lock por jogo no kickoff | Task 2 (PUT verifica kickoff), Task 8 (isLocked) |
| Pontuação 10/5/0 | Task 1 (`calcPts`) |
| Cron idempotente 30min | Task 4 (`scoreExists` antes de gravar) |
| Visitante vê ranking sem login | Task 3 (global sem auth), Task 7 (renderiza sem user) |
| Compartilhar Web Share API | Task 9 (`ShareButton`) |
| nanoid para códigos | Task 1 (`generateInviteCode`) |
| Middleware proteção rotas | Task 5 |
| Cron no vercel.json | Task 4 |
| Link Bolão na nav | Task 10 |
