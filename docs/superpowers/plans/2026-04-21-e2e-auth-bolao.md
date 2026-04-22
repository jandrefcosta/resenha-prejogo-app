# E2E Tests: Auth + Bolão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar testes Playwright end-to-end de stack completo (sem mocks) para os fluxos de cadastro, login, acesso restrito e fluxos básicos do Bolão Copa 2026.

**Architecture:** Dois spec files novos (`auth.spec.ts`, `bolao.spec.ts`) que rodam contra o servidor local real com Redis ativo. Um helper `authHelper.ts` centraliza registro via API, injeção de cookie `sc_auth`, e cleanup cirúrgico de chaves Redis após cada suite. Nenhum mock de API — stack completo.

**Tech Stack:** Playwright, TypeScript, Upstash Redis (`@upstash/redis`), Node.js `execSync` para cleanup.

---

## Mapa de Arquivos

**Criar:**
- `tests/e2e/helpers/authHelper.ts` — `createTestUser`, `loginAs`, `cleanupTestData`
- `tests/e2e/auth.spec.ts` — 9 testes de auth (cadastro, login, logout, rotas restritas)
- `tests/e2e/bolao.spec.ts` — 9 testes de bolão (hub, criar, entrar, ranking, 404)

**Não modificar:** `playwright.config.ts`, specs existentes, código da aplicação.

---

## Contexto de codebase para o implementador

### Chaves Redis criadas pelo registro (necessárias para cleanup)

```
user:{userId}          — registro do usuário (campo `displayName` = username)
email:{emailHash}      — índice email→userId (hash SHA-256 do email)
username:{username}    — índice username→userId
session:{jti}          — sessão JWT válida (TTL 30d)
```

`emailHash` = `createHash('sha256').update(email.toLowerCase().trim()).digest('hex')`

### Cookie de auth

- Nome: `sc_auth` (exportado como `AUTH_COOKIE` em `src/lib/auth.ts`)
- httpOnly, sameSite: strict, path: /
- Presente na resposta de `POST /api/auth/login` e `POST /api/auth/register`

### Respostas das APIs de auth

```typescript
// POST /api/auth/register  → 201
{ user: { id, username, displayName, email, clubId, bio } }
// cookie sc_auth setado

// POST /api/auth/login  → 200
{ user: { id, username, displayName, email, clubId, bio } }
// cookie sc_auth setado

// POST /api/auth/login (senha errada) → 401
{ error: 'Email ou senha incorretos' }

// POST /api/auth/logout → 200
{ ok: true }
// cookie sc_auth removido (maxAge: 0)
```

### Rota de cadastro + login na UI

Ambos ficam em `/login` com tabs. Tab default: "Entrar". Tab "Criar conta" mostra campo username adicional.

### Middleware de proteção

`/api/bolao/((?!global|score).*)` e `/api/palpites/:path*` — retornam 401 sem `sc_auth`.

`/bolao/[id]` (page) — redireciona para `/?bolao={id}` se não autenticado.

---

## Task 1: authHelper.ts — createTestUser, loginAs, cleanupTestData

**Files:**
- Create: `tests/e2e/helpers/authHelper.ts`

- [ ] **Step 1: Criar o arquivo com os tipos e imports**

```typescript
import { createHash, execSync } from 'node:crypto';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

export interface TestUser {
  userId: string;
  email: string;
  password: string;
  username: string;
  jti?: string; // session id, preenchido após login
}
```

- [ ] **Step 2: Implementar `createTestUser`**

Chama `POST /api/auth/register` via Playwright request API. Extrai `userId` e `sc_auth` da resposta.

```typescript
export async function createTestUser(request: APIRequestContext): Promise<TestUser> {
  const ts = Date.now();
  const email = `e2e_${ts}@test.invalid`;
  const username = `e2e${ts}`;
  const password = 'TestPass123!';

  const res = await request.post('http://localhost:3000/api/auth/register', {
    data: { username, email, password },
  });

  if (res.status() !== 201) {
    const body = await res.text();
    throw new Error(`createTestUser failed ${res.status()}: ${body}`);
  }

  const data = await res.json();
  return { userId: data.user.id, email, password, username };
}
```

