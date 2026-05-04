/**
 * API Error Classes
 *
 * Standardized error types used across the backend.
 * All errors include an HTTP status code and a machine-readable error code.
 */

/**
 * Standardized API error with status code and error code.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: string;

  constructor(status: number, code: string, message: string, details?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';

    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * 400 Bad Request — validation errors, malformed input
 */
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', details?: string) {
    super(400, 'BAD_REQUEST', message, details);
    this.name = 'BadRequestError';
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * 401 Unauthorized — missing or invalid authentication
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized', details?: string) {
    super(401, 'UNAUTHORIZED', message, details);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * 403 Forbidden — authenticated but not permitted
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden', details?: string) {
    super(403, 'FORBIDDEN', message, details);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * 404 Not Found — resource does not exist
 */
export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found', details?: string) {
    super(404, 'NOT_FOUND', message, details);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 409 Conflict — resource conflict (e.g., duplicate email)
 */
export class ConflictError extends ApiError {
  constructor(message: string = 'Conflict', details?: string) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * 500 Internal Server Error — unexpected server error
 */
export class InternalError extends ApiError {
  constructor(message: string = 'Internal server error', details?: string) {
    super(500, 'INTERNAL_ERROR', message, details);
    this.name = 'InternalError';
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}
