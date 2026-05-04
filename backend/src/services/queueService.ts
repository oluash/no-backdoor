/**
 * Queue Service — Verification Queue Business Logic
 *
 * Core service layer for managing verification tasks in the No-Backdoor System.
 * Handles CRUD, batch operations, logging, Redis queue publishing, and
 * WebSocket event emission for real-time progress updates.
 */

import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { generateTaskId } from '../utils/taskId';
import type {
  QueueTask,
  QueueTaskDetail,
  TaskLog,
  TaskStatus,
  TaskPriority,
  CreateTaskRequest,
  UpdateTaskRequest,
  BatchOperationRequest,
  BatchOperationResult,
  TaskQueryParams,
  TaskLogQueryParams,
  QueueStatusCounts,
  PaginationResponse,
  ApiResponse,
} from '../../api/types';

// ---------------------------------------------------------------------------
// DB → API type helpers
// ---------------------------------------------------------------------------

/** Map DB status values to API TaskStatus */
function mapDbStatus(dbStatus: string): TaskStatus {
  // DB uses 'processing' but API uses 'running'
  if (dbStatus === 'processing') return 'running';
  return dbStatus as TaskStatus;
}

/** Map API TaskStatus back to DB status values */
function mapApiStatus(apiStatus: TaskStatus): string {
  // API uses 'running' but DB stores 'processing'
  if (apiStatus === 'running') return 'processing';
  return apiStatus;
}

/** Map DB log_level to API log level */
function mapDbLogLevel(dbLevel: string): TaskLog['level'] {
  // DB uses 'success' for some log levels, API doesn't have it
  if (dbLevel === 'success') return 'info';
  return dbLevel as TaskLog['level'];
}

/** Map DB priority to API TaskPriority */
function mapDbPriority(dbPriority: string): TaskPriority {
  return dbPriority as TaskPriority;
}

/** Map DB task_type (single) to API checkTypes (array) */
function mapDbCheckTypes(taskType: string): string[] {
  return [taskType];
}

/** Map API checkTypes (array) to DB task_type (single) */
function mapApiCheckTypes(checkTypes: string[]): string {
  return checkTypes[0] ?? 'code_scan';
}

// ---------------------------------------------------------------------------
// Row transformers
// ---------------------------------------------------------------------------

interface TaskDbRow {
  id: string;
  task_id: string;
  system_id: string;
  system_name: string | null;
  task_type: string;
  priority: string;
  status: string;
  progress: number;
  assigned_to: string | null;
  assigned_first_name: string | null;
  assigned_last_name: string | null;
  created_by: string;
  created_by_first_name: string | null;
  created_by_last_name: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  estimated_completion: Date | null;
  result_summary: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  log_count?: string | number;
}

function transformTaskRow(row: TaskDbRow): QueueTask {
  return {
    id: row.task_id,
    name: row.result_summary ?? `Verification Task ${row.task_id}`,
    systemId: row.system_id,
    systemName: row.system_name ?? 'Unknown System',
    status: mapDbStatus(row.status),
    priority: mapDbPriority(row.priority),
    assigneeId: row.assigned_to,
    assigneeName:
      row.assigned_first_name && row.assigned_last_name
        ? `${row.assigned_first_name} ${row.assigned_last_name}`
        : row.assigned_to
          ? 'Unknown User'
          : null,
    progress: row.progress,
    checkTypes: mapDbCheckTypes(row.task_type),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    scheduledAt: row.estimated_completion?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    estimatedDuration: row.estimated_completion
      ? Math.round(
          (row.estimated_completion.getTime() - row.created_at.getTime()) /
            1000
        )
      : null,
  };
}

interface LogDbRow {
  id: string;
  task_id: string;
  level: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function transformLogRow(row: LogDbRow): TaskLog {
  return {
    id: row.id,
    taskId: row.task_id,
    level: mapDbLogLevel(row.level),
    message: row.message,
    timestamp: row.created_at.toISOString(),
    metadata: row.metadata ?? null,
  };
}

// ---------------------------------------------------------------------------
// Activity logger helper
// ---------------------------------------------------------------------------

async function logActivity(
  client: PoolClient | Pool,
  actionType: string,
  entityType: string,
  entityId: string | null,
  description: string,
  actorId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actorId,
      actionType,
      entityType,
      entityId,
      description,
      metadata ? JSON.stringify(metadata) : '{}',
    ]
  );
}

