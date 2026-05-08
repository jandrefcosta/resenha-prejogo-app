import { describe, it, expect } from 'vitest';
import { scoreSumula, scoreBoletim, CONFIDENCE_THRESHOLD } from './cbfDocConfidence';
import type { CbfSumulaData, CbfBoletimData } from './cbfDocTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const player = { numero: 1, nome: 'Jogador', apelido: 'J' };

const fullTeam = {
  nome: 'Time A', gols: 0,
  titulares: [player], reservas: [], substituicoes: [],
};

const emptyTeam = {
  nome: 'Time A', gols: 0,
  titulares: [], reservas: [], substituicoes: [],
};

const fullSumula: CbfSumulaData = {
  idJogo: '123', parsedAt: '', campeonato: 'Série A', rodada: '1',
  data: '01/01/2026', hora: '19:00', estadio: 'Arena', cidade: 'SP',
  mandante: fullTeam,
  visitante: fullTeam,
  arbitros: [{ funcao: 'Árbitro', nome: 'João', uf: 'SP' }],
  gols: [{ jogador: '1', minuto: '45', periodo: '1T', tipo: 'normal', time: 'mandante' }],
  cartoes: [{ jogador: '2', minuto: '30', periodo: '1T', tipo: 'amarelo', time: 'visitante' }],
};

const fullBoletim: CbfBoletimData = {
  idJogo: '123', parsedAt: '', estadio: 'Arena', data: '01/01/2026',
  publico: { geral: 10000, pagante: 9000, naoPagente: 1000 },
  renda: { bruta: 500000, liquida: 400000 },
  ingressos: [{ categoria: 'Inteira', quantidade: 9000, valorUnitario: null, valorTotal: 500000 }],
};

// ─── scoreSumula ──────────────────────────────────────────────────────────────

describe('scoreSumula', () => {
  it('returns 1.0 when all critical fields are populated', () => {
    expect(scoreSumula(fullSumula)).toBe(1.0);
  });

  it('returns 0.0 when both teams have no titulares and no referees', () => {
    const empty: CbfSumulaData = {
      ...fullSumula,
      mandante: { ...emptyTeam },
      visitante: { ...emptyTeam },
      arbitros: [],
      gols: [],
      cartoes: [],
    };
    expect(scoreSumula(empty)).toBe(0);
  });

  it('stays above threshold when only titulares + arrays are present', () => {
    const partial: CbfSumulaData = {
      ...fullSumula,
      arbitros: [],
    };
    // 4/5 checks pass → 0.8
    expect(scoreSumula(partial)).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('falls below threshold when both teams are empty regardless of referees', () => {
    const worst: CbfSumulaData = {
      ...fullSumula,
      mandante: { ...emptyTeam },
      visitante: { ...emptyTeam },
      arbitros: [],
      gols: [],
      cartoes: [],
    };
    expect(scoreSumula(worst)).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
});

// ─── scoreBoletim ─────────────────────────────────────────────────────────────

describe('scoreBoletim', () => {
  it('returns 1.0 when all critical fields are populated', () => {
    expect(scoreBoletim(fullBoletim)).toBe(1.0);
  });

  it('returns 0.0 when all fields are null/empty', () => {
    const empty: CbfBoletimData = {
      ...fullBoletim,
      publico: { geral: null, pagante: null, naoPagente: null },
      renda: { bruta: null, liquida: null },
      ingressos: [],
    };
    expect(scoreBoletim(empty)).toBe(0);
  });

  it('returns above threshold when public count and gross revenue are present', () => {
    const partial: CbfBoletimData = {
      ...fullBoletim,
      ingressos: [],
    };
    // 2/3 checks → 0.67
    expect(scoreBoletim(partial)).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
});

// ─── CONFIDENCE_THRESHOLD ─────────────────────────────────────────────────────

describe('CONFIDENCE_THRESHOLD', () => {
  it('is 0.4', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.4);
  });
});
