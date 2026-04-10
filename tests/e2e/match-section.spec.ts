import { test, expect } from '@playwright/test';
import { setupStorage, mockAllApis, mockAllApisMulti } from './helpers/setup';
import { MOCK_FIXTURES, MOCK_FIXTURES_MULTI } from './helpers/mocks';

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

test.describe('competition filter pills', () => {
  test.beforeEach(async ({ page }) => {
    await setupStorage(page);
    await mockAllApisMulti(page);
    await page.goto('/');
    await expect(
      page.getByRole('status', { name: 'Carregando jogos' }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('shows filter pills when club plays in multiple competitions', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Filtrar por competição' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('button', { name: 'Todos' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Brasileirão' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Copa do Brasil' })).toBeVisible();
  });

  test('"Todos" pill is active by default', async ({ page }) => {
    const articles = page.getByRole('article');
    await expect(articles).toHaveCount(MOCK_FIXTURES_MULTI['athletico-pr'].length);
  });

  test('clicking a competition pill filters matches', async ({ page }) => {
    await page.getByRole('group', { name: 'Filtrar por competição' })
      .getByRole('button', { name: 'Brasileirão' })
      .click();

    // Only the Série A fixture should remain visible
    const articles = page.getByRole('article');
    await expect(articles).toHaveCount(1);
  });

  test('clicking active pill again deselects and restores all matches', async ({ page }) => {
    const pill = page.getByRole('group', { name: 'Filtrar por competição' })
      .getByRole('button', { name: 'Brasileirão' });

    await pill.click(); // select
    await pill.click(); // deselect

    const articles = page.getByRole('article');
    await expect(articles).toHaveCount(MOCK_FIXTURES_MULTI['athletico-pr'].length);
  });

  test('filter persists when switching tabs', async ({ page }) => {
    // Select a filter
    await page.getByRole('group', { name: 'Filtrar por competição' })
      .getByRole('button', { name: 'Brasileirão' })
      .click();

    // Switch to Resultados and back
    await page.getByRole('tab', { name: 'Resultados' }).click();
    await page.getByRole('tab', { name: 'Próximos Jogos' }).click();

    // Filter should still be active — only Brasileirão matches visible
    const brazilMatches = MOCK_FIXTURES_MULTI['athletico-pr'].filter(
      (m) => m.leagueId === 71,
    );
    const articles = page.getByRole('article');
    await expect(articles).toHaveCount(brazilMatches.length);

  });
});

test.describe('Resultados tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupStorage(page);
    await mockAllApis(page);
    await page.goto('/');
    await expect(
      page.getByRole('status', { name: 'Carregando jogos' }),
    ).not.toBeVisible({ timeout: 5_000 });
    await page.getByRole('tab', { name: 'Resultados' }).click();
  });

  test('shows loading skeleton while fetching results', async ({ page }) => {
    await setupStorage(page);

    await page.route('/api/**', (route) => route.fulfill({ json: {} }));
    await page.route('/api/past-fixtures**', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      route.fulfill({ json: [] });
    });
    await page.route('/api/fixtures', (route) =>
      route.fulfill({ json: MOCK_FIXTURES }),
    );

    await page.goto('/');
    await expect(
      page.getByRole('status', { name: 'Carregando jogos' }),
    ).not.toBeVisible({ timeout: 5_000 });

    await page.getByRole('tab', { name: 'Resultados' }).click();
    await expect(
      page.getByRole('status', { name: 'Carregando resultados' }),
    ).toBeVisible();
  });

  test('shows past results from other competitions', async ({ page }) => {
    // SimpleResultCard renders an article with competition name in the header
    await expect(page.getByRole('article').filter({ hasText: 'Copa do Brasil' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('shows empty state when no results available', async ({ page }) => {
    await setupStorage(page);

    await page.route('/api/**', (route) => route.fulfill({ json: {} }));
    await page.route('/api/past-results**', (route) => route.fulfill({ json: [] }));
    await page.route('/api/past-fixtures**', (route) => route.fulfill({ json: [] }));
    await page.route('/api/fixtures', (route) => route.fulfill({ json: MOCK_FIXTURES }));

    await page.goto('/');
    await expect(
      page.getByRole('status', { name: 'Carregando jogos' }),
    ).not.toBeVisible({ timeout: 5_000 });

    await page.getByRole('tab', { name: 'Resultados' }).click();
    await expect(
      page.getByText('Sem resultados anteriores disponíveis'),
    ).toBeVisible({ timeout: 5_000 });
  });
});
