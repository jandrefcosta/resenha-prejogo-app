# Migração para Postgres — Fase 0 + Fase 1 — Design

> Status: **approved** · Data: 2026-06-08 · Autor: João André + Claude
>
> Parte de um plano maior (4 fases) para tornar o Postgres a fonte de verdade
> primária, com o Redis rebaixado a cache + leaderboard. Este spec cobre só as
> **Fases 0 e 1**. Fases 2–4 (backfill, cutover de leitura, descomissionamento)
> terão specs próprios.

## 1. Objetivo

- **Fase 0 — Migrações no deploy:** hoje `railway.toml` só roda `npm run build`;
  não há passo de `migrate`. Mudanças de schema (ex.: `brazil_rankings`) só
  chegam em produção por execução manual. Automatizar a aplicação das migrações
  no deploy.
- **Fase 1 — Write de `users` confiável + FK guard:** o write de `users` no
  Postgres é fire-and-forget (`userIdentity.ts:77,100`); quando falha, o usuário
  fica ausente do PG e **todo** write com FK pra `users` quebra com `23503`
  (observado em `ensureBrazilParticipant`). Tornar o write de `users`
  autoritativo (soft-fail) e blindar os writes dependentes do domínio bolão.

## 2. Contexto do que já existe

- **Driver:** `postgres-js` via `drizzle-orm/postgres-js` (`src/lib/db/index.ts`).
  Migração programática usa `drizzle-orm/postgres-js/migrator`.
- **`drizzle.config.ts`:** `out: './drizzle'`, dialect `postgresql`, lê
  `DATABASE_URL`. Migrações já existem em `drizzle/` (`0000_*`, `0001_*`) com
  `drizzle/meta/_journal.json`.
- **Quem cria dados com FK pra `users`:** rotas de bolão/palpites/scores exigem
  `getCurrentUser()` (JWT de sessão válido) → **só usuários registrados**. O
  `sc_uid` (`IDENTITY_COOKIE`) é identidade anônima separada, usada pelo feed
  social (inacabado) — **fora de escopo** desta fase.
- **`registerOrUpdateUser`** (`userIdentity.ts`): grava Redis primeiro (`user:{id}`
  com TTL 1 ano + `email:{hash}`), depois faz o insert/upsert de `users` no PG em
  fire-and-forget. Dois branches: email já existente (upsert) e usuário novo
  (insert `onConflictDoNothing`).
- **Writes com FK pra `users` no domínio bolão** (`bolaoRedis.ts` + cron de
  score): `createBolao`, `joinBolao`, `savePalpite`, `saveScore`,
  `incrementUserPoints`, `ensureBrazilParticipant`, e os 2 loops de
  `src/app/api/bolao/score/route.ts`. Todos fire-and-forget.
- **Infra de teste:** vitest `environment: 'node'`, sem DB nem jsdom. Só lógica
  pura é unit-testável; I/O é verificado manual/staging.

## 3. Decisões tomadas (brainstorming)

| Decisão | Escolha |
|---|---|
| Estado final (projeto) | **PG primário de verdade** (backfill + writes confiáveis + cutover de leitura); este spec é só Fase 0+1 |
| Mecanismo de migrate no deploy | **Script `.mjs` programático** (migrator do postgres-js) no `startCommand`, antes do `start` |
| Falha no write de `users` | **Soft + reconciliação** — login não quebra; write awaited com retry; log no Sentry; cron de reconciliação fica pra Fase 4 |
| Escopo de writes confiáveis na Fase 1 | **Só `users` + FK guard** nos writes do domínio bolão; demais seguem fire-and-forget até a Fase 3 |
| Defesa pra usuários legados | **`ensureUserPersisted(userId)`** antes dos writes dependentes, até o backfill da Fase 2 |

## 4. Fase 0 — Migrações no deploy

### 4.1 `scripts/migrate.mjs` (novo)

`.mjs` de propósito: usa só dependências de runtime (`postgres`,
`drizzle-orm/postgres-js/migrator`) — sem `tsx`/`drizzle-kit` em produção, onde
devDependencies podem ser podadas. O migrator aplica os SQLs de `./drizzle` e não
importa o schema TS.

```js
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL não definido');
  process.exit(1);
}

// max: 1 — uma conexão dedicada, fechada ao fim (migrator roda em transação).
const client = postgres(url, { max: 1, ssl: 'require' });

try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('[migrate] OK');
} catch (err) {
  console.error('[migrate] FALHOU:', err);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

### 4.2 `package.json`

```json
"migrate": "node scripts/migrate.mjs"
```

### 4.3 `railway.toml`

```toml
[deploy]
startCommand = "npm run migrate && npm run start"
```

- Com `&&`, se a migração falhar o app **não sobe** — preferível a servir contra
  schema errado. `restartPolicyMaxRetries = 3` (já existente) cobre falhas
  transientes de conexão.
- Roda a cada deploy/restart; migrações já aplicadas são puladas via
  `__drizzle_migrations`. App single-instance no Railway → sem corrida.

## 5. Fase 1 — Write de `users` autoritativo + FK guard

### 5.1 `userRecordToRow` (novo, puro — testável)

Mapeia um `UserRecord` do Redis para os valores de insert de `users`. Extraído
pra ser unit-testável; consumido por `registerOrUpdateUser` e
`ensureUserPersisted`.

```ts
import type { NewUser } from './db/schema';

