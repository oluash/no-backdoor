/**
 * Auth Controller — Express Route Handlers
 *
 * Handles HTTP requests for authentication endpoints:
 * register, login, refresh token, get profile, update profile.
 * Delegates all business logic to AuthService.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthService } from '../services/authService';
import {
  RegisterRequest,
  LoginRequest,
  UpdateProfileRequest,
  JWTPayload,
} from '../../api/types';
import { registerSchema, loginSchema, updateProfileSchema, refreshTokenSchema } from '../../api/validation';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

// ------------------------------------------------------------------------------
// Authenticated Request Type
// ------------------------------------------------------------------------------

/** Extends Express Request to include authenticated user from JWT */
export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Validate request body against a Zod schema.
 * @throws BadRequestError if validation fails
 */
function validateBody<T>(schema: { parse: (data: unknown) => T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'errors' in err) {
      const zodError = err as { errors: Array<{ path: string[]; message: string }> };
      const messages = zodError.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new BadRequestError('Validation failed', messages);
    }
    throw new BadRequestError('Invalid request body');
  }
}

/** Build standard success response */
function successResponse<T>(data: T, req: Request) {
  return {
    success: true as const,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: (req as Request & { requestId?: string }).requestId || '',
    },
  };
}

// ------------------------------------------------------------------------------
// Controller Factory
// ------------------------------------------------------------------------------

export function createAuthController(authService: AuthService) {

  // ============================================================================
  // POST /api/auth/register
  // ============================================================================

  const register: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = validateBody<RegisterRequest>(registerSchema, req.body);
      const result = await authService.register(data);
      res.status(201).json(successResponse(result, req));
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // POST /api/auth/login
  // ============================================================================

  const login: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = validateBody<LoginRequest>(loginSchema, req.body);
      const result = await authService.login(data);
      res.status(200).json(successResponse(result, req));
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // POST /api/auth/refresh
  // ============================================================================

  const refresh: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = validateBody<{ refreshToken: string }>(refreshTokenSchema, req.body);
      const tokens = await authService.refreshToken(body.refreshToken);
      res.status(200).json(successResponse(tokens, req));
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // GET /api/auth/me
  // ============================================================================

  const me: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user?.sub) {
        throw new UnauthorizedError('Authentication required');
      }
      const user = await authService.getMe(req.user.sub);
      res.status(200).json(successResponse(user, req));
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // PUT /api/auth/me
  // ============================================================================

  const updateMe: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user?.sub) {
        throw new UnauthorizedError('Authentication required');
      }
      const data = validateBody<UpdateProfileRequest>(updateProfileSchema, req.body);
      const user = await authService.updateMe(req.user.sub, data);
      res.status(200).json(successResponse(user, req));
    } catch (err) {
      next(err);
    }
  };

  return {
    register,
    login,
    refresh,
    me,
    updateMe,
  };
}
