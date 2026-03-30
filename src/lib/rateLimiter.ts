import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * AI Analysis: 5 requests per IP per 10 minutes (sliding window).
 * The 24h Redis cache means repeated clicks on the same match are free —
 * this limit only caps first-load requests that actually hit Anthropic.
 */
export const analysisLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix: 'rl:analysis',
});

/**
 * Suggestions: 3 submissions per IP per hour (sliding window).
 */
export const suggestionsLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:suggestions',
});

/** Extracts the real client IP from Vercel/Next.js request headers. */
export function getClientIp(request: Request): string {
  const forwarded = (request.headers as Headers).get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}
