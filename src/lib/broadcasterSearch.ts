import { GoogleGenAI } from '@google/genai';
import { getCache, setCache, TTL_1H, TTL_24H } from '@/lib/redisCache';

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

export async function getBroadcastersForFixture(
  fixtureId: string,
  homeTeam: string,
  awayTeam: string,
  round: string,
  date: string,
): Promise<string[]> {
  const cacheKey = `broadcasters:${fixtureId}`;

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

  const response = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userMessage,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  const broadcasters = parseBroadcasters(response.text ?? '');
  // Empty result = schedule not yet published. Cache briefly so we retry soon.
  const ttl = broadcasters.length > 0 ? TTL_24H : TTL_1H;
  await setCache(cacheKey, broadcasters, ttl);
  return broadcasters;
}
