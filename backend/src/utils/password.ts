/**
 * Password Utilities
 *
 * Bcrypt-based password hashing and comparison with 12 rounds.
 * Used by authService for secure password management.
 */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password using bcrypt.
 * @param plain - Plain-text password
 * @returns Hashed password string
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 * @param plain - Plain-text password
 * @param hash - Bcrypt hash from database
 * @returns True if password matches
 */
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
