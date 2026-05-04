/**
 * No-Backdoor System Architecture — Jest Test Setup
 *
 * This file runs once before the test suite. It:
 *   1. Loads .env.test environment variables
 *   2. Creates a dedicated PostgreSQL pool for tests
 *   3. Creates a Redis test client
 *   4. Runs database migrations (schema + seed data)
 *   5. Provides global helpers: createTestUser(), authHeaders()
 *
 * Global lifecycle:
 *   beforeAll  → connect to test DB, run migrations
 *   beforeEach → truncate tables, re-seed minimal data
 *   afterAll   → close pool, close Redis, clean up uploads
 */

import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables BEFORE any other imports
// that might read from process.env
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { Pool, type PoolClient } from 'pg';
import Redis from 'ioredis';
import fs from 'fs';

import { generateAccessToken, generateRefreshToken } from '@/utils/jwt';

// =============================================================================
// Global Type Declarations
// =============================================================================

declare global {
  // eslint-disable-next-line no-var
  var testDb: Pool;
  // eslint-disable-next-line no-var
  var testRedis: Redis;
  // eslint-disable-next-line no-var
  var createTestUser: (options?: CreateTestUserOptions) => Promise<TestUser>;
  // eslint-disable-next-line no-var
  var authHeaders: (token: string) => Record<string, string>;
}

interface CreateTestUserOptions {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: 'admin' | 'reviewer' | 'viewer';
}

interface TestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

// =============================================================================
// Test Database Configuration
// =============================================================================

const testDbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'no_backdoor_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 5, // small pool for tests
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 5000,
};

const testRedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  db: parseInt(process.env.REDIS_DB || '15', 10), // use DB 15 for tests
  maxRetriesPerRequest: 3,
  lazyConnect: true,
};

// =============================================================================
// Shared Pool & Redis
// =============================================================================

const pool = new Pool(testDbConfig);
const redis = new Redis(testRedisConfig);

// Expose globally for test files
global.testDb = pool;
global.testRedis = redis;

// =============================================================================
// SQL Files for Migrations
// =============================================================================

const SCHEMA_SQL_PATH = path.resolve(__dirname, '../db/schema.sql');
const SEED_SQL_PATH = path.resolve(__dirname, '../db/migrations/002_seed.sql');
const INIT_SQL_PATH = path.resolve(__dirname, '../db/docker-entrypoint-initdb.d/init.sql');

// =============================================================================
// Table List (for truncation)
// =============================================================================

const TABLES = [
  'task_logs',
  'verification_tasks',
  'verification_history',
  'evidence_uploads',
  'systems',
  'activity_log',
  'users',
];

// =============================================================================
// Global Lifecycle Hooks
// =============================================================================

beforeAll(async () => {
  // ── Connect to PostgreSQL ────────────────────────────────────────────────
  try {
    await pool.query('SELECT 1');
    // eslint-disable-next-line no-console
    console.log(`[setup] Connected to test DB: ${testDbConfig.database}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[setup] Failed to connect to test DB: ${testDbConfig.database}`);
    // eslint-disable-next-line no-console
    console.error('Make sure PostgreSQL is running and the test database exists:');
    // eslint-disable-next-line no-console
    console.error(`  CREATE DATABASE ${testDbConfig.database};`);
    throw err;
  }

  // ── Connect to Redis ─────────────────────────────────────────────────────
  try {
    await redis.connect();
    // eslint-disable-next-line no-console
    console.log('[setup] Connected to test Redis');
  } catch {
    // Redis is optional for some tests — warn but don't fail
    // eslint-disable-next-line no-console
    console.warn('[setup] Redis connection failed — tests using Redis will be skipped');
  }

  // ── Run migrations ───────────────────────────────────────────────────────
  await runMigrations();

  // ── Clean up upload directory ────────────────────────────────────────────
  const uploadDir = process.env.UPLOAD_DIR || '/tmp/test-uploads';
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
  fs.mkdirSync(uploadDir, { recursive: true });
});

