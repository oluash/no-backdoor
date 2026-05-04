/**
 * No-Backdoor System Architecture — Internal Service Types
 * Maps between DB schema enums and API types (types.ts)
 */

// =============================================================================
// DB Schema Enums (from schema.sql)
// =============================================================================

/** system_type enum from PostgreSQL schema */
export type DbSystemType =
  | 'api'
  | 'web'
  | 'mobile'
  | 'database'
  | 'infrastructure'
  | 'library'
  | 'other';

/** system_status enum from PostgreSQL schema */
export type DbSystemStatus =
  | 'verified'
  | 'pending'
  | 'threat'
  | 'unknown';

// =============================================================================
// API Types (matching types.ts / OpenAPI spec)
// =============================================================================

/** System type as exposed in the API */
export type ApiSystemType =
  | 'web_app'
  | 'mobile_app'
  | 'api'
  | 'database'
  | 'network'
  | 'desktop'
  | 'cloud_service'
  | 'embedded'
  | 'other';

/** System status as exposed in the API */
export type ApiSystemStatus =
  | 'verified'
  | 'pending'
  | 'failed'
  | 'not_started'
  | 'in_progress';

// =============================================================================
// Type Mappers: DB <-> API
// =============================================================================

/** Map DB system_type to API System.type */
export function dbTypeToApi(dbType: DbSystemType): ApiSystemType {
  const mapping: Record<DbSystemType, ApiSystemType> = {
    'api': 'api',
    'web': 'web_app',
    'mobile': 'mobile_app',
    'database': 'database',
    'infrastructure': 'network',
    'library': 'other',
    'other': 'other',
  };
  return mapping[dbType] || 'other';
}

/** Map API System.type to DB system_type */
export function apiTypeToDb(apiType: ApiSystemType): DbSystemType {
  const mapping: Record<ApiSystemType, DbSystemType> = {
    'api': 'api',
    'web_app': 'web',
    'mobile_app': 'mobile',
    'database': 'database',
    'network': 'infrastructure',
    'desktop': 'other',
    'cloud_service': 'infrastructure',
    'embedded': 'other',
    'other': 'other',
  };
  return mapping[apiType] || 'other';
}

/** Map DB system_status to API System.status */
export function dbStatusToApi(dbStatus: DbSystemStatus): ApiSystemStatus {
  const mapping: Record<DbSystemStatus, ApiSystemStatus> = {
    'verified': 'verified',
    'pending': 'pending',
    'threat': 'failed',
    'unknown': 'not_started',
  };
  return mapping[dbStatus] || 'not_started';
}

/** Map API System.status to DB system_status */
export function apiStatusToDb(apiStatus: ApiSystemStatus): DbSystemStatus {
  const mapping: Record<ApiSystemStatus, DbSystemStatus> = {
    'verified': 'verified',
    'pending': 'pending',
    'failed': 'threat',
    'not_started': 'unknown',
    'in_progress': 'pending',
  };
  return mapping[apiStatus] || 'unknown';
}

// =============================================================================
// Domain Models (Service layer)
// =============================================================================

/** System record as returned from DB queries */
export interface SystemDbRecord {
  id: string;
  name: string;
  version: string | null;
  description: string | null;
  type: DbSystemType;
  status: DbSystemStatus;
  verification_score: number;
  tags: string[] | null;
  created_by: string | null;
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields from v_system_overview
  created_by_first_name?: string | null;
  created_by_last_name?: string | null;
  assigned_first_name?: string | null;
  assigned_last_name?: string | null;
  // Aggregated counts
  evidence_count?: number;
  task_count?: number;
}

/** System as returned to API consumers */
export interface System {
  id: string;
  name: string;
  description: string;
  type: ApiSystemType;
  status: ApiSystemStatus;
  ownerId: string;
  ownerName: string;
  version: string;
  lastVerifiedAt: string | null;
  evidenceCount: number;
  tags: string[];
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Verification history DB record */
export interface VerificationHistoryDbRecord {
  id: string;
  system_id: string;
  event_type: string;
  description: string | null;
  performed_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  // Joined fields
  performed_by_first_name?: string | null;
  performed_by_last_name?: string | null;
  system_name?: string | null;
}

/** Verification history API response */
export interface VerificationHistory {
  id: string;
  systemId: string;
  systemName: string;
  status: 'passed' | 'failed' | 'cancelled' | 'in_progress';
  verifierId: string;
  verifierName: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  findingsCount: number;
  summary: string;
  checkTypes: string[];
}

/** Evidence file DB record */
export interface EvidenceFileDbRecord {
  id: string;
  system_id: string;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: Date;
  status: string;
}

/** Evidence file API response */
export interface EvidenceFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  description: string | null;
  uploadedBy: string;
  uploadedAt: string;
  downloadUrl: string | null;
}

/** Activity log DB record */
export interface ActivityLogDbRecord {
  id: string;
  actor_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  // Joined fields
  actor_first_name?: string | null;
  actor_last_name?: string | null;
  time_ago?: string | null;
}

/** Activity item API response */
export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  userId: string | null;
  userName: string | null;
  systemId: string | null;
  systemName: string | null;
  taskId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

// =============================================================================
// Request / Query Types
// =============================================================================

/** Create system request (API shape) */
export interface CreateSystemRequest {
  name: string;
  description: string;
  type: ApiSystemType;
  ownerId?: string;
  version?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Update system request (API shape) */
export interface UpdateSystemRequest {
  name?: string;
  description?: string;
  type?: ApiSystemType;
  ownerId?: string;
  version?: string;
  tags?: string[];
  status?: ApiSystemStatus;
  metadata?: Record<string, unknown>;
}

/** System list query params */
export interface SystemQueryParams {
  page: number;
  limit: number;
  search?: string;
  status?: ApiSystemStatus;
  type?: ApiSystemType;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  ownerId?: string;
}

/** Generic pagination params */
export interface PaginationParams {
  page: number;
  limit: number;
}

/** History query params */
export interface HistoryQueryParams {
  page: number;
  limit: number;
}

/** Trend query params */
export interface TrendQueryParams {
  days: number;
}

/** Activity query params */
export interface ActivityQueryParams {
  page: number;
  limit: number;
  type?: string;
}

// =============================================================================
// Dashboard Types
// =============================================================================

export interface DashboardMetrics {
  totalSystems: number;
  verifiedSystems: number;
  pendingVerifications: number;
  failedVerifications: number;
  totalEvidence: number;
  queueTasks: number;
  queueCompletedToday: number;
  queueFailedToday: number;
}

export interface TrendDataPoint {
  date: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

export interface TrendsData {
  trends: TrendDataPoint[];
  periodStart: string;
  periodEnd: string;
}

export interface StatusDistribution {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface StatusDistributionData {
  distribution: StatusDistribution[];
  total: number;
}
