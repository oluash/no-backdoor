/**
 * Auth Middleware — JWT Verification & Role-Based Access Control
 *
 * verifyToken: Validates the Authorization Bearer token and attaches the
 *              decoded JWT payload to req.user for downstream handlers.
 * verifyRole:  Restricts access to users with specific roles.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { JWTPayload, UserRole } from '../../api/types';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

// Re-export for direct use (e.g., WebSocket authentication)
export { verifyAccessToken };

// ------------------------------------------------------------------------------
// Type Augmentation
// ------------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      /** Decoded JWT payload for authenticated requests */
      user?: JWTPayload;
    }
  }
}

// ------------------------------------------------------------------------------
// verifyToken — JWT Authentication
// ------------------------------------------------------------------------------

/**
 * Express middleware that verifies the JWT Bearer token in the
 * Authorization header. On success, attaches the decoded payload
 * to `req.user` and calls `next()`. On failure, calls `next(err)`
 * with an UnauthorizedError.
 */
export const verifyToken: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('Access token required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError(
        'Invalid authorization header format. Expected: Bearer <token>'
      );
    }

    const token = parts[1];
    if (!token) {
      throw new UnauthorizedError('Access token missing');
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Invalid or expired access token'));
    }
  }
};

// ------------------------------------------------------------------------------
// verifyRole — Role-Based Access Control
// ------------------------------------------------------------------------------

/**
 * Creates middleware that restricts access to users with one of the
 * specified roles. Must be used AFTER verifyToken.
 *
 * @param allowedRoles - Array of permitted roles
 * @returns Express middleware
 *
 * @example
 * router.delete('/users/:id', verifyToken, verifyRole(['admin']), deleteUser);
 */
export function verifyRole(allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    // Map API role from JWT to check
    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      next(
        new ForbiddenError(
          `Access denied: requires ${allowedRoles.join(' or ')} role`
        )
      );
      return;
    }

    next();
  };
}

// ------------------------------------------------------------------------------
// Combined Middleware Helpers
// ------------------------------------------------------------------------------

/** Shorthand for verifyToken + verifyRole(['admin']) */
export const requireAdmin: RequestHandler[] = [verifyToken, verifyRole(['admin'])];

/** Shorthand for verifyToken + verifyRole(['admin', 'analyst']) */
export const requireAnalyst: RequestHandler[] = [verifyToken, verifyRole(['admin', 'analyst'])];

/** Shorthand for verifyToken + verifyRole(['admin', 'analyst', 'viewer']) */
export const requireViewer: RequestHandler[] = [
  verifyToken,
  verifyRole(['admin', 'analyst', 'viewer']),
];