- [ ] **Step 3: Implementar `loginAs`**

Faz POST ao login, extrai cookie `sc_auth` do header `set-cookie` e injeta no contexto da página.

```typescript
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  const res = await page.request.post('/api/auth/login', {
    data: { email, password },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`loginAs failed ${res.status()}: ${body}`);
  }

  // Extrair token do header set-cookie
  const setCookie = res.headers()['set-cookie'] ?? '';
  const match = setCookie.match(/sc_auth=([^;]+)/);
  if (!match) throw new Error('sc_auth cookie not found in login response');

  await page.context().addCookies([{
    name: 'sc_auth',
    value: match[1],
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
}
```

- [ ] **Step 4: Implementar `cleanupTestData`**

Deleta todas as chaves Redis criadas durante o teste. Usa `execSync` com script Node inline ESM para rodar de forma síncrona no `afterAll`.

```typescript
export function cleanupTestData(opts: {
  users: Array<{ userId: string; email: string; username: string }>;
  bolaoIds?: string[];
  codigos?: string[];
  sessionJtis?: string[];
}): void {
  const { users, bolaoIds = [], codigos = [], sessionJtis = [] } = opts;

  // Construir lista de chaves a deletar
  const keysToDelete: string[] = [];
  const userIds: string[] = [];

  for (const u of users) {
    const emailHash = createHash('sha256')
      .update(u.email.toLowerCase().trim())
      .digest('hex');
    keysToDelete.push(
      `user:${u.userId}`,
      `email:${emailHash}`,
      `username:${u.username}`,
      `bolao:user:${u.userId}:boloes`,
      `palpite:user:${u.userId}:fixtures`,
    );
    userIds.push(u.userId);
  }

  for (const jti of sessionJtis) {
    keysToDelete.push(`session:${jti}`);
  }

  for (const id of bolaoIds) {
    keysToDelete.push(
      `bolao:${id}:meta`,
      `bolao:${id}:members`,
      `bolao:${id}:ranking`,
    );
  }

  for (const codigo of codigos) {
    keysToDelete.push(`bolao:code:${codigo}`);
  }

  const script = `
import { Redis } from '@upstash/redis';
const r = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const keys = ${JSON.stringify(keysToDelete)};
const userIds = ${JSON.stringify(userIds)};
await Promise.all([
  keys.length ? r.del(...keys) : Promise.resolve(),
  userIds.length ? r.zrem('bolao:global:ranking', ...userIds) : Promise.resolve(),
]);
console.log('cleanup ok', keys.length, 'keys,', userIds.length, 'ranking entries');
`.trim();

  try {
    execSync('node --input-type=module', {
      input: script,
      env: process.env,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (err) {
    // Cleanup failure não deve falhar os testes — apenas logar
    console.warn('[authHelper] cleanup warning:', err);
  }
}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd c:\Projetos\Pessoal\sports-compile
rtk npx tsc --noEmit 2>&1 | head -20
```

Expected: sem erros em `tests/e2e/helpers/authHelper.ts`.

- [ ] **Step 6: Commit**

```bash
rtk git add tests/e2e/helpers/authHelper.ts
rtk git commit -m "test: add authHelper (createTestUser, loginAs, cleanupTestData)"
```

---

## Task 2: auth.spec.ts — cadastro, login, logout, rotas restritas

**Files:**
- Create: `tests/e2e/auth.spec.ts`

**Contexto:** Cada teste cria seu próprio usuário e faz cleanup no `afterAll`. Os testes de rotas restritas (7, 8, 9) não precisam de usuário real — apenas verificam respostas 401 sem cookie.

- [ ] **Step 1: Criar o arquivo com setup e testes de cadastro e login via UI**

