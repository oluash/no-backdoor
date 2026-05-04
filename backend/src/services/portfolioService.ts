/**
 * Portfolio (Systems) Service — Business Logic Layer
 *
 * Handles all CRUD operations for systems, full-text search with PostgreSQL tsvector,
 * filtering, pagination, verification history, evidence retrieval, and verification
 * score recalculation.
 *
 * DB/Type Mapping:
 *   - DB `system_type`  <-> API `System.type`  via apiTypeToDb() / dbTypeToApi()
 *   - DB `system_status` <-> API `System.status` via apiStatusToDb() / dbStatusToApi()
 */

import { PoolClient } from 'pg';
import { query, transaction, pool } from '../db/pool';
import {
  SystemDbRecord,
  System,
  VerificationHistory,
  VerificationHistoryDbRecord,
  EvidenceFile,
  EvidenceFileDbRecord,
  CreateSystemRequest,
  UpdateSystemRequest,
  SystemQueryParams,
  HistoryQueryParams,
  PaginationParams,
  ApiSystemType,
  ApiSystemStatus,
  DbSystemType,
  DbSystemStatus,
  dbTypeToApi,
  dbStatusToApi,
  apiTypeToDb,
  apiStatusToDb,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely build a system name from first/last name parts */
function buildUserName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

/** Map a DB system record to the API System shape */
function mapDbSystemToApi(db: SystemDbRecord): System {
  return {
    id: db.id,
    name: db.name,
    description: db.description || '',
    type: dbTypeToApi(db.type),
    status: dbStatusToApi(db.status),
    ownerId: db.created_by || '',
    ownerName: buildUserName(db.created_by_first_name, db.created_by_last_name),
    version: db.version || '1.0.0',
    lastVerifiedAt: null, // populated separately when needed
    evidenceCount: db.evidence_count ?? 0,
    tags: db.tags ?? [],
    createdAt: db.created_at.toISOString(),
    updatedAt: db.updated_at.toISOString(),
  };
}

/** Map DB history record to API VerificationHistory shape */
function mapDbHistoryToApi(db: VerificationHistoryDbRecord): VerificationHistory {
  const meta = db.metadata || {};
  return {
    id: db.id,
    systemId: db.system_id,
    systemName: db.system_name || '',
    status: (meta.status as 'passed' | 'failed' | 'cancelled' | 'in_progress') || 'passed',
    verifierId: db.performed_by || '',
    verifierName: buildUserName(db.performed_by_first_name, db.performed_by_last_name),
    startedAt: meta.startedAt ? String(meta.startedAt) : null,
    completedAt: meta.completedAt ? String(meta.completedAt) : null,
    duration: meta.duration ? Number(meta.duration) : null,
    findingsCount: meta.findingsCount ? Number(meta.findingsCount) : 0,
    summary: db.description || '',
    checkTypes: meta.checkTypes ? (meta.checkTypes as string[]) : [],
  };
}

/** Map DB evidence record to API EvidenceFile shape */
function mapDbEvidenceToApi(db: EvidenceFileDbRecord): EvidenceFile {
  return {
    id: db.id,
    fileName: db.original_name || db.filename,
    mimeType: db.mime_type || 'application/octet-stream',
    size: Number(db.file_size) || 0,
    description: db.description || null,
    uploadedBy: db.uploaded_by || '',
    uploadedAt: db.created_at.toISOString(),
    downloadUrl: null, // populated with signed URL if needed
  };
}

/** Log an activity to the activity_log table */
async function logActivity(
  client: PoolClient | null,
  actorId: string | null,
  actionType: string,
  entityType: string,
  entityId: string | null,
  description: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const sql = `
    INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;
  const params = [actorId, actionType, entityType, entityId, description, JSON.stringify(metadata || {})];
  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}

/** Build safe ORDER BY clause from user-provided sort params */
function buildOrderBy(
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  hasSearch: boolean
): string {
  // When searching, always rank by search relevance first
  const direction = sortOrder.toUpperCase();

  const columnMap: Record<string, string> = {
    name: 's.name',
    createdAt: 's.created_at',
    updatedAt: 's.updated_at',
    status: 's.status',
    lastVerifiedAt: 'last_verified_at',
  };

  const col = columnMap[sortBy] || 's.created_at';

  if (hasSearch) {
    return `search_rank DESC NULLS LAST, ${col} ${direction}`;
  }
  return `${col} ${direction}`;
}

// ---------------------------------------------------------------------------
// 1. List Systems — Full-text search + filter + sort + paginate
// ---------------------------------------------------------------------------

export interface ListSystemsResult {
  systems: System[];
  total: number;
}

export async function listSystems(
  queryParams: SystemQueryParams
): Promise<ListSystemsResult> {
  const {
    page,
    limit,
    search,
    status,
    type,
    sortBy,
    sortOrder,
    ownerId,
  } = queryParams;

  const offset = (page - 1) * limit;
  const conditions: string[] = ['1=1'];
  const params: (string | number | string[])[] = [];
  let paramIdx = 0;

  // Full-text search on search_vector (name, description, tags)
  if (search && search.trim().length > 0) {
    paramIdx++;
    conditions.push(`s.search_vector @@ plainto_tsquery('english', $${paramIdx})`);
    params.push(search.trim());
  }

  // Status filter — map API status to DB status
  if (status) {
    paramIdx++;
    const dbStatus = apiStatusToDb(status as ApiSystemStatus);
    conditions.push(`s.status = $${paramIdx}::system_status`);
    params.push(dbStatus);
  }

  // Type filter — map API type to DB type
  if (type) {
    paramIdx++;
    const dbType = apiTypeToDb(type as ApiSystemType);
    conditions.push(`s.type = $${paramIdx}::system_type`);
    params.push(dbType);
  }

  // Owner filter (created_by)
  if (ownerId) {
    paramIdx++;
    conditions.push(`s.created_by = $${paramIdx}`);
    params.push(ownerId);
  }

  const whereClause = conditions.join(' AND ');
  const orderBy = buildOrderBy(sortBy, sortOrder, !!search);

  // Search rank column (used when searching)
  const searchRankCol = search
    ? `, ts_rank(s.search_vector, plainto_tsquery('english', $1)) AS search_rank`
    : '';

  // --- Count query ---
  const countSql = `
    SELECT COUNT(*)::INT AS total
    FROM systems s
    WHERE ${whereClause}
  `;
  const countResult = await query<{ total: number }>(countSql, [...params]);
  const total = countResult.rows[0]?.total ?? 0;

  // --- Main data query ---
  const dataSql = `
    SELECT
      s.id,
      s.name,
      s.version,
      s.description,
      s.type,
      s.status,
      s.verification_score,
      s.tags,
      s.created_by,
      s.assigned_to,
      s.created_at,
      s.updated_at,
      cb.first_name AS created_by_first_name,
      cb.last_name AS created_by_last_name,
      asg.first_name AS assigned_first_name,
      asg.last_name AS assigned_last_name,
      (SELECT COUNT(*) FROM evidence_uploads WHERE system_id = s.id) AS evidence_count,
      (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id) AS task_count,
      (SELECT MAX(created_at) FROM verification_history WHERE system_id = s.id) AS last_verified_at
      ${searchRankCol}
    FROM systems s
    LEFT JOIN users cb ON s.created_by = cb.id
    LEFT JOIN users asg ON s.assigned_to = asg.id
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${++paramIdx} OFFSET $${++paramIdx}
  `;
  params.push(limit, offset);

  const dataResult = await query<SystemDbRecord>(dataSql, params);

  const systems = dataResult.rows.map(mapDbSystemToApi);

  return { systems, total };
}

// ---------------------------------------------------------------------------
// 2. Create System
// ---------------------------------------------------------------------------

export async function createSystem(
  userId: string,
  data: CreateSystemRequest
): Promise<System> {
  return transaction(async (client) => {
    const dbType = apiTypeToDb(data.type);

    const sql = `
      INSERT INTO systems (
        name, description, type, status, version, tags, metadata, created_by, assigned_to
      ) VALUES (
        $1, $2, $3::system_type, 'unknown'::system_status, $4, $5, $6, $7, $8
      )
      RETURNING
        id, name, version, description, type, status, verification_score, tags,
        created_by, assigned_to, created_at, updated_at
    `;
    const params = [
      data.name,
      data.description,
      dbType,
      data.version || '1.0.0',
      data.tags || [],
      data.metadata || {},
      userId,
      data.ownerId || userId,
    ];

    const result = await client.query<SystemDbRecord>(sql, params);
    const db = result.rows[0];

    // Fetch creator name for response
    const userResult = await client.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    const creator = userResult.rows[0];
    db.created_by_first_name = creator?.first_name;
    db.created_by_last_name = creator?.last_name;

    // Log activity
    await client.query(
      `INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        'system_created',
        'system',
        db.id,
        `System "${db.name}" was created`,
        { systemName: db.name, systemType: db.type },
      ]
    );

    return mapDbSystemToApi(db);
  });
}

