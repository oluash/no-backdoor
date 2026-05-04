/**
 * No-Backdoor System Architecture — Activity Routes
 *
 * Activity feed endpoints mounted at /api/activity by routes/index.ts.
 *
 * Routes:
 *   GET /recent — Recent activity feed (paginated, filterable)
 */

import { Router } from 'express';
import { verifyToken } from '@/middleware/auth';
import { getRecentActivityHandler } from '@/controllers/dashboardController';

const router = Router();

// GET /api/activity/recent — Recent activity feed
router.get('/recent', verifyToken, getRecentActivityHandler);

export default router;
