/**
 * Queue Controller — Route Handlers for Verification Queue Endpoints
 *
 * Handles all HTTP requests for the verification queue API:
 * listing, creation, retrieval, updates, restart, cancel, delete,
 * logs, batch operations, and status counts.
 */

import type { Request, Response, NextFunction } from 'express';
import type { QueueService } from '../services/queueService';
import {
  createTaskSchema,
  updateTaskSchema,
  batchOperationSchema,
  taskQuerySchema,
  taskLogQuerySchema,
} from '../../api/validation';
import type {
  CreateTaskRequest,
  UpdateTaskRequest,
  BatchOperationRequest,
  TaskQueryParams,
  TaskLogQueryParams,
} from '../../api/types';

/**
 * Factory function that creates all queue controller handlers
 * bound to a QueueService instance.
 */
export function createQueueController(service: QueueService) {
  // ── Helper: build standard response ─────────────────────────────────────

  function ok<T>(res: Response, data: T, statusCode = 200): void {
    res.status(statusCode).json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: (req: Request) => req.headers['x-request-id'] ?? `req_${Date.now()}`,
      },
    });
  }

  // ── 1. List Tasks ───────────────────────────────────────────────────────

  async function listTasks(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = taskQuerySchema.safeParse(req.query);
      if (!validated.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: validated.error.message,
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const query: TaskQueryParams = validated.data;
      const result = await service.listTasks(query);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 2. Create Task ──────────────────────────────────────────────────────

  async function createTask(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = createTaskSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validated.error.message,
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const userId = (req as unknown as Record<string, unknown>).userId as string;
      const data: CreateTaskRequest = validated.data;
      const result = await service.createTask(userId, data);

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 3. Get Task ─────────────────────────────────────────────────────────

  async function getTask(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task ID is required',
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const result = await service.getTaskById(id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 4. Update Task ──────────────────────────────────────────────────────

  async function updateTask(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task ID is required',
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const validated = updateTaskSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validated.error.message,
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const data: UpdateTaskRequest = validated.data;
      const result = await service.updateTask(id, data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 5. Restart Task ─────────────────────────────────────────────────────

  async function restartTask(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task ID is required',
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const result = await service.restartTask(id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 6. Cancel Task ──────────────────────────────────────────────────────

  async function cancelTask(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task ID is required',
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const result = await service.cancelTask(id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 7. Delete Task ──────────────────────────────────────────────────────

  async function deleteTask(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task ID is required',
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      await service.deleteTask(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  // ── 8. Get Task Logs ────────────────────────────────────────────────────

  async function getLogs(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task ID is required',
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const validated = taskLogQuerySchema.safeParse(req.query);
      if (!validated.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: validated.error.message,
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const query: TaskLogQueryParams = validated.data;
      const result = await service.getTaskLogs(id, query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 9. Batch Operation ──────────────────────────────────────────────────

  async function batch(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = batchOperationSchema.safeParse(req.body);
      if (!validated.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validated.error.message,
            status: 400,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? `req_${Date.now()}`,
          },
        });
        return;
      }

      const userId = (req as unknown as Record<string, unknown>).userId as string;
      const data: BatchOperationRequest = validated.data;
      const result = await service.batchOperation(userId, data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  // ── 10. Get Queue Counts ────────────────────────────────────────────────

  async function getCounts(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await service.getQueueCounts();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  return {
    listTasks,
    createTask,
    getTask,
    updateTask,
    restartTask,
    cancelTask,
    deleteTask,
    getLogs,
    batch,
    getCounts,
  };
}
