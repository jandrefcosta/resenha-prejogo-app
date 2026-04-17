import { test, expect } from '@playwright/test';
import { setupStorage, mockAllApisWithFinishedCbf, MOCK_PAST_FIXTURES_FINISHED_NO_STATIC_DOCS } from './helpers/setup';
import { MOCK_CBF_MATCH_DOCS_UNAVAILABLE } from './helpers/mocks';

// ── Helpers ───────────────────────────────────────────────────────────────── //

/**
 * Navigate to the Resultados tab and wait for the Série A card to appear.
 * Uses MOCK_PAST_FIXTURES_FINISHED (round 4, CAP 2–1 FLA) + MOCK_CBF_MATCH_DOCS_FULL.
 */
async function openResultadosTab(page: import('@playwright/test').Page) {
  await setupStorage(page);
  await mockAllApisWithFinishedCbf(page);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Resultados' }).click();
  // Confirms CBF past-fixtures loaded and the card is visible
  await expect(
    page.getByRole('article').filter({ hasText: 'Brasileirão' }),
  ).toBeVisible({ timeout: 5_000 });
}

/**
 * Open the Ficha modal for the Série A card.
 * Waits for the prefetched boletim compact text to appear on the card face
 * so that matchDocs is seeded into state before the modal opens.
 */
async function openFichaModal(page: import('@playwright/test').Page) {
  await openResultadosTab(page);
  const article = page.getByRole('article').filter({ hasText: 'Brasileirão' });
  // '38.700 pagantes' only renders once matchDocs is set from the prefetch
  await expect(article.getByText('38.700 pagantes')).toBeVisible({ timeout: 5_000 });
  await article.getByRole('button', { name: 'Ver ficha do jogo' }).click();
  await expect(page.getByRole('dialog', { name: 'Ficha do Jogo' })).toBeVisible({ timeout: 3_000 });
}

// ─── Card face — renda compact ─────────────────────────────────────────────── //

test.describe('card face — renda compact', () => {
  test('shows pagantes and renda bruta on Série A finished match', async ({ page }) => {
    await openResultadosTab(page);
    const article = page.getByRole('article').filter({ hasText: 'Brasileirão' });
    await expect(article.getByText('38.700 pagantes')).toBeVisible({ timeout: 5_000 });
    await expect(article.getByText('R$ 2,45M')).toBeVisible({ timeout: 5_000 });
  });

  test('does not show renda when match-docs unavailable', async ({ page }) => {
    await setupStorage(page);
    // Use a fixture whose idJogo is NOT in the static match-docs JSON so that
    // getMatchDocs() returns null and the card face shows no boletim data.
    await mockAllApisWithFinishedCbf(
      page,
      MOCK_CBF_MATCH_DOCS_UNAVAILABLE,
      MOCK_PAST_FIXTURES_FINISHED_NO_STATIC_DOCS,
    );
    await page.goto('/');
    await page.getByRole('tab', { name: 'Resultados' }).click();
    const article = page.getByRole('article').filter({ hasText: 'Brasileirão' });
    await expect(article).toBeVisible({ timeout: 5_000 });
    // Wait for the prefetch response to settle before asserting absence
    await page.waitForLoadState('networkidle');
    await expect(article.getByText('pagantes')).not.toBeVisible();
  });
});

// ─── Ficha modal — escalação from súmula ──────────────────────────────────── //

test.describe('ficha modal — escalação from súmula', () => {
  test.beforeEach(async ({ page }) => {
    await openFichaModal(page);
  });

  test('shows "Escalação" section heading', async ({ page }) => {
    await expect(
      page.getByRole('dialog', { name: 'Ficha do Jogo' }).getByText('Escalação'),
    ).toBeVisible();
  });

  test('shows mandante starters from súmula when atletas is empty', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Ficha do Jogo' });
    // Santos (#1) and Pedro S. (#2) are starters that don't appear in subs
    await expect(dialog.getByText('Santos')).toBeVisible();
    await expect(dialog.getByText('Pedro S.')).toBeVisible();
    await expect(dialog.getByText('Carlos O.')).toBeVisible();
  });

  test('shows visitante starters from súmula when atletas is empty', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Ficha do Jogo' });
    await expect(dialog.getByText('Paulo G.')).toBeVisible();
    await expect(dialog.getByText('Alex N.')).toBeVisible();
    await expect(dialog.getByText('Henrique B.')).toBeVisible();
  });
});

