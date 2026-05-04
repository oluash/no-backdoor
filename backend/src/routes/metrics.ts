/**
 * No-Backdoor System Architecture — Metrics Routes
 *
 * Dashboard metrics endpoints mounted at /api/metrics by routes/index.ts.
 *
 * Routes:
 *   GET /summary  → Dashboard summary counts
 *   GET /trends   → 30-day verification trends
 *   GET /status   → System status distribution
 */

import { Router } from 'express';
import { verifyToken } from '@/middleware/auth';
import {
  getSummaryHandler,
  getTrendsHandler,
  getStatusDistributionHandler,
} from '@/controllers/dashboardController';

const router = Router();

// GET /api/metrics/summary — Dashboard summary
router.get('/summary', verifyToken, getSummaryHandler);

// GET /api/metrics/trends — 30-day trends
router.get('/trends', verifyToken, getTrendsHandler);

// GET /api/metrics/status — System status distribution
router.get('/status', verifyToken, getStatusDistributionHandler);

export default router;
