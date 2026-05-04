/**
 * No-Backdoor System — Entry Point
 *
 * Loads environment variables, creates DB/Redis connections,
 * builds the Express app via server.ts, and starts listening.
 *
 * This is a thin wrapper — all app logic lives in server.ts and routes/.
 */

import 'dotenv/config';
import { createApp } from '@/server';
import { pool, closePool, checkDatabaseHealth } from '@/db/pool';
import { getRedisClient, closeRedis, checkRedisHealth } from '@/db/redis';
import { logger } from '@/middleware/logger';
import { PORT } from '@/config';

async function main(): Promise<void> {
  logger.info('Starting No-Backdoor API server...');

  // ── Database Connection ─────────────────────────────────────────────────
  try {
    const dbHealthy = await checkDatabaseHealth();
    if (dbHealthy) {
      logger.info('PostgreSQL connection established');
    } else {
      logger.warn('PostgreSQL not yet available — server will start in degraded mode');
    }
  } catch (err) {
    logger.warn('Could not connect to PostgreSQL on startup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Redis Connection ────────────────────────────────────────────────────
  let redis: Awaited<ReturnType<typeof getRedisClient>> | null = null;
  try {
    redis = await getRedisClient();
    logger.info('Redis connection established');
  } catch (err) {
    logger.warn('Could not connect to Redis on startup', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Create App ──────────────────────────────────────────────────────────
  const { app, server, shutdown } = await createApp(pool, redis);

  // ── Start Listening ─────────────────────────────────────────────────────
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 No-Backdoor API running on http://0.0.0.0:${PORT}`);
  });

  // ── Graceful Shutdown ───────────────────────────────────────────────────
  process.on('SIGTERM', async () => {
    await shutdown('SIGTERM');
  });

  process.on('SIGINT', async () => {
    await shutdown('SIGINT');
  });

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
