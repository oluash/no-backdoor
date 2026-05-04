/**
 * Evidence Controller — HTTP Route Handlers
 *
 * Bridges Express HTTP layer with the Evidence Service.
 * Handles multipart uploads, query parsing, error normalisation,
 * and standard API response envelopes.
 */

import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
  EvidenceQueryParams,
  EvidenceUploadInput,
} from '../../api/types';
import { evidenceQuerySchema, evidenceUploadSchema } from '../../api/validation';
import {
  deleteEvidence,
  getEvidenceById,
  listEvidence,
  uploadEvidence,
} from '../services/evidenceService';
import { mapMulterError } from '../utils/upload';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the authenticated user ID from the request object.
 * Assumes verifyToken middleware has already populated req.user.
 *
 * The middleware sets req.user to a JWTPayload (with `sub` field),
 * but we handle both `sub` and `id` for compatibility.
 */
function getUserId(req: Request): string {
  const user = (req as any).user;
  const userId = user?.sub || user?.id;
  if (!userId) {
    throw Object.assign(new Error('User not authenticated'), { status: 401, code: 'UNAUTHORIZED' });
  }
  return userId;
}

/**
 * Extract a request ID for tracing (from header or generate).
 */
function getRequestId(req: Request): string {
  return (req as any).requestId || req.get('x-request-id') || 'unknown';
}

/**
 * Send a standardised success response envelope.
 */
function sendSuccess<T>(req: Request, res: Response, statusCode: number, data: T): void {
  res.status(statusCode).json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    },
  });
}

/**
 * Send a standardised error response envelope.
 */
function sendError(
  req: Request,
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: string,
): void {
  res.status(statusCode).json({
    success: false,
    error: { code, message, details, status: statusCode },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: getRequestId(req),
    },
  });
}

/**
 * Central handler for async route logic — catches errors and forwards
 * them to the global error middleware.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ---------------------------------------------------------------------------
// POST /api/evidence/upload
// ---------------------------------------------------------------------------

/**
 * Handle multipart evidence file uploads.
 *
 * Flow:
 *  1. Multer middleware has already parsed files (called before this handler)
 *  2. Validate non-file form fields with Zod
 *  3. Call service to persist files + DB records
 *  4. Return 201 with upload records
 */
export const uploadEvidenceHandler = asyncHandler(async (req, res, next) => {
  try {
    // Validate form fields
    const parseResult = evidenceUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      sendError(req, res, 400, 'VALIDATION_ERROR', 'Invalid upload metadata', issues);
      return;
    }

    const metadata: EvidenceUploadInput = parseResult.data;

    // Check files were actually uploaded
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      sendError(req, res, 400, 'NO_FILES', 'No files were uploaded. Attach files under the "files" field.');
      return;
    }

    // Process upload
    const userId = getUserId(req);
    const uploads = await uploadEvidence(userId, files, metadata);

    sendSuccess(req, res, 201, { uploads });
  } catch (err: any) {
    // Handle known service-level errors
    if (err.status && err.code) {
      sendError(req, res, err.status, err.code, err.message);
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/evidence
// ---------------------------------------------------------------------------

/**
 * List evidence uploads with filtering, search, sorting, and pagination.
 *
 * Query params:
 *   page, limit, status, systemId, search, sortBy, sortOrder
 */
export const listEvidenceHandler = asyncHandler(async (req, res, next) => {
  try {
    // Parse & validate query params
    const parseResult = evidenceQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      sendError(req, res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', issues);
      return;
    }

    const queryParams: EvidenceQueryParams = parseResult.data;

    const result = await listEvidence(queryParams);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: getRequestId(req),
        pagination: result.meta.pagination,
      },
    });
  } catch (err: any) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/evidence/:id
// ---------------------------------------------------------------------------

/**
 * Get a single evidence upload by ID with system info.
 */
export const getEvidenceHandler = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(req, res, 400, 'MISSING_ID', 'Evidence ID is required');
      return;
    }

    const evidence = await getEvidenceById(id);

    if (!evidence) {
      sendError(req, res, 404, 'NOT_FOUND', `Evidence upload not found: ${id}`);
      return;
    }

    sendSuccess(req, res, 200, evidence);
  } catch (err: any) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/evidence/:id
// ---------------------------------------------------------------------------

/**
 * Delete an evidence upload and its associated file.
 * Returns 204 No Content on success.
 */
export const deleteEvidenceHandler = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(req, res, 400, 'MISSING_ID', 'Evidence ID is required');
      return;
    }

    const userId = getUserId(req);
    const deleted = await deleteEvidence(id, userId);

    if (!deleted) {
      sendError(req, res, 404, 'NOT_FOUND', `Evidence upload not found: ${id}`);
      return;
    }

    // 204 No Content — no response body
    res.status(204).send();
  } catch (err: any) {
    if (err.status && err.code) {
      sendError(req, res, err.status, err.code, err.message);
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Multer Error Handler
// ---------------------------------------------------------------------------

/**
 * Dedicated error handler for Multer-specific errors.
 * Mount this *after* the upload routes to catch file-size, file-count,
 * and file-type violations.
 *
 * Usage:
 *   router.post('/upload', upload.array('files', 10), uploadEvidenceHandler);
 *   router.use(multerErrorHandler);  // catches multer errors from above
 */
export function multerErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Check if this is a Multer error
  if (
    err &&
    (err.code?.startsWith('LIMIT_') ||
      err.name === 'FileTypeError' ||
      err instanceof multer.MulterError)
  ) {
    const { status, code, message } = mapMulterError(err);
    sendError(req, res, status, code, message);
    return;
  }
  next(err);
}
