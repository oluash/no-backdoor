/**
 * No-Backdoor System Architecture — Route Registration
 *
 * Creates all services and controllers, then mounts all API route modules.
 * Each route module receives its controller via dependency injection.
 *
 * Mounted under /api/:
 *   /api/auth     → Authentication routes
 *   /api/metrics  → Dashboard metrics routes
 *   /api/activity → Activity feed routes
 *   /api/evidence → Evidence upload routes
 *   /api/systems  → Portfolio (systems) routes
 *   /api/queue    → Verification queue routes
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { EventEmitter } from 'events';

// Services
import { AuthService } from '@/services/authService';
import { QueueService } from '@/services/queueService';

// Controllers
import { createAuthController } from '@/controllers/authController';
import { createQueueController } from '@/controllers/queueController';

// Route modules (factories)
import createAuthRoutes from './auth';
import metricsRoutes from './metrics';
import activityRoutes from './activity';
import evidenceRoutes from './evidence';
import systemsRoutes from './systems';
import createQueueRoutes from './queue';
import safergreensRoutes from './safergreens';

// Middleware
import { verifyToken } from '@/middleware/auth';

/**
 * Register all API routes on the provided Express Router.
 *
 * @param router    Express Router to mount routes on
 * @param dbPool    PostgreSQL connection pool
 * @param redis     Redis client
 * @param wsEmitter EventEmitter for WebSocket broadcasting (optional)
 */
export function registerRoutes(
  router: Router,
  dbPool: Pool,
  redis: Redis,
  wsEmitter?: EventEmitter
): void {
  const emitter = wsEmitter || new EventEmitter();

  // ── Auth ────────────────────────────────────────────────────────────────
  const authService = new AuthService(dbPool, redis);
  const authController = createAuthController(authService);
  router.use('/auth', createAuthRoutes(authController));

  // ── Dashboard & Metrics ─────────────────────────────────────────────────
  router.use('/metrics', metricsRoutes);

  // ── Activity Feed ───────────────────────────────────────────────────────
  router.use('/activity', activityRoutes);

  // ── Evidence Upload ─────────────────────────────────────────────────────
  router.use('/evidence', evidenceRoutes);

  // ── Portfolio (Systems) ─────────────────────────────────────────────────
  router.use('/systems', systemsRoutes);

  // ── Safer Greens (Public Marketing) ────────────────────────────────────
  router.use('/safergreens', safergreensRoutes);

  // ── Verification Queue ──────────────────────────────────────────────────
  const queueService = new QueueService(dbPool, redis, emitter);
  const queueController = createQueueController(queueService);
  const queueRouter = createQueueRoutes(queueController);
  // Apply auth middleware to all queue routes
  queueRouter.use(verifyToken);
  router.use('/queue', queueRouter);
}

export default registerRoutes;
