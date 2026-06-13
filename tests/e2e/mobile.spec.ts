import { test, expect } from '@playwright/test';
import { setupStorage, mockAllApis, mockAllApisMulti } from './helpers/setup';

// All tests run at 375px — the minimum mobile viewport target
test.use({ viewport: { width: 375, height: 812 } });

test.beforeEach(async ({ page }) => {
  await setupStorage(page);
  await mockAllApis(page);
  await page.goto('/meu-clube');
  // Wait for content to stabilise
  await expect(
    page.getByRole('status', { name: 'Carregando jogos' }),
  ).not.toBeVisible({ timeout: 5_000 });
});

test('no horizontal scroll at 375px', async ({ page }) => {
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
});

test('hero header renders with club name', async ({ page }) => {
  // ThemeProvider defaults to clubs[0] = Athletico Paranaense
  await expect(page.getByRole('heading').filter({ hasText: /athletico/i })).toBeVisible();
});

test('primary action buttons in header are visible and tappable', async ({ page }) => {
  const clubBtn = page.getByRole('button', { name: /alterar/i });
  await expect(clubBtn).toBeVisible();

  const box = await clubBtn.boundingBox();
  expect(box?.height, 'ClubSelector button height ≥ 44px').toBeGreaterThanOrEqual(44);
});

test('match card is fully visible without overflow', async ({ page }) => {
  const card = page.locator('[class*="rounded-2xl"]').first();
  const box = await card.boundingBox();
  if (!box) return; // card not rendered

  expect(box.x, 'card should not start outside left edge').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'card should not overflow right edge').toBeLessThanOrEqual(375);
});

test('touch-action manipulation applied to buttons', async ({ page }) => {
  const value = await page.evaluate(() => {
    const btn = document.querySelector('button');
    return btn ? getComputedStyle(btn).touchAction : null;
  });
  expect(value).toBe('manipulation');
});

test('competition filter pills do not overflow viewport at 375px', async ({ page }) => {
  await setupStorage(page);
  await mockAllApisMulti(page);
  await page.goto('/meu-clube');
  await expect(
    page.getByRole('status', { name: 'Carregando jogos' }),
  ).not.toBeVisible({ timeout: 5_000 });

  const group = page.getByRole('group', { name: 'Filtrar por competição' });
  await expect(group).toBeVisible();

  const box = await group.boundingBox();
  expect(box?.x, 'pills start inside left edge').toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0), 'pills end inside right edge').toBeLessThanOrEqual(375);
});

test('Resultados tab is functional on mobile', async ({ page }) => {
  const resultsTab = page.getByRole('tab', { name: 'Resultados' });
  await resultsTab.click();
  await expect(resultsTab).toHaveAttribute('aria-selected', 'true');

  // Past results card renders (Copa do Brasil result from mock)
  await expect(
    page.getByRole('article').filter({ hasText: 'Copa do Brasil' }),
  ).toBeVisible({ timeout: 5_000 });
});

test('Resultados tab cards do not overflow viewport', async ({ page }) => {
  await page.getByRole('tab', { name: 'Resultados' }).click();

  const card = page.getByRole('article').first();
  await expect(card).toBeVisible({ timeout: 5_000 });

  const box = await card.boundingBox();
  if (!box) return;
  expect(box.x, 'result card should not start outside left edge').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'result card should not overflow right edge').toBeLessThanOrEqual(375);
});
