import type { Page } from '@playwright/test';
import {
  MOCK_FIXTURES,
  MOCK_FIXTURES_MULTI,
  MOCK_PREVIEWS,
  MOCK_PAST_FIXTURES,
  MOCK_PAST_RESULTS,
} from './mocks';

/**
 * Pre-populate localStorage before page load.
 * - Skips OnboardingModal (already onboarded)
 * - Sets a known club so ThemeProvider doesn't show a blank state
 */
export async function setupStorage(page: Page, clubId = 'athletico-pr') {
  await page.addInitScript((id) => {
    localStorage.setItem('resenha-prejogo:onboarded', '1');
    localStorage.setItem('resenha-prejogo:club', id);
    localStorage.setItem('lastKnownRound', '5');
  }, clubId);
}

/**
 * Intercept all API routes used on the home page with deterministic mock data.
 * Individual tests can call page.route() before this to override specific routes.
 */
export async function mockAllApis(page: Page) {
  // Catch-all registered FIRST = lowest priority (Playwright matches last-registered first)
  await page.route('/api/**', (route) => route.fulfill({ json: {} }));
  // Specific routes registered LAST = highest priority
  await page.route('/api/past-results**', (route) =>
    route.fulfill({ json: MOCK_PAST_RESULTS }),
  );
  await page.route('/api/past-fixtures**', (route) =>
    route.fulfill({ json: MOCK_PAST_FIXTURES }),
  );
  await page.route('/api/previews**', (route) =>
    route.fulfill({ json: MOCK_PREVIEWS }),
  );
  await page.route('/api/fixtures', (route) =>
    route.fulfill({ json: MOCK_FIXTURES }),
  );
}

/**
 * Same as mockAllApis but returns multi-competition fixtures (Série A + Copa do Brasil).
 * Use this when testing competition filter pills.
 */
export async function mockAllApisMulti(page: Page) {
  await page.route('/api/**', (route) => route.fulfill({ json: {} }));
  await page.route('/api/past-results**', (route) =>
    route.fulfill({ json: MOCK_PAST_RESULTS }),
  );
  await page.route('/api/past-fixtures**', (route) =>
    route.fulfill({ json: MOCK_PAST_FIXTURES }),
  );
  await page.route('/api/previews**', (route) =>
    route.fulfill({ json: MOCK_PREVIEWS }),
  );
  await page.route('/api/fixtures', (route) =>
    route.fulfill({ json: MOCK_FIXTURES_MULTI }),
  );
}