beforeEach(async () => {
  // ── Truncate all tables and reset sequences ──────────────────────────────
  await truncateTables();

  // ── Clean Redis test DB ──────────────────────────────────────────────────
  try {
    await redis.flushdb();
  } catch {
    // Redis not available — skip
  }

  // ── Seed minimal data ────────────────────────────────────────────────────
  await seedMinimalData();
});

afterAll(async () => {
  // ── Clean up uploads ─────────────────────────────────────────────────────
  const uploadDir = process.env.UPLOAD_DIR || '/tmp/test-uploads';
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  // ── Close Redis ──────────────────────────────────────────────────────────
  try {
    await redis.flushdb();
    await redis.quit();
  } catch {
    // ignore
  }

  // ── Close PostgreSQL pool ────────────────────────────────────────────────
  await pool.end();
  // eslint-disable-next-line no-console
  console.log('[setup] Test DB pool closed');
});

// =============================================================================
// Migration Runner
// =============================================================================

async function runMigrations(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[setup] Running database migrations...');

  let client: PoolClient | null = null;

  try {
    client = await pool.connect();

    // Try init.sql first (creates schema + seed in one file)
    if (fs.existsSync(INIT_SQL_PATH)) {
      const initSql = fs.readFileSync(INIT_SQL_PATH, 'utf-8');
      await client.query(initSql);
      // eslint-disable-next-line no-console
      console.log('[setup] Applied init.sql');
    }

    // Apply schema.sql (idempotent — uses IF NOT EXISTS)
    if (fs.existsSync(SCHEMA_SQL_PATH)) {
      const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf-8');
      await client.query(schemaSql);
      // eslint-disable-next-line no-console
      console.log('[setup] Applied schema.sql');
    }

    // Apply seed data
    if (fs.existsSync(SEED_SQL_PATH)) {
      const seedSql = fs.readFileSync(SEED_SQL_PATH, 'utf-8');
      await client.query(seedSql);
      // eslint-disable-next-line no-console
      console.log('[setup] Applied seed data');
    }
  } finally {
    if (client) client.release();
  }
}

// =============================================================================
// Table Truncation
// =============================================================================

async function truncateTables(): Promise<void> {
  // Disable triggers to avoid interference from foreign keys
  const truncateSql = `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`;
  await pool.query(truncateSql);
}

// =============================================================================
// Minimal Seed Data
// =============================================================================

async function seedMinimalData(): Promise<void> {
  // Insert a default admin user for tests that don't call createTestUser
  const passwordHash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/IyK'; // hash of "TestPass123!"

  await pool.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (email) DO NOTHING`,
    [
      '11111111-1111-1111-1111-111111111111',
      'admin@test.local',
      passwordHash,
      'Admin',
      'User',
      'admin',
    ]
  );
}

// =============================================================================
// Helper: createTestUser
// =============================================================================

/**
 * Create a test user in the database and generate JWT tokens.
 *
 * @param options - Override default test user properties
 * @returns TestUser with id, email, tokens
 *
 * @example
 *   const user = await createTestUser({ role: 'admin' });
 *   const res = await request(app)
 *     .get('/api/systems')
 *     .set(authHeaders(user.accessToken));
 */
global.createTestUser = async function (options: CreateTestUserOptions = {}): Promise<TestUser> {
  const {
    email = `test-${Date.now()}@example.com`,
    password = 'TestPass123!',
    firstName = 'Test',
    lastName = 'User',
    role = 'viewer',
  } = options;

  // Generate a UUID
  const userId = crypto.randomUUID();

  // Hash password
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 10);

  // Map role for DB
  const dbRole = role === 'analyst' ? 'reviewer' : role;

  // Insert user
  const result = await pool.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id`,
    [userId, email, passwordHash, firstName, lastName, dbRole]
  );

  const id = result.rows[0].id;

  // Generate tokens
  const accessToken = generateAccessToken(id, role);
  const refreshToken = generateRefreshToken(id);

  // Store refresh token hash in Redis
  const { createHash } = await import('crypto');
  const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
  await redis.setex(`refresh:${id}`, 7 * 24 * 60 * 60, refreshHash);

  return {
    id,
    email,
    firstName,
    lastName,
    role,
    accessToken,
    refreshToken,
  };
};

