/**
 * No-Backdoor System Architecture — Sliding Window Rate Limiter
 *
 * Redis-backed sliding window rate limiter with configurable windows
 * and request caps. Different limiters for general API, uploads, and auth.
 * Automatically skipped in test environment.
 */

import type { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '@/db/redis';
import {
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_GENERAL_MAX,
  RATE_LIMIT_GENERAL_WINDOW_MS,
  RATE_LIMIT_UPLOAD_MAX,
  RATE_LIMIT_UPLOAD_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_AUTH_WINDOW_MS,
} from '@/config';
import { logger } from './logger';

// =============================================================================
// Rate Limiter Configuration
// =============================================================================

export interface RateLimitConfig {
  /** Maximum requests allowed per window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Redis key prefix for this limiter */
  keyPrefix: string;
  /** Function to extract the rate-limit key from the request */
  keyGenerator?: (req: Request) => string;
  /** Skip rate limiting for this request? */
  skip?: (req: Request) => boolean;
  /** Handler called when rate limit is exceeded */
  handler?: (req: Request, res: Response) => void;
}

// Default key generator uses IP + optional user ID
function defaultKeyGenerator(req: Request): string {
  const userPart = req.user ? `:${req.user.id}` : '';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${ip}${userPart}`;
}

// =============================================================================
// Sliding Window Implementation (Redis sorted sets)
// =============================================================================

/**
 * Check if the request is within the rate limit using a sliding window.
 *
 * Algorithm:
 *   1. Remove entries older than (now - windowMs) from the sorted set.
 *   2. Count remaining entries in the window.
 *   3. If count < max, add current entry and allow.
 *   4. If count >= max, deny.
 *
 * Uses Redis sorted sets where score = timestamp, member = unique entry ID.
 */
async function isAllowed(
  redis: Awaited<ReturnType<typeof getRedisClient>>,
  key: string,
  max: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  // Use Redis pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Remove entries outside the sliding window
  pipeline.zremrangebyscore(redisKey, 0, windowStart);

  // Count entries currently in the window
  pipeline.zcard(redisKey);

  // Add current entry (will be removed if over limit later)
  const entryId = `${now}:${Math.random().toString(36).substring(2, 8)}`;
  pipeline.zadd(redisKey, now, entryId);

  // Set expiry on the key to auto-cleanup
  pipeline.pexpire(redisKey, windowMs);

  const results = await pipeline.exec();
  if (!results) {
    // Pipeline failed — allow request (fail open)
    logger.warn('Rate limiter pipeline failed, allowing request');
    return { allowed: true, remaining: max - 1, resetTime: now + windowMs };
  }

  // results[1] is the zcard result (current count after zadd)
  // We need the count BEFORE the zadd, which is results[1][1]
  const countBefore = (results[1][1] as number) || 0;
  const currentCount = countBefore + 1;

  const allowed = currentCount <= max;
  const remaining = Math.max(0, max - currentCount);
  const resetTime = windowStart + windowMs;

  if (!allowed) {
    // Remove the entry we just added since the request is over limit
    await redis.zrem(redisKey, entryId);
  }

  return { allowed, remaining, resetTime };
}

// =============================================================================
// Rate Limiter Middleware Factory
// =============================================================================

/**
 * Create Express middleware that enforces a sliding-window rate limit.
 */
export function createRateLimiter(config: RateLimitConfig) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Skip rate limiting if disabled
    if (!RATE_LIMIT_ENABLED) {
      return next();
    }

    // Skip if configured
    if (config.skip?.(req)) {
      return next();
    }

    try {
      const redis = await getRedisClient();
      const keyFn = config.keyGenerator || defaultKeyGenerator;
      const key = `${config.keyPrefix}:${keyFn(req)}`;

      const { allowed, remaining, resetTime } = await isAllowed(
        redis,
        key,
        config.max,
        config.windowMs
      );

      // Set rate limit headers (standard de-facto headers)
      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

      if (!allowed) {
        res.setHeader('Retry-After', Math.ceil(config.windowMs / 1000));

        if (config.handler) {
          return config.handler(req, res);
        }

        res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Rate limit exceeded. Please try again later.',
            status: 429,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: (req as any).requestId || 'unknown',
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Fail open: if Redis is down, allow the request
      logger.error('Rate limiter error, allowing request', {
        error: err instanceof Error ? err.message : String(err),
        path: req.originalUrl,
      });
      next();
    }
  };
}

// =============================================================================
// Pre-configured Rate Limiters
// =============================================================================

/** General API rate limiter: 100 requests per 15 minutes */
export const generalLimiter = createRateLimiter({
  max: RATE_LIMIT_GENERAL_MAX,
  windowMs: RATE_LIMIT_GENERAL_WINDOW_MS,
  keyPrefix: 'general',
});

/** Upload endpoint rate limiter: 10 requests per 15 minutes */
export const uploadLimiter = createRateLimiter({
  max: RATE_LIMIT_UPLOAD_MAX,
  windowMs: RATE_LIMIT_UPLOAD_WINDOW_MS,
  keyPrefix: 'upload',
});

/** Auth endpoint rate limiter: 20 requests per 15 minutes */
export const authLimiter = createRateLimiter({
  max: RATE_LIMIT_AUTH_MAX,
  windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
  keyPrefix: 'auth',
  // Auth endpoints use a stricter key (just IP, no user ID)
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});

/** Strict rate limiter for sensitive operations (e.g., password reset) */
export const strictLimiter = createRateLimiter({
  max: 5,
  windowMs: 900_000, // 15 minutes
  keyPrefix: 'strict',
  keyGenerator: (req: Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
});