```typescript
import { test, expect } from '@playwright/test';
import { setupStorage } from './helpers/setup';
import { createTestUser, loginAs, cleanupTestData } from './helpers/authHelper';
import type { TestUser } from './helpers/authHelper';

// Usuários criados nesta suite para cleanup
const createdUsers: TestUser[] = [];

test.afterAll(() => {
  if (createdUsers.length === 0) return;
  cleanupTestData({ users: createdUsers });
});

// ─── Cadastro via UI ──────────────────────────────────────────────────────────

test('cadastro via UI — tab Criar conta', async ({ page, request }) => {
  await setupStorage(page);
  const ts = Date.now();
  const email = `e2e_ui_reg_${ts}@test.invalid`;
  const username = `e2eui${ts}`;
  const password = 'TestPass123!';

  await page.goto('/login');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).last().click();

  // Aguarda redirecionamento (returnTo default = '/')
  await expect(page).toHaveURL('/', { timeout: 8_000 });

  // Cookie sc_auth presente
  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === 'sc_auth');
  expect(authCookie).toBeTruthy();
  expect(authCookie?.httpOnly).toBe(true);

  // Registrar para cleanup — userId via API/me
  const meRes = await page.request.get('/api/auth/me');
  if (meRes.ok()) {
    const me = await meRes.json();
    createdUsers.push({ userId: me.user.id, email, username, password });
  }
});

// ─── Login via UI ─────────────────────────────────────────────────────────────

test('login via UI — tab Entrar', async ({ page, request }) => {
  await setupStorage(page);
  // Criar usuário via API para o teste de login UI
  const user = await createTestUser(request);
  createdUsers.push(user);

  await page.goto('/login');
  // Tab "Entrar" é o default — não precisa clicar

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).last().click();

  await expect(page).toHaveURL('/', { timeout: 8_000 });

  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'sc_auth')).toBeTruthy();
});

// ─── Login com credenciais inválidas ──────────────────────────────────────────

test('login com senha errada — exibe erro, sem redirecionamento', async ({ page, request }) => {
  await setupStorage(page);
  const user = await createTestUser(request);
  createdUsers.push(user);

  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Senha').fill('SenhaErrada99!');
  await page.getByRole('button', { name: 'Entrar' }).last().click();

  // Permanece em /login
  await expect(page).toHaveURL('/login', { timeout: 5_000 });
  // Mensagem de erro visível
  await expect(page.getByText(/email ou senha incorretos/i)).toBeVisible();
});

// ─── Logout ───────────────────────────────────────────────────────────────────

test('logout remove cookie sc_auth', async ({ page, request }) => {
  await setupStorage(page);
  const user = await createTestUser(request);
  createdUsers.push(user);

  await loginAs(page, user.email, user.password);
  await page.goto('/');

  // Chamar logout via API (mais confiável que buscar botão que pode não estar visível)
  await page.request.post('/api/auth/logout');

  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === 'sc_auth');
  expect(!authCookie || authCookie.value === '').toBe(true);
});

// ─── Sessão persiste após refresh ────────────────────────────────────────────

test('sessão persiste após page reload', async ({ page, request }) => {
  await setupStorage(page);
  const user = await createTestUser(request);
  createdUsers.push(user);

  await loginAs(page, user.email, user.password);
  await page.goto('/');
  await page.reload();

  // Cookie ainda presente após reload
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'sc_auth')).toBeTruthy();

  // /api/auth/me retorna o usuário
  const meRes = await page.request.get('/api/auth/me');
  expect(meRes.ok()).toBe(true);
  const me = await meRes.json();
  expect(me.user.email).toBe(user.email);
});

// ─── Rotas restritas sem auth ─────────────────────────────────────────────────

test('/bolao/[id] sem auth → redireciona para /?bolao=...', async ({ page }) => {
  await setupStorage(page);
  // Usar um ID qualquer — o middleware redireciona antes de chegar ao Redis
  await page.goto('/bolao/fake-id-sem-auth');
  await expect(page).toHaveURL(/\/\?bolao=fake-id-sem-auth/, { timeout: 5_000 });
});

test('GET /api/bolao sem auth → 401', async ({ page }) => {
  const res = await page.request.get('/api/bolao');
  expect(res.status()).toBe(401);
});

test('PUT /api/palpites/123 sem auth → 401', async ({ page }) => {
  const res = await page.request.put('/api/palpites/123', {
    data: { home: 1, away: 0 },
  });
  expect(res.status()).toBe(401);
});

test('POST /api/bolao sem auth → 401', async ({ page }) => {
  const res = await page.request.post('/api/bolao', {
    data: { nome: 'Teste Sem Auth' },
  });
  expect(res.status()).toBe(401);
});
```

