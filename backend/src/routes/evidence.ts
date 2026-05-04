/**
 * Evidence Routes
 *
 * Defines the HTTP surface for the evidence upload subsystem:
 *   POST /api/evidence/upload   — Upload evidence files (multipart)
 *   GET  /api/evidence          — List uploads (paginated, filterable)
 *   GET  /api/evidence/:id      — Get single upload detail
 *   DELETE /api/evidence/:id    — Delete upload + physical file
 *
 * All routes are protected by verifyToken middleware.
 * Multer errors are caught by multerErrorHandler mounted after upload routes.
 */

import { Router } from 'express';
import {
  deleteEvidenceHandler,
  getEvidenceHandler,
  listEvidenceHandler,
  multerErrorHandler,
  uploadEvidenceHandler,
} from '../controllers/evidenceController';
import { arrayEvidenceUpload } from '../utils/upload';
import { verifyToken } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/evidence/upload
 *
 * Upload one or more evidence files via multipart form-data.
 *
 * Headers:   Authorization: Bearer <token>
 *             Content-Type: multipart/form-data
 * Body:      files[]       — binary file data (max 10, 50MB each)
 *            systemId      — optional target system UUID
 *            description   — optional human-readable description
 *            tags          — optional comma-separated tag list
 *
 * Response:  201 Created   — { success: true, data: { uploads: [...] } }
 *            400           — validation / no files / file type error
 *            413           — file exceeds 50MB
 *            401           — missing/invalid token
 */
router.post(
  '/upload',
  verifyToken,
  arrayEvidenceUpload('files', 10),
  uploadEvidenceHandler,
);

/**
 * GET /api/evidence
 *
 * List evidence uploads with optional filtering, search, sorting, and pagination.
 *
 * Headers:   Authorization: Bearer <token>
 * Query:     page, limit, status, systemId, search, sortBy, sortOrder
 *
 * Response:  200 OK — { success: true, data: [...], meta: { pagination: {...} } }
 *            401    — missing/invalid token
 */
router.get('/', verifyToken, listEvidenceHandler);

/**
 * GET /api/evidence/:id
 *
 * Retrieve a single evidence upload record including system information.
 *
 * Headers:   Authorization: Bearer <token>
 * Params:    id — evidence upload UUID
 *
 * Response:  200 OK — { success: true, data: EvidenceUpload }
 *            404    — upload not found
 *            401    — missing/invalid token
 */
router.get('/:id', verifyToken, getEvidenceHandler);

/**
 * DELETE /api/evidence/:id
 *
 * Delete an evidence upload and its associated physical file.
 *
 * Headers:   Authorization: Bearer <token>
 * Params:    id — evidence upload UUID
 *
 * Response:  204 No Content
 *            404 — upload not found
 *            401 — missing/invalid token
 *            403 — not authorised to delete this upload
 */
router.delete('/:id', verifyToken, deleteEvidenceHandler);

// ---------------------------------------------------------------------------
// Multer Error Handler
// ---------------------------------------------------------------------------
//
// This MUST be mounted after the upload route so that Multer-specific
// errors (file size exceeded, too many files, invalid file type) are
// serialised into standard JSON error responses instead of raw HTML.
//
router.use(multerErrorHandler);

export default router;
