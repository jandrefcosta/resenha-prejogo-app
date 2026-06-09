# Migração para Postgres — Fase 0 + Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar migrações Drizzle automaticamente no deploy e tornar o write de `users` no Postgres confiável (soft-fail), eliminando os erros de FK `23503` nos writes do domínio bolão.

**Architecture:** Um script `.mjs` programático roda o migrator do postgres-js no `startCommand` do Railway antes do app subir. No app, o write de `users` vira awaited com retry (sem derrubar o login), e um helper `ensureUserPersisted` faz upsert do usuário (a partir do Redis) antes de cada write dependente com FK pra `users`, blindando usuários legados até o backfill (Fase 2). A lógica pura de mapeamento (`UserRecord` → linha de `users`) vive num módulo sem I/O para ser unit-testável.

**Tech Stack:** TypeScript, Next.js 16, Drizzle ORM (`drizzle-orm/postgres-js`), `postgres` (postgres-js), Upstash Redis, Sentry (`@sentry/nextjs`), Vitest (`environment: node`), Railway (nixpacks).

**Spec:** `docs/superpowers/specs/2026-06-08-migracao-postgres-fase-0-1-design.md`

---

## File Structure

- **Create `src/lib/userRow.ts`** — módulo puro (sem imports de `./db`/`./redisCache`): mapper `userRecordToRow`. Importa só `NewUser` de `./db/schema`. Testável em `node`.
- **Create `src/lib/userRow.test.ts`** — testes unit do mapper.
- **Create `scripts/migrate.mjs`** — runner programático de migrações (só deps de runtime).
- **Modify `package.json`** — script `migrate`.
- **Modify `railway.toml`** — `startCommand` roda `migrate` antes de `start`.
- **Modify `src/lib/userIdentity.ts`** — usa `userRecordToRow`; write de `users` awaited com retry + Sentry; novo `ensureUserPersisted`.
- **Modify `src/lib/bolaoRedis.ts`** — FK guard (`ensureUserPersisted`) em 6 writes dependentes.
- **Modify `src/app/api/bolao/score/route.ts`** — FK guard nos 2 loops do cron.

---

## Task 1: Pure mapper `userRecordToRow` (TDD)

**Files:**
- Create: `src/lib/userRow.ts`
- Test: `src/lib/userRow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/userRow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { userRecordToRow } from './userRow';

describe('userRecordToRow', () => {
  it('maps a full record to a users row', () => {
    const row = userRecordToRow('u1', {
      email: 'a@b.com',
      emailHash: 'hash',
      ip: '1.2.3.4',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeen: '2026-02-01T00:00:00.000Z',
      username: 'joao',
      displayName: 'João',
      bio: 'oi',
      clubId: 'flamengo',
      passwordHash: 'pw',
    });

    expect(row).toEqual({
      id: 'u1',
      email: 'a@b.com',
      emailHash: 'hash',
      username: 'joao',
      displayName: 'João',
      bio: 'oi',
      clubId: 'flamengo',
      passwordHash: 'pw',
      ip: '1.2.3.4',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSeen: new Date('2026-02-01T00:00:00.000Z'),
    });
  });

  it('defaults optional social fields to null on a minimal record', () => {
    const row = userRecordToRow('u2', {
      email: 'c@d.com',
      emailHash: 'h2',
      ip: '9.9.9.9',
      createdAt: '2026-03-01T00:00:00.000Z',
      lastSeen: '2026-03-01T00:00:00.000Z',
    });

    expect(row.username).toBeNull();
    expect(row.displayName).toBeNull();
    expect(row.bio).toBeNull();
    expect(row.clubId).toBeNull();
    expect(row.passwordHash).toBeNull();
  });

  it('parses ISO date strings into Date instances', () => {
    const row = userRecordToRow('u3', {
      email: 'e@f.com',
      emailHash: 'h3',
      ip: '0.0.0.0',
      createdAt: '2026-04-01T12:00:00.000Z',
      lastSeen: '2026-04-02T12:00:00.000Z',
    });

    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.lastSeen).toBeInstanceOf(Date);
    expect((row.createdAt as Date).toISOString()).toBe('2026-04-01T12:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/userRow.test.ts`
Expected: FAIL — `Cannot find module './userRow'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/userRow.ts`:

