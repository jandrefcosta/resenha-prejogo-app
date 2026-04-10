// Mock data for E2E tests — avoids real API calls (Redis, API-Football, Gemini)

const FUTURE_DATE  = new Date(Date.now() + 7  * 24 * 60 * 60 * 1000).toISOString();
const FUTURE_DATE2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
const PAST_DATE    = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

// Default club in ThemeProvider is clubs[0] = 'athletico-pr'
export const MOCK_FIXTURES = {
  'athletico-pr': [
    {
      id: 'mock-fixture-1',
      homeTeam: { id: '134', name: 'Atlético Mineiro', shortName: 'ATL' },
      awayTeam: { id: '134', name: 'Athletico Paranaense', shortName: 'CAP' },
      date: FUTURE_DATE,
      stadium: 'Arena MRV',
      city: 'Belo Horizonte',
      competition: 'Campeonato Brasileiro Série A',
      competitionName: 'Brasileirão',
      leagueId: 71,
      round: 'Rodada 5',
      status: 'scheduled',
    },
  ],
};

// Multi-competition fixtures — Série A + Copa do Brasil
export const MOCK_FIXTURES_MULTI = {
  'athletico-pr': [
    {
      id: 'mock-fixture-1',
      homeTeam: { id: '1062', name: 'Atlético Mineiro', shortName: 'ATL', logo: '' },
      awayTeam: { id: '134',  name: 'Athletico Paranaense', shortName: 'CAP', logo: '' },
      date: FUTURE_DATE,
      stadium: 'Arena MRV',
      city: 'Belo Horizonte',
      competition: 'Serie A',
      competitionName: 'Brasileirão',
      leagueId: 71,
      round: 'Rodada 5',
      status: 'scheduled',
    },
    {
      id: 'mock-fixture-2',
      homeTeam: { id: '134', name: 'Athletico Paranaense', shortName: 'CAP', logo: '' },
      awayTeam: { id: '999', name: 'Rival FC', shortName: 'RIV', logo: '' },
      date: FUTURE_DATE2,
      stadium: 'Arena da Baixada',
      city: 'Curitiba',
      competition: 'Copa Do Brasil',
      competitionName: 'Copa do Brasil',
      leagueId: 73,
      round: 'Round of 32',
      status: 'scheduled',
    },
  ],
};

// Finished matches returned by /api/past-results
export const MOCK_PAST_RESULTS = [
  {
    id: 'mock-result-1',
    homeTeam: { id: '134', name: 'Athletico Paranaense', shortName: 'CAP', logo: '' },
    awayTeam: { id: '127', name: 'Flamengo', shortName: 'FLA', logo: '' },
    date: PAST_DATE,
    stadium: 'Arena da Baixada',
    city: 'Curitiba',
    competition: 'Copa Do Brasil',
    competitionName: 'Copa do Brasil',
    leagueId: 73,
    round: 'Round of 32',
    status: 'finished',
    score: { home: 2, away: 1 },
  },
];

export const MOCK_PREVIEWS: Record<string, unknown> = {};

export const MOCK_PAST_FIXTURES: unknown[] = [];
