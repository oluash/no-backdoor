/**
 * Portfolio (Systems) Controller — Route Handlers
 *
 * 7 handlers:
 *   1. listSystems    — GET  /api/systems
 *   2. createSystem   — POST /api/systems
 *   3. getSystem      — GET  /api/systems/:id
 *   4. updateSystem   — PUT  /api/systems/:id
 *   5. deleteSystem   — DELETE /api/systems/:id
 *   6. getHistory     — GET  /api/systems/:id/history
 *   7. getEvidence    — GET  /api/systems/:id/evidence
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listSystems,
  createSystem,
  getSystemById,
  updateSystem,
  deleteSystem,
  getSystemHistory,
  getSystemEvidence,
} from '@/services/portfolioService';
import {
  createSystemSchema,
  updateSystemSchema,
  systemQuerySchema,
  historyQuerySchema,
} from '@/api/validation';
import {
  success,
  created,
  noContent,
  error,
  notFound,
  internalError,
} from '@/utils/response';
import type { PaginationMeta } from '../api/types';
import type {
  SystemQueryParams,
  HistoryQueryParams,
  PaginationParams,
  CreateSystemRequest,
  UpdateSystemRequest,
} from '@/types';

// ---------------------------------------------------------------------------
// 1. List Systems — GET /api/systems
// ---------------------------------------------------------------------------

export async function listSystemsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Parse & validate query params
    const parsed = systemQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      error(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', {
        errors: parsed.error.errors,
      });
      return;
    }

    const q = parsed.data;
    const queryParams: SystemQueryParams = {
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      search: q.search,
      status: q.status,
      type: q.type,
      sortBy: q.sortBy ?? 'createdAt',
      sortOrder: q.sortOrder ?? 'desc',
      ownerId: q.ownerId,
    };

    const { systems, total } = await listSystems(queryParams);

    const paginationMeta: PaginationMeta = {
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total,
        totalPages: Math.ceil(total / queryParams.limit),
        hasNext: queryParams.page * queryParams.limit < total,
        hasPrev: queryParams.page > 1,
      },
    };

    success(res, systems, paginationMeta);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 2. Create System — POST /api/systems
// ---------------------------------------------------------------------------

export async function createSystemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      error(res, 401, 'UNAUTHORIZED', 'User ID not found in token');
      return;
    }

    const data = req.body as CreateSystemRequest;
    const system = await createSystem(userId, data);
    created(res, system);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 3. Get System — GET /api/systems/:id
// ---------------------------------------------------------------------------

const systemIdSchema = z.object({
  id: z.string().min(1).max(100),
});

export async function getSystemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = systemIdSchema.parse(req.params);

    const system = await getSystemById(id);
    if (!system) {
      notFound(res, `System with ID "${id}" not found`);
      return;
    }

    success(res, system);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 4. Update System — PUT /api/systems/:id
// ---------------------------------------------------------------------------

export async function updateSystemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = systemIdSchema.parse(req.params);
    const data = req.body as UpdateSystemRequest;

    const system = await updateSystem(id, data);
    if (!system) {
      notFound(res, `System with ID "${id}" not found`);
      return;
    }

    success(res, system);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 5. Delete System — DELETE /api/systems/:id
// ---------------------------------------------------------------------------

export async function deleteSystemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = systemIdSchema.parse(req.params);

    const deleted = await deleteSystem(id);
    if (!deleted) {
      notFound(res, `System with ID "${id}" not found`);
      return;
    }

    noContent(res);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 6. Get System History — GET /api/systems/:id/history
// ---------------------------------------------------------------------------

export async function getHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = systemIdSchema.parse(req.params);

    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      error(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', {
        errors: parsed.error.errors,
      });
      return;
    }

    const q = parsed.data;
    const queryParams: HistoryQueryParams = {
      page: q.page ?? 1,
      limit: q.limit ?? 10,
    };

    const { history, total } = await getSystemHistory(id, queryParams);

    const paginationMeta: PaginationMeta = {
      pagination: {
        page: queryParams.page,
        limit: queryParams.limit,
        total,
        totalPages: Math.ceil(total / queryParams.limit),
        hasNext: queryParams.page * queryParams.limit < total,
        hasPrev: queryParams.page > 1,
      },
    };

    success(res, history, paginationMeta);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// 7. Get System Evidence — GET /api/systems/:id/evidence
// ---------------------------------------------------------------------------

export async function getEvidenceHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = systemIdSchema.parse(req.params);

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    const queryParams: PaginationParams = { page, limit };

    const { evidence, total } = await getSystemEvidence(id, queryParams);

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

    success(res, evidence, paginationMeta);
  } catch (err) {
    next(err);
  }
}