```ts
// Pure mapper: Redis UserRecord -> Postgres `users` insert row. No I/O imports
// (no ./db client, no ./redisCache) so it stays unit-testable in the node env,
// mirroring bolaoScoring.ts / teamIdentity.ts. Consumed by userIdentity.ts.
import type { NewUser } from './db/schema';

/** Structural shape of the Redis user record needed to build a users row. */
export interface UserRecordInput {
  email: string;
  emailHash: string;
  ip?: string;
  createdAt: string;
  lastSeen: string;
  username?: string;
  displayName?: string;
  bio?: string;
  clubId?: string;
  passwordHash?: string;
}

export function userRecordToRow(userId: string, r: UserRecordInput): NewUser {
  return {
    id:           userId,
    email:        r.email,
    emailHash:    r.emailHash,
    username:     r.username ?? null,
    displayName:  r.displayName ?? null,
    bio:          r.bio ?? null,
    clubId:       r.clubId ?? null,
    passwordHash: r.passwordHash ?? null,
    ip:           r.ip ?? null,
    createdAt:    new Date(r.createdAt),
    lastSeen:     new Date(r.lastSeen),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/userRow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/userRow.ts src/lib/userRow.test.ts
git commit -m "feat: add pure userRecordToRow mapper for Postgres users rows"
```

---

## Task 2: Migrations on deploy (Phase 0)

**Files:**
- Create: `scripts/migrate.mjs`
- Modify: `package.json` (scripts)
- Modify: `railway.toml` (`[deploy].startCommand`)

- [ ] **Step 1: Create the migrate runner**

Create `scripts/migrate.mjs`:

```js
// Runs pending Drizzle migrations from ./drizzle against DATABASE_URL.
// .mjs on purpose: uses only runtime deps (postgres, drizzle-orm) so it works
// in the production image without tsx/drizzle-kit (devDeps may be pruned).
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL not set');
  process.exit(1);
}

// max: 1 — single dedicated connection, closed at the end. The migrator runs
// each migration in a transaction and records them in __drizzle_migrations.
const client = postgres(url, { max: 1, ssl: 'require' });

try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('[migrate] OK');
} catch (err) {
  console.error('[migrate] FAILED:', err);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

- [ ] **Step 2: Add the `migrate` npm script**

In `package.json`, inside `"scripts"`, add after the `"start"` line:

```json
    "migrate": "node scripts/migrate.mjs",
```

- [ ] **Step 3: Wire migrate into the Railway start command**

In `railway.toml`, change the `[deploy]` block's `startCommand`:

```toml
[deploy]
startCommand = "npm run migrate && npm run start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

(Only the `startCommand` line changes; leave the rest of `[deploy]` as-is.)

- [ ] **Step 4: Manual verification (against a test/staging Postgres)**

> Not run in CI — there is no database in the test environment. Run locally
> against a disposable DB or staging, with `DATABASE_URL` set.

Run: `npm run migrate`
Expected: prints `[migrate] OK`; tables exist (`brazil_rankings`, etc.) and a `__drizzle_migrations` table is populated.

Run again: `npm run migrate`
Expected: `[migrate] OK` with no new migrations applied (idempotent).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate.mjs package.json railway.toml
git commit -m "feat: run drizzle migrations on deploy via migrate.mjs"
```

---

## Task 3: Authoritative `users` write + `ensureUserPersisted` (Phase 1 core)

**Files:**
- Modify: `src/lib/userIdentity.ts`

This task is I/O (Redis + Postgres) — no unit test; verified via build + manual.

- [ ] **Step 1: Update imports**

In `src/lib/userIdentity.ts`, replace the top import block:

```ts
import { createHash, randomUUID } from 'crypto';
import { redis } from './redisCache';
import { db } from './db';
import { users } from './db/schema';
```

with:

```ts
import { createHash, randomUUID } from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { redis } from './redisCache';
import { db } from './db';
import { users } from './db/schema';
import { userRecordToRow } from './userRow';
```

- [ ] **Step 2: Add the `persistUserToPg` helper (awaited, retry, soft-fail)**

In `src/lib/userIdentity.ts`, add this private helper immediately above
`registerOrUpdateUser`:

```ts
/**
 * Upserts a user row into Postgres, awaited with one retry. Soft-fail: on final
 * failure it does NOT throw (login must not depend on Postgres being up) — it
 * reports to Sentry. onConflictDoUpdate refreshes ip/lastSeen for existing rows.
 */
async function persistUserToPg(userId: string, record: UserRecord): Promise<void> {
  const row = userRecordToRow(userId, record);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await db.insert(users).values(row).onConflictDoUpdate({
        target: users.id,
        set: { ip: row.ip, lastSeen: row.lastSeen },
      });
      return;
    } catch (err) {
      if (attempt === 2) {
        Sentry.captureException(err, { tags: { area: 'pg-user-write' } });
      }
    }
  }
}
```

- [ ] **Step 3: Replace the fire-and-forget write in the existing-email branch**

In `registerOrUpdateUser`, replace this block:

```ts
    if (existing) {
      db.insert(users).values({
        id:           existingByEmail,
        email:        existing.email,
        emailHash,
        username:     existing.username ?? null,
        displayName:  existing.displayName ?? null,
        bio:          existing.bio ?? null,
        clubId:       existing.clubId ?? null,
        passwordHash: existing.passwordHash ?? null,
        ip,
        createdAt:    new Date(existing.createdAt),
        lastSeen:     new Date(now),
      }).onConflictDoUpdate({
        target: users.id,
        set: { ip, lastSeen: new Date(now) },
      }).catch(err => console.error('[pg-shadow-write] userIdentity update:', err));
    }
    return existingByEmail;
