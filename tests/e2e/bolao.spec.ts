import { test, expect } from '@playwright/test';
import { setupStorage } from './helpers/setup';
import { createTestUser, loginAs, cleanupTestData } from './helpers/authHelper';
import type { TestUser } from './helpers/authHelper';

test.describe('bolão E2E', () => {
  test.describe.configure({ mode: 'serial' });

  let userA: TestUser;
  let userB: TestUser;
  let bolaoId: string;
  let bolaoCodigo: string;

  test.beforeAll(async ({ request }) => {
    userA = await createTestUser(request);
    userB = await createTestUser(request);
  });

  test.afterAll(() => {
    cleanupTestData({
      users: [userA, userB].filter(Boolean),
      bolaoIds: bolaoId ? [bolaoId] : [],
      codigos: bolaoCodigo ? [bolaoCodigo] : [],
    });
  });

  // 1. Visitor sees global ranking but NOT the private bolões section
  test('hub /bolao — visitante vê ranking global, sem seção Meus Bolões', async ({ page }) => {
    await setupStorage(page);
    await page.goto('/bolao');

    // Global ranking heading is always visible
    await expect(page.getByRole('heading', { name: /ranking global/i })).toBeVisible();

    // "Meus Bolões Privados" heading is only rendered for authenticated users
    await expect(page.getByRole('heading', { name: /meus bolões privados/i })).not.toBeVisible();

    // The login CTA link is visible for visitors
    await expect(page.getByRole('link', { name: /criar conta \/ entrar/i })).toBeVisible();
  });

  // 2. Logged-in user sees "Meus Bolões Privados" section
  test('hub /bolao — logado vê seção Meus Bolões Privados', async ({ page }) => {
    await setupStorage(page);
    await loginAs(page, userA.email, userA.password);
    await page.goto('/bolao');

    await expect(page.getByRole('heading', { name: /meus bolões privados/i })).toBeVisible();
  });

  // 3. Create a bolão, capture id and código
  test('criar bolão — redireciona para /bolao/[id] com código visível', async ({ page }) => {
    await setupStorage(page);
    await loginAs(page, userA.email, userA.password);
    await page.goto('/bolao/novo');

    await page.getByPlaceholder(/bolão do trabalho/i).fill('Bolão E2E Test');
    await page.getByRole('button', { name: /criar bolão/i }).click();

    // Wait for redirect to /bolao/<uuid>
    await expect(page).toHaveURL(/\/bolao\/[0-9a-f-]{36}$/, { timeout: 10_000 });

    // Capture bolaoId from URL
    const url = page.url();
    bolaoId = url.split('/bolao/')[1];

    // The code is shown on the page as: "Código: XXXXXX"
    const codigoEl = page.locator('span.font-mono.font-bold');
    await expect(codigoEl).toBeVisible();
    bolaoCodigo = (await codigoEl.textContent()) ?? '';
    expect(bolaoCodigo).toMatch(/^[A-Z0-9]{6}$/);
  });

  // 4. Invite code (6 chars) is visible on /bolao/[id]
  test('código de convite (6 chars) está visível na página /bolao/[id]', async ({ page }) => {
    test.skip(!bolaoId, 'bolaoId not set — test 3 must pass first');
    await setupStorage(page);
    await loginAs(page, userA.email, userA.password);
    await page.goto(`/bolao/${bolaoId}`);

    const codigoEl = page.locator('span.font-mono.font-bold');
    await expect(codigoEl).toBeVisible();
    const code = await codigoEl.textContent();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  // 5. Join by valid code — redirect to the correct bolão
  test('entrar por código válido — redireciona para o bolão correto', async ({ page }) => {
    test.skip(!bolaoId || !bolaoCodigo, 'bolaoId/bolaoCodigo not set — tests 3–4 must pass first');
    await setupStorage(page);
    await loginAs(page, userB.email, userB.password);
    await page.goto('/bolao');

    // The code input has placeholder "Código de convite (ex: TRAB42)"
    await page.getByPlaceholder(/código de convite/i).fill(bolaoCodigo);
    await page.getByPlaceholder(/código de convite/i).press('Enter');

    await expect(page).toHaveURL(`/bolao/${bolaoId}`, { timeout: 10_000 });
  });

  // 6. Invalid code — no redirect, stays on hub
  test('código inválido — sem redirecionamento, form permanece na hub', async ({ page }) => {
    await setupStorage(page);
    await loginAs(page, userA.email, userA.password);
    await page.goto('/bolao');

    await page.getByPlaceholder(/código de convite/i).fill('XXXXXX');
    await page.getByPlaceholder(/código de convite/i).press('Enter');

    // Server action with no matching code does nothing — still on /bolao
    await expect(page).toHaveURL('/bolao', { timeout: 5_000 });
  });

  // 7. Private ranking — creator appears with 0 pts
  test('ranking privado — criador aparece com 0 pts', async ({ page }) => {
    test.skip(!bolaoId, 'bolaoId not set — test 3 must pass first');
    await setupStorage(page);
    await loginAs(page, userA.email, userA.password);
    await page.goto(`/bolao/${bolaoId}`);

    // Creator's username appears in the ranking table
    await expect(page.getByText(`@${userA.username}`)).toBeVisible();

    // Score shown as "0 pts" — use first() since multiple members may each have 0 pts
    await expect(page.getByText('0 pts').first()).toBeVisible();
  });

  // 8. Non-member accessing someone else's bolão → 404
  test('não-membro acessa bolão alheio → 404', async ({ page, request }) => {
    test.skip(!bolaoId, 'bolaoId not set — test 3 must pass first');
    const userC = await createTestUser(request);
    try {
      await setupStorage(page);
      await loginAs(page, userC.email, userC.password);
      const response = await page.goto(`/bolao/${bolaoId}`);
      expect(response?.status()).toBe(404);
    } finally {
      cleanupTestData({ users: [userC] });
    }
  });

  // 9. /bolao/[id] without auth — shows login prompt
  test('/bolao/[id] sem auth — exibe prompt de login', async ({ page }) => {
    test.skip(!bolaoId, 'bolaoId not set — test 3 must pass first');
    await setupStorage(page);
    // No loginAs — visit as unauthenticated user
    await page.goto(`/bolao/${bolaoId}`);

    // The page renders an "Entrar / Criar conta" link for unauthenticated users
    await expect(page.getByRole('link', { name: /entrar \/ criar conta/i })).toBeVisible();
  });
});