- [ ] **Step 2: Rodar os testes e verificar**

```bash
cd c:\Projetos\Pessoal\sports-compile
rtk npx playwright test tests/e2e/auth.spec.ts --project=desktop 2>&1 | tail -30
```

Expected: todos os 9 testes passando. Se algum falhar, ajustar seletores conforme a UI real.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/auth.spec.ts
rtk git commit -m "test: add auth E2E spec (register, login, logout, protected routes)"
```

---

## Task 3: bolao.spec.ts — hub, criar bolão, entrar por código, ranking, 404

**Files:**
- Create: `tests/e2e/bolao.spec.ts`

**Contexto:** `beforeAll` cria dois usuários (criador e entrante). O criador cria um bolão no teste 3 e o `bolaoId`/`codigo` são capturados via URL/DOM para uso nos testes seguintes. `afterAll` faz cleanup completo.

- [ ] **Step 1: Criar o arquivo com setup e testes do hub**

```typescript
import { test, expect } from '@playwright/test';
import { setupStorage } from './helpers/setup';
import { createTestUser, loginAs, cleanupTestData } from './helpers/authHelper';
import type { TestUser } from './helpers/authHelper';

// Estado compartilhado entre testes desta suite
let userA: TestUser; // criador do bolão
let userB: TestUser; // entrante por código
let bolaoId: string;
let bolaoCodigo: string;

test.beforeAll(async ({ request }) => {
  userA = await createTestUser(request);
  userB = await createTestUser(request);
});

test.afterAll(() => {
  cleanupTestData({
    users: [userA, userB],
    bolaoIds: bolaoId ? [bolaoId] : [],
    codigos: bolaoCodigo ? [bolaoCodigo] : [],
  });
});

// ─── Hub /bolao — visitante ───────────────────────────────────────────────────

test('hub /bolao — visitante vê ranking global, sem seção Meus Bolões', async ({ page }) => {
  await setupStorage(page);
  await page.goto('/bolao');

  // Ranking Global sempre visível (público)
  await expect(page.getByRole('heading', { name: /ranking global/i })).toBeVisible({ timeout: 8_000 });

  // Seção de bolões privados ausente (só para logados)
  await expect(page.getByRole('heading', { name: /meus bolões privados/i })).not.toBeVisible();

  // CTA de login presente
  await expect(page.getByRole('link', { name: /criar conta/i })).toBeVisible();
});

// ─── Hub /bolao — logado ─────────────────────────────────────────────────────

test('hub /bolao — logado vê CTA palpites e seção Meus Bolões', async ({ page }) => {
  await setupStorage(page);
  await loginAs(page, userA.email, userA.password);
  await page.goto('/bolao');

  // CTA palpites visível
  await expect(page.getByRole('link', { name: /meus palpites/i })).toBeVisible({ timeout: 8_000 });

  // Seção de bolões privados presente
  await expect(page.getByRole('heading', { name: /meus bolões privados/i })).toBeVisible();
});

// ─── Criar bolão ─────────────────────────────────────────────────────────────

test('criar bolão — redireciona para /bolao/[id] com código visível', async ({ page }) => {
  await setupStorage(page);
  await loginAs(page, userA.email, userA.password);
  await page.goto('/bolao/novo');

  await page.getByLabel('Nome do bolão').fill('Bolão E2E Teste');
  await page.getByRole('button', { name: 'Criar Bolão' }).click();

  // Redireciona para /bolao/[id]
  await expect(page).toHaveURL(/\/bolao\/[a-f0-9-]{36}/, { timeout: 8_000 });

  // Capturar bolaoId da URL para uso nos próximos testes
  bolaoId = page.url().split('/bolao/')[1];

  // Código de convite visível (6 chars uppercase + dígitos)
  const codigoEl = page.locator('span.font-mono.font-bold').first();
  await expect(codigoEl).toBeVisible();
  bolaoCodigo = (await codigoEl.textContent()) ?? '';
  expect(bolaoCodigo).toMatch(/^[A-Z0-9]{6}$/);
});

