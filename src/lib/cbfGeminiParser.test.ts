import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function() {
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

import { parseSumulaWithGemini, parseBoletimWithGemini } from './cbfGeminiParser';

const dummyBuffer = new ArrayBuffer(8);

const sumulaJson = {
  campeonato: 'Brasileirão Série A/2026', rodada: '1',
  data: '28/01/2026', hora: '19:00', estadio: 'Arena MRV', cidade: 'Belo Horizonte',
  mandante: {
    nome: 'Atlético Mineiro', gols: 2,
    titulares: [{ numero: 1, nome: 'Everson', apelido: 'Everson' }],
    reservas: [], substituicoes: [],
  },
  visitante: {
    nome: 'Flamengo', gols: 1,
    titulares: [{ numero: 1, nome: 'Rossi', apelido: 'Rossi' }],
    reservas: [], substituicoes: [],
  },
  arbitros: [{ funcao: 'Árbitro', nome: 'Bruno Arleu', uf: 'RJ' }],
  gols: [{ jogador: 'Hulk', minuto: '30', periodo: '1T', tipo: 'normal', time: 'mandante' }],
  cartoes: [],
};

const boletimJson = {
  estadio: 'Arena MRV', data: '28/01/2026',
  publico: { geral: 25770, pagante: 20000, naoPagente: 5770 },
  renda: { bruta: 1331907.88, liquida: 683891.75 },
  ingressos: [{ categoria: 'Inteira', quantidade: 20000, valorUnitario: null, valorTotal: 1331907.88 }],
};

describe('parseSumulaWithGemini', () => {
  beforeEach(() => { mockGenerateContent.mockReset(); });

  it('parses a valid Gemini response into CbfSumulaData', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(sumulaJson) });

    const result = await parseSumulaWithGemini(dummyBuffer, '999');

    expect(result).not.toBeNull();
    expect(result!.idJogo).toBe('999');
    expect(result!.mandante.nome).toBe('Atlético Mineiro');
    expect(result!.gols).toHaveLength(1);
    expect(result!.arbitros).toHaveLength(1);
  });

  it('returns null when Gemini response is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'não encontrei o documento' });
    const result = await parseSumulaWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });

  it('returns null when generateContent throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));
    const result = await parseSumulaWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });
});

describe('parseBoletimWithGemini', () => {
  beforeEach(() => { mockGenerateContent.mockReset(); });

  it('parses a valid Gemini response into CbfBoletimData', async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(boletimJson) });

    const result = await parseBoletimWithGemini(dummyBuffer, '999');

    expect(result).not.toBeNull();
    expect(result!.idJogo).toBe('999');
    expect(result!.publico.geral).toBe(25770);
    expect(result!.renda.bruta).toBe(1331907.88);
    expect(result!.ingressos).toHaveLength(1);
  });

  it('returns null when Gemini response is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'error: no document found' });
    const result = await parseBoletimWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });

  it('returns null when generateContent throws', async () => {
    mockGenerateContent.mockRejectedValue(new Error('network error'));
    const result = await parseBoletimWithGemini(dummyBuffer, '999');
    expect(result).toBeNull();
  });
});
