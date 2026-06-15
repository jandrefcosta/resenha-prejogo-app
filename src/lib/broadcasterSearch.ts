import { GoogleGenAI } from '@google/genai';
import { getCache, setCache, TTL_1H, TTL_24H } from '@/lib/redisCache';
import type { BroadcasterInfo } from './types';

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function buildSystemPrompt(competitionName: string): string {
  return `You are a sports broadcasting assistant for football matches shown in Brazil.
Your task: find ONLY the confirmed TV/streaming broadcasters for a specific match.

Return a JSON array of objects with this exact shape:
[{"name": "Globo", "url": "https://globoplay.globo.com"}, {"name": "SporTV", "url": "https://globoplay.globo.com/sportv"}]

Rules:
- Include ONLY broadcasters confirmed for THIS specific match
- Do NOT include general channel information
- The "url" must be the direct watch/live page for the broadcaster, NOT a search page
- If you cannot find a confirmed URL for a broadcaster, use "" (empty string) for url
- If no broadcasters are confirmed, return: []
- Competition: ${competitionName}`;
}

function parseBroadcasters(text: string): BroadcasterInfo[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown) => {
      if (typeof item === 'string') {
        return { name: item, url: '' };
      }
      if (typeof item === 'object' && item !== null && 'name' in item) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.name !== 'string') return null;
        return {
          name: obj.name,
          url: typeof obj.url === 'string' ? obj.url : '',
        };
      }
      return null;
    }).filter((b): b is BroadcasterInfo => b !== null);
  } catch {
    return [];
  }
}

export async function getBroadcastersForFixture(
  fixtureId: string,
  homeTeam: string,
  awayTeam: string,
  round: string,
  date: string,
  /** Display name of the competition, used to focus the Gemini search prompt */
  competitionName: string = 'Brasileirão Série A',
): Promise<BroadcasterInfo[]> {
  const cacheKey = `broadcasters:${fixtureId}`;

  const cached = await getCache<BroadcasterInfo[]>(cacheKey);
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
    `${round} — ${competitionName}\n` +
    `Data: ${formattedDate} (Horário de Brasília)`;

  let response: Awaited<ReturnType<typeof gemini.models.generateContent>>;
  try {
    response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: buildSystemPrompt(competitionName),
      },
    });
  } catch (err) {
    // 429 / quota exhausted — do NOT cache so next request retries immediately.
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) {
      return [];
    }
    throw err;
  }

  const broadcasters = parseBroadcasters(response.text ?? '');
  // Empty result = schedule not yet published. Cache briefly so we retry soon.
  const ttl = broadcasters.length > 0 ? TTL_24H : TTL_1H;
  await setCache(cacheKey, broadcasters, ttl);
  return broadcasters;
}
