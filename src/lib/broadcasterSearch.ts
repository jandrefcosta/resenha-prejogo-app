import Anthropic from '@anthropic-ai/sdk';
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages/messages';
import { GoogleGenAI } from '@google/genai';
import { getCache, setCache, TTL_24H } from '@/lib/redisCache';

const anthropic = new Anthropic();
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const SYSTEM_PROMPT = `Você é um assistente especializado em transmissões de futebol brasileiro.
Sua tarefa: buscar na web onde uma partida ESPECÍFICA do Brasileirão Série A será transmitida.

REGRAS ESTRITAS:
1. Retorne SOMENTE canais com transmissão CONFIRMADA para essa partida específica.
2. NÃO liste todos os canais que costumam transmitir o Brasileirão em geral.
3. Se não encontrar informação específica e confirmada para essa partida, retorne [].
4. Canais válidos: Globo, SporTV, SporTV 2, SporTV 3, Premiere, CazéTV, Amazon Prime Video, TNT Sports, Max, ESPN, Band.

Formato de resposta: SOMENTE um array JSON. Ex: ["Globo","SporTV"] ou []
Sem texto adicional.`;

function parseBroadcasters(text: string): string[] {
  let parsed: unknown = null;
  try {
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* */ }
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === 'string');
}

async function getBroadcastersViaAnthropic(userMessage: string): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    tools: [{ type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] }],
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return parseBroadcasters(text);
}

async function getBroadcastersViaGemini(userMessage: string): Promise<string[]> {
  const response = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userMessage,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  const text = response.text ?? '';
  return parseBroadcasters(text);
}

export type BroadcasterEngine = 'anthropic' | 'gemini';

export function getActiveEngine(): BroadcasterEngine {
  return process.env.BROADCASTER_ENGINE === 'gemini' ? 'gemini' : 'anthropic';
}

export async function getBroadcastersForFixture(
  fixtureId: string,
  homeTeam: string,
  awayTeam: string,
  round: string,
  date: string,
  engine: BroadcasterEngine = getActiveEngine(),
): Promise<string[]> {
  const cacheKey = `broadcasters:${engine}:${fixtureId}`;

  const cached = await getCache<string[]>(cacheKey);
  if (cached !== null) return cached;

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date));

  const userMessage =
    `Onde assistir: ${homeTeam} x ${awayTeam}\n` +
    `${round} — Campeonato Brasileiro Série A\n` +
    `Data: ${formattedDate} (Horário de Brasília)`;

  const broadcasters =
    engine === 'gemini'
      ? await getBroadcastersViaGemini(userMessage)
      : await getBroadcastersViaAnthropic(userMessage);

  await setCache(cacheKey, broadcasters, TTL_24H);

  return broadcasters;
}
