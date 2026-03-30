import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveEngine, type BroadcasterEngine } from '@/lib/broadcasterSearch';

const anthropic = new Anthropic();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const home = 'Internacional';
const away = 'Sao Paulo';
const round = 'Rodada 1';
const date = '2026-04-01T22:30:00+00:00';

const SYSTEM_PROMPT =
  'Você é um assistente especializado em transmissões de futebol brasileiro. ' +
  'Busque onde a partida será transmitida e retorne SOMENTE um array JSON com os nomes dos canais. Ex: ["Globo","Premiere"]. ' +
  'Canais: Globo, SporTV, SporTV 2, Premiere, CazéTV, Amazon Prime Video, TNT Sports, Max, ESPN, Band.';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawEngine = searchParams.get('engine');
  const engine: BroadcasterEngine =
    rawEngine === 'anthropic' ? 'anthropic'
    : rawEngine === 'gemini' ? 'gemini'
    : getActiveEngine();

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date));

  const userMessage = `Onde assistir: ${home} x ${away}\n${round} — Brasileirão Série A\nData: ${formattedDate}`;

  let rawContent: unknown = null;
  let error: string | null = null;
  let parsedBroadcasters: string[] | null = null;

  try {
    if (engine === 'gemini') {
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
    } else {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [{ type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] }],
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      rawContent = response.content;
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')
        .trim();

      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) parsedBroadcasters = parsed;
      } catch {
        parsedBroadcasters = null;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ engine, formattedDate, rawContent, parsedBroadcasters, error });
}
