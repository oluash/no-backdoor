/**
 * Evidence Service — Business Logic Layer
 *
 * Handles all evidence upload operations:
 * - Upload with validation, SHA-256 checksum, and DB persistence
 * - Paginated listing with filters, search, and sorting
 * - Single-record retrieval with system info
 * - Deletion with physical file cleanup
 */

import { randomUUID } from 'crypto';
import { extname } from 'path';
import {
  EvidenceQueryParams,
  EvidenceUpload,
  EvidenceUploadInput,
  PaginationInfo,
  UploadStatus,
} from '../../api/types';
import { extensionToEvidenceType } from '../utils/upload';
import {
  computeChecksumSync,
  deleteFile,
  fileExists,
  getFilePath,
  isPathSafe,
} from '../utils/fileStorage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw database row shape from evidence_uploads table */
interface EvidenceRow {
  id: string;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string | null;
  status: 'pending' | 'processing' | 'verified' | 'failed';
  system_id: string | null;
  system_name: string | null;
  description: string | null;
  tags: string[] | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  checksum: string | null;
  file_path: string;
  created_at: Date;
  updated_at: Date;
}

/** Result of a paginated list operation */
export interface ListResult {
  data: EvidenceUpload[];
  meta: { pagination: PaginationInfo };
}

// ---------------------------------------------------------------------------
// DB Status <-> API Status Mapping
// ---------------------------------------------------------------------------

/** Convert DB evidence_status enum to API UploadStatus */
function dbStatusToApi(status: EvidenceRow['status']): UploadStatus {
  if (status === 'verified') return 'completed';
  return status as UploadStatus;
}