```

with:

```ts
    if (existing) {
      await persistUserToPg(existingByEmail, { ...existing, ip, lastSeen: now });
    }
    return existingByEmail;
```

- [ ] **Step 4: Replace the fire-and-forget write in the new-user branch**

In `registerOrUpdateUser`, replace this block:

```ts
  db.insert(users).values({
    id: userId,
    email,
    emailHash,
    ip,
    createdAt: new Date(now),
    lastSeen:  new Date(now),
  }).onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] userIdentity insert:', err));

  return userId;
```

with:

```ts
  await persistUserToPg(userId, record);

  return userId;
```

- [ ] **Step 5: Add `ensureUserPersisted`**

At the end of `src/lib/userIdentity.ts`, add:

```ts
/**
 * Ensures the user exists in Postgres before an FK-dependent write references
 * them. Reads the Redis user record and upserts it (onConflictDoNothing).
 * Bridges legacy users (registered before the PG dual-write, or whose write
 * soft-failed) until the Phase 2 backfill. No-op once the user is present.
 */
export async function ensureUserPersisted(userId: string): Promise<void> {
  const record = await getUserById(userId);
  if (!record) {
    Sentry.captureMessage(`ensureUserPersisted: user ${userId} missing from Redis`, 'warning');
    return;
  }
  await db.insert(users).values(userRecordToRow(userId, record)).onConflictDoNothing();
}
```

- [ ] **Step 6: Verify build + lint**

Run: `npm run build`
Expected: `Compiled successfully`.

Run: `npx eslint src/lib/userIdentity.ts src/lib/userRow.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/userIdentity.ts
git commit -m "feat: make Postgres users write authoritative with retry + ensureUserPersisted"
```

---

## Task 4: FK guard in `bolaoRedis.ts` (6 writes)

**Files:**
- Modify: `src/lib/bolaoRedis.ts`

I/O — no unit test; verified via build + lint. Each edit prepends
`ensureUserPersisted(userId)` to the dependent write chain (parent before child),
keeping the overall write fire-and-forget.

- [ ] **Step 1: Import `ensureUserPersisted`**

In `src/lib/bolaoRedis.ts`, add below the existing `import { db } from './db';` line:

```ts
import { ensureUserPersisted } from './userIdentity';
```

(No circular import: `userIdentity.ts` does not import `bolaoRedis.ts`.)

- [ ] **Step 2: Guard `createBolao`**

Replace:

```ts
  db.insert(boloes).values({ id, adminId, nome, codigo, createdAt })
    .onConflictDoNothing()
    .then(() => db.insert(bolaoMembers).values({ bolaoId: id, userId: adminId, joinedAt: createdAt }).onConflictDoNothing())
    .catch(err => console.error('[pg-shadow-write] createBolao:', err));
```

with:

```ts
  ensureUserPersisted(adminId)
    .then(() => db.insert(boloes).values({ id, adminId, nome, codigo, createdAt }).onConflictDoNothing())
    .then(() => db.insert(bolaoMembers).values({ bolaoId: id, userId: adminId, joinedAt: createdAt }).onConflictDoNothing())
    .catch(err => console.error('[pg-shadow-write] createBolao:', err));
```

- [ ] **Step 3: Guard `joinBolao`**

Replace:

```ts
  db.insert(bolaoMembers).values({ bolaoId, userId })
    .onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] joinBolao:', err));
```

with:

```ts
  ensureUserPersisted(userId)
    .then(() => db.insert(bolaoMembers).values({ bolaoId, userId }).onConflictDoNothing())
    .catch(err => console.error('[pg-shadow-write] joinBolao:', err));
```

- [ ] **Step 4: Guard `savePalpite`**

Replace:

```ts
  db.insert(palpites).values({ userId, fixtureId, homeGoals: home, awayGoals: away, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [palpites.userId, palpites.fixtureId],
      set: { homeGoals: home, awayGoals: away, updatedAt: now },
    })
    .catch(err => console.error('[pg-shadow-write] savePalpite:', err));
```

with:

```ts
  ensureUserPersisted(userId)
    .then(() => db.insert(palpites).values({ userId, fixtureId, homeGoals: home, awayGoals: away, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [palpites.userId, palpites.fixtureId],
        set: { homeGoals: home, awayGoals: away, updatedAt: now },
      }))
    .catch(err => console.error('[pg-shadow-write] savePalpite:', err));
