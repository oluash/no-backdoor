/**
 * No-Backdoor System Architecture — Centralized Configuration
 *
 * All environment variables with defaults, validation, and typed config objects
 * for database and Redis connections. Throws on missing critical values.
 */

import { config } from 'dotenv';

// Load .env file before any config is read
config();

// =============================================================================
// Environment & Server
// =============================================================================

export const NODE_ENV = (process.env.NODE_ENV || 'development') as
  | 'development'
  | 'test'
  | 'production';

export const IS_DEV = NODE_ENV === 'development';
export const IS_TEST = NODE_ENV === 'test';
export const IS_PROD = NODE_ENV === 'production';

export const PORT = parseInt(process.env.PORT || '3000', 10);

/** Request ID header name */
export const REQUEST_ID_HEADER = 'x-request-id';

// =============================================================================
// Database (PostgreSQL)
// =============================================================================

/** Full connection string (takes priority over individual DB_* vars) */
export const DATABASE_URL = process.env.DATABASE_URL;

export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
export const DB_NAME = process.env.DB_NAME || 'nobackdoor';
export const DB_USER = process.env.DB_USER || 'postgres';
export const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

/** Maximum connections in the PostgreSQL pool */
export const DB_POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || '20', 10);

/** Query timeout in milliseconds */
export const DB_QUERY_TIMEOUT = parseInt(
  process.env.DB_QUERY_TIMEOUT || '30000',
  10
);

/** Connection timeout in milliseconds */
export const DB_CONNECT_TIMEOUT = parseInt(
  process.env.DB_CONNECT_TIMEOUT || '10000',
  10
);

/** Idle timeout in milliseconds */
export const DB_IDLE_TIMEOUT = parseInt(
  process.env.DB_IDLE_TIMEOUT || '30000',
  10
);

/** SSL mode for database connection */
export const DB_SSL = process.env.DB_SSL === 'true';

/** PostgreSQL pool configuration object for `pg` */
export const dbPoolConfig = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
      max: DB_POOL_SIZE,
      idleTimeoutMillis: DB_IDLE_TIMEOUT,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT,
      query_timeout: DB_QUERY_TIMEOUT,
      ssl: {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      },
    }
  : {
      host: DB_HOST,
      port: DB_PORT,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
      max: DB_POOL_SIZE,
      idleTimeoutMillis: DB_IDLE_TIMEOUT,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT,
      query_timeout: DB_QUERY_TIMEOUT,
      ssl: DB_SSL
        ? {
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          }
        : false,
    };

// =============================================================================
// Redis
// =============================================================================

export const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
export const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

/** Redis connection retry max attempts */
export const REDIS_MAX_RETRIES = parseInt(
  process.env.REDIS_MAX_RETRIES || '10',
  10
);

/** Redis connection retry delay in milliseconds */
export const REDIS_RETRY_DELAY = parseInt(
  process.env.REDIS_RETRY_DELAY || '1000',
  10
);

/** Redis key prefix for namespacing */
export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'nb:';

/** Redis configuration object for `ioredis` */
export const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  db: REDIS_DB,
  maxRetriesPerRequest: REDIS_MAX_RETRIES,
  retryStrategy: (times: number): number => {
    const delay = Math.min(times * REDIS_RETRY_DELAY, 5000);
    return delay;
  },
  showFriendlyErrorStack: IS_DEV,
  keyPrefix: REDIS_KEY_PREFIX,
  lazyConnect: true,
};

// =============================================================================
// JWT Authentication
// =============================================================================

export const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && !IS_TEST) {
  throw new Error(
    'JWT_SECRET environment variable is required (except in test environment)'
  );
}

/** Secret used for signing access tokens */
export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || JWT_SECRET || 'dev-secret-change-me';

/** Secret used for signing refresh tokens */
export const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || JWT_ACCESS_SECRET;

/** Access token expiry in seconds (default: 1 hour) */
export const JWT_ACCESS_EXPIRY = parseInt(
  process.env.JWT_ACCESS_EXPIRY || '3600',
  10
);

/** Refresh token expiry in seconds (default: 7 days) */
export const JWT_REFRESH_EXPIRY = parseInt(
  process.env.JWT_REFRESH_EXPIRY || '604800',
  10
);

/** JWT issuer claim */
export const JWT_ISSUER = process.env.JWT_ISSUER || 'no-backdoor-api';

