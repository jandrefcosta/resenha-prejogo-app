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

/**
 * Extracts the real client IP from the request.
 * Railway sits as the single reverse proxy in front of the app and appends
 * the real client IP as the LAST hop in X-Forwarded-For — the leftmost
 * entries are client-supplied and spoofable, so they must not be trusted.
 */
export function getClientIp(request: Request): string {
  const forwarded = (request.headers as Headers).get('x-forwarded-for');
  if (!forwarded) return 'unknown';
  const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1] : 'unknown';
}

/**
 * Password reset: 3 attempts per email hash per hour (sliding window).
 */
export const passwordResetLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:password-reset',
});

/**
 * Live fixture polling: 20 requests per IP per minute (sliding window).
 * Normal polling every 15s generates 4 req/min; 20 allows manual refresh headroom.
 */
export const liveFixtureLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:live-fixture',
});

/** Login: 10 attempts per IP+email per 15 minutes — throttles credential stuffing. */
export const loginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '15 m'),
  prefix: 'rl:login',
});

/** Registration: 5 accounts per IP per hour. */
export const registerLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'rl:register',
});

/** Admin login: 5 attempts per IP per 15 minutes — single shared secret, no lockout otherwise. */
export const adminLoginLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:admin-login',
});