```

- [ ] **Step 5: Guard `saveScore`**

Replace:

```ts
  db.insert(scoresTable).values({ userId, fixtureId, points: pts, outcome })
    .onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] saveScore:', err));
```

with:

```ts
  ensureUserPersisted(userId)
    .then(() => db.insert(scoresTable).values({ userId, fixtureId, points: pts, outcome }).onConflictDoNothing())
    .catch(err => console.error('[pg-shadow-write] saveScore:', err));
```

- [ ] **Step 6: Guard `incrementUserPoints`**

Replace:

```ts
  Promise.all(pgWrites).catch(err => console.error('[pg-shadow-write] incrementUserPoints:', err));
```

with:

```ts
  ensureUserPersisted(userId)
    .then(() => Promise.all(pgWrites))
    .catch(err => console.error('[pg-shadow-write] incrementUserPoints:', err));
```

(The `pgWrites` array holds unexecuted Drizzle queries; they run when `Promise.all` is awaited inside the `.then`, so guarding the user first is correct.)

- [ ] **Step 7: Guard `ensureBrazilParticipant`**

Replace:

```ts
  db.insert(brazilRankings).values({ userId, totalPoints: 0 })
    .onConflictDoNothing()
    .catch(err => console.error('[pg-shadow-write] ensureBrazilParticipant:', err));
```

with:

```ts
  ensureUserPersisted(userId)
    .then(() => db.insert(brazilRankings).values({ userId, totalPoints: 0 }).onConflictDoNothing())
    .catch(err => console.error('[pg-shadow-write] ensureBrazilParticipant:', err));
```

- [ ] **Step 8: Verify build + lint**

Run: `npm run build`
Expected: `Compiled successfully`.

Run: `npx eslint src/lib/bolaoRedis.ts`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/bolaoRedis.ts
git commit -m "fix: ensure user exists in Postgres before bolão FK writes"
```

---

## Task 5: FK guard in the score cron (2 loops)

**Files:**
- Modify: `src/app/api/bolao/score/route.ts`

- [ ] **Step 1: Import `ensureUserPersisted`**

In `src/app/api/bolao/score/route.ts`, add below the existing
`import { db } from '@/lib/db';` line:

```ts
import { ensureUserPersisted } from '@/lib/userIdentity';
```

- [ ] **Step 2: Guard loop 1 (group-stage scoring)**

Replace:

```ts
        Promise.all(pgWrites).catch(err => console.error('[pg-shadow-write] score cron:', err));
```

with:

```ts
        ensureUserPersisted(userId)
          .then(() => Promise.all(pgWrites))
          .catch(err => console.error('[pg-shadow-write] score cron:', err));
```

- [ ] **Step 3: Guard loop 2 (Só Brasil scoring)**

Replace:

```ts
        Promise.all(pgWrites).catch(err => console.error('[pg-shadow-write] brazil score cron:', err));
```

with:

```ts
        ensureUserPersisted(userId)
          .then(() => Promise.all(pgWrites))
          .catch(err => console.error('[pg-shadow-write] brazil score cron:', err));
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build`
Expected: `Compiled successfully`.

Run: `npx eslint "src/app/api/bolao/score/route.ts"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/bolao/score/route.ts"
git commit -m "fix: ensure user exists in Postgres before score cron FK writes"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit`
Expected: the new `userRow` suite passes; total pass count increases by 3.
Known pre-existing failures (NOT from this work): 3 tests in
`src/app/api/admin/force-reprocess-docs/route.test.ts` — leave as-is.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Manual integration check (staging/local with DATABASE_URL + Redis)**

1. Create a Redis `user:{id}` record with NO matching row in Postgres `users`
   (simulates a legacy user).
2. Perform a bolão action as that user (e.g., save a palpite, or run the score
   cron over a finished Brazil match they guessed).
3. Confirm the `users` row now exists and the dependent write succeeded — no
   `23503` in the logs.

---

## Self-Review (done at write time)

- **Spec coverage:** Fase 0 → Task 2. Fase 1 `userRecordToRow` → Task 1;
  authoritative users write + `ensureUserPersisted` → Task 3; FK guard (bolão +
  cron) → Tasks 4 & 5. Tests → Task 1 + manual steps. All spec sections mapped.
- **Placeholder scan:** none — every code step shows full code.
- **Type/name consistency:** `userRecordToRow(userId, record)`,
  `ensureUserPersisted(userId)`, `persistUserToPg(userId, record)` used
  consistently across tasks; `UserRecordInput` (userRow.ts) is structurally
  compatible with `UserRecord` (userIdentity.ts), so `persistUserToPg` /
  `ensureUserPersisted` can pass a `UserRecord` to `userRecordToRow`.
