/**
 * Simplified working backend for No-Backdoor System
 * This is a production-ready Express API that compiles without errors
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Pool } from 'pg';
import Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ── CONFIG ────────────────────────────────────────────────────────────────
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '52428800', 10);

const DB_HOST = process.env.DB_HOST || 'postgres';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'no_backdoor';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// ── DATABASE ──────────────────────────────────────────────────────────────
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// ── HELPERS ───────────────────────────────────────────────────────────────
const hashPassword = (pwd: string) => bcrypt.hashSync(pwd, 12);
const comparePassword = (pwd: string, hash: string) => bcrypt.compareSync(pwd, hash);
const generateAccessToken = (userId: string, role: string) =>
  jwt.sign({ userId, role, type: 'access' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
const generateRefreshToken = (userId: string) =>
  jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
const verifyToken = (token: string) => jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

const success = (res: express.Response, data: any, meta?: any) =>
  res.json({ success: true, data, meta });
const error = (res: express.Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, error: { code, message } });

const generateTaskId = () => {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `VT-${num}`;
};

const paginate = async (sql: string, params: any[], page: number, limit: number) => {
  const offset = (page - 1) * limit;
  const countSql = `SELECT COUNT(*) FROM (${sql}) AS t`;
  const countResult = await pool.query(countSql, params);
  const total = parseInt(countResult.rows[0].count, 10);
  const dataSql = `${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const result = await pool.query(dataSql, [...params, limit, offset]);
  return {
    data: result.rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return error(res, 401, 'UNAUTHORIZED', 'Missing or invalid token');
  }
  try {
    const token = auth.slice(7);
    const decoded = verifyToken(token);
    (req as any).user = decoded;
    next();
  } catch {
    return error(res, 401, 'UNAUTHORIZED', 'Invalid token');
  }
};

const requireRole = (...roles: string[]) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      return error(res, 403, 'FORBIDDEN', 'Insufficient permissions');
    }
    next();
  };

// ── FILE UPLOAD SETUP ──────────────────────────────────────────────────────
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.zip', '.pdf', '.json', '.xml', '.sarif', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ── EXPRESS APP ───────────────────────────────────────────────────────────
const app = express();
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// ── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// ── AUTH ROUTES ───────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) return error(res, 400, 'BAD_REQUEST', 'Email and password required');

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) return error(res, 409, 'CONFLICT', 'Email already registered');

    const id = uuidv4();
    const hash = hashPassword(password);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at)
       VALUES ($1, $2, $3, $4, $5, 'viewer', NOW())`,
      [id, email, hash, firstName || '', lastName || '']
    );

    const accessToken = generateAccessToken(id, 'viewer');
    const refreshToken = generateRefreshToken(id);
    await redis.setex(`refresh:${id}`, 7 * 24 * 3600, refreshToken);

    success(res, { id, email, firstName, lastName, role: 'viewer', accessToken, refreshToken });
  } catch (e) {
    console.error(e);
    error(res, 500, 'INTERNAL_ERROR', 'Registration failed');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !comparePassword(password, user.password_hash)) {
      return error(res, 401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await redis.setex(`refresh:${user.id}`, 7 * 24 * 3600, refreshToken);

    success(res, {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      accessToken,
      refreshToken,
    });
  } catch (e) {
    console.error(e);
    error(res, 500, 'INTERNAL_ERROR', 'Login failed');
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
    const stored = await redis.get(`refresh:${decoded.userId}`);
    if (!stored || stored !== refreshToken) return error(res, 401, 'UNAUTHORIZED', 'Invalid refresh token');

    const user = await pool.query('SELECT id, role FROM users WHERE id = $1', [decoded.userId]);
    if (!user.rows[0]) return error(res, 401, 'UNAUTHORIZED', 'User not found');

    const newAccess = generateAccessToken(user.rows[0].id, user.rows[0].role);
    const newRefresh = generateRefreshToken(user.rows[0].id);
    await redis.setex(`refresh:${user.rows[0].id}`, 7 * 24 * 3600, newRefresh);

    success(res, { accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    error(res, 401, 'UNAUTHORIZED', 'Invalid refresh token');
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, role, avatar_url, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (!result.rows[0]) return error(res, 404, 'NOT_FOUND', 'User not found');
    const u = result.rows[0];
    success(res, { id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, role: u.role });
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get profile');
  }
});

// ── DASHBOARD ROUTES ─────────────────────────────────────────────────────
app.get('/api/metrics/summary', requireAuth, async (_req, res) => {
  try {
    const systems = await pool.query("SELECT status, COUNT(*) FROM systems GROUP BY status");
    const tasks = await pool.query("SELECT status, COUNT(*) FROM verification_tasks GROUP BY status");
    const evidence = await pool.query("SELECT status, COUNT(*) FROM evidence_uploads GROUP BY status");

    const summary = {
      verifiedSystems: parseInt(systems.rows.find((r: any) => r.status === 'verified')?.count || 0, 10),
      pendingReviews: parseInt(systems.rows.find((r: any) => r.status === 'pending')?.count || 0, 10),
      activeThreats: parseInt(systems.rows.find((r: any) => r.status === 'threat')?.count || 0, 10),
      queueDepth: parseInt(tasks.rows.find((r: any) => r.status === 'pending')?.count || 0, 10),
      totalTasks: parseInt(tasks.rows[0]?.count || 0, 10),
      totalEvidence: parseInt(evidence.rows[0]?.count || 0, 10),
    };
    success(res, summary);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get metrics');
  }
});

app.get('/api/metrics/trends', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT DATE(created_at) as date, status, COUNT(*) as count
      FROM verification_tasks
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at), status
      ORDER BY date
    `);
    success(res, result.rows);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get trends');
  }
});

app.get('/api/metrics/status', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query("SELECT status, COUNT(*) FROM systems GROUP BY status");
    success(res, result.rows);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get status');
  }
});

app.get('/api/activity/recent', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '10', 10);
    const result = await paginate(
      `SELECT a.*, u.first_name, u.last_name FROM activity_log a
       LEFT JOIN users u ON a.actor_id = u.id ORDER BY a.created_at DESC`,
      [], page, limit
    );
    success(res, result.data, result.meta);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get activity');
  }
});

// ── EVIDENCE ROUTES ────────────────────────────────────────────────────────
app.post('/api/evidence/upload', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    const files = (req as any).files || [];
    const { systemId, description, evidenceType, priority, tags } = req.body;
    const userId = (req as any).user.userId;

    const uploads = [];
    for (const file of files) {
      const id = uuidv4();
      const checksum = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
      const result = await pool.query(
        `INSERT INTO evidence_uploads (id, system_id, uploaded_by, filename, original_name, file_path, file_size, mime_type, evidence_type, description, priority, tags, status, checksum, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, NOW()) RETURNING *`,
        [id, systemId || null, userId, file.filename, file.originalname, file.path, file.size, file.mimetype, evidenceType || 'code_scan', description || '', priority || 'medium', tags ? tags.split(',') : [], checksum]
      );
      uploads.push(result.rows[0]);
    }
    success(res, { uploads, count: uploads.length });
  } catch (e) {
    console.error(e);
    error(res, 500, 'INTERNAL_ERROR', 'Upload failed');
  }
});

app.get('/api/evidence', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const status = req.query.status as string;
    const type = req.query.type as string;

    let where = '';
    const params: any[] = [];
    if (status) { where += ` AND status = $${params.length + 1}`; params.push(status); }
    if (type) { where += ` AND evidence_type = $${params.length + 1}`; params.push(type); }

    const result = await paginate(
      `SELECT e.*, s.name as system_name FROM evidence_uploads e
       LEFT JOIN systems s ON e.system_id = s.id WHERE 1=1 ${where} ORDER BY e.created_at DESC`,
      params, page, limit
    );
    success(res, result.data, result.meta);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to list evidence');
  }
});

app.get('/api/evidence/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT e.*, s.name as system_name FROM evidence_uploads e LEFT JOIN systems s ON e.system_id = s.id WHERE e.id = $1',
      [req.params.id]
    );
    if (!result.rows[0]) return error(res, 404, 'NOT_FOUND', 'Evidence not found');
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get evidence');
  }
});

app.delete('/api/evidence/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT file_path FROM evidence_uploads WHERE id = $1', [req.params.id]);
    if (result.rows[0]?.file_path) fs.unlinkSync(result.rows[0].file_path);
    await pool.query('DELETE FROM evidence_uploads WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to delete evidence');
  }
});

// ── PORTFOLIO (SYSTEMS) ROUTES ────────────────────────────────────────────
app.get('/api/systems', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const search = req.query.search as string;
    const status = req.query.status as string;
    const type = req.query.type as string;

    let where = '';
    const params: any[] = [];
    if (search) { where += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`; params.push(`%${search}%`); }
    if (status) { where += ` AND status = $${params.length + 1}`; params.push(status); }
    if (type) { where += ` AND type = $${params.length + 1}`; params.push(type); }

    const result = await paginate(
      `SELECT s.*, u.first_name as creator_name FROM systems s
       LEFT JOIN users u ON s.created_by = u.id WHERE 1=1 ${where} ORDER BY s.created_at DESC`,
      params, page, limit
    );
    success(res, result.data, result.meta);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to list systems');
  }
});

app.post('/api/systems', requireAuth, async (req, res) => {
  try {
    const { name, version, description, type, tags } = req.body;
    const userId = (req as any).user.userId;
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO systems (id, name, version, description, type, status, verification_score, tags, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, $7, NOW()) RETURNING *`,
      [id, name, version || '', description || '', type || 'api', tags ? tags.split(',') : [], userId]
    );
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to create system');
  }
});

app.get('/api/systems/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.first_name as creator_name FROM systems s
       LEFT JOIN users u ON s.created_by = u.id WHERE s.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return error(res, 404, 'NOT_FOUND', 'System not found');

    const evidence = await pool.query('SELECT id, filename, status, created_at FROM evidence_uploads WHERE system_id = $1', [req.params.id]);
    const history = await pool.query(
      'SELECT h.*, u.first_name FROM verification_history h LEFT JOIN users u ON h.performed_by = u.id WHERE h.system_id = $1 ORDER BY h.created_at DESC',
      [req.params.id]
    );

    success(res, { ...result.rows[0], evidence: evidence.rows, history: history.rows });
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get system');
  }
});

app.put('/api/systems/:id', requireAuth, async (req, res) => {
  try {
    const { name, version, description, type, status, tags } = req.body;
    const result = await pool.query(
      `UPDATE systems SET name = $1, version = $2, description = $3, type = $4, status = $5, tags = $6, updated_at = NOW() WHERE id = $7 RETURNING *`,
      [name, version, description, type, status, tags ? tags.split(',') : [], req.params.id]
    );
    if (!result.rows[0]) return error(res, 404, 'NOT_FOUND', 'System not found');
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to update system');
  }
});

app.delete('/api/systems/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM systems WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to delete system');
  }
});

// ── QUEUE ROUTES ──────────────────────────────────────────────────────────
app.get('/api/queue/counts', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query("SELECT status, COUNT(*) FROM verification_tasks GROUP BY status");
    const counts: any = { all: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const row of result.rows) {
      counts[row.status] = parseInt(row.count, 10);
      counts.all += parseInt(row.count, 10);
    }
    success(res, counts);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get counts');
  }
});

app.get('/api/queue/tasks', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const status = req.query.status as string;

    let where = '';
    const params: any[] = [];
    if (status) { where += ` AND t.status = $${params.length + 1}`; params.push(status); }

    const result = await paginate(
      `SELECT t.*, s.name as system_name, u.first_name as assigned_name FROM verification_tasks t
       LEFT JOIN systems s ON t.system_id = s.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE 1=1 ${where} ORDER BY t.created_at DESC`,
      params, page, limit
    );
    success(res, result.data, result.meta);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to list tasks');
  }
});

app.post('/api/queue/tasks', requireAuth, async (req, res) => {
  try {
    const { systemId, taskType, priority } = req.body;
    const userId = (req as any).user.userId;
    const id = uuidv4();
    const taskId = generateTaskId();
    const result = await pool.query(
      `INSERT INTO verification_tasks (id, task_id, system_id, task_type, priority, status, progress, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, NOW()) RETURNING *`,
      [id, taskId, systemId, taskType || 'code_scan', priority || 'normal', userId]
    );
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to create task');
  }
});

app.get('/api/queue/tasks/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, s.name as system_name FROM verification_tasks t
       LEFT JOIN systems s ON t.system_id = s.id WHERE t.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return error(res, 404, 'NOT_FOUND', 'Task not found');
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get task');
  }
});

app.put('/api/queue/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { priority, status, assignedTo } = req.body;
    const result = await pool.query(
      `UPDATE verification_tasks SET priority = $1, status = $2, assigned_to = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
      [priority, status, assignedTo, req.params.id]
    );
    if (!result.rows[0]) return error(res, 404, 'NOT_FOUND', 'Task not found');
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to update task');
  }
});

app.post('/api/queue/tasks/:id/restart', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM task_logs WHERE task_id = $1', [req.params.id]);
    const result = await pool.query(
      `UPDATE verification_tasks SET status = 'pending', progress = 0, error_message = NULL, started_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to restart task');
  }
});

app.post('/api/queue/tasks/:id/cancel', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE verification_tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    success(res, result.rows[0]);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to cancel task');
  }
});

app.delete('/api/queue/tasks/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM task_logs WHERE task_id = $1', [req.params.id]);
    await pool.query('DELETE FROM verification_tasks WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to delete task');
  }
});

app.get('/api/queue/tasks/:id/logs', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM task_logs WHERE task_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    success(res, result.rows);
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Failed to get logs');
  }
});

app.post('/api/queue/batch', requireAuth, async (req, res) => {
  try {
    const { operation, taskIds } = req.body;
    let processed = 0;
    for (const id of taskIds || []) {
      if (operation === 'delete') {
        await pool.query('DELETE FROM task_logs WHERE task_id = $1', [id]);
        await pool.query('DELETE FROM verification_tasks WHERE id = $1', [id]);
      } else if (operation === 'restart') {
        await pool.query('DELETE FROM task_logs WHERE task_id = $1', [id]);
        await pool.query(`UPDATE verification_tasks SET status = 'pending', progress = 0 WHERE id = $1`, [id]);
      } else if (operation === 'cancel') {
        await pool.query(`UPDATE verification_tasks SET status = 'cancelled' WHERE id = $1`, [id]);
      }
      processed++;
    }
    success(res, { processed, taskIds });
  } catch {
    error(res, 500, 'INTERNAL_ERROR', 'Batch operation failed');
  }
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Something went wrong' },
  });
});

app.use((_req: express.Request, res: express.Response) => {
  error(res, 404, 'NOT_FOUND', 'Endpoint not found');
});

// ── START SERVER ──────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 No-Backdoor API running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Environment: ${NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    pool.end();
    redis.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    pool.end();
    redis.disconnect();
    process.exit(0);
  });
});
