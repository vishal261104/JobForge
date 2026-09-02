/**
 * ─────────────────────────────────────────────────────────────
 *  Redis Sliding-Window Rate Limiter  (Stage 8)
 *
 *  Strategy:
 *    A fixed window per minute, keyed by userId + current minute.
 *    Redis INCR is atomic; EXPIRE sets the TTL so keys auto-clean.
 *
 *  Window: 1 hour rolling (60 per-minute buckets each with a 1h TTL)
 *
 *  Key structure:
 *    ratelimit:{userId}:{YYYY-MM-DDTHH:mm}   (1-minute precision)
 *
 *  Limits (from env):
 *    FREE    → RATE_LIMIT_FREE    jobs / hour  (default 100)
 *    PREMIUM → RATE_LIMIT_PREMIUM jobs / hour  (default 10 000)
 *
 *  Response headers (always set):
 *    X-RateLimit-Limit     — max requests allowed in the window
 *    X-RateLimit-Remaining — requests remaining this minute
 *    X-RateLimit-Reset     — Unix timestamp (seconds) when the window resets
 *    Retry-After           — seconds until reset (only on 429)
 * ─────────────────────────────────────────────────────────────
 */

import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../../config/redis';
import { UserTier } from '../../types';
import { sendError } from '../../utils/apiResponse';
import env from '../../config/env';
import logger from '../../utils/logger';

// ── Window Configuration ──────────────────────────────────────

/** Window size in seconds */
const WINDOW_SECONDS = 60 * 60; // 1 hour

/** Granularity: each bucket covers 1 minute */
const BUCKET_SECONDS = 60;

/** Total number of buckets in the window */
const BUCKET_COUNT = WINDOW_SECONDS / BUCKET_SECONDS; // 60

// ── Helper: bucket key ────────────────────────────────────────

/**
 * Returns the Redis key for the current 1-minute bucket.
 * Format: ratelimit:{userId}:{ISO_minute}
 * Example: ratelimit:user123:2024-08-01T14:35
 */
function bucketKey(userId: string): string {
  const now = new Date();
  // Truncate to the current minute
  const minute = now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
  return `ratelimit:${userId}:${minute}`;
}

/**
 * Returns the Unix timestamp (seconds) at the start of the NEXT minute,
 * which is when the current bucket resets.
 */
function nextWindowReset(): number {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() + 1);
  return Math.floor(now.getTime() / 1000);
}

// ── Limit resolver ────────────────────────────────────────────

/**
 * Resolves the per-hour limit for a user based on their tier.
 * The hourly limit is distributed evenly across 60 one-minute buckets,
 * so each bucket's ceiling = limit / 60 (rounded up).
 */
function getBucketLimit(tier: UserTier): number {
  const hourlyLimit =
    tier === UserTier.PREMIUM ? env.RATE_LIMIT_PREMIUM : env.RATE_LIMIT_FREE;

  return Math.ceil(hourlyLimit / BUCKET_COUNT);
}

// ── Middleware ────────────────────────────────────────────────

/**
 * Applies Redis-backed per-user rate limiting.
 *
 * Usage:
 *   router.post('/', authenticate, jobRateLimiter, asyncHandler(createJob))
 */
export async function jobRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Rate limiting only applies to authenticated users
  if (!req.user) {
    next();
    return;
  }

  const { id: userId, tier } = req.user;
  const key                  = bucketKey(userId);
  const bucketLimit          = getBucketLimit(tier as UserTier);
  const hourlyLimit          = tier === UserTier.PREMIUM ? env.RATE_LIMIT_PREMIUM : env.RATE_LIMIT_FREE;
  const resetAt              = nextWindowReset();

  try {
    // INCR is atomic — safe under concurrent requests
    const current = await redisClient.incr(key);

    // Set TTL only on the first increment (avoids resetting the timer)
    if (current === 1) {
      await redisClient.expire(key, BUCKET_SECONDS + 5); // +5s grace period
    }

    const remaining = Math.max(0, bucketLimit - current);

    // Always set rate-limit headers so clients can self-throttle
    res.setHeader('X-RateLimit-Limit',     hourlyLimit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset',     resetAt);

    if (current > bucketLimit) {
      const retryAfter = resetAt - Math.floor(Date.now() / 1000);
      res.setHeader('Retry-After', retryAfter);

      logger.warn(
        { userId, tier, current, bucketLimit, key },
        '🚫  Rate limit exceeded'
      );

      sendError(
        res,
        `Rate limit exceeded. You are allowed ${hourlyLimit} job submissions per hour. ` +
        `Please retry after ${retryAfter} seconds.`,
        429
      );
      return;
    }

    next();
  } catch (redisErr) {
    // If Redis is unavailable, fail open (don't block legitimate requests)
    // Still set headers so clients know their limit ceiling
    logger.error({ err: redisErr, userId }, '⚠️  Rate limiter Redis error — failing open');
    const hourlyLimit = tier === UserTier.PREMIUM ? env.RATE_LIMIT_PREMIUM : env.RATE_LIMIT_FREE;
    res.setHeader('X-RateLimit-Limit',     hourlyLimit);
    res.setHeader('X-RateLimit-Remaining', hourlyLimit); // assume full quota when Redis is down
    res.setHeader('X-RateLimit-Reset',     nextWindowReset());
    next();
  }
}

// ── Global HTTP Rate Limiter (express-rate-limit) ─────────────

/**
 * IP-based rate limiter for all API routes using express-rate-limit.
 * Acts as a first line of defence against unauthenticated abuse.
 * Applied at the app level in app.ts.
 *
 * Limits:
 *   - 200 requests per 15 minutes per IP
 *   - Returns standard 429 with Retry-After header
 */
import rateLimit from 'express-rate-limit';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,   // Return X-RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
  handler(req, res, _next, options) {
    logger.warn({ ip: req.ip }, '🚫  Global IP rate limit exceeded');
    res.status(options.statusCode).json(options.message);
  },
  skip: (req) => req.path === '/health', // never rate-limit health checks
});
