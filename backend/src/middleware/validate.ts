/**
 * No-Backdoor System Architecture — Zod Request Validation Middleware
 *
 * Provides reusable Express middleware factories for validating
 * request body, query parameters, and route parameters using Zod schemas.
 * Produces clean, field-level error messages on validation failure.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError, ValidationError } from './errorHandler';

// =============================================================================
// Zod Error Formatter
// =============================================================================

/**
 * Format a ZodError into a human-readable object mapping field paths
 * to arrays of error messages.
 */
function formatZodErrors(err: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of err.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }

  return errors;
}

/**
 * Build a single human-readable message from Zod issues.
 */
function buildZodMessage(err: ZodError): string {
  const messages = err.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'request';
    return `${path}: ${issue.message}`;
  });

  // Return the first few messages, truncated if many
  const maxMessages = 5;
  if (messages.length <= maxMessages) {
    return messages.join('; ');
  }
  return `${messages.slice(0, maxMessages).join('; ')} and ${messages.length - maxMessages} more`;
}

// =============================================================================
// Validation Middleware Factories
// =============================================================================

/**
 * Create middleware that validates req.body against a Zod schema.
 *
 * On success: parsed data replaces req.body (applies transforms/defaults).
 * On failure: throws BadRequestError with field-level details.
 *
 * @example
 *   router.post('/login', validateBody(loginSchema), loginHandler);
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = formatZodErrors(result.error);
      return next(
        new ValidationError(
          `Invalid request body: ${buildZodMessage(result.error)}`,
          details,
          'VALIDATION_ERROR'
        )
      );
    }

    // Replace req.body with parsed (and potentially transformed) data
    req.body = result.data;
    next();
  };
}

/**
 * Create middleware that validates req.query against a Zod schema.
 *
 * On success: parsed data replaces req.query.
 * On failure: throws BadRequestError with field-level details.
 *
 * @example
 *   router.get('/systems', validateQuery(systemQuerySchema), listSystems);
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const details = formatZodErrors(result.error);
      return next(
        new BadRequestError(
          `Invalid query parameters: ${buildZodMessage(result.error)}`,
          'INVALID_QUERY_PARAMS'
        )
      );
    }

    // Replace req.query with parsed (and potentially transformed) data
    req.query = result.data as any;
    next();
  };
}

/**
 * Create middleware that validates req.params against a Zod schema.
 *
 * On success: parsed data replaces req.params.
 * On failure: throws BadRequestError with field-level details.
 *
 * @example
 *   router.get('/evidence/:id', validateParams(z.object({ id: z.string() })), getEvidence);
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const details = formatZodErrors(result.error);
      return next(
        new BadRequestError(
          `Invalid URL parameters: ${buildZodMessage(result.error)}`,
          'INVALID_URL_PARAMS'
        )
      );
    }

    // Replace req.params with parsed data
    req.params = result.data as any;
    next();
  };
}

// =============================================================================
// Combined Validation Helper
// =============================================================================

/**
 * Validate an arbitrary value against a Zod schema.
 * Returns parsed value on success, throws ValidationError on failure.
 * Useful for service-layer validation.
 */
export function validate<T>(schema: ZodSchema<T>, value: unknown, context?: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const prefix = context ? `${context}: ` : '';
    throw new ValidationError(
      `${prefix}${buildZodMessage(result.error)}`,
      formatZodErrors(result.error),
      'VALIDATION_ERROR'
    );
  }
  return result.data;
}