/** Convert API UploadStatus to DB evidence_status enum */
function apiStatusToDb(status: UploadStatus): EvidenceRow['status'] {
  if (status === 'completed') return 'verified';
  return status as EvidenceRow['status'];
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

/**
 * Map a raw database row to the public EvidenceUpload type.
 */
function mapRowToEvidence(row: EvidenceRow): EvidenceUpload {
  return {
    id: row.id,
    fileName: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type || 'application/octet-stream',
    size: Number(row.file_size),
    status: dbStatusToApi(row.status),
    systemId: row.system_id,
    systemName: row.system_name,
    description: row.description,
    tags: row.tags || [],
    uploadedBy: row.uploaded_by || 'unknown',
    uploaderName: row.uploader_name || 'Unknown User',
    downloadUrl: row.file_path ? `/api/evidence/${row.id}/download` : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Activity Logger (hook — replace with real logger in production)
// ---------------------------------------------------------------------------

/**
 * Log an activity event to the activity_log table.
 * Falls back to console if DB logging fails.
 */
async function logActivity(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { query } = require('../config/db');
    await query(
      `INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, action, entityType, entityId, description, JSON.stringify(metadata || {})],
    );
  } catch {
    // Fallback: console log so we never break the upload flow
    console.warn('[ActivityLog] Failed to persist activity:', { actorId, action, entityId, description });
  }
}

// ---------------------------------------------------------------------------
// SQL Fragments
// ---------------------------------------------------------------------------

const BASE_SELECT = `
  SELECT
    e.id,
    e.filename,
    e.original_name,
    e.file_size,
    e.mime_type,
    e.status,
    e.system_id,
    s.name AS system_name,
    e.description,
    e.tags,
    e.uploaded_by,
    u.first_name || ' ' || u.last_name AS uploader_name,
    e.checksum,
    e.file_path,
    e.created_at,
    e.updated_at
  FROM evidence_uploads e
  LEFT JOIN systems s ON e.system_id = s.id
  LEFT JOIN users u ON e.uploaded_by = u.id
`;

const COUNT_SELECT = `SELECT COUNT(*)::int AS total FROM evidence_uploads e`;

// ---------------------------------------------------------------------------
// 1. Upload Evidence
// ---------------------------------------------------------------------------

/**
 * Process and persist uploaded evidence files.
 *
 * @param userId   — ID of the uploading user
 * @param files    — Multer file objects from the request
 * @param metadata — Parsed form fields (systemId, description, tags)
 * @returns        — Array of created EvidenceUpload records
 */
export async function uploadEvidence(
  userId: string,
  files: Express.Multer.File[],
  metadata: EvidenceUploadInput,
): Promise<EvidenceUpload[]> {
  const { query } = require('../config/db');
  const results: EvidenceUpload[] = [];

  // Resolve system_id: required by DB schema
  const systemId = metadata.systemId;
  if (!systemId) {
    throw Object.assign(new Error('systemId is required'), { status: 400, code: 'MISSING_SYSTEM_ID' });
  }

  // Verify the system actually exists
  const systemCheck = await query('SELECT id FROM systems WHERE id = $1', [systemId]);
  if (systemCheck.rows.length === 0) {
    throw Object.assign(new Error(`System not found: ${systemId}`), { status: 404, code: 'SYSTEM_NOT_FOUND' });
  }

  for (const file of files) {
    const ext = extname(file.originalname).toLowerCase();
    const evidenceType = extensionToEvidenceType(ext);

    // Compute SHA-256 checksum from the file on disk
    const checksum = computeChecksumSync(file.path);

    // Insert into DB
    const insertResult = await query(
      `INSERT INTO evidence_uploads (
        system_id, uploaded_by, filename, original_name, file_path,
        file_size, mime_type, evidence_type, description, priority, tags, status, checksum
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, created_at, updated_at`,
      [
        systemId,
        userId,
        file.filename,
        file.originalname,
        file.path,
        file.size,
        file.mimetype,
        evidenceType,
        metadata.description || null,
        'medium', // default priority
        metadata.tags || [],
        'pending',
        checksum,
      ],
    );

    const inserted = insertResult.rows[0];

    // Fetch the complete joined record
    const detailResult = await query(
      `${BASE_SELECT} WHERE e.id = $1`,
      [inserted.id],
    );

    const record = mapRowToEvidence(detailResult.rows[0] as EvidenceRow);
    results.push(record);

    // Log activity
    await logActivity(
      userId,
      'upload',
      'evidence',
      inserted.id,
      `Evidence "${file.originalname}" (${(file.size / 1024).toFixed(1)} KB) uploaded`,
      {
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        checksum,
        systemId,
      },
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. List Evidence (Paginated, Filterable, Searchable)
// ---------------------------------------------------------------------------

/**
 * Build and execute a dynamic, paginated query for evidence uploads.
 *
 * @param queryParams — Parsed query parameters
 * @returns           — Paginated list result
 */
export async function listEvidence(
  queryParams: EvidenceQueryParams,
): Promise<ListResult> {
  const { query } = require('../config/db');

  const page = Math.max(1, queryParams.page || 1);
  const limit = Math.max(1, Math.min(100, queryParams.limit || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: (string | number | string[])[] = [];
  let paramIndex = 1;

  // Status filter
  if (queryParams.status) {
    conditions.push(`e.status = $${paramIndex++}`);
    values.push(apiStatusToDb(queryParams.status));
  }

  // System filter
  if (queryParams.systemId) {
    conditions.push(`e.system_id = $${paramIndex++}`);
    values.push(queryParams.systemId);
  }

  // Search filter (filename or description, ILIKE)
  if (queryParams.search) {
    conditions.push(`(
      e.filename ILIKE $${paramIndex} OR
      e.original_name ILIKE $${paramIndex} OR
      e.description ILIKE $${paramIndex}
    )`);
    values.push(`%${queryParams.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sorting
  const sortColumnMap: Record<string, string> = {
    createdAt: 'e.created_at',
    fileName: 'e.filename',
    size: 'e.file_size',
    status: 'e.status',
  };
  const sortBy = sortColumnMap[queryParams.sortBy || 'createdAt'] || 'e.created_at';
  const sortOrder = queryParams.sortOrder === 'asc' ? 'ASC' : 'DESC';

  // --- Count query ---
  const countResult = await query(
    `${COUNT_SELECT} ${whereClause}`,
    values,
  );
  const total = countResult.rows[0]?.total || 0;

  // --- Data query ---
  const dataValues = [...values, limit, offset];
  const dataResult = await query(
    `${BASE_SELECT} ${whereClause} ORDER BY ${sortBy} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    dataValues,
  );

  const uploads = (dataResult.rows as EvidenceRow[]).map(mapRowToEvidence);

  const totalPages = Math.ceil(total / limit);

  return {
    data: uploads,
    meta: {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Get Single Evidence by ID
// ---------------------------------------------------------------------------

/**
 * Retrieve a single evidence upload with system details.
 *
 * @param id — Evidence upload UUID
 * @returns  — EvidenceUpload record or null
 */
export async function getEvidenceById(id: string): Promise<EvidenceUpload | null> {
  const { query } = require('../config/db');

  const result = await query(
    `${BASE_SELECT} WHERE e.id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToEvidence(result.rows[0] as EvidenceRow);
}

// ---------------------------------------------------------------------------
// 4. Delete Evidence
// ---------------------------------------------------------------------------

/**
 * Delete an evidence upload and its physical file.
 *
 * @param id     — Evidence upload UUID
 * @param userId — ID of the user performing the deletion (for authz + logging)
 * @returns      — True if deleted, false if not found
 */
export async function deleteEvidence(
  id: string,
  userId: string,
): Promise<boolean> {
  const { query } = require('../config/db');

  // Fetch the record first (we need file_path for cleanup)
  const fetchResult = await query(
    `SELECT file_path, filename, original_name, system_id FROM evidence_uploads WHERE id = $1`,
    [id],
  );

  if (fetchResult.rows.length === 0) {
    return false;
  }

  const { file_path, filename, original_name, system_id } = fetchResult.rows[0];

  // Safety: ensure the path is inside the upload directory
  const safePath = getFilePath(filename);
  if (!isPathSafe(safePath)) {
    throw Object.assign(new Error('Invalid file path detected'), { status: 500, code: 'SECURITY_VIOLATION' });
  }

  // Delete from DB first
  await query(`DELETE FROM evidence_uploads WHERE id = $1`, [id]);

  // Delete physical file (best-effort; don't fail if already gone)
  try {
    if (fileExists(safePath)) {
      await deleteFile(filename);
    }
  } catch (err) {
    console.warn(`[EvidenceService] Failed to delete physical file: ${safePath}`, err);
  }

  // Log activity
  await logActivity(
    userId,
    'delete',
    'evidence',
    id,
    `Evidence "${original_name}" deleted`,
    { filename, systemId: system_id },
  );

  return true;
}

// ---------------------------------------------------------------------------
// 5. Verify Checksum (integrity check)
// ---------------------------------------------------------------------------

/**
 * Re-compute and verify the SHA-256 checksum of an uploaded file.
 *
 * @param id — Evidence upload UUID
 * @returns  — True if checksum matches, false otherwise
 */
export async function verifyChecksum(id: string): Promise<boolean> {
  const { query } = require('../config/db');

  const result = await query(
    `SELECT filename, checksum FROM evidence_uploads WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0 || !result.rows[0].checksum) {
    return false;
  }

  const { filename, checksum: expectedChecksum } = result.rows[0];
  const filePath = getFilePath(filename);

  if (!fileExists(filePath)) {
    return false;
  }

  const actualChecksum = computeChecksumSync(filePath);
  return actualChecksum === expectedChecksum;
}

// ---------------------------------------------------------------------------
// 6. Update Status (for async processing pipeline)
// ---------------------------------------------------------------------------

/**
 * Update the processing status of an evidence upload.
 *
 * @param id     — Evidence upload UUID
 * @param status — New status value
 */
export async function updateEvidenceStatus(
  id: string,
  status: UploadStatus,
): Promise<void> {
  const { query } = require('../config/db');

  const dbStatus = apiStatusToDb(status);
  const processedAt = status === 'completed' || status === 'failed' ? new Date() : null;

  if (processedAt) {
    await query(
      `UPDATE evidence_uploads SET status = $1, processed_at = $2, updated_at = NOW() WHERE id = $3`,
      [dbStatus, processedAt, id],
    );
  } else {
    await query(
      `UPDATE evidence_uploads SET status = $1, updated_at = NOW() WHERE id = $2`,
      [dbStatus, id],
    );
  }
}
