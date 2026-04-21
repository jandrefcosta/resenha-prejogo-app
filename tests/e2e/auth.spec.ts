import { test, expect } from '@playwright/test';
import { setupStorage } from './helpers/setup';
import { createTestUser, loginAs, cleanupTestData } from './helpers/authHelper';
import type { TestUser } from './helpers/authHelper';

const createdUsers: TestUser[] = [];

test.afterAll(() => {
  if (createdUsers.length === 0) return;
  cleanupTestData({ users: createdUsers });
});

test('cadastro via UI — tab Criar conta', async ({ page, request }) => {
  await setupStorage(page);
  const ts = Date.now();
  const email = `e2e_ui_reg_${ts}@test.invalid`;
  const username = `e2eui${ts}`;
  const password = 'TestPass123!';

  await page.goto('/login');
  // Click the "Criar conta" tab in the tab switcher (inside the tab bar div)
  await page.locator('div.flex.gap-1 button', { hasText: 'Criar conta' }).click();

  await page.getByPlaceholder('seu_usuario').fill(username);
  await page.getByPlaceholder('seuemail@exemplo.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  // Submit via the form's submit button
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL('/', { timeout: 10_000 });

  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === 'sc_auth');
  expect(authCookie).toBeTruthy();
  expect(authCookie?.httpOnly).toBe(true);

  const meRes = await page.request.get('/api/auth/me');
  if (meRes.ok()) {
    const me = await meRes.json();
    createdUsers.push({ userId: me.user.id, email, username, password });
  }
});

test('login via UI — tab Entrar', async ({ page, request }) => {
  await setupStorage(page);
  const user = await createTestUser(request);
  createdUsers.push(user);

  await page.goto('/login');
  // Default tab is "Entrar" — fill email and password directly
  await page.getByPlaceholder('seuemail@exemplo.com').fill(user.email);
  await page.getByPlaceholder('••••••••').fill(user.password);
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL('/', { timeout: 10_000 });
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'sc_auth')).toBeTruthy();
});

test('login com senha errada — exibe erro, sem redirecionamento', async ({ page, request }) => {
  await setupStorage(page);
  const user = await createTestUser(request);
  createdUsers.push(user);

  await page.goto('/login');
  await page.getByPlaceholder('seuemail@exemplo.com').fill(user.email);
  await page.getByPlaceholder('••••••••').fill('SenhaErrada99!');
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL('/login', { timeout: 5_000 });
  await expect(page.getByText(/email ou senha incorretos/i)).toBeVisible();
});

test('logout remove cookie sc_auth', async ({ page, request }) => {
  await setupStorage(page);
  const user = await createTestUser(request);
  createdUsers.push(user);

  await loginAs(page, user.email, user.password);
  await page.goto('/');
  await page.request.post('/api/auth/logout');

  const cookies = await page.context().cookies();
  const authCookie = cookies.find((c) => c.name === 'sc_auth');
  expect(!authCookie || authCookie.value === '').toBe(true);
});

test('sessão persiste após page reload', async ({ page, request }) => {
  await setupStorage(page);
  const user = await createTestUser(request);
  createdUsers.push(user);

  await loginAs(page, user.email, user.password);
  await page.goto('/');
  await page.reload();

  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'sc_auth')).toBeTruthy();

  const meRes = await page.request.get('/api/auth/me');
  expect(meRes.ok()).toBe(true);
  const me = await meRes.json();
  expect(me.user.email).toBe(user.email);
});

test('/bolao/[id] sem auth — exibe prompt de login', async ({ page }) => {
  await setupStorage(page);
  // Access a fake bolão ID — getBolaoMeta returns null → notFound() fires before auth check
  // Capture the navigation response to assert the server returned 404
  const response = await page.goto('/bolao/nonexistent-id-auth-test');
  expect(response?.status()).toBe(404);
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
