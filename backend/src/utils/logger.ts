/**
 * Activity Logger
 *
 * Logs user activity events to the PostgreSQL activity_log table.
 * Used by authService for login/logout/registration tracking.
 */

import { Pool } from 'pg';

let dbPool: Pool | null = null;

/**
 * Set the database pool for activity logging.
 * Must be called once during application startup.
 */
export function setLogDbPool(pool: Pool): void {
  dbPool = pool;
}

/** Activity action types */
export type ActionType = 'login' | 'logout' | 'register' | 'refresh_token' | 'update_profile' | 'password_change' | 'user_created' | 'user_updated' | 'user_deleted';

/** Entity types for activity logging */
export type EntityType = 'user' | 'system' | 'evidence' | 'task' | 'auth';

/**
 * Log an activity event to the database.
 * @param params - Activity log parameters
 */
export async function logActivity(params: {
  actorId?: string;
  action: ActionType;
  entityType: EntityType;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!dbPool) {
    // During development/testing, silently skip if pool not configured
    console.warn('[ActivityLogger] DB pool not configured, skipping activity log');
    return;
  }

  try {
    await dbPool.query(
      `INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.actorId || null,
        params.action,
        params.entityType,
        params.entityId || null,
        params.description,
        params.metadata ? JSON.stringify(params.metadata) : '{}',
      ]
    );
  } catch (err) {
    // Activity logging should never break the main flow
    console.error('[ActivityLogger] Failed to log activity:', err);
  }
}

/**
 * Convenience: log a login event.
 */
export async function logLogin(userId: string, email: string): Promise<void> {
  await logActivity({
    actorId: userId,
    action: 'login',
    entityType: 'auth',
    entityId: userId,
    description: `User ${email} logged in`,
    metadata: { email },
  });
}

/**
 * Convenience: log a logout event.
 */
export async function logLogout(userId: string): Promise<void> {
  await logActivity({
    actorId: userId,
    action: 'logout',
    entityType: 'auth',
    entityId: userId,
    description: `User logged out`,
  });
}

/**
 * Convenience: log a registration event.
 */
export async function logRegister(userId: string, email: string): Promise<void> {
  await logActivity({
    actorId: userId,
    action: 'register',
    entityType: 'auth',
    entityId: userId,
    description: `New user registered: ${email}`,
    metadata: { email },
  });
}

/**
 * Convenience: log a token refresh event.
 */
export async function logTokenRefresh(userId: string): Promise<void> {
  await logActivity({
    actorId: userId,
    action: 'refresh_token',
    entityType: 'auth',
    entityId: userId,
    description: `Token refreshed for user`,
  });
}