// =============================================================================
// Helper: authHeaders
// =============================================================================

/**
 * Build an Authorization header object for use with supertest.
 *
 * @param token - JWT access token
 * @returns Object with Authorization header
 *
 * @example
 *   .set(authHeaders(user.accessToken))
 */
global.authHeaders = function (token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
};

// =============================================================================
// Additional Helpers (exported for test files)
// =============================================================================

/**
 * Insert a test system directly into the database.
 */
export async function createTestSystem(
  overrides: Partial<{
    name: string;
    description: string;
    type: string;
    status: string;
    verificationScore: number;
    tags: string[];
    createdBy: string;
  }> = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const {
    name = `Test System ${Date.now()}`,
    description = 'A test system',
    type = 'api',
    status = 'unknown',
    verificationScore = 0,
    tags = [],
    createdBy = null,
  } = overrides;

  await pool.query(
    `INSERT INTO systems (id, name, description, type, status, verification_score, tags, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [id, name, description, type, status, verificationScore, tags, createdBy]
  );

  return id;
}

/**
 * Insert test evidence directly into the database.
 */
export async function createTestEvidence(
  overrides: Partial<{
    systemId: string;
    uploadedBy: string;
    filename: string;
    originalName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    evidenceType: string;
    status: string;
  }> = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const {
    systemId,
    uploadedBy = null,
    filename = 'test-evidence.pdf',
    originalName = 'test-evidence.pdf',
    filePath = '/tmp/test-uploads/test-evidence.pdf',
    fileSize = 1024,
    mimeType = 'application/pdf',
    evidenceType = 'audit_report',
    status = 'pending',
  } = overrides;

  await pool.query(
    `INSERT INTO evidence_uploads (
       id, system_id, uploaded_by, filename, original_name, file_path,
       file_size, mime_type, evidence_type, status, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
    [id, systemId, uploadedBy, filename, originalName, filePath, fileSize, mimeType, evidenceType, status]
  );

  return id;
}

/**
 * Insert a test verification task directly into the database.
 */
export async function createTestTask(
  overrides: Partial<{
    systemId: string;
    taskId: string;
    taskType: string;
    priority: string;
    status: string;
    createdBy: string;
  }> = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const {
    systemId,
    taskId = `VT-${String(Date.now()).slice(-8)}`,
    taskType = 'code_scan',
    priority = 'normal',
    status = 'pending',
    createdBy = '11111111-1111-1111-1111-111111111111',
  } = overrides;

  await pool.query(
    `INSERT INTO verification_tasks (
       id, task_id, system_id, task_type, priority, status, created_by, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
    [id, taskId, systemId, taskType, priority, status, createdBy]
  );

  return id;
}

/**
 * Insert test activity log entries.
 */
export async function createTestActivity(
  count: number = 5,
  overrides: Partial<{
    actorId: string;
    actionType: string;
    entityType: string;
  }> = {}
): Promise<void> {
  const { actorId = null, actionType = 'test_action', entityType = 'system' } = overrides;

  for (let i = 0; i < count; i++) {
    await pool.query(
      `INSERT INTO activity_log (actor_id, action_type, entity_type, entity_id, description, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${i} minutes')`,
      [actorId, actionType, entityType, crypto.randomUUID(), `Test activity ${i + 1}`]
    );
  }
}

/**
 * Insert test verification history entries for a system.
 */
export async function createTestHistory(
  systemId: string,
  count: number = 3
): Promise<void> {
  const eventTypes = ['scan_initiated', 'scan_completed', 'review_started', 'review_completed'];

  for (let i = 0; i < count; i++) {
    await pool.query(
      `INSERT INTO verification_history (system_id, event_type, description, performed_by, created_at)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${i} hours')`,
      [
        systemId,
        eventTypes[i % eventTypes.length],
        `History event ${i + 1}`,
        '11111111-1111-1111-1111-111111111111',
      ]
    );
  }
}
