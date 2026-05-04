/**
 * No-Backdoor System Architecture — Structured Logger
 *
 * Simple console-based logger with log levels, timestamps, and structured metadata.
 * No external dependencies (no winston) — keeps the Docker image lean.
 *
 * Provides:
 *   - Log levels: error, warn, info, debug
 *   - Timestamps in ISO format
 *   - Metadata serialization
 *   - Express request logging middleware
 *   - Test mode silence
 */

import type { Request, Response, NextFunction } from 'express';

// =============================================================================
// Log Levels
// =============================================================================

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[90m', // Grey
};

const RESET_COLOR = '\x1b[0m';

// =============================================================================
// Current log level (configurable via env)
// =============================================================================

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const IS_TEST = process.env.NODE_ENV === 'test';

// =============================================================================
// Logger Interface
// =============================================================================

export interface Logger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  silent: boolean;
}

// =============================================================================
// Logger Implementation
// =============================================================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (value instanceof Error) {
        cleaned[key] = { message: value.message, stack: value.stack };
      } else if (typeof value === 'object' && value !== null) {
        cleaned[key] = value;
      } else {
        cleaned[key] = value;
      }
    }
    return ` ${JSON.stringify(cleaned)}`;
  } catch {
    return '';
  }
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (IS_TEST) return;
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const color = LOG_COLORS[level];
  const metaStr = formatMeta(meta);

  const formatted = `${timestamp} [${color}${level.toUpperCase()}${RESET_COLOR}]: ${message}${metaStr}`;

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
      break;
  }
}

export const logger: Logger = {
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  silent: false,
};

// =============================================================================
// Express Request Logging Middleware
// =============================================================================

/**
 * Express middleware that logs incoming requests and their duration.
 * Attaches a request ID to each request for traceability.
 */
export function attachLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Generate a simple request ID
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  (req as any).requestId = requestId;

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('Request completed', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      userAgent: req.get('user-agent'),
    });
  });

  next();
}

export default logger;