export function userRecordToRow(userId: string, r: UserRecord): NewUser {
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

### 5.2 `registerOrUpdateUser` — write awaited com retry (soft-fail)

- Manter a ordem atual: **Redis primeiro** (login funciona mesmo com PG fora),
  depois o write de `users` no PG.
- Trocar o `.catch(console.error)` fire-and-forget por uma chamada **awaited**
  com **retry (2 tentativas)** via um helper `persistUserToPg(userId, record)`
  que usa `userRecordToRow` + `onConflictDoUpdate` (atualiza `ip`/`lastSeen`).
- Em falha após os retries: **não lançar** — logar no **Sentry**
  (`captureException`) e retornar o `userId` normalmente. Login não quebra.
- Vale pros dois branches (email existente / usuário novo).

### 5.3 `ensureUserPersisted(userId)` (novo)

```ts
export async function ensureUserPersisted(userId: string): Promise<void> {
  const record = await getUserById(userId);          // Redis user:{id}
  if (!record) {
    // Não dá pra backfillar sem o record (ex.: expirou). Loga e segue —
    // o write dependente vai falhar no FK e será logado normalmente.
    Sentry.captureMessage(`ensureUserPersisted: user ${userId} ausente do Redis`);
    return;
  }
  await db.insert(users).values(userRecordToRow(userId, record))
    .onConflictDoNothing();
}
```

Idempotente. Custo: 1 GET Redis + 1 upsert — aceitável no caminho de shadow-write.

### 5.4 FK guard nos writes do domínio bolão

Em cada write com FK pra `users`, encadear `ensureUserPersisted(userId)` **antes**
do insert dependente, dentro da própria cadeia fire-and-forget (garante o pai
antes do filho, sem mudar o caráter best-effort do shadow-write):

```ts
// Antes:
db.insert(palpites).values({...}).onConflictDoUpdate({...})
  .catch(err => console.error('[pg-shadow-write] savePalpite:', err));

// Depois:
ensureUserPersisted(userId)
  .then(() => db.insert(palpites).values({...}).onConflictDoUpdate({...}))
  .catch(err => console.error('[pg-shadow-write] savePalpite:', err));
```

Aplicar em: `createBolao` (adminId), `joinBolao`, `savePalpite`, `saveScore`,
`incrementUserPoints`, `ensureBrazilParticipant`, e os 2 loops do cron de score
(`bolao/score/route.ts:101,185`). Para writes que envolvem múltiplos `userId`
(nenhum no domínio bolão hoje — todos são por usuário único), garantir cada um.

> O guard é **ponte temporária**: depois do backfill da Fase 2 todo usuário
> legado já existirá no PG e o guard vira no-op (upsert que não faz nada). Mantê-lo
> ainda protege contra o caso soft-fail (write de users que falhou e não foi
> reconciliado ainda).

## 6. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `scripts/migrate.mjs` | **NOVO** — migrator programático |
| `package.json` | + script `migrate` |
| `railway.toml` | `startCommand` roda `migrate` antes do `start` |
| `src/lib/userIdentity.ts` | + `userRecordToRow`, + `ensureUserPersisted`, write de `users` awaited com retry + Sentry (soft-fail) |
| `src/lib/userIdentity.test.ts` | **NOVO** — testes de `userRecordToRow` |
| `src/lib/bolaoRedis.ts` | FK guard (`ensureUserPersisted`) nos 6 writes dependentes |
| `src/app/api/bolao/score/route.ts` | FK guard nos 2 loops do cron |

## 7. Testes

**Unit (`node`, vitest):**
- `userRecordToRow`: record completo → todos os campos; record mínimo (sem
  `username`/`displayName`/`bio`/`clubId`/`passwordHash`) → `null` nesses campos;
  `createdAt`/`lastSeen` viram `Date`.

**Manual / staging (documentado — sem DB no CI):**
- `npm run migrate` contra um Postgres de teste → tabelas criadas +
  `__drizzle_migrations` populado; rodar 2× → segunda execução é no-op.
- Simular usuário legado (record no Redis, ausente em `users`) → uma ação de
  bolão (ex.: salvar palpite) → `ensureUserPersisted` insere o user e o write
  dependente sucede (sem `23503`).
- Deploy: confirmar que `startCommand` aplica a migração antes do app subir.

## 8. Casos de borda

- **Migração falha no deploy:** app não sobe (`&&`); retries da política cobrem
  transiente; falha persistente exige correção da migração (comportamento
  desejado).
- **`user:{id}` expirou do Redis (TTL 1 ano):** `ensureUserPersisted` não tem
  como backfillar; loga e o write dependente falha no FK como hoje. A remoção do
  TTL é tratada na Fase 4.
- **PG fora durante registro:** login continua (Redis), user fica pendente de
  reconciliação; `ensureUserPersisted` cobre o próximo write de bolão; cron de
  reconciliação (Fase 4) cobre quem não fizer nenhuma ação.
- **`ensureUserPersisted` concorrente (2 ações quase simultâneas):**
  `onConflictDoNothing` torna o upsert idempotente — sem erro de duplicata.

## 9. Fora de escopo (próximas fases)

- **Fase 2:** backfill histórico Redis→PG (todas as entidades, ordem FK-safe) +
  relatório de reconciliação.
- **Fase 3:** cutover de leitura por domínio + tornar os demais dual-writes
  autoritativos; rebaixar Redis a cache/leaderboard.
- **Fase 4:** cron de reconciliação PG↔Redis, remoção do TTL de 1 ano dos
  `user:{id}`, monitoramento.
- **Social** (`socialRedis.ts`, identidades `sc_uid`): tratado no cutover social
  da Fase 3.
