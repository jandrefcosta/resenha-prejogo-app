import { test, expect } from '@playwright/test';
import { setupStorage, mockAllApis } from './helpers/setup';
import { MOCK_FIXTURES } from './helpers/mocks';

test.describe('loading states', () => {
  test('shows skeleton while fixtures are loading', async ({ page }) => {
    await setupStorage(page);

    // Delay fixtures so the skeleton is visible during load
    // Catch-all first (lowest priority), specific route last (highest priority)
    await page.route('/api/**', (route) => route.fulfill({ json: {} }));
    await page.route('/api/fixtures', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ json: MOCK_FIXTURES });
    });

    await page.goto('/');

    await expect(
      page.getByRole('status', { name: 'Carregando jogos' }),
    ).toBeVisible();
  });

  test('skeleton disappears after fixtures load', async ({ page }) => {
    await setupStorage(page);
    await mockAllApis(page);
    await page.goto('/');

    await expect(
      page.getByRole('status', { name: 'Carregando jogos' }),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe('content rendering', () => {
  test.beforeEach(async ({ page }) => {
    await setupStorage(page);
    await mockAllApis(page);
    await page.goto('/');
    await expect(
      page.getByRole('status', { name: 'Carregando jogos' }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('renders match teams after fixtures load', async ({ page }) => {
    // Scope to match card article to avoid strict-mode violation
    // (team names also appear in the hero heading and section subtitle)
    const card = page.getByRole('article').first();
    await expect(card.getByText('Atlético Mineiro')).toBeVisible();
    await expect(card.getByText('Athletico Paranaense')).toBeVisible();
  });

  test('shows tab navigation when round > 1', async ({ page }) => {
    // lastKnownRound=5 is set in setupStorage, so tabs should render
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Próximos Jogos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Resultados' })).toBeVisible();
  });

  test('tab buttons meet 44px touch target', async ({ page }) => {
    const tabs = page.getByRole('tab');
    for (const tab of await tabs.all()) {
      const box = await tab.boundingBox();
      expect(box?.height, 'tab height should be ≥ 44px').toBeGreaterThanOrEqual(44);
    }
  });

  test('switches to Resultados tab', async ({ page }) => {
    await page.getByRole('tab', { name: 'Resultados' }).click();
    // Tab becomes selected
    await expect(
      page.getByRole('tab', { name: 'Resultados' }),
    ).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('error state', () => {
  test('shows error message when fixtures API fails', async ({ page }) => {
    await setupStorage(page);

    await page.route('/api/**', (route) => route.fulfill({ json: {} }));
    await page.route('/api/fixtures', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    );

    await page.goto('/');

    await expect(
      page.getByText('Não foi possível carregar os jogos'),
    ).toBeVisible({ timeout: 5_000 });
  });
});
