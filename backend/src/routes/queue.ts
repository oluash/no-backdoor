/**
 * Queue Routes — Verification Queue API Endpoints
 *
 * All routes under /api/queue/*, protected by JWT auth.
 * Delegates to the QueueController which wraps QueueService.
 *
 * This is a factory function — the controller is injected at route registration time.
 *
 * Routes:
 *   GET    /tasks          → List tasks (paginated, filterable)
 *   POST   /tasks          → Create verification task
 *   GET    /tasks/:id      → Get single task detail
 *   PUT    /tasks/:id      → Update task properties
 *   POST   /tasks/:id/restart → Restart a failed task
 *   POST   /tasks/:id/cancel  → Cancel a pending task
 *   DELETE /tasks/:id      → Delete a task
 *   GET    /tasks/:id/logs → Get task logs
 *   POST   /batch          → Batch operations
 *   GET    /counts         → Task counts by status
 */

import { Router, type RequestHandler } from 'express';

/**
 * Shape of the queue controller returned by createQueueController().
 */
export interface QueueControllerHandlers {
  listTasks: RequestHandler;
  createTask: RequestHandler;
  getTask: RequestHandler;
  updateTask: RequestHandler;
  restartTask: RequestHandler;
  cancelTask: RequestHandler;
  deleteTask: RequestHandler;
  getLogs: RequestHandler;
  batch: RequestHandler;
  getCounts: RequestHandler;
}

/**
 * Create the queue router with dependency injection.
 *
 * @param controller - Queue controller instance (from createQueueController)
 * @returns Configured Express Router
 */
export function createQueueRoutes(controller: QueueControllerHandlers): Router {
  const router = Router();

  // ── Task CRUD ───────────────────────────────────────────────────────────
  router.get('/tasks', controller.listTasks);
  router.post('/tasks', controller.createTask);
  router.get('/tasks/:id', controller.getTask);
  router.put('/tasks/:id', controller.updateTask);
  router.post('/tasks/:id/restart', controller.restartTask);
  router.post('/tasks/:id/cancel', controller.cancelTask);
  router.delete('/tasks/:id', controller.deleteTask);

  // ── Task Logs ───────────────────────────────────────────────────────────
  router.get('/tasks/:id/logs', controller.getLogs);

  // ── Batch Operations ────────────────────────────────────────────────────
  router.post('/batch', controller.batch);

  // ── Queue Metadata ──────────────────────────────────────────────────────
  router.get('/counts', controller.getCounts);

  return router;
}

export default createQueueRoutes;
