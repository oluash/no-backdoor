/**
 * JWT Utilities
 *
 * Token generation and verification for access and refresh tokens.
 * Uses HS256 algorithm with separate secrets for each token type.
 */

import jwt from 'jsonwebtoken';
import { JWTPayload } from '../../api/types';

// ------------------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-change-in-production';

/** Access token expiry: 15 minutes (in seconds) */
export const ACCESS_TOKEN_EXPIRY = 15 * 60;

/** Refresh token expiry: 7 days (in seconds) */
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60;

/** Access token expiry expressed as a string for jsonwebtoken */
const ACCESS_TOKEN_EXPIRY_STR = '15m';

/** Refresh token expiry expressed as a string for jsonwebtoken */
const REFRESH_TOKEN_EXPIRY_STR = '7d';

// ------------------------------------------------------------------------------
// Access Token
// ------------------------------------------------------------------------------

/**
 * Generate a JWT access token for a user.
 * @param userId - User UUID
 * @param role - User role
 * @returns Signed JWT access token
 */
export function generateAccessToken(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_EXPIRY_STR,
  });
}

/**
 * Verify a JWT access token.
 * @param token - Access token string
 * @returns Decoded JWT payload
 * @throws Error if token is invalid or expired
 */
export function verifyAccessToken(token: string): JWTPayload {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
  return decoded;
}

// ------------------------------------------------------------------------------
// Refresh Token
// ------------------------------------------------------------------------------

/**
 * Generate a JWT refresh token for a user.
 * @param userId - User UUID
 * @returns Signed JWT refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: REFRESH_TOKEN_EXPIRY_STR,
  });
}

/**
 * Verify a JWT refresh token.
 * @param token - Refresh token string
 * @returns Decoded JWT payload (with sub only)
 * @throws Error if token is invalid or expired
 */
export function verifyRefreshToken(token: string): Pick<JWTPayload, 'sub'> {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as Pick<
    JWTPayload,
    'sub'
  >;
  return decoded;
}
