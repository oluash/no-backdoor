/**
 * No-Backdoor System Architecture — Response Helpers
 *
 * Standardized JSON response builders for success and error responses.
 * Ensures consistent API response format across all endpoints.
 */

import type { Response } from 'express';
import type { Meta, PaginationMeta } from '../api/types';

// =============================================================================
// Meta Generator
// =============================================================================

/**
 * Generate response metadata with timestamp and request ID.
 */
function generateMeta(req?: { requestId?: string }): Meta {
  return {
    timestamp: new Date().toISOString(),
    requestId: req?.requestId || 'unknown',
  };
}

// =============================================================================
// Success Response
// =============================================================================

/**
 * Send a standardized success JSON response.
 *
 * @param res    Express response object
 * @param data   Response payload data
 * @param meta   Optional pagination or other metadata
 * @returns      The Response object (for chaining)
 *
 * @example
 *   success(res, { totalSystems: 142 });
 *   // → { success: true, data: { totalSystems: 142 }, meta: { timestamp, requestId } }
 *
 * @example
 *   success(res, systems, { pagination: { page: 1, limit: 20, total: 142, ... } });
 *   // → { success: true, data: [...], meta: { timestamp, requestId, pagination: {...} } }
 */
export function success<T>(
  res: Response,
  data: T,
  meta?: PaginationMeta
): Response {
  const baseMeta = generateMeta(res.req);

  const response: Record<string, unknown> = {
    success: true,
    data,
    meta: meta ? { ...baseMeta, ...meta } : baseMeta,
  };

  return res.status(200).json(response);
}

/**
 * Send a standardized created (201) success response.
 */
export function created<T>(
  res: Response,
  data: T,
  meta?: PaginationMeta
): Response {
  const baseMeta = generateMeta(res.req);

  const response: Record<string, unknown> = {
    success: true,
    data,
    meta: meta ? { ...baseMeta, ...meta } : baseMeta,
  };

  return res.status(201).json(response);
}

/**
 * Send a 204 No Content response (for successful deletions).
 */
export function noContent(res: Response): Response {
  return res.status(204).send();
}

// =============================================================================
// Error Response
// =============================================================================

/**
 * Send a standardized error JSON response.
 *
 * @param res          Express response object
 * @param statusCode   HTTP status code
 * @param code         Application error code string
 * @param message      Human-readable error message
 * @param details      Optional additional error details
 * @returns            The Response object (for chaining)
 *
 * @example
 *   error(res, 404, 'NOT_FOUND', 'System not found');
 *   // → { success: false, error: { code: 'NOT_FOUND', message: 'System not found', status: 404 }, meta: {...} }
 */
export function error(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  const meta = generateMeta(res.req);

  const errorPayload: Record<string, unknown> = {
    code,
    message,
    status: statusCode,
  };

  if (details) {
    errorPayload.details = details;
  }

  return res.status(statusCode).json({
    success: false,
    error: errorPayload,
    meta,
  });
}

// =============================================================================
// Convenience Error Shorthands
// =============================================================================

/**
 * 400 Bad Request
 */
export function badRequest(
  res: Response,
  message: string = 'Bad request',
  code: string = 'BAD_REQUEST',
  details?: Record<string, unknown>
): Response {
  return error(res, 400, code, message, details);
}

/**
 * 401 Unauthorized
 */
export function unauthorized(
  res: Response,
  message: string = 'Unauthorized',
  code: string = 'UNAUTHORIZED'
): Response {
  return error(res, 401, code, message);
}

/**
 * 403 Forbidden
 */
export function forbidden(
  res: Response,
  message: string = 'Forbidden',
  code: string = 'FORBIDDEN'
): Response {
  return error(res, 403, code, message);
}

/**
 * 404 Not Found
 */
export function notFound(
  res: Response,
  message: string = 'Resource not found',
  code: string = 'NOT_FOUND'
): Response {
  return error(res, 404, code, message);
}

/**
 * 409 Conflict
 */
export function conflict(
  res: Response,
  message: string = 'Conflict',
  code: string = 'CONFLICT'
): Response {
  return error(res, 409, code, message);
}

/**
 * 429 Too Many Requests
 */
export function tooManyRequests(
  res: Response,
  message: string = 'Rate limit exceeded. Please try again later.',
  code: string = 'TOO_MANY_REQUESTS'
): Response {
  return error(res, 429, code, message);
}

/**
 * 500 Internal Server Error
 */
export function internalError(
  res: Response,
  message: string = 'Internal server error',
  code: string = 'INTERNAL_ERROR'
): Response {
  return error(res, 500, code, message);
}
