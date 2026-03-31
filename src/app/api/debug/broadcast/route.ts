import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const home = 'Internacional';
const away = 'Sao Paulo';
const round = 'Rodada 1';
const date = '2026-04-01T22:30:00+00:00';

const SYSTEM_PROMPT =
  'Você é um assistente especializado em transmissões de futebol brasileiro. ' +
  'Busque onde a partida será transmitida e retorne SOMENTE um array JSON com os nomes dos canais. Ex: ["Globo","Premiere"]. ' +
  'Canais: Globo, SporTV, SporTV 2, Premiere, CazéTV, Amazon Prime Video, TNT Sports, Max, ESPN, Band.';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.DEBUG_SECRET;
  if (!secret) return false;
  return req.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date));

  const userMessage = `Onde assistir: ${home} x ${away}\n${round} — Brasileirão Série A\nData: ${formattedDate}`;

  let rawContent: unknown = null;
  let parsedBroadcasters: string[] | null = null;
  let error: string | null = null;

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    rawContent = response.candidates;
    const text = response.text ?? '';

    try {
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) parsedBroadcasters = parsed;
    } catch {
      const match = text.match(/\[.*?\]/s);
      if (match) {
        try { parsedBroadcasters = JSON.parse(match[0]); } catch { /* */ }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ formattedDate, rawContent, parsedBroadcasters, error });
}