/** JWT audience claim */
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'no-backdoor-client';

// =============================================================================
// Upload / File Handling
// =============================================================================

/** Maximum file upload size in bytes (default: 100MB) */
export const UPLOAD_MAX_SIZE = parseInt(
  process.env.UPLOAD_MAX_SIZE || '104857600',
  10
);

/** Maximum files per upload request */
export const UPLOAD_MAX_FILES = parseInt(
  process.env.UPLOAD_MAX_FILES || '10',
  10
);

/** Directory for temporary upload storage */
export const UPLOAD_TEMP_DIR =
  process.env.UPLOAD_TEMP_DIR || '/tmp/nobackdoor-uploads';

/** Allowed MIME types for evidence uploads */
export const UPLOAD_ALLOWED_TYPES = (
  process.env.UPLOAD_ALLOWED_TYPES ||
  'image/jpeg,image/png,image/gif,application/pdf,text/plain,text/markdown,application/zip,application/x-zip-compressed,application/json'
).split(',');

// =============================================================================
// CORS
// =============================================================================

/** Allowed CORS origins (comma-separated, or * for all in dev) */
export const CORS_ORIGINS = (
  process.env.CORS_ORIGINS || (IS_DEV ? '*' : '')
).split(',');

/** CORS credentials support */
export const CORS_CREDENTIALS = process.env.CORS_CREDENTIALS !== 'false';

/** Allowed CORS methods */
export const CORS_METHODS =
  process.env.CORS_METHODS || 'GET,POST,PUT,PATCH,DELETE,OPTIONS';

/** Allowed CORS headers */
export const CORS_ALLOWED_HEADERS =
  process.env.CORS_ALLOWED_HEADERS ||
  'Content-Type,Authorization,X-Request-Id';

// =============================================================================
// Rate Limiting
// =============================================================================

/** Enable rate limiting (default: true, disabled in test) */
export const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false' && !IS_TEST;

/** General API rate limit: max requests per window (default: 100) */
export const RATE_LIMIT_GENERAL_MAX = parseInt(
  process.env.RATE_LIMIT_GENERAL_MAX || '100',
  10
);

/** General API rate limit window in milliseconds (default: 15 minutes) */
export const RATE_LIMIT_GENERAL_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_GENERAL_WINDOW_MS || '900000',
  10
);

/** Upload endpoint rate limit: max requests per window (default: 10) */
export const RATE_LIMIT_UPLOAD_MAX = parseInt(
  process.env.RATE_LIMIT_UPLOAD_MAX || '10',
  10
);

/** Upload endpoint rate limit window in milliseconds (default: 15 minutes) */
export const RATE_LIMIT_UPLOAD_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || '900000',
  10
);

/** Auth endpoint rate limit: max requests per window (default: 20) */
export const RATE_LIMIT_AUTH_MAX = parseInt(
  process.env.RATE_LIMIT_AUTH_MAX || '20',
  10
);

/** Auth endpoint rate limit window in milliseconds (default: 15 minutes) */
export const RATE_LIMIT_AUTH_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_AUTH_WINDOW_MS || '900000',
  10
);

// =============================================================================
// WebSocket
// =============================================================================

/** WebSocket server path */
export const WS_PATH = process.env.WS_PATH || '/ws';

/** WebSocket heartbeat interval in milliseconds */
export const WS_HEARTBEAT_INTERVAL = parseInt(
  process.env.WS_HEARTBEAT_INTERVAL || '30000',
  10
);

/** WebSocket ping timeout in milliseconds */
export const WS_PING_TIMEOUT = parseInt(
  process.env.WS_PING_TIMEOUT || '60000',
  10
);

// =============================================================================
// Logging
// =============================================================================

/** Log level (default: debug in dev, info in prod) */
export const LOG_LEVEL = process.env.LOG_LEVEL || (IS_DEV ? 'debug' : 'info');

/** Log directory for file transports */
export const LOG_DIR = process.env.LOG_DIR || 'logs';

// =============================================================================
// Feature Flags
// =============================================================================

/** Enable request/response body logging in dev */
export const LOG_HTTP_BODIES = IS_DEV && process.env.LOG_HTTP_BODIES === 'true';

/** Enable detailed error stack traces in responses (dev only) */
export const EXPOSE_STACK_TRACES = IS_DEV;
