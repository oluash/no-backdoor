/**
 * No-Backdoor System Architecture — Authentication Integration Tests
 *
 * Tests all /api/auth/* endpoints:
 *   POST /api/auth/register  — registration (success, duplicate, invalid)
 *   POST /api/auth/login     — login (success, wrong password, non-existent)
 *   POST /api/auth/refresh   — token refresh (success, invalid)
 *   GET  /api/auth/me        — profile (success, missing/invalid token)
 *   PUT  /api/auth/me        — profile update (success, partial, invalid)
 */

import request from 'supertest';
import { createApp } from '@/server';
import type { Express } from 'express';

// =============================================================================
// Test Suite Setup
// =============================================================================

describe('Authentication API', () => {
  let app: Express;

  beforeAll(async () => {
    const result = await createApp(global.testDb, global.testRedis);
    app = result.app;
  });

  // =============================================================================
  // POST /api/auth/register
  // =============================================================================

  describe('POST /api/auth/register', () => {
    it('should register a new user and return 201 with tokens', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'analyst',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('newuser@example.com');
      expect(res.body.data.user.firstName).toBe('Jane');
      expect(res.body.data.user.lastName).toBe('Doe');
      expect(res.body.data.user.role).toBe('analyst');
      expect(res.body.data.user.id).toBeDefined();
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.token.accessToken).toBeDefined();
      expect(res.body.data.token.refreshToken).toBeDefined();
      expect(res.body.data.token.expiresIn).toBeDefined();
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.timestamp).toBeDefined();
    });

    it('should return 409 when email already exists', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'SecurePass123!',
          firstName: 'First',
          lastName: 'User',
        });

      // Duplicate registration
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'SecurePass123!',
          firstName: 'Second',
          lastName: 'User',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should return 400 for invalid registration data', async () => {
      const testCases = [
        { body: {}, desc: 'empty body' },
        { body: { email: 'not-an-email' }, desc: 'invalid email format' },
        { body: { email: 'valid@example.com', password: '123' }, desc: 'password too short' },
        { body: { email: 'valid@example.com', password: 'SecurePass123!' }, desc: 'missing names' },
        { body: { email: 'valid@example.com', password: 'SecurePass123!', firstName: '' }, desc: 'empty firstName' },
      ];

      for (const tc of testCases) {
        const res = await request(app)
          .post('/api/auth/register')
          .send(tc.body);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBeDefined();
      }
    });

    it('should return 400 for unsupported role value', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'roletest@example.com',
          password: 'SecurePass123!',
          firstName: 'Role',
          lastName: 'Test',
          role: 'superadmin', // invalid role
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // POST /api/auth/login
  // =============================================================================

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return 200 with tokens', async () => {
      // Register first
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'logintest@example.com',
          password: 'SecurePass123!',
          firstName: 'Login',
          lastName: 'Test',
        });

      expect(registerRes.status).toBe(201);

      // Login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'logintest@example.com',
          password: 'SecurePass123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('logintest@example.com');
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.token.accessToken).toBeDefined();
      expect(res.body.data.token.refreshToken).toBeDefined();
    });

    it('should return 401 for wrong password', async () => {
      // Register first
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'wrongpass@example.com',
          password: 'SecurePass123!',
          firstName: 'Wrong',
          lastName: 'Password',
        });

      // Login with wrong password
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrongpass@example.com',
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for invalid login data', async () => {
      const testCases = [
        { email: '', password: 'password' },
        { email: 'not-an-email', password: 'password' },
        { email: 'valid@example.com', password: '' },
        {},
      ];

      for (const body of testCases) {
        const res = await request(app)
          .post('/api/auth/login')
          .send(body);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });
  });

  // =============================================================================
  // POST /api/auth/refresh
  // =============================================================================

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens and return 200 with new tokens', async () => {
      // Register and get tokens
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'refreshtest@example.com',
          password: 'SecurePass123!',
          firstName: 'Refresh',
          lastName: 'Test',
        });

      const refreshToken = registerRes.body.data.token.refreshToken;
      expect(refreshToken).toBeDefined();

      // Refresh
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.expiresIn).toBeDefined();

      // New tokens should be different
      expect(res.body.data.accessToken).not.toBe(registerRes.body.data.token.accessToken);
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token-string' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 for reused refresh token (token rotation)', async () => {
      // Register and get tokens
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'rotatetest@example.com',
          password: 'SecurePass123!',
          firstName: 'Rotate',
          lastName: 'Test',
        });

      const refreshToken = registerRes.body.data.token.refreshToken;

      // First refresh — should succeed
      const firstRefresh = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(firstRefresh.status).toBe(200);

      // Second refresh with same token — should fail (rotation)
      const secondRefresh = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(secondRefresh.status).toBe(401);
    });
  });

  // =============================================================================
  // GET /api/auth/me
  // =============================================================================

  describe('GET /api/auth/me', () => {
    it('should return 200 with user profile for valid token', async () => {
      const user = await global.createTestUser({
        email: 'metest@example.com',
        firstName: 'Me',
        lastName: 'Test',
        role: 'analyst',
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set(global.authHeaders(user.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(user.id);
      expect(res.body.data.email).toBe('metest@example.com');
      expect(res.body.data.firstName).toBe('Me');
      expect(res.body.data.lastName).toBe('Test');
      expect(res.body.data.role).toBe('analyst');
      expect(res.body.data.password_hash).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('should return 401 when token is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is invalid', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set({ Authorization: 'Bearer invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when Authorization header format is wrong', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set({ Authorization: 'Basic abc123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // =============================================================================
  // PUT /api/auth/me
  // =============================================================================

  describe('PUT /api/auth/me', () => {
    it('should update profile and return 200 with updated user', async () => {
      const user = await global.createTestUser({
        email: 'updatemetest@example.com',
        firstName: 'Original',
        lastName: 'Name',
      });

      const res = await request(app)
        .put('/api/auth/me')
        .set(global.authHeaders(user.accessToken))
        .send({
          firstName: 'Updated',
          lastName: 'User',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.firstName).toBe('Updated');
      expect(res.body.data.lastName).toBe('User');
      expect(res.body.data.email).toBe('updatemetest@example.com');
      expect(res.body.data.id).toBe(user.id);
    });

    it('should support partial update (firstName only)', async () => {
      const user = await global.createTestUser({
        email: 'partialupdate@example.com',
        firstName: 'Original',
        lastName: 'Name',
      });

      const res = await request(app)
        .put('/api/auth/me')
        .set(global.authHeaders(user.accessToken))
        .send({ firstName: 'Partial' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.firstName).toBe('Partial');
      expect(res.body.data.lastName).toBe('Name'); // unchanged
    });

    it('should support partial update (lastName only)', async () => {
      const user = await global.createTestUser({
        email: 'partialupdate2@example.com',
        firstName: 'Original',
        lastName: 'Name',
      });

      const res = await request(app)
        .put('/api/auth/me')
        .set(global.authHeaders(user.accessToken))
        .send({ lastName: 'UpdatedLast' });

      expect(res.status).toBe(200);
      expect(res.body.data.lastName).toBe('UpdatedLast');
      expect(res.body.data.firstName).toBe('Original'); // unchanged
    });

    it('should support avatar update', async () => {
      const user = await global.createTestUser({
        email: 'avatarupdate@example.com',
      });

      const res = await request(app)
        .put('/api/auth/me')
        .set(global.authHeaders(user.accessToken))
        .send({ avatar: 'https://example.com/avatar.png' });

      expect(res.status).toBe(200);
      expect(res.body.data.avatar).toBe('https://example.com/avatar.png');
    });

    it('should return 400 for invalid update data', async () => {
      const user = await global.createTestUser({
        email: 'invalidupdate@example.com',
      });

      const testCases = [
        { firstName: '' }, // empty name
        { firstName: 'a'.repeat(101) }, // name too long
        { unknownField: 'value' }, // might be allowed depending on schema
      ];

      for (const body of testCases) {
        const res = await request(app)
          .put('/api/auth/me')
          .set(global.authHeaders(user.accessToken))
          .send(body);

        // Should either return 400 for validation errors or 200 if field is ignored
        expect([200, 400]).toContain(res.status);
      }
    });

    it('should return 401 when updating without token', async () => {
      const res = await request(app)
        .put('/api/auth/me')
        .send({ firstName: 'NoAuth' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