// ─── Código de convite exibido ───────────────────────────────────────────────

test('código de convite (6 chars) está visível na página /bolao/[id]', async ({ page }) => {
  // Depende do teste anterior ter populado bolaoId
  test.skip(!bolaoId, 'bolaoId não disponível — teste de criação falhou');

  await setupStorage(page);
  await loginAs(page, userA.email, userA.password);
  await page.goto(`/bolao/${bolaoId}`);

  const codigoEl = page.locator('span.font-mono.font-bold').first();
  await expect(codigoEl).toBeVisible({ timeout: 5_000 });
  const codigo = await codigoEl.textContent();
  expect(codigo).toMatch(/^[A-Z0-9]{6}$/);
});

// ─── Entrar por código — válido ──────────────────────────────────────────────

test('entrar por código válido — redireciona para o bolão correto', async ({ page }) => {
  test.skip(!bolaoId || !bolaoCodigo, 'bolão não criado — teste de criação falhou');

  await setupStorage(page);
  await loginAs(page, userB.email, userB.password);
  await page.goto('/bolao');

  // Preencher campo de código
  await page.getByPlaceholder(/código/i).fill(bolaoCodigo);
  await page.keyboard.press('Enter');

  // Redireciona para o bolão correto
  await expect(page).toHaveURL(`/bolao/${bolaoId}`, { timeout: 8_000 });
});

// ─── Entrar por código — inválido ────────────────────────────────────────────

test('código inválido — sem redirecionamento, form permanece na hub', async ({ page }) => {
  await setupStorage(page);
  await loginAs(page, userA.email, userA.password);
  await page.goto('/bolao');

  await page.getByPlaceholder(/código/i).fill('XXXXXX');
  await page.keyboard.press('Enter');

  // Permanece em /bolao (Server Action retorna sem redirecionar)
  await expect(page).toHaveURL('/bolao', { timeout: 5_000 });
});

// ─── Ranking privado — criador aparece ───────────────────────────────────────

test('ranking privado — criador aparece com 0 pts', async ({ page }) => {
  test.skip(!bolaoId, 'bolaoId não disponível');

  await setupStorage(page);
  await loginAs(page, userA.email, userA.password);
  await page.goto(`/bolao/${bolaoId}`);

  // displayName do criador (= username, definido em createTestUser)
  await expect(page.getByText(userA.username, { exact: false })).toBeVisible({ timeout: 5_000 });

  // 0 pts visível no ranking
  await expect(page.getByText('0 pts')).toBeVisible();
});

// ─── Não-membro → 404 ────────────────────────────────────────────────────────

test('não-membro acessa bolão alheio → 404', async ({ page, request }) => {
  test.skip(!bolaoId, 'bolaoId não disponível');

  // Criar terceiro usuário isolado que nunca entrou no bolão
  const userC = await createTestUser(request);

  await setupStorage(page);
  await loginAs(page, userC.email, userC.password);
  await page.goto(`/bolao/${bolaoId}`);

  // Next.js notFound() renderiza a página de erro 404
  await expect(page.getByRole('heading', { name: /404|not found/i })).toBeVisible({ timeout: 5_000 });

  // Cleanup do usuário temporário inline
  cleanupTestData({ users: [userC] });
});

// ─── /bolao/[id] sem auth → redirect ─────────────────────────────────────────

