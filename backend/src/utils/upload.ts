/**
 * Multer Upload Configuration
 *
 * Pre-configured Multer instance with security-hardened settings:
 * - Disk storage with UUID-based filenames (prevents overwrite attacks)
 * - Strict file-type filtering (whitelist approach)
 * - Size limits and count caps
 * - MIME type detection from file extension
 */

import { randomUUID } from 'crypto';
import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { extname } from 'path';
import { UPLOAD_DIR } from './fileStorage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size: 50 MB */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum files per upload request */
export const MAX_FILES_PER_UPLOAD = 10;

/** Whitelist of allowed file extensions */
export const ALLOWED_EXTENSIONS = new Set([
  '.zip',
  '.pdf',
  '.json',
  '.xml',
  '.sarif',
  '.txt',
]);

/** Human-readable allowed extensions for error messages */
export const ALLOWED_EXTENSIONS_STR = '.zip, .pdf, .json, .xml, .sarif, .txt';

// ---------------------------------------------------------------------------
// MIME Type Mapping
// ---------------------------------------------------------------------------

/**
 * Detect MIME type from file extension.
 *
 * @param ext — Lowercase file extension (e.g. '.pdf')
 * @returns   — MIME type string or 'application/octet-stream'
 */
export function detectMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.zip': 'application/zip',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.sarif': 'application/sarif+json',
    '.txt': 'text/plain',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Map a file extension to an internal evidence_type enum value
 * used by the database schema.
 *
 * @param ext — Lowercase file extension
 * @returns   — evidence_type enum value
 */
export function extensionToEvidenceType(ext: string): string {
  const mapping: Record<string, string> = {
    '.zip': 'dependency_check',
    '.pdf': 'audit_report',
    '.json': 'static_analysis',
    '.xml': 'config_review',
    '.sarif': 'static_analysis',
    '.txt': 'code_scan',
  };
  return mapping[ext.toLowerCase()] || 'code_scan';
}

// ---------------------------------------------------------------------------
// Multer Storage Engine
// ---------------------------------------------------------------------------

const evidenceStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniquePrefix = randomUUID();
    // Sanitise original name: strip path components and non-alphanumeric chars
    const cleanOriginal = file.originalname
      .replace(/\\/g, '_')
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${uniquePrefix}_${cleanOriginal}`;
    cb(null, uniqueName);
  },
});

// ---------------------------------------------------------------------------
// File Filter (Whitelist)
// ---------------------------------------------------------------------------

const evidenceFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void => {
  const ext = extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const err = new Error(
      `File type not allowed: "${ext}". Allowed types: ${ALLOWED_EXTENSIONS_STR}`,
    );
    err.name = 'FileTypeError';
    return cb(err as any, false);
  }

  // Override multer's auto mime-type detection with our explicit mapping
  // to avoid browsers sending incorrect MIME types
  file.mimetype = detectMimeType(ext);

  cb(null, true);
};

// ---------------------------------------------------------------------------
// Error Code → HTTP Status Mapping
// ---------------------------------------------------------------------------

/**
 * Convert a Multer error code to an HTTP status code and user-friendly message.
 */
export function mapMulterError(
  err: any,
): { status: number; code: string; message: string } {
  const code = err.code || 'UNKNOWN_UPLOAD_ERROR';

  switch (code) {
    case 'LIMIT_FILE_SIZE':
      return {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: `File exceeds maximum size limit of ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      };
    case 'LIMIT_FILE_COUNT':
      return {
        status: 400,
        code: 'TOO_MANY_FILES',
        message: `Maximum ${MAX_FILES_PER_UPLOAD} files allowed per upload`,
      };
    case 'LIMIT_UNEXPECTED_FILE':
      return {
        status: 400,
        code: 'UNEXPECTED_FIELD',
        message: 'Unexpected form field. Expected field name: "files"',
      };
    case 'LIMIT_PART_COUNT':
      return {
        status: 400,
        code: 'TOO_MANY_PARTS',
        message: 'Too many parts in multipart request',
      };
    default:
      if (err.name === 'FileTypeError') {
        return {
          status: 400,
          code: 'INVALID_FILE_TYPE',
          message: err.message,
        };
      }
      return {
        status: 500,
        code: 'UPLOAD_ERROR',
        message: err.message || 'An error occurred during file upload',
      };
  }
}

// ---------------------------------------------------------------------------
// Configured Multer Instance
// ---------------------------------------------------------------------------

/** Pre-configured multer middleware for evidence file uploads */
export const evidenceUpload = multer({
  storage: evidenceStorage,
  fileFilter: evidenceFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_UPLOAD,
    parts: MAX_FILES_PER_UPLOAD + 5, // files + metadata fields
    fieldNameSize: 100,
    fieldSize: 10 * 1024, // 10 KB for form fields
  },
});

/** Middleware factory for single-file uploads */
export function singleEvidenceUpload(fieldName: string = 'file') {
  return evidenceUpload.single(fieldName);
}

/** Middleware factory for multi-file uploads */
export function arrayEvidenceUpload(
  fieldName: string = 'files',
  maxCount: number = MAX_FILES_PER_UPLOAD,
) {
  return evidenceUpload.array(fieldName, maxCount);
}
