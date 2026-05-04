/**
 * Express Type Augmentations
 * Extends Express Request interface with custom properties.
 */

import type { User, UserRole } from './api/types';

declare global {
  namespace Express {
    // Extend Request to include authenticated user
    interface Request {
      /** Authenticated user (set by verifyToken middleware) */
      user?: User;
      /** Unique request ID for tracing */
      requestId: string;
      /** Request start time for duration tracking */
      startTime: number;
    }
  }
}

// Export an empty object so this file is treated as a module
export {};
