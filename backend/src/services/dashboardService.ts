/**
 * Dashboard Metrics Service — Business Logic Layer
 *
 * Provides aggregated metrics and analytics for the dashboard:
 *   - Summary counts (systems, evidence, tasks)
 *   - Trend data (daily verification activity over N days)
 *   - Status distribution (systems grouped by status for donut chart)
 *   - Recent activity feed (latest platform activities)
 */

import { query } from '../db/pool';
import {
  DashboardMetrics,
  TrendsData,
  TrendDataPoint,
  StatusDistributionData,
  StatusDistribution,
  ActivityItem,
  ActivityLogDbRecord,
} from '../types';

// ---------------------------------------------------------------------------
// 1. getSummary — Aggregated counts for dashboard cards
// ---------------------------------------------------------------------------

export async function getSummary(): Promise<DashboardMetrics> {
  // Use the dashboard metrics CTE query for efficiency
  const sql = `
    WITH
      system_counts AS (
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'verified') AS verified,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'threat') AS threat,
          COUNT(*) FILTER (WHERE status = 'unknown') AS unknown
        FROM systems
      ),
      task_counts AS (
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'processing') AS processing,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed
        FROM verification_tasks
      ),
      evidence_counts AS (
        SELECT COUNT(*) AS total FROM evidence_uploads
      ),
      today_tasks AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= DATE_TRUNC('day', NOW())) AS completed_today,
          COUNT(*) FILTER (WHERE status = 'failed' AND completed_at >= DATE_TRUNC('day', NOW())) AS failed_today
        FROM verification_tasks
      )
    SELECT
      sc.total AS total_systems,
      sc.verified AS verified_systems,
      sc.pending AS pending_verifications,
      sc.threat AS failed_verifications,
      ec.total AS total_evidence,
      tc.pending AS queue_tasks,
      COALESCE(tt.completed_today, 0) AS queue_completed_today,
      COALESCE(tt.failed_today, 0) AS queue_failed_today
    FROM system_counts sc
    CROSS JOIN task_counts tc
    CROSS JOIN evidence_counts ec
    CROSS JOIN today_tasks tt
  `;

  const result = await query<{
    total_systems: number;
    verified_systems: number;
    pending_verifications: number;
    failed_verifications: number;
    total_evidence: number;
    queue_tasks: number;
    queue_completed_today: number;
    queue_failed_today: number;
  }>(sql);

  const row = result.rows[0];

  return {
    totalSystems: row?.total_systems ?? 0,
    verifiedSystems: row?.verified_systems ?? 0,
    pendingVerifications: row?.pending_verifications ?? 0,
    failedVerifications: row?.failed_verifications ?? 0,
    totalEvidence: row?.total_evidence ?? 0,
    queueTasks: row?.queue_tasks ?? 0,
    queueCompletedToday: row?.queue_completed_today ?? 0,
    queueFailedToday: row?.queue_failed_today ?? 0,
  };
}

// ---------------------------------------------------------------------------
// 2. getTrends — Daily verification counts for area chart
// ---------------------------------------------------------------------------

export async function getTrends(days: number = 30): Promise<TrendsData> {
  const sql = `
    WITH date_range AS (
      SELECT generate_series(
        DATE_TRUNC('day', NOW() - INTERVAL '${days} days'),
        DATE_TRUNC('day', NOW()),
        INTERVAL '1 day'
      )::DATE AS day
    )
    SELECT
      dr.day AS date,
      COUNT(vh.id)::INT AS total,
      COUNT(vh.id) FILTER (WHERE vh.event_type IN ('scan_completed', 'review_completed'))::INT AS passed,
      COUNT(vh.id) FILTER (WHERE vh.event_type = 'threat_detected')::INT AS failed,
      COUNT(vh.id) FILTER (WHERE vh.event_type IN ('scan_initiated', 'review_started'))::INT AS pending
    FROM date_range dr
    LEFT JOIN verification_history vh ON DATE(vh.created_at) = dr.day
    GROUP BY dr.day
    ORDER BY dr.day
  `;

  const result = await query<{
    date: Date;
    total: number;
    passed: number;
    failed: number;
    pending: number;
  }>(sql);

  const trends: TrendDataPoint[] = result.rows.map((row) => ({
    date: row.date.toISOString().split('T')[0], // YYYY-MM-DD
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    pending: row.pending,
  }));

  const periodStart =
    trends.length > 0 ? trends[0].date : new Date().toISOString().split('T')[0];
  const periodEnd =
    trends.length > 0
      ? trends[trends.length - 1].date
      : new Date().toISOString().split('T')[0];

  return { trends, periodStart, periodEnd };
}

