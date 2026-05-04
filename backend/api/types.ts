/**
 * No-Backdoor System Architecture — Shared TypeScript Types
 * Auto-generated from OpenAPI 3.0.3 specification
 *
 * This file contains all domain types used across the backend API.
 * Keep in sync with openapi.yaml and validation.ts.
 */

// =============================================================================
// Shared / Meta Types
// =============================================================================

/** API response wrapper metadata */
export interface Meta {
  timestamp: string;
  requestId: string;
}

/** Pagination metadata included in list responses */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Standard paginated API response metadata */
export interface PaginationMeta {
  pagination: PaginationInfo;
}

/** Standard API error structure */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: string;
    status: number;
  };
  meta: Meta;
}

/** Generic paginated API response wrapper */
export interface PaginationResponse<T> {
  success: true;
  data: T[];
  meta: Meta & PaginationMeta;
}

/** Generic single-item API response wrapper */
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta: Meta;
}

// =============================================================================
// Auth & Users
// =============================================================================

/** User role in the system */
export type UserRole = 'admin' | 'analyst' | 'viewer';

/** User domain model */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatar: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** JWT token payload */
export interface JWTPayload {
  /** User ID */
  sub: string;
  email: string;
  role: UserRole;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
}

/** Token pair returned on login/refresh */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Authentication response data */
export interface AuthData {
  user: User;
  token: TokenPair;
}

// =============================================================================
// Dashboard & Metrics
// =============================================================================

/** Summary metrics for the dashboard cards */
export interface DashboardMetrics {
  /** Total number of registered systems */
  totalSystems: number;
  /** Number of systems with passed verification */
  verifiedSystems: number;
  /** Number of systems awaiting verification */
  pendingVerifications: number;
  /** Number of systems with failed verification */
  failedVerifications: number;
  /** Total number of evidence files uploaded */
  totalEvidence: number;
  /** Total number of tasks currently in queue */
  queueTasks: number;
  /** Tasks completed today */
  queueCompletedToday: number;
  /** Tasks that failed today */
  queueFailedToday: number;
}

/** Single data point for the 30-day verification trends area chart */
export interface TrendDataPoint {
  date: string;
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

/** Verification trends response */
export interface TrendsData {
  trends: TrendDataPoint[];
  periodStart: string;
  periodEnd: string;
}

/** Single slice of the system status distribution donut chart */
export interface StatusDistribution {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

/** Status distribution response */
export interface StatusDistributionData {
  distribution: StatusDistribution[];
  total: number;
}

/** Activity types for the recent activity feed */
export type ActivityType = 'verification' | 'upload' | 'system' | 'queue' | 'user';

/** Single activity item in the recent activity feed */
export interface ActivityItem {
  id: string;
  type: ActivityType;
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
// Evidence Upload
// =============================================================================

/** Evidence upload processing status */
export type UploadStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Evidence file upload record */
export interface EvidenceUpload {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  /** File size in bytes */
  size: number;
  status: UploadStatus;
  systemId: string | null;
  systemName: string | null;
  description: string | null;
  tags: string[] | null;
  uploadedBy: string;
  uploaderName: string;
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Portfolio (Systems)
// =============================================================================

/** System type classification */
export type SystemType =
  | 'web_app'
  | 'mobile_app'
  | 'api'
  | 'database'
  | 'network'
  | 'desktop'
  | 'cloud_service'
  | 'embedded'
  | 'other';

/** System verification status */
export type SystemStatus = 'verified' | 'pending' | 'failed' | 'not_started' | 'in_progress';

/** System domain model */
export interface System {
  id: string;
  name: string;
  description: string;
  type: SystemType;
  status: SystemStatus;
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

/** System detail with nested verification history and evidence */
export interface SystemDetail extends System {
  verificationHistory: VerificationHistory[];
  evidenceFiles: EvidenceFile[];
}

/** Verification history entry for a system */
export interface VerificationHistory {
  id: string;
  systemId: string;
  systemName: string;
  status: 'passed' | 'failed' | 'cancelled' | 'in_progress';
  verifierId: string;
  verifierName: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Duration in seconds */
  duration: number | null;
  findingsCount: number;
  summary: string;
  checkTypes: string[];
}

/** Linked evidence file summary for a system */
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

// =============================================================================
// Verification Queue
// =============================================================================

/** Queue task execution status */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Queue task priority level */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/** Verification queue task */
export interface QueueTask {
  id: string;
  name: string;
  systemId: string;
  systemName: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  /** Completion percentage (0-100) */
  progress: number;
  checkTypes: string[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  /** Estimated duration in seconds */
  estimatedDuration: number | null;
}

/** Queue task with full detail including logs */
export interface QueueTaskDetail extends QueueTask {
  logs: TaskLog[];
  errorDetails: string | null;
}

/** Single log entry for a queue task */
export interface TaskLog {
  id: string;
  taskId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

/** Batch operation request payload */
export interface BatchOperationRequest {
  operation: 'restart' | 'cancel' | 'delete';
  taskIds: string[];
}

/** Batch operation result */
export interface BatchOperationResult {
  operation: 'restart' | 'cancel' | 'delete';
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ taskId: string; error: string }>;
}

/** Task counts by status for tab badges */
export interface QueueStatusCounts {
  total: number;
  byStatus: Array<{
    status: string;
    count: number;
    label: string;
  }>;
}

// =============================================================================
// Request Body Types (for service layer usage)
// =============================================================================

/** User registration request */
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

/** User login request */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Token refresh request */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/** Profile update request */
export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
}

/** Evidence upload metadata request (non-file fields) */
export interface EvidenceUploadRequest {
  systemId?: string;
  description?: string;
  tags?: string;
}

/** Create system request */
export interface CreateSystemRequest {
  name: string;
  description: string;
  type: SystemType;
  ownerId?: string;
  version?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Update system request */
export interface UpdateSystemRequest {
  name?: string;
  description?: string;
  type?: SystemType;
  ownerId?: string;
  version?: string;
  tags?: string[];
  status?: SystemStatus;
  metadata?: Record<string, unknown>;
}

/** Create verification task request */
export interface CreateTaskRequest {
  name: string;
  systemId: string;
  priority?: TaskPriority;
  checkTypes: string[];
  scheduledAt?: string | null;
  assigneeId?: string | null;
}

/** Update verification task request */
export interface UpdateTaskRequest {
  name?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigneeId?: string | null;
  scheduledAt?: string | null;
  checkTypes?: string[];
}

// =============================================================================
// Query Parameter Types
// =============================================================================

/** Pagination query parameters */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Activity feed query parameters */
export interface ActivityQueryParams extends PaginationParams {
  type?: ActivityType;
}

/** Evidence list query parameters */
export interface EvidenceQueryParams extends PaginationParams {
  status?: UploadStatus;
  systemId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'fileName' | 'size' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/** System list query parameters */
export interface SystemQueryParams extends PaginationParams {
  search?: string;
  status?: SystemStatus;
  type?: SystemType;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'lastVerifiedAt';
  sortOrder?: 'asc' | 'desc';
  ownerId?: string;
}

/** Queue task list query parameters */
export interface TaskQueryParams extends PaginationParams {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'scheduledAt';
  sortOrder?: 'asc' | 'desc';
  assigneeId?: string;
}

/** Task log query parameters */
export interface TaskLogQueryParams extends PaginationParams {
  level?: 'debug' | 'info' | 'warn' | 'error';
  since?: string;
}

/** Trend data query parameters */
export interface TrendQueryParams {
  days?: number;
}
