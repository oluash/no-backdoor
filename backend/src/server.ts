/**
 * No-Backdoor System Architecture — Express App Factory
 *
 * Creates and configures the Express application with all middleware,
 * route registration, global error handling, and health checks.
 *
 * Usage:
 *   const { app, server } = await createApp(dbPool, redisClient);
 *   server.listen(PORT, () => console.log('Server running'));
 */

import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer, type Server as HTTPServer } from 'http';
import type { Pool } from 'pg';
import type { Redis as IoRedis } from 'ioredis';

import {
  IS_DEV,
  IS_TEST,
  IS_PROD,
  PORT,
  CORS_ORIGINS,
  CORS_CREDENTIALS,
  CORS_METHODS,
  CORS_ALLOWED_HEADERS,
} from '@/config';

import { logger } from '@/middleware/logger';
import { globalErrorHandler, notFoundHandler } from '@/middleware/errorHandler';
import { generalLimiter } from '@/middleware/rateLimiter';
import { registerRoutes } from '@/routes';
import { checkDatabaseHealth } from '@/db/pool';
import { checkRedisHealth } from '@/db/redis';
import { success } from '@/utils/response';
import { createWebSocketServer, closeWebSocketServer } from '@/websocket/server';

// =============================================================================
// Types
// =============================================================================

export interface AppResult {
  /** Configured Express application */
  app: Express;
  /** HTTP server (needed for WebSocket attachment) */
  server: HTTPServer;
  /** Graceful shutdown function */
  shutdown: (signal: string) => Promise<void>;
}

// =============================================================================
// Express App Factory
// =============================================================================

/**
 * Create and configure the Express application.
 *
 * @param dbPool      PostgreSQL connection pool
 * @param redis       Redis client (for health checks)
 * @returns           AppResult with app, server, and shutdown function
 */
export async function createApp(
  dbPool?: Pool,
  redis?: IoRedis | null
): Promise<AppResult> {
  const app = express();
  const server = createServer(app);

  // Attach WebSocket server for real-time updates
  createWebSocketServer(server);

  // ==========================================================================
  // 1. Security Middleware
  // ==========================================================================

  // Helmet — secure HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: IS_PROD
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
            },
          }
        : false, // Disable CSP in dev for easier debugging
      crossOriginEmbedderPolicy: false, // Allow embedding in dev
    })
  );

  // CORS — cross-origin resource sharing
  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Check against allowed origins
      const allowed = CORS_ORIGINS.some((allowed) => {
        if (allowed === '*') return true;
        return origin.includes(allowed) || allowed === origin;
      });

      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: CORS_CREDENTIALS,
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS.split(','),
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  };
  app.use(cors(corsOptions));

  // ==========================================================================
  // 2. Body Parsing
  // ==========================================================================

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ==========================================================================
  // 3. Compression
  // ==========================================================================

  app.use(compression());

  // ==========================================================================
  // 4. Request Logging (Morgan)
  // ==========================================================================

  // Use 'dev' format in development, 'combined' in production
  // Integrate Morgan with Winston for structured logging in prod
  if (IS_DEV) {
    app.use(morgan('dev'));
  } else if (!IS_TEST) {
    app.use(
      morgan('combined', {
        stream: {
          write: (message: string) => {
            logger.info(message.trim());
          },
        },
      })
    );
  }

  // ==========================================================================
  // 5. Request ID & Context
  // ==========================================================================

  app.use((req, res, next) => {
    req.startTime = Date.now();
    req.requestId =
      (req.headers['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  // ==========================================================================
  // 6. Health Check Endpoint
  // ==========================================================================

  app.get('/health', async (_req, res) => {
    // Check database
    const dbHealthy = dbPool ? await checkDatabaseHealth() : false;

    // Check Redis
    const redisHealthy = redis ? await checkRedisHealth() : false;

    const statusCode = dbHealthy && redisHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: statusCode === 200,
      data: {
        status: statusCode === 200 ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: dbHealthy ? 'connected' : 'disconnected',
          redis: redisHealthy ? 'connected' : 'disconnected',
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: 'health-check',
      },
    });
  });

  // Simple liveness probe (always returns 200)
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  // Readiness probe (checks dependencies)
  app.get('/health/ready', async (_req, res) => {
    const dbHealthy = dbPool ? await checkDatabaseHealth() : false;
    const redisHealthy = redis ? await checkRedisHealth() : false;

    if (dbHealthy && redisHealthy) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({
        status: 'not_ready',
        checks: { database: dbHealthy, redis: redisHealthy },
      });
    }
  });

  // ==========================================================================
  // 7. General Rate Limiting
  // ==========================================================================

  app.use(generalLimiter);

  // ==========================================================================
  // 8. API Route Registration
  // ==========================================================================

  const apiRouter = express.Router();
  registerRoutes(apiRouter, dbPool!, redis!);
  app.use('/api', apiRouter);

  // ==========================================================================
  // 9. 404 Handler
  // ==========================================================================

  app.use(notFoundHandler);

  // ==========================================================================
  // 10. Global Error Handler (must be last)
  // ==========================================================================

  app.use(globalErrorHandler);

  // ==========================================================================
  // 11. Graceful Shutdown Handler
  // ==========================================================================

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close WebSocket connections
    await closeWebSocketServer();

    // Close database pool
    if (dbPool) {
      const { closePool } = await import('@/db/pool');
      await closePool();
    }

    // Close Redis connection
    if (redis) {
      const { closeRedis } = await import('@/db/redis');
      await closeRedis();
    }

    // Allow 5 seconds for cleanup then force exit
    setTimeout(() => {
      logger.error('Forced exit after timeout');
      process.exit(1);
    }, 5000);

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  return { app, server, shutdown };
}
