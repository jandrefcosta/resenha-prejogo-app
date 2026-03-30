import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/systemPrompt';
import { getCache, setCache, TTL_24H } from '@/lib/redisCache';
import { analysisLimiter, getClientIp } from '@/lib/rateLimiter';
import type { Match } from '@/lib/types';

const client = new Anthropic();

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { success } = await analysisLimiter.limit(ip);
  if (!success) {
    return new Response('Muitas requisições. Tente novamente em alguns minutos.', { status: 429 });
  }

  let match: Match;
  try {
    const body = await request.json();
    match = body.match as Match;
    if (!match?.homeTeam || !match?.awayTeam) throw new Error('invalid payload');
  } catch {
    return new Response('Payload inválido', { status: 400 });
  }

  const cacheKey = `ai-analysis:${match.id}`;
  const cached = await getCache<string>(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(match.date));

  const venueParts = [match.stadium, match.city].filter(Boolean);
  const venueStr = venueParts.length ? venueParts.join(', ') : 'local a confirmar';
  const broadcastStr = match.broadcasters?.join(', ') ?? 'a confirmar';

  const userMessage =
    `Confronto: ${match.homeTeam.name} (casa) x ${match.awayTeam.name} (visitante)\n` +
    `Data e hora: ${dateStr} (Horário de Brasília)\n` +
    `Estádio: ${venueStr}\n` +
    `Competição: ${match.competition}, ${match.round}\n` +
    `Transmissão: ${broadcastStr}`;

  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const encoder = new TextEncoder();
  let fullText = '';

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            fullText += chunk.delta.text;
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
        await setCache(cacheKey, fullText, TTL_24H);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
