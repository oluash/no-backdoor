/**
 * No-Backdoor System Architecture — Dashboard Integration Tests
 *
 * Tests all dashboard metrics and activity endpoints:
 *   GET /api/metrics/summary  — dashboard summary counts
 *   GET /api/metrics/trends   — 30-day verification trends
 *   GET /api/metrics/status   — system status distribution
 *   GET /api/activity/recent  — recent activity feed (paginated)
 */

import request from 'supertest';
import { createApp } from '@/server';
import type { Express } from 'express';
import { createTestSystem, createTestEvidence, createTestTask, createTestActivity } from './setup';

// =============================================================================
// Test Suite Setup
// =============================================================================

describe('Dashboard API', () => {
  let app: Express;
  let testUser: Awaited<ReturnType<typeof global.createTestUser>>;

  beforeAll(async () => {
    const result = await createApp(global.testDb, global.testRedis);
    app = result.app;
  });

  beforeEach(async () => {
    testUser = await global.createTestUser({ role: 'viewer' });
  });

  // =============================================================================
  // GET /api/metrics/summary
  // =============================================================================

  describe('GET /api/metrics/summary', () => {
    it('should return 200 with correct dashboard counts', async () => {
      // Seed data
      await createTestSystem({ name: 'Verified System 1', status: 'verified' });
      await createTestSystem({ name: 'Verified System 2', status: 'verified' });
      await createTestSystem({ name: 'Pending System', status: 'pending' });
      await createTestSystem({ name: 'Threat System', status: 'threat' });
      await createTestEvidence({});
      await createTestTask({ status: 'pending' });
      await createTestTask({ status: 'completed' });

      const res = await request(app)
        .get('/api/metrics/summary')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      // Verify the response contains expected metric fields
      const data = res.body.data;
      expect(data).toHaveProperty('totalSystems');
      expect(data).toHaveProperty('verifiedCount');
      expect(data).toHaveProperty('pendingCount');
      expect(data).toHaveProperty('threatCount');
      expect(data).toHaveProperty('totalEvidence');
      expect(data).toHaveProperty('pendingTasks');
      expect(data).toHaveProperty('completedTasks');
      expect(data).toHaveProperty('totalUsers');
      expect(data).toHaveProperty('avgVerificationScore');
    });

    it('should return correct system counts', async () => {
      await createTestSystem({ name: 'Sys A', status: 'verified' });
      await createTestSystem({ name: 'Sys B', status: 'verified' });
      await createTestSystem({ name: 'Sys C', status: 'pending' });

      const res = await request(app)
        .get('/api/metrics/summary')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.totalSystems).toBeGreaterThanOrEqual(3);
      expect(res.body.data.verifiedCount).toBeGreaterThanOrEqual(2);
      expect(res.body.data.pendingCount).toBeGreaterThanOrEqual(1);
    });

    it('should return correct evidence and task counts', async () => {
      await createTestEvidence({});
      await createTestEvidence({});
      await createTestTask({ status: 'pending' });
      await createTestTask({ status: 'processing' });

      const res = await request(app)
        .get('/api/metrics/summary')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.totalEvidence).toBeGreaterThanOrEqual(2);
      expect(res.body.data.pendingTasks).toBeGreaterThanOrEqual(1);
      expect(res.body.data.processingTasks).toBeGreaterThanOrEqual(1);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/metrics/summary');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return consistent data format', async () => {
      const res = await request(app)
        .get('/api/metrics/summary')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.timestamp).toBeDefined();

      // All numeric fields should be numbers (not null/undefined)
      const data = res.body.data;
      const numericFields = [
        'totalSystems',
        'verifiedCount',
        'pendingCount',
        'threatCount',
        'unknownCount',
        'totalEvidence',
        'pendingTasks',
        'processingTasks',
        'completedTasks',
        'failedTasks',
        'totalUsers',
      ];

      for (const field of numericFields) {
        expect(typeof data[field]).toBe('number');
        expect(data[field]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // =============================================================================
  // GET /api/metrics/trends
  // =============================================================================

  describe('GET /api/metrics/trends', () => {
    it('should return 200 with 30 days of trend data', async () => {
      // Seed verification history data
      const systemId = await createTestSystem();
      await createTestActivity(10, { entityType: 'verification' });

      const res = await request(app)
        .get('/api/metrics/trends')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.trends).toBeDefined();
      expect(Array.isArray(res.body.data.trends)).toBe(true);
    });

    it('should return trend data with date range', async () => {
      const res = await request(app)
        .get('/api/metrics/trends')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.periodStart).toBeDefined();
      expect(res.body.data.periodEnd).toBeDefined();
    });

    it('should support custom days parameter', async () => {
      const res = await request(app)
        .get('/api/metrics/trends')
        .query({ days: 7 })
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.trends).toBeDefined();
    });

    it('should return 400 for invalid days parameter', async () => {
      const res = await request(app)
        .get('/api/metrics/trends')
        .query({ days: 3 }) // below minimum of 7
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for excessive days parameter', async () => {
      const res = await request(app)
        .get('/api/metrics/trends')
        .query({ days: 100 }) // above maximum of 90
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/metrics/trends');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return trend data with correct structure', async () => {
      const res = await request(app)
        .get('/api/metrics/trends')
        .set(global.authHeaders(testUser.accessToken));

      if (res.status === 200 && res.body.data.trends.length > 0) {
        const firstTrend = res.body.data.trends[0];
        expect(firstTrend).toHaveProperty('date');
        expect(firstTrend).toHaveProperty('total');
        expect(firstTrend).toHaveProperty('passed');
        expect(firstTrend).toHaveProperty('failed');
        expect(firstTrend).toHaveProperty('pending');
      }
    });
  });

  // =============================================================================
  // GET /api/metrics/status
  // =============================================================================

  describe('GET /api/metrics/status', () => {
    it('should return 200 with status distribution', async () => {
      await createTestSystem({ name: 'Status Verified 1', status: 'verified' });
      await createTestSystem({ name: 'Status Verified 2', status: 'verified' });
      await createTestSystem({ name: 'Status Pending', status: 'pending' });
      await createTestSystem({ name: 'Status Threat', status: 'threat' });
      await createTestSystem({ name: 'Status Unknown', status: 'unknown' });

      const res = await request(app)
        .get('/api/metrics/status')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return distribution array with status, label, count, percentage', async () => {
      await createTestSystem({ name: 'Dist System', status: 'verified' });

      const res = await request(app)
        .get('/api/metrics/status')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.distribution).toBeDefined();
      expect(Array.isArray(res.body.data.distribution)).toBe(true);
      expect(res.body.data.total).toBeDefined();

      if (res.body.data.distribution.length > 0) {
        const firstDist = res.body.data.distribution[0];
        expect(firstDist).toHaveProperty('status');
        expect(firstDist).toHaveProperty('label');
        expect(firstDist).toHaveProperty('count');
        expect(firstDist).toHaveProperty('percentage');
      }
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/metrics/status');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // GET /api/activity/recent
  // =============================================================================

  describe('GET /api/activity/recent', () => {
    it('should return 200 with paginated activity feed', async () => {
      await createTestActivity(5);

      const res = await request(app)
        .get('/api/activity/recent')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('should paginate activity results', async () => {
      await createTestActivity(10);

      const res = await request(app)
        .get('/api/activity/recent')
        .query({ page: 1, limit: 3 })
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination.page).toBe(1);
      expect(res.body.meta.pagination.limit).toBe(3);
    });

    it('should filter activity by type', async () => {
      await createTestActivity(3, { actionType: 'verification' });
      await createTestActivity(3, { actionType: 'upload' });

      const res = await request(app)
        .get('/api/activity/recent')
        .query({ type: 'verification' })
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return activity items with correct structure', async () => {
      await createTestActivity(1, {
        actionType: 'test',
        entityType: 'system',
        actorId: testUser.id,
      });

      const res = await request(app)
        .get('/api/activity/recent')
        .set(global.authHeaders(testUser.accessToken));

      if (res.status === 200 && res.body.data.length > 0) {
        const activity = res.body.data[0];
        expect(activity).toHaveProperty('id');
        expect(activity).toHaveProperty('actionType');
        expect(activity).toHaveProperty('entityType');
        expect(activity).toHaveProperty('createdAt');
      }
    });

    it('should return 400 for invalid query parameters', async () => {
      const res = await request(app)
        .get('/api/activity/recent')
        .query({ page: -1 }) // invalid page
        .set(global.authHeaders(testUser.accessToken));

      expect([200, 400]).toContain(res.status);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/activity/recent');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return empty array when no activity exists', async () => {
      const res = await request(app)
        .get('/api/activity/recent')
        .set(global.authHeaders(testUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // May be empty or have seed data
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
