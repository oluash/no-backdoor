/**
 * Auth Service — Core Authentication Business Logic
 *
 * Handles user registration, login, token refresh, logout, and profile management.
 * Uses PostgreSQL for user storage, Redis for refresh token rotation, and JWT for sessions.
 */

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

import {
  User,
  UserRole,
  AuthData,
  TokenPair,
  RegisterRequest,
  LoginRequest,
  UpdateProfileRequest,
} from '../../api/types';

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from '../utils/jwt';
import { hashPassword, comparePassword } from '../utils/password';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { logLogin, logLogout, logRegister, logTokenRefresh } from '../utils/logger';

// ------------------------------------------------------------------------------
// Role Mapping: API <-> Database
// ------------------------------------------------------------------------------

/** Map API role to database role */
function toDbRole(role: UserRole): string {
  // DB enum: 'admin', 'reviewer', 'viewer'
  // API type: 'admin', 'analyst', 'viewer'
  return role === 'analyst' ? 'reviewer' : role;
}

/** Map database role to API role */
function toApiRole(dbRole: string): UserRole {
  return dbRole === 'reviewer' ? 'analyst' : (dbRole as UserRole);
}

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------

/** Hash a refresh token for secure Redis storage */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Build Redis key for a user's refresh token */
function refreshKey(userId: string): string {
  return `refresh:${userId}`;
}

/**
 * Convert raw database row to API User object.
 * Maps snake_case DB columns to camelCase API fields.
 */
function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    role: toApiRole(String(row.role)),
    avatar: row.avatar_url ? String(row.avatar_url) : null,
    isActive: true,
    lastLoginAt: row.last_login ? new Date(String(row.last_login)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

// ------------------------------------------------------------------------------
// Token Generation
// ------------------------------------------------------------------------------

/**
 * Generate a new access + refresh token pair and store the refresh token in Redis.
 */
async function createTokenPair(
  redis: Redis,
  userId: string,
  role: string
): Promise<TokenPair> {
  const accessToken = generateAccessToken(userId, role);
  const refreshToken = generateRefreshToken(userId);
  const refreshTokenHash = hashRefreshToken(refreshToken);

  // Store refresh token hash in Redis with expiry matching the token
  await redis.setex(refreshKey(userId), REFRESH_TOKEN_EXPIRY, refreshTokenHash);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

// ------------------------------------------------------------------------------
// Service
// ------------------------------------------------------------------------------

export class AuthService {
  constructor(
    private readonly db: Pool,
    private readonly redis: Redis
  ) {}

  // ============================================================================
  // Register
  // ============================================================================

  /**
   * Register a new user account.
   * @param data - Registration request data
   * @returns AuthData with user and token pair
   * @throws ConflictError if email already exists
   */
  async register(data: RegisterRequest): Promise<AuthData> {
    // Check for existing email
    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new ConflictError(
        'Email already registered',
        'A user with this email address already exists.'
      );
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Generate UUID
    const userId = randomUUID();

    // Map role for DB storage
    const dbRole = toDbRole(data.role || 'analyst');

    // Insert user
    const result = await this.db.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [userId, data.email, passwordHash, data.firstName, data.lastName, dbRole]
    );

    const row = result.rows[0];
    const user = mapUserRow(row);

    // Generate tokens
    const token = await createTokenPair(this.redis, user.id, user.role);

    // Log activity
    await logRegister(user.id, user.email);

    return { user, token };
  }

  // ============================================================================
  // Login
  // ============================================================================

  /**
   * Authenticate a user with email and password.
   * @param data - Login request data
   * @returns AuthData with user and token pair
   * @throws UnauthorizedError if credentials are invalid
   */
  async login(data: LoginRequest): Promise<AuthData> {
    // Find user by email
    const result = await this.db.query('SELECT * FROM users WHERE email = $1', [data.email]);
    if (!result.rowCount || result.rowCount === 0) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const row = result.rows[0];

    // Compare password
    const isMatch = await comparePassword(data.password, String(row.password_hash));
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const user = mapUserRow(row);

    // Update last_login timestamp
    await this.db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    user.lastLoginAt = new Date().toISOString();

    // Generate tokens
    const token = await createTokenPair(this.redis, user.id, user.role);

    // Log activity
    await logLogin(user.id, user.email);

    return { user, token };
  }

  // ============================================================================
  // Refresh Token
  // ============================================================================

  /**
   * Rotate refresh token: verify old token, issue new pair, invalidate old one.
   * @param refreshToken - The current refresh token
   * @returns New TokenPair
   * @throws UnauthorizedError if token is invalid or revoked
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    // Verify the refresh token signature
    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Refresh token expired or invalid');
    }

    const userId = payload.sub;

    // Check against Redis stored hash
    const storedHash = await this.redis.get(refreshKey(userId));
    if (!storedHash) {
      throw new UnauthorizedError('Refresh token revoked or expired');
    }

    const providedHash = hashRefreshToken(refreshToken);
    if (storedHash !== providedHash) {
      // Token mismatch — potential reuse attack. Delete the stored token immediately.
      await this.redis.del(refreshKey(userId));
      throw new UnauthorizedError('Refresh token invalid — possible token reuse detected');
    }

    // Fetch user to get current role
    const result = await this.db.query(
      'SELECT id, role FROM users WHERE id = $1',
      [userId]
    );
    if (!result.rowCount || result.rowCount === 0) {
      throw new UnauthorizedError('User no longer exists');
    }

    const dbRole = String(result.rows[0].role);
    const apiRole = toApiRole(dbRole);

    // Delete old refresh token before issuing new one (rotation)
    await this.redis.del(refreshKey(userId));

    // Generate new token pair
    const newTokens = await createTokenPair(this.redis, userId, apiRole);

    // Log activity
    await logTokenRefresh(userId);

    return newTokens;
  }

  // ============================================================================
  // Logout
  // ============================================================================

  /**
   * Log out a user by deleting their refresh token from Redis.
   * @param userId - User UUID
   */
  async logout(userId: string): Promise<void> {
    await this.redis.del(refreshKey(userId));
    await logLogout(userId);
  }

  // ============================================================================
  // Get Me
  // ============================================================================

  /**
   * Get the current authenticated user's profile.
   * @param userId - User UUID
   * @returns User object (without password)
   * @throws NotFoundError if user not found
   */
  async getMe(userId: string): Promise<User> {
    const result = await this.db.query(
      `SELECT id, email, first_name, last_name, role, avatar_url,
              created_at, updated_at, last_login
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundError('User not found');
    }

    return mapUserRow(result.rows[0]);
  }

  // ============================================================================
  // Update Me
  // ============================================================================

  /**
   * Update the current user's profile.
   * @param userId - User UUID
   * @param data - Profile update fields
   * @returns Updated User object
   * @throws NotFoundError if user not found
   */
  async updateMe(userId: string, data: UpdateProfileRequest): Promise<User> {
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
    if (data.avatar !== undefined) {
      updates.push(`avatar_url = $${paramIdx++}`);
      values.push(data.avatar);
    }

    if (updates.length === 0) {
      // Nothing to update, return current user
      return this.getMe(userId);
    }

    values.push(userId);

    const result = await this.db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIdx}
       RETURNING id, email, first_name, last_name, role, avatar_url,
                 created_at, updated_at, last_login`,
      values
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundError('User not found');
    }

    return mapUserRow(result.rows[0]);
  }
}
