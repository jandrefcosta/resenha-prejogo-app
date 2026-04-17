// Mock data for E2E tests — avoids real API calls (Redis, API-Football, Gemini)

const FUTURE_DATE  = new Date(Date.now() + 7  * 24 * 60 * 60 * 1000).toISOString();
const FUTURE_DATE2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
const PAST_DATE    = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

// CBF data field uses DD/MM/YYYY — 7 days in the past so isPostMatch is true
const _pastDay = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const PAST_DATE_CBF = [
  String(_pastDay.getDate()).padStart(2, '0'),
  String(_pastDay.getMonth() + 1).padStart(2, '0'),
  _pastDay.getFullYear(),
].join('/');

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

// ─── CBF match-docs mocks ─────────────────────────────────────────────────────

export const MOCK_CBF_MATCH_DOCS_FULL = {
  available: true,
  sumula: {
    mandante: {
      titulares: [
        { numero: 1,  nome: 'Santos', apelido: 'Santos' },
        { numero: 2,  nome: 'Pedro Silva', apelido: 'Pedro S.' },
        { numero: 3,  nome: 'Carlos Oliveira', apelido: 'Carlos O.' },
        { numero: 4,  nome: 'João Ferreira', apelido: 'João F.' },
        { numero: 5,  nome: 'Rafael Lima', apelido: 'Rafael L.' },
        { numero: 6,  nome: 'Bruno Costa', apelido: 'Bruno C.' },
        { numero: 7,  nome: 'Diego Souza', apelido: 'Diego S.' },
        { numero: 8,  nome: 'Marcos Pereira', apelido: 'Marcos P.' },
        { numero: 9,  nome: 'Lucas Rocha', apelido: 'Lucas R.' },
        { numero: 10, nome: 'Gabriel Alves', apelido: 'Gabriel A.' },
        { numero: 11, nome: 'Felipe Castro', apelido: 'Felipe C.' },
      ],
      reservas: [
        { numero: 12, nome: 'André Tavares', apelido: 'André T.' },
        { numero: 23, nome: 'Rodrigo Mendes', apelido: 'Rodrigo M.' },
      ],
      substituicoes: [
        { saiuNumero: 9,  entrouNumero: 23, minuto: '67', periodo: '2T' },
        { saiuNumero: 11, entrouNumero: 12, minuto: '80', periodo: '2T' },
      ],
    },
    visitante: {
      titulares: [
        { numero: 1,  nome: 'Paulo Gomes', apelido: 'Paulo G.' },
        { numero: 2,  nome: 'Alex Nunes', apelido: 'Alex N.' },
        { numero: 3,  nome: 'Thiago Ribeiro', apelido: 'Thiago R.' },
        { numero: 4,  nome: 'Ricardo Barbosa', apelido: 'Ricardo B.' },
        { numero: 5,  nome: 'Eduardo Carvalho', apelido: 'Eduardo C.' },
        { numero: 6,  nome: 'Fernando Pinto', apelido: 'Fernando P.' },
        { numero: 7,  nome: 'Mateus Correia', apelido: 'Mateus C.' },
        { numero: 8,  nome: 'Leonardo Araujo', apelido: 'Leonardo A.' },
        { numero: 9,  nome: 'Gustavo Moreira', apelido: 'Gustavo M.' },
        { numero: 10, nome: 'Vinicius Freitas', apelido: 'Vinicius F.' },
        { numero: 11, nome: 'Henrique Batista', apelido: 'Henrique B.' },
      ],
      reservas: [],
      substituicoes: [
        { saiuNumero: 10, entrouNumero: 14, minuto: '72', periodo: '2T' },
      ],
    },
    arbitros: [{ funcao: 'Árbitro', nome: 'José Beltrano' }],
    gols: [],
    cartoes: [],
  },
  boletim: {
    publico: { geral: 42000, pagante: 38700, naoPagante: 3300 },
    renda:   { bruta: 2450000, liquida: 1980000 },
    categorias: [],
  },
};

export const MOCK_CBF_MATCH_DOCS_UNAVAILABLE = { available: false };

// A finished CBF Série A past-fixtures entry so the ficha modal can be opened
export const MOCK_PAST_FIXTURES_FINISHED = [
  {
    round: 4,
    match: {
      idJogo: 'mock-jogo-4',
      numJogo: '4',
      rodada: '4',
      grupo: 'G01',
      local: 'Arena da Baixada',
      campeonato: 'Campeonato Brasileiro Série A',
      data: PAST_DATE_CBF,
      hora: '16:00',
      mandante: {
        id: '20052',
        nome: 'Athletico Paranaense',
        sigla: 'CAP',
        gols: '2',
        atletas: [],
        substituicoes: [],
        penalti: null,
        escudo: '',
      },
      visitante: {
        id: '20016',
        nome: 'Flamengo',
        sigla: 'FLA',
        gols: '1',
        atletas: [],
        substituicoes: [],
        penalti: null,
        escudo: '',
      },
      arbitros: [],
      gols: [],
      cartoes: [],
      documentos: [],
    },
  },
];

// Same as above but uses an idJogo not present in the static match-docs JSON,
// so getMatchDocs() returns null and the card face shows no boletim.
export const MOCK_PAST_FIXTURES_FINISHED_NO_STATIC_DOCS = [
  {
    round: 4,
    match: {
      ...MOCK_PAST_FIXTURES_FINISHED[0].match,
      idJogo: 'mock-jogo-nodocs',
    },
  },
];