// ---------------------------------------------------------------------------
// 3. getStatusDistribution — Systems grouped by status for donut chart
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  verified: 'Verified',
  pending: 'Pending',
  threat: 'Failed',
  unknown: 'Not Started',
};

export async function getStatusDistribution(): Promise<StatusDistributionData> {
  const sql = `
    SELECT
      status,
      COUNT(*)::INT AS count
    FROM systems
    GROUP BY status
    ORDER BY count DESC
  `;

  const result = await query<{
    status: string;
    count: number;
  }>(sql);

  const total = result.rows.reduce((sum, row) => sum + row.count, 0);

  const distribution: StatusDistribution[] = result.rows.map((row) => ({
    status: row.status,
    label: STATUS_LABELS[row.status] || row.status,
    count: row.count,
    percentage:
      total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));

  return { distribution, total };
}

// ---------------------------------------------------------------------------
// 4. getRecentActivity — Latest platform activities
// ---------------------------------------------------------------------------

export interface RecentActivityResult {
  activities: ActivityItem[];
  total: number;
}

function mapDbActivityToApi(db: ActivityLogDbRecord): ActivityItem {
  const meta = db.metadata || {};
  return {
    id: db.id,
    type: db.entity_type,
    title: db.action_type,
    description: db.description || '',
    userId: db.actor_id,
    userName: db.actor_first_name
      ? `${db.actor_first_name} ${db.actor_last_name ?? ''}`.trim()
      : null,
    systemId: db.entity_id,
    systemName: meta.systemName ? String(meta.systemName) : null,
    taskId: meta.taskId ? String(meta.taskId) : null,
    metadata: db.metadata,
    createdAt: db.created_at.toISOString(),
  };
}

export async function getRecentActivity(
  page: number = 1,
  limit: number = 20,
  type?: string
): Promise<RecentActivityResult> {
  const offset = (page - 1) * limit;

  // Build WHERE for optional type filter
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];
  let paramIdx = 0;

  if (type) {
    paramIdx++;
    whereClauses.push(`al.entity_type = $${paramIdx}`);
    params.push(type);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count query
  const countSql = `
    SELECT COUNT(*)::INT AS total
    FROM activity_log al
    ${whereSql}
  `;
  const countResult = await query<{ total: number }>(countSql, [...params]);
  const total = countResult.rows[0]?.total ?? 0;

  // Data query — join users for actor name, with human-readable time_ago
  const dataSql = `
    SELECT
      al.id,
      al.actor_id,
      u.first_name AS actor_first_name,
      u.last_name AS actor_last_name,
      u.email AS actor_email,
      u.avatar_url AS actor_avatar,
      u.role AS actor_role,
      al.action_type,
      al.entity_type,
      al.entity_id,
      al.description,
      al.metadata,
      al.created_at
    FROM activity_log al
    LEFT JOIN users u ON al.actor_id = u.id
    ${whereSql}
    ORDER BY al.created_at DESC
    LIMIT $${++paramIdx} OFFSET $${++paramIdx}
  `;
  params.push(limit, offset);

  const result = await query<ActivityLogDbRecord>(dataSql, params);
  const activities = result.rows.map(mapDbActivityToApi);

  return { activities, total };
}
