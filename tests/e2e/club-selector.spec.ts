import { test, expect } from '@playwright/test';
import { setupStorage, mockAllApis } from './helpers/setup';

test.beforeEach(async ({ page }) => {
  await setupStorage(page);
  await mockAllApis(page);
  await page.goto('/');
  // Wait for ThemeProvider to hydrate and show the club button
  await expect(page.getByRole('button', { name: /alterar/i })).toBeVisible();
});

test('opens club selector modal', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  await expect(page.getByRole('dialog', { name: 'Escolher clube' })).toBeVisible();
});

test('closes modal with × button', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('dialog', { name: 'Escolher clube' })).not.toBeVisible();
});

test('closes modal on backdrop click', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  await expect(page.getByRole('dialog', { name: 'Escolher clube' })).toBeVisible();
  // Click the top-left corner — always outside the centered panel
  await page.mouse.click(5, 5);
  await expect(page.getByRole('dialog', { name: 'Escolher clube' })).not.toBeVisible();
});

test('restores page scroll after closing modal', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  await page.getByRole('button', { name: 'Fechar' }).click();

  const overflow = await page.evaluate(() => document.body.style.overflow);
  expect(overflow).not.toBe('hidden');
});

test('updates displayed club name after selection', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  await page.getByRole('button', { name: 'Flamengo' }).click();

  // Selector trigger now shows the new club
  await expect(page.getByRole('button', { name: /flamengo/i })).toBeVisible();
  // Modal is closed
  await expect(page.getByRole('dialog', { name: 'Escolher clube' })).not.toBeVisible();
});

test('shows scroll fade when club list overflows', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  // With 20 clubs the list overflows — fade should be visible before scrolling
  await expect(page.getByTestId('scroll-fade')).toBeVisible();
});

test('hides scroll fade when list is scrolled to bottom', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  const list = page.locator('div.scrollbar-none');
  await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByTestId('scroll-fade')).not.toBeVisible();
});

test('club list buttons meet 44px touch target', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  // Scope to the grid that contains club buttons — excludes the header close button
  const clubButtons = page.getByRole('dialog', { name: 'Escolher clube' }).locator('div.grid button');

  for (const btn of await clubButtons.all()) {
    const box = await btn.boundingBox();
    expect(box?.height, `club button height should be ≥ 44px`).toBeGreaterThanOrEqual(44);
  }
});

test('Escape key closes modal', async ({ page }) => {
  await page.getByRole('button', { name: /alterar/i }).click();
  await expect(page.getByRole('dialog', { name: 'Escolher clube' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Escolher clube' })).not.toBeVisible();
});

test('focus returns to trigger button after modal closes', async ({ page }) => {
  const trigger = page.getByRole('button', { name: /alterar/i });
  await trigger.click();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(trigger).toBeFocused();
});

test('selecting a different club updates the match section context', async ({ page }) => {
  // MatchSection loads fixtures once on mount and filters client-side on club change.
  // The observable change is the section aria-label and the "Jogos" subtitle.
  await page.getByRole('button', { name: /alterar/i }).click();
  await page.getByRole('button', { name: 'Flamengo' }).click();

  // Section aria-label reflects the new club
  await expect(
    page.getByRole('region', { name: /Jogos — Flamengo/i }),
  ).toBeVisible({ timeout: 5_000 });
});
