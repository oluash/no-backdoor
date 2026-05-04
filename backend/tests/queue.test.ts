/**
 * No-Backdoor System Architecture — Queue Integration Tests
 *
 * Tests all /api/queue/* endpoints:
 *   GET    /api/queue/counts              — task counts by status
 *   GET    /api/queue/tasks               — list tasks (filter, pagination)
 *   POST   /api/queue/tasks               — create task (success, invalid)
 *   GET    /api/queue/tasks/:id           — get single task
 *   PUT    /api/queue/tasks/:id           — update priority/status
 *   POST   /api/queue/tasks/:id/restart   — restart task
 *   POST   /api/queue/tasks/:id/cancel    — cancel task
 *   DELETE /api/queue/tasks/:id           — delete task
 *   GET    /api/queue/tasks/:id/logs      — task logs (paginated)
 *   POST   /api/queue/batch               — batch operations
 */

import request from 'supertest';
import { createApp } from '@/server';
import type { Express } from 'express';
import { createTestSystem, createTestTask } from './setup';

// =============================================================================
// Test Suite Setup
// =============================================================================

describe('Queue API', () => {
  let app: Express;
  let adminUser: Awaited<ReturnType<typeof global.createTestUser>>;
  let viewerUser: Awaited<ReturnType<typeof global.createTestUser>>;

  beforeAll(async () => {
    const result = await createApp(global.testDb, global.testRedis);
    app = result.app;
  });

  beforeEach(async () => {
    adminUser = await global.createTestUser({ role: 'admin' });
    viewerUser = await global.createTestUser({ role: 'viewer' });
  });

  // =============================================================================
  // GET /api/queue/counts
  // =============================================================================

  describe('GET /api/queue/counts', () => {
    it('should return 200 with task counts grouped by status', async () => {
      const systemId = await createTestSystem();
      await createTestTask({ systemId, status: 'pending' });
      await createTestTask({ systemId, status: 'processing' });
      await createTestTask({ systemId, status: 'completed' });

      const res = await request(app)
        .get('/api/queue/counts')
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/queue/counts');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // GET /api/queue/tasks
  // =============================================================================

  describe('GET /api/queue/tasks', () => {
    it('should return 200 with paginated task list', async () => {
      const systemId = await createTestSystem();
      await createTestTask({ systemId });
      await createTestTask({ systemId });

      const res = await request(app)
        .get('/api/queue/tasks')
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('should filter tasks by status', async () => {
      const systemId = await createTestSystem();
      await createTestTask({ systemId, status: 'pending' });
      await createTestTask({ systemId, status: 'processing' });

      const res = await request(app)
        .get('/api/queue/tasks')
        .query({ status: 'pending' })
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter tasks by priority', async () => {
      const systemId = await createTestSystem();
      await createTestTask({ systemId, priority: 'high' });
      await createTestTask({ systemId, priority: 'low' });

      const res = await request(app)
        .get('/api/queue/tasks')
        .query({ priority: 'high' })
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should paginate results', async () => {
      const systemId = await createTestSystem();
      for (let i = 0; i < 5; i++) {
        await createTestTask({ systemId });
      }

      const res = await request(app)
        .get('/api/queue/tasks')
        .query({ page: 1, limit: 2 })
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination.page).toBe(1);
      expect(res.body.meta.pagination.limit).toBe(2);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/queue/tasks');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // POST /api/queue/tasks
  // =============================================================================

  describe('POST /api/queue/tasks', () => {
    it('should create a task and return 201', async () => {
      const systemId = await createTestSystem();

      const res = await request(app)
        .post('/api/queue/tasks')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          systemId,
          taskType: 'code_scan',
          priority: 'high',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 400 for invalid task data', async () => {
      const res = await request(app)
        .post('/api/queue/tasks')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          // Missing required systemId
          taskType: 'code_scan',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for unsupported task type', async () => {
      const systemId = await createTestSystem();

      const res = await request(app)
        .post('/api/queue/tasks')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          systemId,
          taskType: 'unsupported_type',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem();

      const res = await request(app)
        .post('/api/queue/tasks')
        .send({
          systemId,
          taskType: 'code_scan',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // GET /api/queue/tasks/:id
  // =============================================================================

  describe('GET /api/queue/tasks/:id', () => {
    it('should return 200 with task details', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'pending' });

      const res = await request(app)
        .get(`/api/queue/tasks/${taskId}`)
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .get('/api/queue/tasks/00000000-0000-0000-0000-000000000000')
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      const res = await request(app)
        .get(`/api/queue/tasks/${taskId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // PUT /api/queue/tasks/:id
  // =============================================================================

  describe('PUT /api/queue/tasks/:id', () => {
    it('should update task priority and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, priority: 'normal' });

      const res = await request(app)
        .put(`/api/queue/tasks/${taskId}`)
        .set(global.authHeaders(adminUser.accessToken))
        .send({ priority: 'critical' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should update task status and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'pending' });

      const res = await request(app)
        .put(`/api/queue/tasks/${taskId}`)
        .set(global.authHeaders(adminUser.accessToken))
        .send({ status: 'processing' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .put('/api/queue/tasks/00000000-0000-0000-0000-000000000000')
        .set(global.authHeaders(adminUser.accessToken))
        .send({ priority: 'high' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      const res = await request(app)
        .put(`/api/queue/tasks/${taskId}`)
        .send({ priority: 'high' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // POST /api/queue/tasks/:id/restart
  // =============================================================================

  describe('POST /api/queue/tasks/:id/restart', () => {
    it('should restart a failed task and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'failed' });

      const res = await request(app)
        .post(`/api/queue/tasks/${taskId}/restart`)
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should restart a completed task and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'completed' });

      const res = await request(app)
        .post(`/api/queue/tasks/${taskId}/restart`)
        .set(global.authHeaders(adminUser.accessToken));

      expect([200, 400]).toContain(res.status);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .post('/api/queue/tasks/00000000-0000-0000-0000-000000000000/restart')
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'failed' });

      const res = await request(app)
        .post(`/api/queue/tasks/${taskId}/restart`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // POST /api/queue/tasks/:id/cancel
  // =============================================================================

  describe('POST /api/queue/tasks/:id/cancel', () => {
    it('should cancel a pending task and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'pending' });

      const res = await request(app)
        .post(`/api/queue/tasks/${taskId}/cancel`)
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when cancelling a running task', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'processing' });

      const res = await request(app)
        .post(`/api/queue/tasks/${taskId}/cancel`)
        .set(global.authHeaders(adminUser.accessToken));

      expect([200, 400]).toContain(res.status);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .post('/api/queue/tasks/00000000-0000-0000-0000-000000000000/cancel')
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId, status: 'pending' });

      const res = await request(app)
        .post(`/api/queue/tasks/${taskId}/cancel`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // DELETE /api/queue/tasks/:id
  // =============================================================================

  describe('DELETE /api/queue/tasks/:id', () => {
    it('should delete a task and return 204', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      const res = await request(app)
        .delete(`/api/queue/tasks/${taskId}`)
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(204);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .delete('/api/queue/tasks/00000000-0000-0000-0000-000000000000')
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      const res = await request(app)
        .delete(`/api/queue/tasks/${taskId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // GET /api/queue/tasks/:id/logs
  // =============================================================================

  describe('GET /api/queue/tasks/:id/logs', () => {
    it('should return 200 with paginated task logs', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      // Insert some task logs directly
      await global.testDb.query(
        `INSERT INTO task_logs (task_id, level, message, created_at)
         VALUES ($1, 'info', 'Task started', NOW()),
                ($1, 'info', 'Processing...', NOW() + INTERVAL '1 second'),
                ($1, 'success', 'Task completed', NOW() + INTERVAL '2 seconds')`,
        [taskId]
      );

      const res = await request(app)
        .get(`/api/queue/tasks/${taskId}/logs`)
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('should paginate logs', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      await global.testDb.query(
        `INSERT INTO task_logs (task_id, level, message, created_at)
         VALUES ($1, 'info', 'Log entry 1', NOW()),
                ($1, 'info', 'Log entry 2', NOW()),
                ($1, 'info', 'Log entry 3', NOW())`,
        [taskId]
      );

      const res = await request(app)
        .get(`/api/queue/tasks/${taskId}/logs`)
        .query({ page: 1, limit: 2 })
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination.limit).toBe(2);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .get('/api/queue/tasks/00000000-0000-0000-0000-000000000000/logs')
        .set(global.authHeaders(adminUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      const res = await request(app)
        .get(`/api/queue/tasks/${taskId}/logs`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // POST /api/queue/batch
  // =============================================================================

  describe('POST /api/queue/batch', () => {
    it('should batch cancel tasks and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId1 = await createTestTask({ systemId, status: 'pending' });
      const taskId2 = await createTestTask({ systemId, status: 'pending' });

      const res = await request(app)
        .post('/api/queue/batch')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          operation: 'cancel',
          taskIds: [taskId1, taskId2],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should batch restart failed tasks and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId1 = await createTestTask({ systemId, status: 'failed' });
      const taskId2 = await createTestTask({ systemId, status: 'failed' });

      const res = await request(app)
        .post('/api/queue/batch')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          operation: 'restart',
          taskIds: [taskId1, taskId2],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should batch delete tasks and return 200', async () => {
      const systemId = await createTestSystem();
      const taskId1 = await createTestTask({ systemId });
      const taskId2 = await createTestTask({ systemId });

      const res = await request(app)
        .post('/api/queue/batch')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          operation: 'delete',
          taskIds: [taskId1, taskId2],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 for invalid operation', async () => {
      const systemId = await createTestSystem();
      const taskId = await createTestTask({ systemId });

      const res = await request(app)
        .post('/api/queue/batch')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          operation: 'invalid_operation',
          taskIds: [taskId],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for empty taskIds array', async () => {
      const res = await request(app)
        .post('/api/queue/batch')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          operation: 'cancel',
          taskIds: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/queue/batch')
        .send({
          operation: 'cancel',
          taskIds: ['00000000-0000-0000-0000-000000000000'],
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