// ---------------------------------------------------------------------------
// Queue Service
// ---------------------------------------------------------------------------

export class QueueService {
  private pool: Pool;
  private redis: Redis;
  private wsEmitter: EventEmitter;

  constructor(pool: Pool, redis: Redis, wsEmitter: EventEmitter) {
    this.pool = pool;
    this.redis = redis;
    this.wsEmitter = wsEmitter;
  }

  // ── Create Task ─────────────────────────────────────────────────────────

  async createTask(
    userId: string,
    data: CreateTaskRequest
  ): Promise<ApiResponse<QueueTask>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Generate unique task ID
      const taskId = await generateTaskId(this.pool);

      // Validate system exists
      const systemResult = await client.query(
        'SELECT id, name FROM systems WHERE id = $1',
        [data.systemId]
      );
      if (systemResult.rowCount === 0) {
        throw new Error(`System with id '${data.systemId}' not found`);
      }
      const systemName = systemResult.rows[0].name as string;
      const systemUuid = systemResult.rows[0].id as string;

      // Map checkTypes to task_type
      const taskType = mapApiCheckTypes(data.checkTypes);
      const priority = data.priority ?? 'normal';
      const scheduledAt = data.scheduledAt ?? null;
      const assigneeId = data.assigneeId ?? null;

      // Insert task
      const insertResult = await client.query<TaskDbRow>(
        `INSERT INTO verification_tasks
         (task_id, system_id, task_type, priority, status, progress, assigned_to, created_by, estimated_completion, result_summary)
         VALUES ($1, $2, $3, $4, 'pending', 0, $5, $6, $7, $8)
         RETURNING *,
           (SELECT name FROM systems WHERE id = $2) AS system_name,
           (SELECT first_name FROM users WHERE id = $5) AS assigned_first_name,
           (SELECT last_name FROM users WHERE id = $5) AS assigned_last_name,
           (SELECT first_name FROM users WHERE id = $6) AS created_by_first_name,
           (SELECT last_name FROM users WHERE id = $6) AS created_by_last_name`,
        [
          taskId,
          systemUuid,
          taskType,
          priority,
          assigneeId,
          userId,
          scheduledAt ? new Date(scheduledAt) : null,
          data.name,
        ]
      );

      const row = insertResult.rows[0];

      // Log activity
      await logActivity(
        client,
        'task_created',
        'queue',
        row.id,
        `Created verification task ${taskId} for system "${systemName}"`,
        userId,
        { taskId, systemId: data.systemId, priority, checkTypes: data.checkTypes }
      );

      // Insert initial log entry
      await client.query(
        `INSERT INTO task_logs (task_id, level, message, metadata)
         VALUES ($1, 'info', $2, $3)`,
        [
          row.id,
          `Task ${taskId} created for system "${systemName}"`,
          JSON.stringify({
            priority,
            checkTypes: data.checkTypes,
            assigneeId,
            scheduledAt,
          }),
        ]
      );

      await client.query('COMMIT');

      // Publish to Redis queue for processing
      await this.redis.lpush(
        'verification:queue',
        JSON.stringify({ taskId, id: row.id, priority })
      );

      const task = transformTaskRow(row);

      // Emit WebSocket event
      this.wsEmitter.emit('task:created', { taskId: task.id, task });

