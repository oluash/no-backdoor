/**
 * No-Backdoor System Architecture — PostgreSQL Connection Pool
 *
 * Creates and exports a `pg.Pool` instance from config.
 * Provides:
 *   - Query helper that logs slow queries (>1s)
 *   - Transaction helper (BEGIN / COMMIT / ROLLBACK)
 *   - Graceful connection management
 */

import { Pool, type PoolClient, type QueryResult } from 'pg';
import { dbPoolConfig } from '@/config';
import { logger } from '@/middleware/logger';

// =============================================================================
// Pool Creation
// =============================================================================

export const pool = new Pool(dbPoolConfig);

// Log pool events for observability
pool.on('connect', () => {
  logger.debug('New client connected to PostgreSQL pool');
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', {
    error: err.message,
    stack: err.stack,
  });
  // Don't crash — let the pool handle reconnection
});

pool.on('acquire', () => {
  logger.debug('Client acquired from PostgreSQL pool');
});

pool.on('remove', () => {
  logger.debug('Client removed from PostgreSQL pool');
});

// =============================================================================
// Query Helper
// =============================================================================

const SLOW_QUERY_THRESHOLD_MS = 1000; // 1 second

/**
 * Execute a SQL query with timing and slow-query logging.
 *
 * @param text     SQL query string
 * @param params   Query parameters (escaped by pg)
 * @returns        QueryResult with rows and metadata
 *
 * @example
 *   const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
 *   const user = result.rows[0];
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();

  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Slow query detected', {
        query: text,
        params,
        durationMs: duration,
        rowCount: result.rowCount,
      });
    } else {
      logger.debug('Query executed', {
        query: text,
        durationMs: duration,
        rowCount: result.rowCount,
      });
    }

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error('Query failed', {
      query: text,
      params,
      durationMs: duration,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Execute a query and return the first row, or null if no rows.
 */
export async function queryOne<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Execute a query and return all rows.
 */
export async function queryMany<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

// =============================================================================
// Transaction Helper
// =============================================================================

/**
 * Execute a block of queries within a database transaction.
 *
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 * The provided client must be used for all queries within the callback.
 *
 * @param callback  Async function that receives a PoolClient
 * @returns         Whatever the callback returns
 *
 * @example
 *   const result = await transaction(async (client) => {
 *     await client.query('INSERT INTO users ...', [...]);
 *     await client.query('INSERT INTO logs ...', [...]);
 *     return { success: true };
 *   });
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  const start = Date.now();

  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');

    const result = await callback(client);

    await client.query('COMMIT');
    logger.debug('Transaction committed', {
      durationMs: Date.now() - start,
    });

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.warn('Transaction rolled back', {
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a callback with an advisory lock (useful for job queue workers).
 *
 * @param lockId   Unique integer lock ID
 * @param callback Function to execute while holding the lock
 */
export async function withAdvisoryLock<T>(
  lockId: number,
  callback: () => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    logger.debug('Advisory lock acquired', { lockId });

    return await callback();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
    logger.debug('Advisory lock released', { lockId });
    client.release();
  }
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Check database connectivity.
 * Returns true if a simple query succeeds.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

/**
 * Drain the pool and end all connections.
 * Call during graceful shutdown.
 */
export async function closePool(): Promise<void> {
  logger.info('Closing PostgreSQL connection pool...');
  await pool.end();
  logger.info('PostgreSQL connection pool closed');
}
