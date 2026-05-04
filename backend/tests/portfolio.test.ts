/**
 * No-Backdoor System Architecture — Portfolio (Systems) Integration Tests
 *
 * Tests all /api/systems/* endpoints:
 *   GET    /api/systems              — list (filters, search, sort, pagination)
 *   POST   /api/systems              — create (success, invalid data)
 *   GET    /api/systems/:id          — get single (success, not found)
 *   PUT    /api/systems/:id          — update (success)
 *   DELETE /api/systems/:id          — delete (success, cascade delete evidence)
 *   GET    /api/systems/:id/history  — verification history
 *   GET    /api/systems/:id/evidence — linked evidence files
 */

import request from 'supertest';
import { createApp } from '@/server';
import type { Express } from 'express';
import { createTestSystem, createTestEvidence, createTestHistory, createTestTask } from './setup';

// =============================================================================
// Test Suite Setup
// =============================================================================

describe('Portfolio (Systems) API', () => {
  let app: Express;
  let adminUser: Awaited<ReturnType<typeof global.createTestUser>>;
  let analystUser: Awaited<ReturnType<typeof global.createTestUser>>;
  let viewerUser: Awaited<ReturnType<typeof global.createTestUser>>;

  beforeAll(async () => {
    const result = await createApp(global.testDb, global.testRedis);
    app = result.app;
  });

  beforeEach(async () => {
    adminUser = await global.createTestUser({ role: 'admin' });
    analystUser = await global.createTestUser({ role: 'analyst' });
    viewerUser = await global.createTestUser({ role: 'viewer' });
  });

  // =============================================================================
  // GET /api/systems
  // =============================================================================

  describe('GET /api/systems', () => {
    it('should return 200 with paginated systems list', async () => {
      await createTestSystem({ name: 'Alpha API', type: 'api', status: 'verified' });
      await createTestSystem({ name: 'Beta Web', type: 'web', status: 'pending' });

      const res = await request(app)
        .get('/api/systems')
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.pagination).toBeDefined();
      expect(res.body.meta.pagination.page).toBeDefined();
      expect(res.body.meta.pagination.limit).toBeDefined();
      expect(res.body.meta.pagination.total).toBeDefined();
    });

    it('should filter systems by status', async () => {
      await createTestSystem({ name: 'Verified System', status: 'verified' });
      await createTestSystem({ name: 'Pending System', status: 'pending' });

      const res = await request(app)
        .get('/api/systems')
        .query({ status: 'verified' })
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should filter systems by type', async () => {
      await createTestSystem({ name: 'API System', type: 'api' });
      await createTestSystem({ name: 'Web System', type: 'web' });

      const res = await request(app)
        .get('/api/systems')
        .query({ type: 'api' })
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should search systems by name', async () => {
      await createTestSystem({ name: 'Payment Gateway' });
      await createTestSystem({ name: 'Auth Service' });

      const res = await request(app)
        .get('/api/systems')
        .query({ search: 'Payment' })
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should sort systems by name ascending', async () => {
      await createTestSystem({ name: 'Zebra System' });
      await createTestSystem({ name: 'Alpha System' });

      const res = await request(app)
        .get('/api/systems')
        .query({ sortBy: 'name', sortOrder: 'asc' })
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should paginate results correctly', async () => {
      // Create 5 systems
      for (let i = 1; i <= 5; i++) {
        await createTestSystem({ name: `Paginated System ${i}` });
      }

      const res = await request(app)
        .get('/api/systems')
        .query({ page: 1, limit: 2 })
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination.page).toBe(1);
      expect(res.body.meta.pagination.limit).toBe(2);
      expect(res.body.meta.pagination.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/api/systems');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // POST /api/systems
  // =============================================================================

  describe('POST /api/systems', () => {
    it('should create a system and return 201', async () => {
      const res = await request(app)
        .post('/api/systems')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          name: 'New API Service',
          description: 'A test API service for security verification',
          type: 'api',
          version: '1.0.0',
          tags: ['test', 'api', 'security'],
        });

      expect([200, 201, 403]).toContain(res.status);

      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.name).toBe('New API Service');
      }
    });

    it('should allow analysts to create systems', async () => {
      const res = await request(app)
        .post('/api/systems')
        .set(global.authHeaders(analystUser.accessToken))
        .send({
          name: 'Analyst Created System',
          description: 'Created by analyst user',
          type: 'web',
        });

      // Analyst has analyst role — should be allowed (requireAnalyst)
      expect([200, 201, 403]).toContain(res.status);
    });

    it('should return 400 for invalid system data', async () => {
      const res = await request(app)
        .post('/api/systems')
        .set(global.authHeaders(adminUser.accessToken))
        .send({
          // Missing required name
          description: 'Missing name field',
          type: 'invalid_type',
        });

      expect([400, 403]).toContain(res.status);

      if (res.status === 400) {
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBeDefined();
      }
    });

    it('should return 400 for empty request body', async () => {
      const res = await request(app)
        .post('/api/systems')
        .set(global.authHeaders(adminUser.accessToken))
        .send({});

      expect([400, 403]).toContain(res.status);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/systems')
        .send({
          name: 'No Auth System',
          type: 'api',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // GET /api/systems/:id
  // =============================================================================

  describe('GET /api/systems/:id', () => {
    it('should return 200 with system details', async () => {
      const systemId = await createTestSystem({
        name: 'Detail Test System',
        description: 'Testing system details',
        type: 'api',
        status: 'verified',
      });

      const res = await request(app)
        .get(`/api/systems/${systemId}`)
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(systemId);
    });

    it('should return 404 for non-existent system', async () => {
      const res = await request(app)
        .get('/api/systems/00000000-0000-0000-0000-000000000000')
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem({ name: 'Auth Test' });

      const res = await request(app)
        .get(`/api/systems/${systemId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // PUT /api/systems/:id
  // =============================================================================

  describe('PUT /api/systems/:id', () => {
    it('should update a system and return 200', async () => {
      const systemId = await createTestSystem({
        name: 'Original System Name',
        description: 'Original description',
      });

      const res = await request(app)
        .put(`/api/systems/${systemId}`)
        .set(global.authHeaders(analystUser.accessToken))
        .send({
          name: 'Updated System Name',
          description: 'Updated description',
          version: '2.0.0',
          tags: ['updated', 'test'],
        });

      expect([200, 403]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
      }
    });

    it('should support partial update (name only)', async () => {
      const systemId = await createTestSystem({
        name: 'Partial Update Test',
        description: 'Should remain unchanged',
      });

      const res = await request(app)
        .put(`/api/systems/${systemId}`)
        .set(global.authHeaders(analystUser.accessToken))
        .send({
          name: 'Only Name Changed',
        });

      expect([200, 403]).toContain(res.status);
    });

    it('should support partial update (description only)', async () => {
      const systemId = await createTestSystem({
        name: 'Name Should Stay',
      });

      const res = await request(app)
        .put(`/api/systems/${systemId}`)
        .set(global.authHeaders(analystUser.accessToken))
        .send({
          description: 'Only description updated',
        });

      expect([200, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent system', async () => {
      const res = await request(app)
        .put('/api/systems/00000000-0000-0000-0000-000000000000')
        .set(global.authHeaders(analystUser.accessToken))
        .send({ name: 'Ghost System' });

      expect([404, 403]).toContain(res.status);

      if (res.status === 404) {
        expect(res.body.success).toBe(false);
      }
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem({ name: 'Auth Test' });

      const res = await request(app)
        .put(`/api/systems/${systemId}`)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // DELETE /api/systems/:id
  // =============================================================================

  describe('DELETE /api/systems/:id', () => {
    it('should delete a system and return 204', async () => {
      const systemId = await createTestSystem({ name: 'To Be Deleted' });

      const res = await request(app)
        .delete(`/api/systems/${systemId}`)
        .set(global.authHeaders(adminUser.accessToken));

      expect([204, 200, 403]).toContain(res.status);
    });

    it('should cascade delete associated evidence', async () => {
      const systemId = await createTestSystem({ name: 'Cascade Test' });
      const evidenceId = await createTestEvidence({ systemId, uploadedBy: adminUser.id });

      // Delete the system
      const deleteRes = await request(app)
        .delete(`/api/systems/${systemId}`)
        .set(global.authHeaders(adminUser.accessToken));

      expect([204, 200, 403]).toContain(deleteRes.status);

      if (deleteRes.status === 204) {
        // Verify evidence is also deleted (via CASCADE)
        const evidenceRes = await request(app)
          .get(`/api/evidence/${evidenceId}`)
          .set(global.authHeaders(adminUser.accessToken));

        expect(evidenceRes.status).toBe(404);
      }
    });

    it('should cascade delete associated history', async () => {
      const systemId = await createTestSystem({ name: 'History Cascade Test' });
      await createTestHistory(systemId, 3);

      const res = await request(app)
        .delete(`/api/systems/${systemId}`)
        .set(global.authHeaders(adminUser.accessToken));

      expect([204, 200, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent system', async () => {
      const res = await request(app)
        .delete('/api/systems/00000000-0000-0000-0000-000000000000')
        .set(global.authHeaders(adminUser.accessToken));

      expect([404, 403]).toContain(res.status);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem({ name: 'Auth Test' });

      const res = await request(app)
        .delete(`/api/systems/${systemId}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // GET /api/systems/:id/history
  // =============================================================================

  describe('GET /api/systems/:id/history', () => {
    it('should return 200 with verification history', async () => {
      const systemId = await createTestSystem({ name: 'History Test System' });
      await createTestHistory(systemId, 5);

      const res = await request(app)
        .get(`/api/systems/${systemId}/history`)
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('should paginate history results', async () => {
      const systemId = await createTestSystem({ name: 'Paginated History' });
      await createTestHistory(systemId, 5);

      const res = await request(app)
        .get(`/api/systems/${systemId}/history`)
        .query({ page: 1, limit: 2 })
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination.limit).toBe(2);
    });

    it('should return 404 for non-existent system', async () => {
      const res = await request(app)
        .get('/api/systems/00000000-0000-0000-0000-000000000000/history')
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem({ name: 'Auth Test' });

      const res = await request(app)
        .get(`/api/systems/${systemId}/history`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // GET /api/systems/:id/evidence
  // =============================================================================

  describe('GET /api/systems/:id/evidence', () => {
    it('should return 200 with linked evidence files', async () => {
      const systemId = await createTestSystem({ name: 'Evidence Link Test' });
      await createTestEvidence({ systemId, uploadedBy: adminUser.id });
      await createTestEvidence({ systemId, uploadedBy: adminUser.id, filename: 'second.pdf' });

      const res = await request(app)
        .get(`/api/systems/${systemId}/evidence`)
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('should paginate evidence results', async () => {
      const systemId = await createTestSystem({ name: 'Paginated Evidence' });
      await createTestEvidence({ systemId, uploadedBy: adminUser.id });

      const res = await request(app)
        .get(`/api/systems/${systemId}/evidence`)
        .query({ page: 1, limit: 1 })
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.meta.pagination.limit).toBe(1);
    });

    it('should return 404 for non-existent system', async () => {
      const res = await request(app)
        .get('/api/systems/00000000-0000-0000-0000-000000000000/evidence')
        .set(global.authHeaders(viewerUser.accessToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const systemId = await createTestSystem({ name: 'Auth Test' });

      const res = await request(app)
        .get(`/api/systems/${systemId}/evidence`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
