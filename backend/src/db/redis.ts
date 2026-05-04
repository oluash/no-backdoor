/**
 * No-Backdoor System Architecture — Redis Client
 *
 * Creates an ioredis client from config with helper methods for
 * JSON serialization, pattern deletion, and health checks.
 */

import Redis from 'ioredis';
import { redisConfig } from '@/config';
import { logger } from '@/middleware/logger';

// =============================================================================
// Singleton Client
// =============================================================================

let redisClient: Redis | null = null;
let isConnecting = false;

/**
 * Get (or create) the shared Redis client instance.
 * Uses lazy connection — first call triggers connect().
 */
export async function getRedisClient(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  if (isConnecting) {
    // Wait for the connection in progress
    await new Promise((resolve) => setTimeout(resolve, 100));
    return getRedisClient();
  }

  isConnecting = true;

  try {
    redisClient = new Redis(redisConfig);

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
    });

    redisClient.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    redisClient.on('end', () => {
      logger.info('Redis client connection ended');
      redisClient = null;
    });

    // Explicit connect for lazyConnect mode
    await redisClient.connect();

    return redisClient;
  } catch (err) {
    logger.error('Failed to create Redis client', {
      error: err instanceof Error ? err.message : String(err),
    });
    redisClient = null;
    throw err;
  } finally {
    isConnecting = false;
  }
}

/**
 * Get the existing Redis client without triggering creation.
 * Returns null if not yet created.
 */
export function getExistingRedisClient(): Redis | null {
  return redisClient;
}

// =============================================================================
// JSON Helper Methods
// =============================================================================

/**
 * Get a value from Redis and parse as JSON.
 * Returns null if key doesn't exist or JSON parsing fails.
 */
export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    const value = await redis.get(key);
    if (value === null) return null;
    return JSON.parse(value) as T;
  } catch (err) {
    logger.error('Redis getJSON error', { key, error: String(err) });
    return null;
  }
}

/**
 * Set a value in Redis as JSON string.
 */
export async function setJSON<T>(
  key: string,
  value: T
): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.set(key, JSON.stringify(value));
  } catch (err) {
    logger.error('Redis setJSON error', { key, error: String(err) });
    throw err;
  }
}

/**
 * Set a value in Redis as JSON with expiration (in seconds).
 */
export async function setEX<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.error('Redis setEX error', { key, ttlSeconds, error: String(err) });
    throw err;
  }
}

/**
 * Delete keys matching a pattern (uses SCAN to avoid blocking).
 * Returns the number of keys deleted.
 */
export async function delPattern(pattern: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    let cursor = '0';
    let deleted = 0;

    do {
      const result = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = result[0];
      const keys = result[1];

      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    return deleted;
  } catch (err) {
    logger.error('Redis delPattern error', { pattern, error: String(err) });
    throw err;
  }
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Check Redis connectivity.
 * Returns true if PING succeeds.
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

/**
 * Disconnect from Redis.
 * Call during graceful shutdown.
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    logger.info('Closing Redis connection...');
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}