// ---------------------------------------------------------------------------
// 3. Get System by ID
// ---------------------------------------------------------------------------

export async function getSystemById(id: string): Promise<System | null> {
  const sql = `
    SELECT
      s.id,
      s.name,
      s.version,
      s.description,
      s.type,
      s.status,
      s.verification_score,
      s.tags,
      s.created_by,
      s.assigned_to,
      s.created_at,
      s.updated_at,
      cb.first_name AS created_by_first_name,
      cb.last_name AS created_by_last_name,
      asg.first_name AS assigned_first_name,
      asg.last_name AS assigned_last_name,
      (SELECT COUNT(*) FROM evidence_uploads WHERE system_id = s.id) AS evidence_count,
      (SELECT COUNT(*) FROM verification_tasks WHERE system_id = s.id) AS task_count,
      (SELECT MAX(created_at) FROM verification_history WHERE system_id = s.id) AS last_verified_at
    FROM systems s
    LEFT JOIN users cb ON s.created_by = cb.id
    LEFT JOIN users asg ON s.assigned_to = asg.id
    WHERE s.id = $1
  `;

  const result = await query<SystemDbRecord>(sql, [id]);
  if (result.rows.length === 0) return null;

  return mapDbSystemToApi(result.rows[0]);
}

// ---------------------------------------------------------------------------
// 4. Update System
// ---------------------------------------------------------------------------