// ─── Ficha modal — substituições ──────────────────────────────────────────── //

test.describe('ficha modal — substituições', () => {
  test.beforeEach(async ({ page }) => {
    await openFichaModal(page);
  });

  test('shows "Substituições" section heading', async ({ page }) => {
    await expect(
      page.getByRole('dialog', { name: 'Ficha do Jogo' }).getByText('Substituições'),
    ).toBeVisible();
  });

  test('shows minute and player names for each substitution', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Ficha do Jogo' });
    // Mandante sub at 67': Lucas R. (out) → Rodrigo M. (in)
    await expect(dialog.getByText("67'")).toBeVisible();
    await expect(dialog.getByText('Rodrigo M.')).toBeVisible();
    // Visitante sub at 72': Vinicius F. (out) — also in escalação, scope to subs section
    await expect(dialog.getByText("72'")).toBeVisible();
    const subsSection = dialog.locator('section').filter({ hasText: 'Substituições' });
    await expect(subsSection.getByText('Vinicius F.')).toBeVisible();
    // Mandante sub at 80': Felipe C. (out) → André T. (in)
    await expect(dialog.getByText("80'")).toBeVisible();
    await expect(dialog.getByText('André T.')).toBeVisible();
  });

  test('substitutions are sorted by minute ascending', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Ficha do Jogo' });
    const min67 = dialog.getByText("67'");
    const min72 = dialog.getByText("72'");
    const min80 = dialog.getByText("80'");
    await expect(min67).toBeVisible();
    await expect(min72).toBeVisible();
    await expect(min80).toBeVisible();

    const box67 = await min67.boundingBox();
    const box72 = await min72.boundingBox();
    const box80 = await min80.boundingBox();
    expect(box67!.y).toBeLessThan(box72!.y);
    expect(box72!.y).toBeLessThan(box80!.y);
  });
});

// ─── Ficha modal — público e renda ────────────────────────────────────────── //

test.describe('ficha modal — público e renda', () => {
  test('shows "Público e Renda" section with stats when boletim available', async ({ page }) => {
    await openFichaModal(page);
    const dialog = page.getByRole('dialog', { name: 'Ficha do Jogo' });
    await expect(dialog.getByText('Público e Renda')).toBeVisible();
    await expect(dialog.getByText('Público Pagante')).toBeVisible();
    await expect(dialog.getByText('38.700')).toBeVisible();
    await expect(dialog.getByText('Renda Bruta')).toBeVisible();
    await expect(dialog.getByText('R$ 2,45M')).toBeVisible();
  });

  test('shows pending message when match-docs unavailable', async ({ page }) => {
    await setupStorage(page);
    await mockAllApisWithFinishedCbf(page, MOCK_CBF_MATCH_DOCS_UNAVAILABLE);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Resultados' }).click();
    const article = page.getByRole('article').filter({ hasText: 'Brasileirão' });
    await expect(article).toBeVisible({ timeout: 5_000 });
    await page.waitForLoadState('networkidle');
    await article.getByRole('button', { name: 'Ver ficha do jogo' }).click();

    const dialog = page.getByRole('dialog', { name: 'Ficha do Jogo' });
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await expect(dialog.getByText('Público e Renda')).toBeVisible();
    // Scope to the Boletim section to avoid matching the Documentos pending message
    const boletimSection = dialog.locator('section').filter({ hasText: 'Público e Renda' });
    await expect(boletimSection.getByText('Disponíveis algumas horas após o jogo')).toBeVisible();
  });
});
