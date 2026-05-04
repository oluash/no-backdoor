/**
 * No-Backdoor System Architecture — Auth Routes
 *
 * Authentication endpoints mounted at /api/auth:
 *   POST /register  → Register new user
 *   POST /login     → Login with credentials
 *   POST /refresh   → Refresh access token
 *   GET  /me        → Get current user profile
 *   PUT  /me        → Update user profile
 *
 * All routes delegate to the AuthController which wraps AuthService.
 * This is a factory function — the controller is injected at route registration time.
 */

import { Router, type RequestHandler } from 'express';
import { verifyToken } from '@/middleware/auth';
import { authLimiter } from '@/middleware/rateLimiter';

/**
 * Shape of the auth controller returned by createAuthController().
 */
export interface AuthControllerHandlers {
  register: RequestHandler;
  login: RequestHandler;
  refresh: RequestHandler;
  me: RequestHandler;
  updateMe: RequestHandler;
}

/**
 * Create auth routes with dependency injection.
 *
 * @param controller - Auth controller instance (from createAuthController)
 * @returns Configured Express Router
 */
export function createAuthRoutes(controller: AuthControllerHandlers): Router {
  const router = Router();

  // POST /api/auth/register — Register new user (public, rate-limited)
  router.post('/register', authLimiter, controller.register);

  // POST /api/auth/login — User login (public, rate-limited)
  router.post('/login', authLimiter, controller.login);

  // POST /api/auth/refresh — Refresh access token (public)
  router.post('/refresh', controller.refresh);

  // GET /api/auth/me — Get current user profile (protected)
  router.get('/me', verifyToken, controller.me);

  // PUT /api/auth/me — Update user profile (protected)
  router.put('/me', verifyToken, controller.updateMe);

  return router;
}

export default createAuthRoutes;