export async function updateSystem(
  id: string,
  data: UpdateSystemRequest
): Promise<System | null> {
  return transaction(async (client) => {
    // Build dynamic SET clause
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    if (data.name !== undefined) {
      setClauses.push(`name = $${++paramIdx}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${++paramIdx}`);
      params.push(data.description);
    }
    if (data.type !== undefined) {
      setClauses.push(`type = $${++paramIdx}::system_type`);
      params.push(apiTypeToDb(data.type));
    }
    if (data.status !== undefined) {
      setClauses.push(`status = $${++paramIdx}::system_status`);
      params.push(apiStatusToDb(data.status));
    }
    if (data.version !== undefined) {
      setClauses.push(`version = $${++paramIdx}`);
      params.push(data.version);
    }
    if (data.tags !== undefined) {
      setClauses.push(`tags = $${++paramIdx}`);
      params.push(data.tags);
    }
    if (data.ownerId !== undefined) {
      setClauses.push(`assigned_to = $${++paramIdx}`);
      params.push(data.ownerId);
    }
    if (data.metadata !== undefined) {
      setClauses.push(`metadata = $${++paramIdx}::JSONB`);
      params.push(JSON.stringify(data.metadata));
    }

    if (setClauses.length === 0) {
      // Nothing to update — return current system
      return getSystemById(id);
    }

    params.push(id); // for WHERE clause
    const sql = `
      UPDATE systems
      SET ${setClauses.join(', ')}
      WHERE id = $${++paramIdx}
      RETURNING
        id, name, version, description, type, status, verification_score, tags,
        created_by, assigned_to, created_at, updated_at
    `;

    const result = await client.query<SystemDbRecord>(sql, params);
    if (result.rows.length === 0) return null;

    const db = result.rows[0];

    // Fetch user names
    const userResult = await client.query(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [db.created_by]
    );
    const creator = userResult.rows[0];
    db.created_by_first_name = creator?.first_name;
    db.created_by_last_name = creator?.last_name;

    // Log activity
    await client.query(
      `INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        null,
        'system_updated',
        'system',
        db.id,
        `System "${db.name}" was updated`,
        { fields: Object.keys(data) },
      ]
    );

    return mapDbSystemToApi(db);
  });
}

// ---------------------------------------------------------------------------
// 5. Delete System
// ---------------------------------------------------------------------------

export async function deleteSystem(id: string): Promise<boolean> {
  // CASCADE deletes will handle evidence_uploads, verification_history, verification_tasks
  const result = await query(
    `DELETE FROM systems WHERE id = $1 RETURNING id, name`,
    [id]
  );

  if (result.rows.length === 0) return false;

  // Log activity (after delete since CASCADE handles children)
  await query(
    `INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      null,
      'system_deleted',
      'system',
      id,
      `System "${result.rows[0].name}" was deleted`,
      {},
    ]
  );

  return true;
}

// ---------------------------------------------------------------------------
// 6. Get System History
// ---------------------------------------------------------------------------

export interface HistoryResult {
  history: VerificationHistory[];
  total: number;
}

export async function getSystemHistory(
  systemId: string,
  queryParams: HistoryQueryParams
): Promise<HistoryResult> {
  const { page, limit } = queryParams;
  const offset = (page - 1) * limit;

  // Count
  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::INT AS total FROM verification_history WHERE system_id = $1`,
    [systemId]
  );
  const total = countResult.rows[0]?.total ?? 0;

  // Data
  const sql = `
    SELECT
      vh.id,
      vh.system_id,
      s.name AS system_name,
      vh.event_type,
      vh.description,
      vh.performed_by,
      u.first_name AS performed_by_first_name,
      u.last_name AS performed_by_last_name,
      vh.metadata,
      vh.created_at
    FROM verification_history vh
    LEFT JOIN systems s ON vh.system_id = s.id
    LEFT JOIN users u ON vh.performed_by = u.id
    WHERE vh.system_id = $1
    ORDER BY vh.created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await query<VerificationHistoryDbRecord>(sql, [systemId, limit, offset]);
  const history = result.rows.map(mapDbHistoryToApi);

  return { history, total };
}

// ---------------------------------------------------------------------------
// 7. Get System Evidence
// ---------------------------------------------------------------------------

export interface EvidenceResult {
  evidence: EvidenceFile[];
  total: number;
}

export async function getSystemEvidence(
  systemId: string,
  queryParams: PaginationParams
): Promise<EvidenceResult> {
  const { page = 1, limit = 10 } = queryParams;
  const offset = (page - 1) * limit;

  // Count
  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::INT AS total FROM evidence_uploads WHERE system_id = $1`,
    [systemId]
  );
  const total = countResult.rows[0]?.total ?? 0;

  // Data
  const sql = `
    SELECT
      id,
      system_id,
      filename,
      original_name,
      file_size,
      mime_type,
      description,
      uploaded_by,
      created_at,
      status
    FROM evidence_uploads
    WHERE system_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await query<EvidenceFileDbRecord>(sql, [systemId, limit, offset]);
  const evidence = result.rows.map(mapDbEvidenceToApi);

  return { evidence, total };
}

// ---------------------------------------------------------------------------
// 8. Update Verification Score
// ---------------------------------------------------------------------------

export async function updateVerificationScore(
  systemId: string
): Promise<number> {
  // Recalculate verification_score based on:
  // 1. Evidence count (more evidence = higher base score)
  // 2. Evidence status (verified evidence boosts score)
  // 3. Task outcomes (completed tasks boost score, failed tasks reduce it)
  const sql = `
    WITH
      evidence_stats AS (
        SELECT
          COUNT(*) AS total_evidence,
          COUNT(*) FILTER (WHERE status = 'verified') AS verified_evidence,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_evidence
        FROM evidence_uploads
        WHERE system_id = $1
      ),
      task_stats AS (
        SELECT
          COUNT(*) AS total_tasks,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_tasks,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_tasks
        FROM verification_tasks
        WHERE system_id = $1
      )
    SELECT
      CASE
        WHEN es.total_evidence = 0 AND ts.total_tasks = 0 THEN 0
        ELSE LEAST(100, GREATEST(0, (
          -- Evidence base: up to 40 points
          (COALESCE(es.verified_evidence, 0) * 10) -
          (COALESCE(es.failed_evidence, 0) * 5) +
          -- Task outcomes: up to 60 points
          (COALESCE(ts.completed_tasks, 0) * 15) -
          (COALESCE(ts.failed_tasks, 0) * 10)
        )))
      END AS new_score
    FROM evidence_stats es
    CROSS JOIN task_stats ts
  `;

  const result = await query<{ new_score: number }>(sql, [systemId]);
  const newScore = result.rows[0]?.new_score ?? 0;

  // Update the system
  await query(
    `UPDATE systems SET verification_score = $1 WHERE id = $2`,
    [newScore, systemId]
  );

  return newScore;
}
