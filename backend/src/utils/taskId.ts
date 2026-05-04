/**
 * Task ID Generator
 *
 * Generates unique verification task IDs in the format VT-{4 random digits}.
 * Ensures uniqueness by checking against the database before returning.
 */

import type { Pool } from 'pg';

const MAX_ATTEMPTS = 10;

/**
 * Generate a random 4-digit number as a zero-padded string.
 */
function randomDigits(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Generate a candidate task ID: VT-{4 random digits}.
 */
export function generateTaskIdCandidate(): string {
  return `VT-${randomDigits()}`;
}

/**
 * Generate a unique task ID, verified against the database.
 * Retries up to MAX_ATTEMPTS times if collisions occur.
 *
 * @param pool - PostgreSQL connection pool
 * @returns A unique VT-XXXX task ID string
 * @throws Error if unable to generate a unique ID after max attempts
 */
export async function generateTaskId(pool: Pool): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const candidate = generateTaskIdCandidate();

    const result = await pool.query(
      'SELECT 1 FROM verification_tasks WHERE task_id = $1 LIMIT 1',
      [candidate]
    );

    if (result.rowCount === 0) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to generate a unique task ID after ${MAX_ATTEMPTS} attempts`
  );
}
