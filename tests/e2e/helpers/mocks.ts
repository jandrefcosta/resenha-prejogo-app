// Mock data for E2E tests — avoids real API calls (Redis, API-Football, Gemini)

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

// Default club in ThemeProvider is clubs[0] = 'athletico-pr'
export const MOCK_FIXTURES = {
  'athletico-pr': [
    {
      id: 'mock-fixture-1',
      homeTeam: { id: 'atletico-mg', name: 'Atlético Mineiro', shortName: 'ATL' },
      awayTeam: { id: 'athletico-pr', name: 'Athletico Paranaense', shortName: 'CAP' },
      date: FUTURE_DATE,
      stadium: 'Arena MRV',
      city: 'Belo Horizonte',
      competition: 'Campeonato Brasileiro Série A',
      round: 'Regular Season - 5',
      status: 'scheduled',
    },
  ],
};

export const MOCK_PREVIEWS: Record<string, unknown> = {};

export const MOCK_PAST_FIXTURES: unknown[] = [];