      return {
        success: true,
        data: task,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `req_${Date.now()}`,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ── List Tasks ──────────────────────────────────────────────────────────

  async listTasks(
    query: TaskQueryParams
  ): Promise<PaginationResponse<QueueTask>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (query.status) {
      conditions.push(`vt.status = $${paramIdx}`);
      params.push(mapApiStatus(query.status));
      paramIdx++;
    }

    if (query.priority) {
      conditions.push(`vt.priority = $${paramIdx}`);
      params.push(query.priority);
      paramIdx++;
    }

    if (query.assigneeId) {
      conditions.push(`vt.assigned_to = $${paramIdx}`);
      params.push(query.assigneeId);
      paramIdx++;
    }

    if (query.search) {
      conditions.push(
        `(vt.task_id ILIKE $${paramIdx} OR s.name ILIKE $${paramIdx} OR vt.result_summary ILIKE $${paramIdx})`
      );
      params.push(`%${query.search}%`);
      paramIdx++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build sort clause
    const sortColumnMap: Record<string, string> = {
      createdAt: 'vt.created_at',
      updatedAt: 'vt.updated_at',
      priority: 'vt.priority',
      status: 'vt.status',
      scheduledAt: 'vt.estimated_completion',
    };
    const sortColumn = sortColumnMap[query.sortBy ?? 'createdAt'] ?? 'vt.created_at';
    const sortDirection = query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Count query
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::TEXT AS total
       FROM verification_tasks vt
       LEFT JOIN systems s ON vt.system_id = s.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Data query
    const dataParams = [...params, limit, offset];
    const dataResult = await this.pool.query<TaskDbRow>(
      `SELECT
         vt.id,
         vt.task_id,
         vt.system_id,
         s.name AS system_name,
         vt.task_type,
         vt.priority,
         vt.status,
         vt.progress,
         vt.assigned_to,
         u.first_name AS assigned_first_name,
         u.last_name AS assigned_last_name,
         vt.created_by,
         cb.first_name AS created_by_first_name,
         cb.last_name AS created_by_last_name,
         vt.started_at,
         vt.completed_at,
         vt.estimated_completion,
         vt.result_summary,
         vt.error_message,
         vt.created_at,
         vt.updated_at,
         (SELECT COUNT(*) FROM task_logs WHERE task_id = vt.id) AS log_count
       FROM verification_tasks vt
       LEFT JOIN systems s ON vt.system_id = s.id
       LEFT JOIN users u ON vt.assigned_to = u.id
       LEFT JOIN users cb ON vt.created_by = cb.id
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}, vt.priority ASC, vt.task_id ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams
    );

    const tasks = dataResult.rows.map(transformTaskRow);

    return {
      success: true,
      data: tasks,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    };
  }

  // ── Get Task by ID ──────────────────────────────────────────────────────

  async getTaskById(taskId: string): Promise<ApiResponse<QueueTaskDetail>> {
    // taskId here is the public task_id (e.g., VT-1234)
    const result = await this.pool.query<TaskDbRow>(
      `SELECT
         vt.id,
         vt.task_id,
         vt.system_id,
         s.name AS system_name,
         vt.task_type,
         vt.priority,
         vt.status,
         vt.progress,
         vt.assigned_to,
         u.first_name AS assigned_first_name,
         u.last_name AS assigned_last_name,
         u.email AS assigned_email,
         vt.created_by,
         cb.first_name AS created_by_first_name,
         cb.last_name AS created_by_last_name,
         cb.email AS created_by_email,
         vt.started_at,
         vt.completed_at,
         vt.estimated_completion,
         vt.result_summary,
         vt.error_message,
         vt.created_at,
         vt.updated_at,
         (SELECT COUNT(*) FROM task_logs WHERE task_id = vt.id) AS log_count
       FROM verification_tasks vt
       LEFT JOIN systems s ON vt.system_id = s.id
       LEFT JOIN users u ON vt.assigned_to = u.id
       LEFT JOIN users cb ON vt.created_by = cb.id
       WHERE vt.task_id = $1`,
      [taskId]
    );

    if (result.rowCount === 0) {
      const error = new Error(`Task with id '${taskId}' not found`);
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const row = result.rows[0];

    // Fetch logs for this task
    const logsResult = await this.pool.query<LogDbRow>(
      `SELECT id, task_id, level, message, metadata, created_at
       FROM task_logs
       WHERE task_id = $1
       ORDER BY created_at ASC`,
      [row.id]
    );

    const task = transformTaskRow(row);
    const logs = logsResult.rows.map(transformLogRow);

    return {
      success: true,
      data: {
        ...task,
        logs,
        errorDetails: row.error_message,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  // ── Update Task ─────────────────────────────────────────────────────────

  async updateTask(
    taskId: string,
    data: UpdateTaskRequest
  ): Promise<ApiResponse<QueueTask>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current task for comparison
      const currentResult = await client.query<TaskDbRow>(
        `SELECT id, task_id, status, result_summary AS name, system_id, priority,
                 assigned_to, estimated_completion, task_type, created_by,
                 progress, error_message, started_at, completed_at,
                 created_at, updated_at,
                 (SELECT name FROM systems WHERE id = system_id) AS system_name,
                 (SELECT first_name FROM users WHERE id = assigned_to) AS assigned_first_name,
                 (SELECT last_name FROM users WHERE id = assigned_to) AS assigned_last_name,
                 (SELECT first_name FROM users WHERE id = created_by) AS created_by_first_name,
                 (SELECT last_name FROM users WHERE id = created_by) AS created_by_last_name
          FROM verification_tasks WHERE task_id = $1`,
        [taskId]
      );

      if (currentResult.rowCount === 0) {
        const error = new Error(`Task with id '${taskId}' not found`);
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      const current = currentResult.rows[0];
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (data.name !== undefined) {
        updates.push(`result_summary = $${paramIdx}`);
        values.push(data.name);
        paramIdx++;
      }

      if (data.priority !== undefined) {
        updates.push(`priority = $${paramIdx}`);
        values.push(data.priority);
        paramIdx++;
      }

      let oldStatus = current.status;
      let newStatus = oldStatus;
      if (data.status !== undefined) {
        newStatus = mapApiStatus(data.status);
        updates.push(`status = $${paramIdx}`);
        values.push(newStatus);
        paramIdx++;
      }

      if (data.assigneeId !== undefined) {
        updates.push(`assigned_to = $${paramIdx}`);
        values.push(data.assigneeId);
        paramIdx++;
      }

      if (data.scheduledAt !== undefined) {
        updates.push(`estimated_completion = $${paramIdx}`);
        values.push(
          data.scheduledAt ? new Date(data.scheduledAt) : null
        );
        paramIdx++;
      }

      if (data.checkTypes !== undefined) {
        updates.push(`task_type = $${paramIdx}`);
        values.push(mapApiCheckTypes(data.checkTypes));
        paramIdx++;
      }

      if (updates.length === 0) {
        const error = new Error('No fields provided for update');
        (error as Error & { statusCode: number }).statusCode = 400;
        throw error;
      }

      values.push(taskId);

      const updateResult = await client.query<TaskDbRow>(
        `UPDATE verification_tasks
         SET ${updates.join(', ')}
         WHERE task_id = $${paramIdx}
         RETURNING
           id, task_id, system_id,
           (SELECT name FROM systems WHERE id = verification_tasks.system_id) AS system_name,
           task_type, priority, status, progress, assigned_to,
           (SELECT first_name FROM users WHERE id = assigned_to) AS assigned_first_name,
           (SELECT last_name FROM users WHERE id = assigned_to) AS assigned_last_name,
           created_by,
           (SELECT first_name FROM users WHERE id = created_by) AS created_by_first_name,
           (SELECT last_name FROM users WHERE id = created_by) AS created_by_last_name,
           started_at, completed_at, estimated_completion,
           result_summary, error_message, created_at, updated_at,
           (SELECT COUNT(*) FROM task_logs WHERE task_id = verification_tasks.id) AS log_count`,
        values
      );

      // Log status transition if changed
      if (data.status !== undefined && oldStatus !== newStatus) {
        await client.query(
          `INSERT INTO task_logs (task_id, level, message, metadata)
           VALUES ($1, 'info', $2, $3)`,
          [
            current.id,
            `Status changed from ${mapDbStatus(oldStatus)} to ${data.status}`,
            JSON.stringify({ from: mapDbStatus(oldStatus), to: data.status }),
          ]
        );

        await logActivity(
          client,
          'task_status_changed',
          'queue',
          current.id,
          `Task ${taskId} status: ${mapDbStatus(oldStatus)} → ${data.status}`,
          null,
          { taskId, from: oldStatus, to: newStatus }
        );
      }

      await client.query('COMMIT');

      const task = transformTaskRow(updateResult.rows[0]);

      // Emit WebSocket event
      this.wsEmitter.emit('task:updated', { taskId: task.id, task });

      return {
        success: true,
        data: task,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `req_${Date.now()}`,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Restart Task ────────────────────────────────────────────────────────

  async restartTask(taskId: string): Promise<ApiResponse<QueueTask>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get internal UUID for the task
      const taskResult = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM verification_tasks WHERE task_id = $1',
        [taskId]
      );

      if (taskResult.rowCount === 0) {
        const error = new Error(`Task with id '${taskId}' not found`);
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      const internalId = taskResult.rows[0].id;

      // Clear old logs
      await client.query('DELETE FROM task_logs WHERE task_id = $1', [
        internalId,
      ]);

      // Reset task state
      const updateResult = await client.query<TaskDbRow>(
        `UPDATE verification_tasks
         SET status = 'pending',
             progress = 0,
             error_message = NULL,
             started_at = NULL,
             completed_at = NULL,
             updated_at = NOW()
         WHERE task_id = $1
         RETURNING
           id, task_id, system_id,
           (SELECT name FROM systems WHERE id = verification_tasks.system_id) AS system_name,
           task_type, priority, status, progress, assigned_to,
           (SELECT first_name FROM users WHERE id = assigned_to) AS assigned_first_name,
           (SELECT last_name FROM users WHERE id = assigned_to) AS assigned_last_name,
           created_by,
           (SELECT first_name FROM users WHERE id = created_by) AS created_by_first_name,
           (SELECT last_name FROM users WHERE id = created_by) AS created_by_last_name,
           started_at, completed_at, estimated_completion,
           result_summary, error_message, created_at, updated_at,
           (SELECT COUNT(*) FROM task_logs WHERE task_id = verification_tasks.id) AS log_count`,
        [taskId]
      );

      // Insert restart log
      await client.query(
        `INSERT INTO task_logs (task_id, level, message, metadata)
         VALUES ($1, 'info', $2, $3)`,
        [
          internalId,
          `Task ${taskId} restarted`,
          JSON.stringify({ restartedAt: new Date().toISOString() }),
        ]
      );

      await logActivity(
        client,
        'task_restarted',
        'queue',
        internalId,
        `Task ${taskId} was restarted`,
        null,
        { taskId }
      );

      await client.query('COMMIT');

      // Re-publish to Redis queue
      const priority = updateResult.rows[0].priority;
      await this.redis.lpush(
        'verification:queue',
        JSON.stringify({ taskId, id: internalId, priority })
      );

      const task = transformTaskRow(updateResult.rows[0]);

      // Emit WebSocket event
      this.wsEmitter.emit('task:restarted', { taskId: task.id, task });

      return {
        success: true,
        data: task,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `req_${Date.now()}`,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Cancel Task ─────────────────────────────────────────────────────────

  async cancelTask(taskId: string): Promise<ApiResponse<QueueTask>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const taskResult = await client.query<{
        id: string;
        status: string;
        priority: string;
      }>('SELECT id, status, priority FROM verification_tasks WHERE task_id = $1', [
        taskId,
      ]);

      if (taskResult.rowCount === 0) {
        const error = new Error(`Task with id '${taskId}' not found`);
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      const { id: internalId, status } = taskResult.rows[0];

      // Can only cancel pending tasks
      if (status !== 'pending') {
        const error = new Error(
          `Cannot cancel a task with status '${mapDbStatus(status)}'. Only pending tasks can be cancelled.`
        );
        (error as Error & { statusCode: number }).statusCode = 400;
        throw error;
      }

      // Update status to cancelled
      const updateResult = await client.query<TaskDbRow>(
        `UPDATE verification_tasks
         SET status = 'cancelled', updated_at = NOW()
         WHERE task_id = $1
         RETURNING
           id, task_id, system_id,
           (SELECT name FROM systems WHERE id = verification_tasks.system_id) AS system_name,
           task_type, priority, status, progress, assigned_to,
           (SELECT first_name FROM users WHERE id = assigned_to) AS assigned_first_name,
           (SELECT last_name FROM users WHERE id = assigned_to) AS assigned_last_name,
           created_by,
           (SELECT first_name FROM users WHERE id = created_by) AS created_by_first_name,
           (SELECT last_name FROM users WHERE id = created_by) AS created_by_last_name,
           started_at, completed_at, estimated_completion,
           result_summary, error_message, created_at, updated_at,
           (SELECT COUNT(*) FROM task_logs WHERE task_id = verification_tasks.id) AS log_count`,
        [taskId]
      );

      // Remove from queue if still pending (LREM on Redis list)
      await this.redis.lrem(
        'verification:queue',
        0,
        JSON.stringify({ taskId, id: internalId, priority: taskResult.rows[0].priority })
      );

      // Log cancellation
      await client.query(
        `INSERT INTO task_logs (task_id, level, message, metadata)
         VALUES ($1, 'warn', $2, $3)`,
        [
          internalId,
          `Task ${taskId} cancelled`,
          JSON.stringify({ cancelledAt: new Date().toISOString() }),
        ]
      );

      await logActivity(
        client,
        'task_cancelled',
        'queue',
        internalId,
        `Task ${taskId} was cancelled`,
        null,
        { taskId }
      );

      await client.query('COMMIT');

      const task = transformTaskRow(updateResult.rows[0]);

      // Emit WebSocket event
      this.wsEmitter.emit('task:cancelled', { taskId: task.id, task });

      return {
        success: true,
        data: task,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `req_${Date.now()}`,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Delete Task ─────────────────────────────────────────────────────────

  async deleteTask(taskId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get internal ID
      const taskResult = await client.query<{ id: string }>(
        'SELECT id FROM verification_tasks WHERE task_id = $1',
        [taskId]
      );

      if (taskResult.rowCount === 0) {
        const error = new Error(`Task with id '${taskId}' not found`);
        (error as Error & { statusCode: number }).statusCode = 404;
        throw error;
      }

      const internalId = taskResult.rows[0].id;

      // Delete logs first (CASCADE handles this, but explicit is safer)
      await client.query('DELETE FROM task_logs WHERE task_id = $1', [
        internalId,
      ]);

      // Delete task
      await client.query('DELETE FROM verification_tasks WHERE id = $1', [
        internalId,
      ]);

      await logActivity(
        client,
        'task_deleted',
        'queue',
        internalId,
        `Task ${taskId} was deleted`,
        null,
        { taskId }
      );

      await client.query('COMMIT');

      // Emit WebSocket event
      this.wsEmitter.emit('task:deleted', { taskId });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Get Task Logs ───────────────────────────────────────────────────────

  async getTaskLogs(
    taskId: string,
    query: TaskLogQueryParams
  ): Promise<PaginationResponse<TaskLog>> {
    // Resolve internal UUID from public task_id
    const taskResult = await this.pool.query<{ id: string }>(
      'SELECT id FROM verification_tasks WHERE task_id = $1',
      [taskId]
    );

    if (taskResult.rowCount === 0) {
      const error = new Error(`Task with id '${taskId}' not found`);
      (error as Error & { statusCode: number }).statusCode = 404;
      throw error;
    }

    const internalId = taskResult.rows[0].id;
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['tl.task_id = $1'];
    const params: unknown[] = [internalId];
    let paramIdx = 2;

    if (query.level) {
      conditions.push(`tl.level = $${paramIdx}`);
      params.push(query.level);
      paramIdx++;
    }

    if (query.since) {
      conditions.push(`tl.created_at > $${paramIdx}`);
      params.push(new Date(query.since));
      paramIdx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count query
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::TEXT AS total FROM task_logs tl ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Data query
    const dataParams = [...params, limit, offset];
    const dataResult = await this.pool.query<LogDbRow>(
      `SELECT id, task_id, level, message, metadata, created_at
       FROM task_logs tl
       ${whereClause}
       ORDER BY created_at ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams
    );

    const logs = dataResult.rows.map(transformLogRow);

    return {
      success: true,
      data: logs,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    };
  }

  // ── Batch Operation ─────────────────────────────────────────────────────

  async batchOperation(
    _userId: string,
    request: BatchOperationRequest
  ): Promise<ApiResponse<BatchOperationResult>> {
    const { operation, taskIds } = request;
    const errors: Array<{ taskId: string; error: string }> = [];
    let succeeded = 0;

    // Process in parallel with Promise.all
    const results = await Promise.all(
      taskIds.map(async (taskId) => {
        try {
          switch (operation) {
            case 'restart':
              await this.restartTask(taskId);
              break;
            case 'cancel':
              await this.cancelTask(taskId);
              break;
            case 'delete':
              await this.deleteTask(taskId);
              break;
            default:
              throw new Error(`Unknown operation: ${operation}`);
          }
          return { taskId, success: true };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Unknown error';
          return { taskId, success: false, error: message };
        }
      })
    );

    for (const result of results) {
      if (result.success) {
        succeeded++;
      } else {
        errors.push({
          taskId: result.taskId,
          error: result.error ?? 'Unknown error',
        });
      }
    }

    return {
      success: true,
      data: {
        operation,
        processed: taskIds.length,
        succeeded,
        failed: taskIds.length - succeeded,
        errors,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  // ── Get Queue Counts ────────────────────────────────────────────────────

  async getQueueCounts(): Promise<ApiResponse<QueueStatusCounts>> {
    const result = await this.pool.query<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*)::TEXT AS count
       FROM verification_tasks
       GROUP BY status
       ORDER BY
         CASE status
           WHEN 'pending' THEN 1
           WHEN 'processing' THEN 2
           WHEN 'completed' THEN 3
           WHEN 'failed' THEN 4
           WHEN 'cancelled' THEN 5
         END`
    );

    const statusLabels: Record<string, string> = {
      pending: 'Pending',
      processing: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };

    let total = 0;
    const byStatus = result.rows.map((row) => {
      const count = parseInt(row.count, 10);
      total += count;
      return {
        status: mapDbStatus(row.status),
        count,
        label: statusLabels[row.status] ?? row.status,
      };
    });

    return {
      success: true,
      data: { total, byStatus },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };
  }

  // ── Internal: Insert task log (used by task processor) ──────────────────

  async insertTaskLog(
    internalTaskId: string,
    level: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO task_logs (task_id, level, message, metadata)
       VALUES ($1, $2, $3, $4)`,
      [internalTaskId, level, message, metadata ? JSON.stringify(metadata) : '{}']
    );
  }

  // ── Internal: Update task progress (used by task processor) ─────────────

  async updateTaskProgress(
    internalTaskId: string,
    progress: number,
    status?: string
  ): Promise<void> {
    if (status) {
      await this.pool.query(
        `UPDATE verification_tasks
         SET progress = $1, status = $2, updated_at = NOW()
         WHERE id = $3`,
        [progress, status, internalTaskId]
      );
    } else {
      await this.pool.query(
        `UPDATE verification_tasks
         SET progress = $1, updated_at = NOW()
         WHERE id = $2`,
        [progress, internalTaskId]
      );
    }
  }

  // ── Internal: Get task by internal ID (used by task processor) ──────────

  async getTaskByInternalId(
    internalId: string
  ): Promise<QueueTask | null> {
    const result = await this.pool.query<TaskDbRow>(
      `SELECT
         vt.id,
         vt.task_id,
         vt.system_id,
         s.name AS system_name,
         vt.task_type,
         vt.priority,
         vt.status,
         vt.progress,
         vt.assigned_to,
         u.first_name AS assigned_first_name,
         u.last_name AS assigned_last_name,
         vt.created_by,
         cb.first_name AS created_by_first_name,
         cb.last_name AS created_by_last_name,
         vt.started_at,
         vt.completed_at,
         vt.estimated_completion,
         vt.result_summary,
         vt.error_message,
         vt.created_at,
         vt.updated_at,
         (SELECT COUNT(*) FROM task_logs WHERE task_id = vt.id) AS log_count
       FROM verification_tasks vt
       LEFT JOIN systems s ON vt.system_id = s.id
       LEFT JOIN users u ON vt.assigned_to = u.id
       LEFT JOIN users cb ON vt.created_by = cb.id
       WHERE vt.id = $1`,
      [internalId]
    );

    if (result.rowCount === 0) return null;
    return transformTaskRow(result.rows[0]);
  }
}
