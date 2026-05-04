/**
 * No-Backdoor System Architecture — Global Error Handler
 *
 * Custom ApiError hierarchy with operational vs programming error distinction.
 * Global Express error handler that:
 *   - Logs all errors via Winston
 *   - Returns consistent JSON error responses
 *   - Hides stack traces in production
 *   - Handles Zod validation errors (→ 400)
 *   - Handles PostgreSQL errors (unique violation → 409, FK → 400)
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';
import { IS_DEV } from '@/config';
import { error as errorResponse } from '@/utils/response';

// =============================================================================
// Custom ApiError Class Hierarchy
// =============================================================================

/**
 * Base API error class. All application errors extend this.
 * Operational errors are expected failures (bad input, not found, etc.).
 * Programming errors are unexpected bugs.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;

  constructor(
    statusCode: number,
    message: string,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 Bad Request — malformed or invalid client input */
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', code: string = 'BAD_REQUEST') {
    super(400, message, code, true);
  }
}

/** 401 Unauthorized — missing or invalid authentication */
export class UnauthorizedError extends ApiError {
  constructor(
    message: string = 'Unauthorized',
    code: string = 'UNAUTHORIZED'
  ) {
    super(401, message, code, true);
  }
}

/** 403 Forbidden — authenticated but lacking permission */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden', code: string = 'FORBIDDEN') {
    super(403, message, code, true);
  }
}

/** 404 Not Found — requested resource does not exist */
export class NotFoundError extends ApiError {
  constructor(
    message: string = 'Resource not found',
    code: string = 'NOT_FOUND'
  ) {
    super(404, message, code, true);
  }
}

/** 409 Conflict — resource conflict (e.g., duplicate email) */
export class ConflictError extends ApiError {
  constructor(
    message: string = 'Conflict',
    code: string = 'CONFLICT'
  ) {
    super(409, message, code, true);
  }
}

/** 413 Payload Too Large — file or body exceeds limit */
export class PayloadTooLargeError extends ApiError {
  constructor(
    message: string = 'Payload too large',
    code: string = 'PAYLOAD_TOO_LARGE'
  ) {
    super(413, message, code, true);
  }
}

/** 422 Unprocessable Entity — semantic validation failure */
export class ValidationError extends ApiError {
  public readonly details: Record<string, string[]>;

  constructor(
    message: string = 'Validation failed',
    details: Record<string, string[]> = {},
    code: string = 'VALIDATION_ERROR'
  ) {
    super(422, message, code, true);
    this.details = details;
  }
}

/** 500 Internal Server Error — unexpected server failure */
export class InternalServerError extends ApiError {
  constructor(
    message: string = 'Internal server error',
    code: string = 'INTERNAL_ERROR'
  ) {
    super(500, message, code, false);
  }
}

// =============================================================================
// Zod Error Formatter
// =============================================================================

/**
 * Convert a ZodError into a clean field → messages[] map.
 */
function formatZodError(err: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }
  return details;
}

// =============================================================================
// PostgreSQL Error Handler
// =============================================================================

/** PostgreSQL error codes we care about */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_NOT_NULL_VIOLATION = '23502';
const PG_INVALID_TEXT_REPRESENTATION = '22P02';

interface PostgresError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
}

function isPostgresError(err: unknown): err is PostgresError {
  return err instanceof Error && 'code' in err;
}

/**
 * Transform known PostgreSQL errors into appropriate ApiErrors.
 * Returns null if the error is not a recognized Postgres error.
 */
function transformPostgresError(err: unknown): ApiError | null {
  if (!isPostgresError(err) || !err.code) {
    return null;
  }

  switch (err.code) {
    case PG_UNIQUE_VIOLATION: {
      const field = err.constraint || 'unknown';
      return new ConflictError(
        'A resource with this unique value already exists',
        'DUPLICATE_ENTRY'
      );
    }
    case PG_FOREIGN_KEY_VIOLATION: {
      return new BadRequestError(
        'Referenced resource does not exist',
        'FOREIGN_KEY_VIOLATION'
      );
    }
    case PG_CHECK_VIOLATION:
      return new BadRequestError(
        'Data violates a constraint',
        'CHECK_VIOLATION'
      );
    case PG_NOT_NULL_VIOLATION:
      return new BadRequestError(
        `Required field is missing: ${err.column || 'unknown'}`,
        'NOT_NULL_VIOLATION'
      );
    case PG_INVALID_TEXT_REPRESENTATION:
      return new BadRequestError(
        'Invalid data format provided',
        'INVALID_DATA_FORMAT'
      );
    default:
      return null;
  }
}

// =============================================================================
// Global Express Error Handler
// =============================================================================

/**
 * Global Express error-handling middleware (must be registered last).
 *
 * Handles:
 *   - ApiError subclasses → appropriate status + JSON
 *   - ZodError → 400 with field-level messages
 *   - PostgreSQL errors → mapped to 400/409
 *   - Unknown errors → 500 (hide details in production)
 */
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // --- 1. Try to normalize to ApiError ---
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    const details = formatZodError(err);
    const fieldCount = Object.keys(details).length;
    apiError = new ValidationError(
      fieldCount > 0 ? 'Request validation failed' : 'Invalid request data',
      details,
      'VALIDATION_ERROR'
    );
  } else {
    // Check for PostgreSQL error
    const pgError = transformPostgresError(err);
    if (pgError) {
      apiError = pgError;
    } else if (err instanceof Error) {
      // Generic error — treat as internal
      apiError = new InternalServerError(
        IS_DEV ? err.message : 'An unexpected error occurred'
      );
    } else {
      apiError = new InternalServerError('An unexpected error occurred');
    }
  }

  // --- 2. Log the error ---
  const logPayload: Record<string, unknown> = {
    statusCode: apiError.statusCode,
    code: apiError.code,
    message: apiError.message,
    isOperational: apiError.isOperational,
    stack: IS_DEV ? apiError.stack : undefined,
  };

  if (apiError instanceof ValidationError) {
    logPayload.validationDetails = apiError.details;
  }

  if (apiError.statusCode >= 500 && !apiError.isOperational) {
    logger.error('Unexpected server error', logPayload);
  } else if (apiError.statusCode >= 400) {
    logger.warn('Client error', logPayload);
  }

  // --- 3. Build response ---
  const responseDetails: Record<string, unknown> = {};

  // Include stack trace in development
  if (IS_DEV && err instanceof Error && err.stack) {
    responseDetails.stack = err.stack;
  }

  // Include validation details
  if (apiError instanceof ValidationError) {
    responseDetails.validationErrors = apiError.details;
  }

  // Include original error message in dev for non-operational errors
  if (IS_DEV && err instanceof Error && !(err instanceof ApiError)) {
    responseDetails.originalError = err.message;
  }

  // Send response
  errorResponse(
    res,
    apiError.statusCode,
    apiError.code,
    apiError.message,
    Object.keys(responseDetails).length > 0 ? responseDetails : undefined
  );
}

// =============================================================================
// 404 Handler
// =============================================================================

/**
 * Catches requests to undefined routes and throws a NotFoundError.
 */
export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(new NotFoundError(`Route not found`));
}
