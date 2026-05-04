/**
 * No-Backdoor System Architecture — Systems (Portfolio) Routes
 *
 * Delegates to the portfolio route implementations.
 * Mounted at /api/systems by routes/index.ts.
 *
 * Routes:
 *   GET    /          → List systems (paginated, searchable, filterable)
 *   POST   /          → Create new system
 *   GET    /:id       → Get system detail
 *   PUT    /:id       → Update system
 *   DELETE /:id       → Delete system
 *   GET    /:id/history → Get verification history
 *   GET    /:id/evidence → Get linked evidence files
 */

import { Router } from 'express';
import { verifyToken, requireAnalyst, requireAdmin } from '@/middleware/auth';
import { validateBody } from '@/middleware/validate';
import { createSystemSchema, updateSystemSchema } from '@/api/validation';
import {
  listSystemsHandler,
  createSystemHandler,
  getSystemHandler,
  updateSystemHandler,
  deleteSystemHandler,
  getHistoryHandler,
  getEvidenceHandler,
} from '@/controllers/portfolioController';

const router = Router();

// GET  /api/systems — List systems
router.get('/', verifyToken, listSystemsHandler);

// POST /api/systems — Create system (admin + analyst)
router.post(
  '/',
  verifyToken,
  requireAnalyst,
  validateBody(createSystemSchema),
  createSystemHandler
);

// GET /api/systems/:id — Get system detail
router.get('/:id', verifyToken, getSystemHandler);

// PUT /api/systems/:id — Update system
router.put(
  '/:id',
  verifyToken,
  requireAnalyst,
  validateBody(updateSystemSchema),
  updateSystemHandler
);

// DELETE /api/systems/:id — Delete system (admin only)
router.delete('/:id', verifyToken, requireAdmin, deleteSystemHandler);

// GET /api/systems/:id/history — Verification history
router.get('/:id/history', verifyToken, getHistoryHandler);

// GET /api/systems/:id/evidence — Linked evidence files
router.get('/:id/evidence', verifyToken, getEvidenceHandler);

export default router;
