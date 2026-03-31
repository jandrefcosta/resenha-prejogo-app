import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redisCache';

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
