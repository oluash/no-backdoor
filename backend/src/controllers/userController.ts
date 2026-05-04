/**
 * User Controller — Admin User Management Route Handlers
 *
 * Handles HTTP requests for administrative user management:
 * list users (paginated, searchable), get single user, update user, delete user.
 * All endpoints require admin role (enforced by route-level verifyRole).
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { UserService, ListUsersQuery, AdminUpdateUserData } from '../services/userService';
import { UserRole } from '../../api/types';
import { BadRequestError } from '../utils/errors';
import { userRoleSchema } from '../../api/validation';

// ------------------------------------------------------------------------------
// Authenticated Request
// ------------------------------------------------------------------------------

interface AuthenticatedRequest extends Request {
  user?: { sub: string; role: UserRole };
}

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

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

/** Parse positive integer from query param */
function parseIntParam(value: unknown, defaultVal: number): number {
  if (typeof value !== 'string') return defaultVal;
  const n = parseInt(value, 10);
  return isNaN(n) ? defaultVal : Math.max(1, n);
}

// ------------------------------------------------------------------------------
// Controller Factory
// ------------------------------------------------------------------------------

export function createUserController(userService: UserService) {

  // ============================================================================
  // GET /api/users — List users (admin only)
  // ============================================================================

  const listUsers: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query: ListUsersQuery = {
        page: parseIntParam(req.query.page, 1),
        limit: parseIntParam(req.query.limit, 20),
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        sortBy: (req.query.sortBy as ListUsersQuery['sortBy']) || 'createdAt',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      // Validate role filter if provided
      if (typeof req.query.role === 'string') {
        const roleParse = userRoleSchema.safeParse(req.query.role);
        if (roleParse.success) {
          query.role = roleParse.data;
        }
      }

      const result = await userService.listUsers(query);

      // Inject requestId into meta
      result.meta.requestId = (req as Request & { requestId?: string }).requestId || '';
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // GET /api/users/:id — Get single user (admin only)
  // ============================================================================

  const getUser: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new BadRequestError('User ID is required');
      }
      const user = await userService.getUserById(id);
      res.status(200).json(successResponse(user, req));
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // PUT /api/users/:id — Update user (admin only)
  // ============================================================================

  const updateUser: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new BadRequestError('User ID is required');
      }

      const body = req.body as Record<string, unknown>;
      const updateData: AdminUpdateUserData = {};

      if (body.firstName !== undefined) {
        if (typeof body.firstName !== 'string' || body.firstName.length < 1 || body.firstName.length > 100) {
          throw new BadRequestError('firstName must be 1-100 characters');
        }
        updateData.firstName = body.firstName;
      }
      if (body.lastName !== undefined) {
        if (typeof body.lastName !== 'string' || body.lastName.length < 1 || body.lastName.length > 100) {
          throw new BadRequestError('lastName must be 1-100 characters');
        }
        updateData.lastName = body.lastName;
      }
      if (body.role !== undefined) {
        const roleParse = userRoleSchema.safeParse(body.role);
        if (!roleParse.success) {
          throw new BadRequestError('role must be admin, analyst, or viewer');
        }
        updateData.role = roleParse.data;
      }
      if (body.avatar !== undefined) {
        if (body.avatar !== null && (typeof body.avatar !== 'string' || !body.avatar.startsWith('http'))) {
          throw new BadRequestError('avatar must be a valid URL or null');
        }
        updateData.avatar = body.avatar as string | null;
      }

      const user = await userService.updateUser(id, updateData);
      res.status(200).json(successResponse(user, req));
    } catch (err) {
      next(err);
    }
  };

  // ============================================================================
  // DELETE /api/users/:id — Soft-delete user (admin only)
  // ============================================================================

  const deleteUser: RequestHandler = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new BadRequestError('User ID is required');
      }
      await userService.deleteUser(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  return {
    listUsers,
    getUser,
    updateUser,
    deleteUser,
  };
}
