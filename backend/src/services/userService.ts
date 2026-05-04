/**
 * User Service — Admin User CRUD Operations
 *
 * Provides administrative user management: paginated listing with search,
 * single user retrieval, role/status updates, and soft delete.
 * All operations are intended for admin-role users only (enforced at controller/middleware level).
 *
 * NOTE: Soft-delete requires a `deleted_at` column on the `users` table.
 *       Call `ensureSoftDeleteColumn()` at startup to add it automatically.
 */

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { User, UserRole, PaginationResponse, PaginationInfo } from '../../api/types';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logActivity } from '../utils/logger';

// ------------------------------------------------------------------------------
// Role Mapping: API <-> Database
// ------------------------------------------------------------------------------

/** Map API role to database role */
function toDbRole(role: UserRole): string {
  return role === 'analyst' ? 'reviewer' : role;
}

/** Map database role to API role */
function toApiRole(dbRole: string): UserRole {
  return dbRole === 'reviewer' ? 'analyst' : (dbRole as UserRole);
}

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/**
 * Convert raw database row to API User object.
 */
function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    role: toApiRole(String(row.role)),
    avatar: row.avatar_url ? String(row.avatar_url) : null,
    isActive: row.deleted_at === null || row.deleted_at === undefined,
    lastLoginAt: row.last_login ? new Date(String(row.last_login)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

/** Build pagination metadata */
function buildPaginationMeta(page: number, limit: number, total: number): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/** WHERE clause for active users only (not soft-deleted) */
function activeUserWhere(): string {
  return 'deleted_at IS NULL';
}

// ------------------------------------------------------------------------------
// Query Types
// ------------------------------------------------------------------------------

/** Query parameters for listing users */
export interface ListUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  sortBy?: 'createdAt' | 'email' | 'firstName' | 'lastName' | 'role';
  sortOrder?: 'asc' | 'desc';
}

/** Admin update fields for a user */
export interface AdminUpdateUserData {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  avatar?: string | null;
}

// ------------------------------------------------------------------------------
// Service
// ------------------------------------------------------------------------------

export class UserService {
  constructor(
    private readonly db: Pool,
    private readonly redis: Redis
  ) {}

  /**
   * Ensure the `deleted_at` column exists on the `users` table.
   * Call this once during application startup.
   */
  async ensureSoftDeleteColumn(): Promise<void> {
    await this.db.query(`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      EXCEPTION WHEN duplicate_column THEN
        NULL;
      END $$;
    `);
  }

  /**
   * List users with pagination, search, and filtering.
   * @param query - Query parameters
   * @returns Paginated list of users and pagination metadata
   */
  async listUsers(query: ListUsersQuery): Promise<PaginationResponse<User>> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const offset = (page - 1) * limit;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Map API sort field to DB column
    const sortColumnMap: Record<string, string> = {
      createdAt: 'created_at',
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      role: 'role',
    };
    const sortColumn = sortColumnMap[sortBy] || 'created_at';

    // Build WHERE conditions
    const conditions: string[] = [activeUserWhere()];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (query.search) {
      conditions.push(
        `(email ILIKE $${paramIdx} OR first_name ILIKE $${paramIdx} OR last_name ILIKE $${paramIdx})`
      );
      values.push(`%${query.search}%`);
      paramIdx++;
    }

    if (query.role) {
      conditions.push(`role = $${paramIdx}`);
      values.push(toDbRole(query.role));
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM users WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch paginated rows
    const queryValues = [...values, limit, offset];
    const result = await this.db.query(
      `SELECT id, email, first_name, last_name, role,
              avatar_url, created_at, updated_at, last_login, deleted_at
       FROM users
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      queryValues
    );

    const users = result.rows.map(mapUserRow);
    const pagination = buildPaginationMeta(page, limit, total);

    return {
      success: true,
      data: users,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: '', // Filled in by middleware
        pagination,
      },
    };
  }

  /**
   * Get a single user by ID.
   * @param id - User UUID
   * @returns User object
   * @throws NotFoundError if user not found or soft-deleted
   */
  async getUserById(id: string): Promise<User> {
    const result = await this.db.query(
      `SELECT id, email, first_name, last_name, role, avatar_url,
              created_at, updated_at, last_login, deleted_at
       FROM users WHERE id = $1 AND ${activeUserWhere()}`,
      [id]
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundError('User not found');
    }

    return mapUserRow(result.rows[0]);
  }

  /**
   * Admin update: modify a user's profile or role.
   * @param id - User UUID
   * @param data - Fields to update
   * @returns Updated User object
   * @throws NotFoundError if user not found
   * @throws BadRequestError if no fields provided
   */
  async updateUser(id: string, data: AdminUpdateUserData): Promise<User> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (data.firstName !== undefined) {
      updates.push(`first_name = $${paramIdx++}`);
      values.push(data.firstName);
    }
    if (data.lastName !== undefined) {
      updates.push(`last_name = $${paramIdx++}`);
      values.push(data.lastName);
    }
    if (data.role !== undefined) {
      updates.push(`role = $${paramIdx++}`);
      values.push(toDbRole(data.role));
    }
    if (data.avatar !== undefined) {
      updates.push(`avatar_url = $${paramIdx++}`);
      values.push(data.avatar);
    }

    if (updates.length === 0) {
      throw new BadRequestError('At least one field must be provided for update');
    }

    values.push(id);

    const result = await this.db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIdx} AND ${activeUserWhere()}
       RETURNING id, email, first_name, last_name, role, avatar_url,
                 created_at, updated_at, last_login, deleted_at`,
      values
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundError('User not found');
    }

    const user = mapUserRow(result.rows[0]);

    // Log activity
    await logActivity({
      actorId: id,
      action: 'user_updated',
      entityType: 'user',
      entityId: id,
      description: `User ${user.email} updated by admin`,
      metadata: { updatedFields: Object.keys(data) },
    });

    return user;
  }

  /**
   * Soft-delete a user by setting deleted_at.
   * Also purges any active Redis sessions.
   * @param id - User UUID
   * @throws NotFoundError if user not found
   */
  async deleteUser(id: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE users SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND ${activeUserWhere()}`,
      [id]
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundError('User not found');
    }

    // Purge Redis sessions for the deleted user
    await this.redis.del(`refresh:${id}`);

    // Log activity
    await logActivity({
      actorId: id,
      action: 'user_deleted',
      entityType: 'user',
      entityId: id,
      description: `User soft-deleted by admin`,
    });
  }
}
