/**
 * No-Backdoor System Architecture — Pagination Helper
 *
 * Provides:
 *   - paginateQuery(): wraps SQL with LIMIT/OFFSET and returns { data, meta }
 *   - generateMeta(): creates PaginationMeta from count + page + limit
 */

import { query, queryOne } from '@/db/pool';
import type { PaginationInfo, PaginationMeta } from '../api/types';

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// =============================================================================
// generateMeta — Build pagination metadata
// =============================================================================

/**
 * Generate pagination metadata from total count and query params.
 *
 * @param total  Total number of records (from COUNT query)
 * @param page   Current page number (1-based)
 * @param limit  Items per page
 * @returns      PaginationInfo with hasNext/hasPrev flags
 */
export function generatePaginationInfo(
  total: number,
  page: number,
  limit: number
): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    page: safePage,
    limit,
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

/**
 * Generate full PaginationMeta including the nested pagination object.
 */
export function generateMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  return {
    pagination: generatePaginationInfo(total, page, limit),
  };
}

// =============================================================================
// paginateQuery — Execute paginated SQL query
// =============================================================================

/**
 * Execute a paginated SQL query against PostgreSQL.
 *
 * Automatically appends LIMIT and OFFSET clauses, executes a COUNT
 * query for the total, and returns data + pagination metadata.
 *
 * @param baseSql       Base SELECT SQL (without LIMIT/OFFSET)
 * @param params        Parameters for the base SQL
 * @param page          Page number (1-based)
 * @param limit         Items per page
 * @param countSql      Optional custom COUNT query (default: wraps baseSql)
 * @param countParams   Optional parameters for the count query
 * @returns             PaginatedResult with data array and meta
 *
 * @example
 *   const result = await paginateQuery<{ id: string; name: string }>(
 *     'SELECT id, name FROM systems WHERE status = $1 ORDER BY created_at DESC',
 *     ['active'],
 *     1,
 *     20
 *   );
 *   // result.data = [...rows]
 *   // result.meta.pagination = { page: 1, limit: 20, total: 142, totalPages: 8, ... }
 */
export async function paginateQuery<T>(
  baseSql: string,
  params: unknown[],
  page: number,
  limit: number,
  countSql?: string,
  countParams?: unknown[]
): Promise<PaginatedResult<T>> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const offset = (safePage - 1) * safeLimit;

  // Build count query if not provided
  const finalCountSql =
    countSql || `SELECT COUNT(*) FROM (${baseSql}) AS count_query`;
  const finalCountParams = countParams || params;

  // Execute count and data queries in parallel
  const [countResult, dataResult] = await Promise.all([
    queryOne<{ count: string }>(finalCountSql, finalCountParams),
    query<T>(`${baseSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, safeLimit, offset]
    ),
  ]);

  const total = parseInt(countResult?.count ?? '0', 10);

  return {
    data: dataResult.rows,
    meta: generateMeta(total, safePage, safeLimit),
  };
}

/**
 * Build ORDER BY clause from sort parameters with allowlist validation.
 *
 * @param sortBy       Column name to sort by
 * @param sortOrder    'asc' or 'desc'
 * @param allowedCols  Array of allowed column names
 * @param defaultCol   Fallback column if sortBy is not allowed
 * @returns            Safe ORDER BY clause string (without the "ORDER BY" prefix)
 */
export function buildOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  allowedCols: string[],
  defaultCol: string = 'created_at'
): string {
  const safeSortBy = allowedCols.includes(sortBy || '') ? sortBy! : defaultCol;
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Map camelCase sort fields to snake_case DB columns if needed
  const columnMap: Record<string, string> = {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    lastVerifiedAt: 'last_verified_at',
    fileName: 'file_name',
  };

  const dbColumn = columnMap[safeSortBy] || safeSortBy;
  return `${dbColumn} ${safeOrder}`;
}

/**
 * Build a WHERE clause fragment for ILIKE search across multiple columns.
 *
 * @param search     Search term
 * @param columns    Array of column names to search
 * @param paramIndex Starting parameter index ($N)
 * @returns          Object with clause string and params array
 */
export function buildSearchWhere(
  search: string | undefined,
  columns: string[],
  paramIndex: number = 1
): { clause: string; params: string[]; nextIndex: number } {
  if (!search || search.trim() === '' || columns.length === 0) {
    return { clause: '', params: [], nextIndex: paramIndex };
  }

  const searchTerm = `%${search.trim()}%`;
  const conditions = columns.map((col) => `${col} ILIKE $${paramIndex}`);
  const params = new Array(columns.length).fill(searchTerm);

  return {
    clause: `(${conditions.join(' OR ')})`,
    params: [searchTerm],
    nextIndex: paramIndex + 1,
  };
}