test('/bolao/[id] sem auth → redireciona para /?bolao=...', async ({ page }) => {
  test.skip(!bolaoId, 'bolaoId não disponível');

  await setupStorage(page);
  // Sem loginAs — sem cookie
  await page.goto(`/bolao/${bolaoId}`);

  await expect(page).toHaveURL(new RegExp(`\\?bolao=${bolaoId}`), { timeout: 5_000 });
});
```

- [ ] **Step 2: Rodar os testes e verificar**

```bash
cd c:\Projetos\Pessoal\sports-compile
rtk npx playwright test tests/e2e/bolao.spec.ts --project=desktop 2>&1 | tail -40
```

Expected: todos os 9 testes passando. Os testes 4-9 dependem do teste 3 (criar bolão) — se o 3 falhar os demais são pulados com `test.skip`.

- [ ] **Step 3: Commit**

```bash
rtk git add tests/e2e/bolao.spec.ts
rtk git commit -m "test: add bolao E2E spec (hub, create, join, ranking, 404)"
```

---

## Task 4: Verificação final — suites completas + testes existentes

**Files:** nenhum — só execução e verificação.

- [ ] **Step 1: Rodar toda a suite E2E nova**

```bash
cd c:\Projetos\Pessoal\sports-compile
rtk npx playwright test tests/e2e/auth.spec.ts tests/e2e/bolao.spec.ts --project=desktop 2>&1 | tail -40
```

Expected: `18 passed` (9 auth + 9 bolão). Tempo total: ~20-40s.

- [ ] **Step 2: Verificar que os testes existentes continuam passando**

```bash
rtk npx playwright test tests/e2e/mobile.spec.ts tests/e2e/club-selector.spec.ts tests/e2e/match-section.spec.ts tests/e2e/match-ficha.spec.ts --project=desktop 2>&1 | tail -20
```

Expected: todos passando (esses usam mocks, não são afetados).

- [ ] **Step 3: Verificar cleanup Redis**

Confirmar que após os testes, as chaves de teste não existem mais. Executar no terminal:

```bash
node --input-type=module <<'EOF'
import { Redis } from '@upstash/redis';
const r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const keys = await r.keys('e2e_*');
console.log('Chaves e2e_ restantes:', keys);
EOF
```

Expected: `Chaves e2e_ restantes: []` (ou vazio). Se houver resíduos, é sinal que o cleanup falhou silenciosamente — investigar o log de `[authHelper] cleanup warning`.

- [ ] **Step 4: Commit final**

```bash
rtk git add -A
rtk git commit -m "test: E2E auth+bolao suite complete — 18 tests, full stack, Redis cleanup"
```

---

## Variáveis de Ambiente Necessárias

Já presentes no `.env.local` do projeto:
```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
JWT_SECRET=...
```

---

## Self-Review — Cobertura da Spec

| Requisito da Spec | Task |
|---|---|
| `createTestUser` via `POST /api/auth/register` | Task 1 |
| `loginAs` com injeção de cookie `sc_auth` | Task 1 |
| `cleanupTestData` com cleanup Redis cirúrgico | Task 1 |
| Cadastro via UI (tab "Criar conta" em `/login`) | Task 2 |
| Login via UI (tab "Entrar" em `/login`) | Task 2 |
| Login com credenciais inválidas → erro | Task 2 |
| Logout → cookie removido | Task 2 |
| Sessão persiste após refresh | Task 2 |
| `/bolao/[id]` sem auth → redirect `/?bolao=...` | Tasks 2 e 3 |
| `GET /api/bolao` sem auth → 401 | Task 2 |
| `PUT /api/palpites` sem auth → 401 | Task 2 |
| `POST /api/bolao` sem auth → 401 | Task 2 |
| Hub `/bolao` visitante — ranking visível, sem bolões privados | Task 3 |
| Hub `/bolao` logado — CTA palpites + seção bolões privados | Task 3 |
| Criar bolão via UI → redirect + código visível | Task 3 |
| Código convite 6 chars uppercase exibido | Task 3 |
| Entrar por código válido → redirect correto | Task 3 |
| Entrar por código inválido → sem crash, sem redirect | Task 3 |
| Ranking privado — criador com 0 pts | Task 3 |
| Não-membro → 404 | Task 3 |
| Cleanup Redis após testes | Tasks 1, 2, 3 |
| Testes existentes não quebram | Task 4 |
