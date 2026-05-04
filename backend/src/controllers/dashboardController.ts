/**
 * Dashboard Controller — Route Handlers
 *
 * 4 handlers:
 *   1. getSummary           — GET /api/metrics/summary
 *   2. getTrends            — GET /api/metrics/trends
 *   3. getStatusDistribution — GET /api/metrics/status
 *   4. getRecentActivity    — GET /api/activity/recent
 */

import { Request, Response, NextFunction } from 'express';
import {
  getSummary,
  getTrends,
  getStatusDistribution,
  getRecentActivity,
} from '@/services/dashboardService';
import {
  trendQuerySchema,
  activityQuerySchema,
} from '@/api/validation';
import {
  success,
  error,
} from '@/utils/response';
import type { PaginationMeta } from '../api/types';

// ---------------------------------------------------------------------------
// 1. Get Summary — GET /api/metrics/summary
// ---------------------------------------------------------------------------

export async function getSummaryHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const metrics = await getSummary();
    success(res, metrics);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 2. Get Trends — GET /api/metrics/trends
// ---------------------------------------------------------------------------

export async function getTrendsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = trendQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      error(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', {
        errors: parsed.error.errors,
      });
      return;
    }

    const days = parsed.data.days ?? 30;
    const trendsData = await getTrends(days);
    success(res, trendsData);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 3. Get Status Distribution — GET /api/metrics/status
// ---------------------------------------------------------------------------

export async function getStatusDistributionHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const distributionData = await getStatusDistribution();
    success(res, distributionData);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 4. Get Recent Activity — GET /api/activity/recent
// ---------------------------------------------------------------------------

export async function getRecentActivityHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = activityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      error(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', {
        errors: parsed.error.errors,
      });
      return;
    }

    const q = parsed.data;
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const type = q.type;

    const { activities, total } = await getRecentActivity(page, limit, type);

    const paginationMeta: PaginationMeta = {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };

    success(res, activities, paginationMeta);
  } catch (err) {
    next(err);
  }
}
