import { GoogleGenAI } from '@google/genai';
import type { CbfBoletimData, CbfSumulaData } from '@/lib/cbfDocTypes';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

const SUMULA_PROMPT = `Extract all data from this CBF "Súmula de Arbitragem" PDF and return ONLY a JSON object — no markdown, no extra text.

Required shape:
{
  "campeonato": "string",
  "rodada": "string",
  "data": "DD/MM/YYYY",
  "hora": "HH:MM",
  "estadio": "string",
  "cidade": "string",
  "mandante": {
    "nome": "string",
    "gols": 0,
    "titulares": [{"numero": 1, "nome": "string", "apelido": "string"}],
    "reservas":  [{"numero": 1, "nome": "string", "apelido": "string"}],
    "substituicoes": [{"saiuNumero": 1, "entrouNumero": 2, "minuto": "45", "periodo": "1T"}]
  },
  "visitante": { same shape as mandante },
  "arbitros": [{"funcao": "string", "nome": "string", "uf": "string"}],
  "gols": [{"jogador": "string", "minuto": "string", "periodo": "1T", "tipo": "normal", "time": "mandante"}],
  "cartoes": [{"jogador": "string", "minuto": "string", "periodo": "1T", "tipo": "amarelo", "time": "mandante"}]
}

Valid values — tipo (gols): "normal" | "penalti" | "contra". tipo (cartoes): "amarelo" | "vermelho" | "segundo_amarelo". time: "mandante" | "visitante". periodo: "1T" | "2T" | "PE".
Use [] for missing arrays. Use "" for missing strings. Do not use null.`;

const BOLETIM_PROMPT = `Extract all data from this CBF "Boletim Financeiro" or "Borderô" PDF and return ONLY a JSON object — no markdown, no extra text.

Required shape:
{
  "estadio": "string",
  "data": "DD/MM/YYYY",
  "publico": {
    "geral": number or null,
    "pagante": number or null,
    "naoPagente": number or null
  },
  "renda": {
    "bruta": number or null,
    "liquida": number or null
  },
  "ingressos": [
    {"categoria": "string", "quantidade": number, "valorUnitario": number or null, "valorTotal": number or null}
  ]
}

Return monetary values as plain numbers (e.g. 1331907.88, not "R$ 1.331.907,88").
Return quantities as plain integers. Use null for missing numbers, [] for missing arrays.`;

export async function parseSumulaWithGemini(
  buffer: ArrayBuffer,
  idJogo: string,
): Promise<CbfSumulaData | null> {
  try {
    const base64 = Buffer.from(buffer).toString('base64');
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            { text: SUMULA_PROMPT },
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
          ],
        },
      ],
    });

    const json = JSON.parse(response.text ?? '');

    return {
      idJogo,
      parsedAt: new Date().toISOString(),
      campeonato:  json.campeonato  ?? '',
      rodada:      json.rodada      ?? '',
      data:        json.data        ?? '',
      hora:        json.hora        ?? '',
      estadio:     json.estadio     ?? '',
      cidade:      json.cidade      ?? '',
      mandante:    json.mandante    ?? { nome: '', gols: 0, titulares: [], reservas: [], substituicoes: [] },
      visitante:   json.visitante   ?? { nome: '', gols: 0, titulares: [], reservas: [], substituicoes: [] },
      arbitros:    json.arbitros    ?? [],
      gols:        json.gols        ?? [],
      cartoes:     json.cartoes     ?? [],
    };
  } catch {
    return null;
  }
}

export async function parseBoletimWithGemini(
  buffer: ArrayBuffer,
  idJogo: string,
): Promise<CbfBoletimData | null> {
  try {
    const base64 = Buffer.from(buffer).toString('base64');
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            { text: BOLETIM_PROMPT },
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
          ],
        },
      ],
    });

    const json = JSON.parse(response.text ?? '');

    return {
      idJogo,
      parsedAt: new Date().toISOString(),
      estadio:   json.estadio ?? '',
      data:      json.data    ?? '',
      publico: {
        geral:      json.publico?.geral      ?? null,
        pagante:    json.publico?.pagante    ?? null,
        naoPagente: json.publico?.naoPagente ?? null,
      },
      renda: {
        bruta:   json.renda?.bruta   ?? null,
        liquida: json.renda?.liquida ?? null,
      },
      ingressos: json.ingressos ?? [],
    };
  } catch {
    return null;
  }
}
