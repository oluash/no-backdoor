/**
 * File Storage Utilities
 *
 * Low-level file operations for the evidence upload service.
 * Handles saving, deleting, path resolution, and integrity verification.
 */

import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  promises as fsPromises,
} from 'fs';
import { dirname, join, resolve } from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Base directory for all uploaded evidence files */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || resolve(process.cwd(), 'uploads', 'evidence');

/** Ensure the upload directory exists */
function ensureUploadDir(): void {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

// Initialise on module load
ensureUploadDir();

// ---------------------------------------------------------------------------
// Core File Operations
// ---------------------------------------------------------------------------

/**
 * Save a file buffer to the upload directory.
 *
 * @param buffer   — Raw file bytes
 * @param filename — Unique destination filename (UUID + original name)
 * @returns        — Absolute path where the file was written
 * @throws Error if the write fails
 */
export async function saveFile(buffer: Buffer, filename: string): Promise<string> {
  ensureUploadDir();
  const filePath = getFilePath(filename);
  await fsPromises.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Delete a file from the upload directory.
 *
 * @param filename — Name of the file to remove
 * @returns        — True if deleted (or did not exist), false on error
 */
export async function deleteFile(filename: string): Promise<boolean> {
  try {
    const filePath = getFilePath(filename);
    if (existsSync(filePath)) {
      await fsPromises.unlink(filePath);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a filename to its full absolute path inside UPLOAD_DIR.
 *
 * @param filename — Uploaded filename
 * @returns        — Absolute filesystem path
 */
export function getFilePath(filename: string): string {
  // Prevent directory traversal: basename only
  const safeName = filename.replace(/\//g, '').replace(/\\/g, '');
  return join(UPLOAD_DIR, safeName);
}

/**
 * Compute the SHA-256 hex checksum of a file.
 *
 * @param filePath — Absolute path to the file
 * @returns        — 64-character hex digest
 * @throws Error if the file cannot be read
 */
export async function computeChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = await fsPromises.readFile(filePath);
  hash.update(stream);
  return hash.digest('hex');
}

/**
 * Synchronous checksum helper for use after multer has already written the file.
 *
 * @param filePath — Absolute path to the file
 * @returns        — 64-character hex digest
 */
export function computeChecksumSync(filePath: string): string {
  const { readFileSync } = require('fs');
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Check whether a file exists on disk.
 *
 * @param filePath — Absolute path to check
 * @returns        — True if the file exists and is readable
 */
export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Read a file into a buffer.
 *
 * @param filePath — Absolute path to the file
 * @returns        — File contents as a Buffer
 */
export async function readFile(filePath: string): Promise<Buffer> {
  return fsPromises.readFile(filePath);
}

/**
 * Get file stats (size, modified time, etc.).
 *
 * @param filePath — Absolute path to the file
 * @returns        — fs.Stats object
 */
export async function getFileStats(filePath: string) {
  return fsPromises.stat(filePath);
}

/**
 * Create a readable stream for a file.
 *
 * @param filePath — Absolute path to the file
 * @returns        — fs.ReadStream
 */
export function createReadStream(filePath: string): NodeJS.ReadableStream {
  const { createReadStream: crs } = require('fs');
  return crs(filePath);
}

// ---------------------------------------------------------------------------
// Security Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a resolved file path stays within the upload directory.
 * Guards against path-traversal attacks.
 *
 * @param resolvedPath — Path to validate
 * @returns            — True if the path is inside UPLOAD_DIR
 */
export function isPathSafe(resolvedPath: string): boolean {
  const uploadDir = resolve(UPLOAD_DIR);
  const resolved = resolve(resolvedPath);
  return resolved.startsWith(uploadDir);
}
