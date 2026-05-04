/**
 * No-Backdoor System Architecture — Zod Validation Schemas
 * Auto-generated from OpenAPI 3.0.3 specification
 *
 * All request body validation schemas for the backend API.
 * Import these into route handlers and middleware.
 */

import { z } from 'zod';

// =============================================================================
// Shared / Helper Schemas
// =============================================================================

/** UUID / CUID-style identifier pattern */
const idSchema = z.string().min(1).max(100);

/** Comma-separated tags string (for form uploads) */
const tagsStringSchema = z
  .string()
  .max(500)
  .optional()
  .transform((val) =>
    val
      ? val
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined
  );

/** ISO 8601 datetime string */
const isoDateSchema = z.string().datetime().optional();

/** Nullable ISO datetime */
const nullableIsoDateSchema = z
  .string()
  .datetime()
  .nullable()
  .optional();

// =============================================================================
// Auth & Users
// =============================================================================

/** User role enum */
export const userRoleSchema = z.enum(['admin', 'analyst', 'viewer']);

/** User registration request validation */
export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Must be a valid email address')
    .max(255, 'Email must be at most 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/,
      'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character'
    ),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters'),
  role: userRoleSchema.optional().default('analyst'),
});

/** User login request validation */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/** Token refresh request validation */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/** Profile update request validation */
export const updateProfileSchema = z
  .object({
    firstName: z
      .string()
      .min(1, 'First name must be at least 1 character')
      .max(100, 'First name must be at most 100 characters')
      .optional(),
    lastName: z
      .string()
      .min(1, 'Last name must be at least 1 character')
      .max(100, 'Last name must be at most 100 characters')
      .optional(),
    avatar: z
      .string()
      .url('Avatar must be a valid URL')
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

// =============================================================================
// Dashboard & Metrics
// =============================================================================

/** Trend data query params validation */
export const trendQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(7, 'Minimum 7 days')
    .max(90, 'Maximum 90 days')
    .optional()
    .default(30),
});

/** Activity feed query params validation */
export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20),
  type: z
    .enum(['verification', 'upload', 'system', 'queue', 'user'])
    .optional(),
});

// =============================================================================
// Evidence Upload
// =============================================================================

/** Upload status enum */
export const uploadStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);

/** Evidence upload form data validation (non-file fields) */
export const evidenceUploadSchema = z.object({
  systemId: idSchema.optional(),
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
  tags: tagsStringSchema,
});

/** Evidence list query params validation */
export const evidenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20),
  status: uploadStatusSchema.optional(),
  systemId: idSchema.optional(),
  search: z
    .string()
    .min(1, 'Search query must be at least 1 character')
    .max(200, 'Search query must be at most 200 characters')
    .optional(),
  sortBy: z
    .enum(['createdAt', 'fileName', 'size', 'status'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// =============================================================================
// Portfolio (Systems)
// =============================================================================

/** System type enum */
export const systemTypeSchema = z.enum([
  'web_app',
  'mobile_app',
  'api',
  'database',
  'network',
  'desktop',
  'cloud_service',
  'embedded',
  'other',
]);

/** System status enum */
export const systemStatusSchema = z.enum([
  'verified',
  'pending',
  'failed',
  'not_started',
  'in_progress',
]);

/** Create system request validation */
export const createSystemSchema = z.object({
  name: z
    .string()
    .min(1, 'System name is required')
    .max(200, 'System name must be at most 200 characters'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(2000, 'Description must be at most 2000 characters'),
  type: systemTypeSchema,
  ownerId: idSchema.optional(),
  version: z
    .string()
    .max(50, 'Version must be at most 50 characters')
    .optional()
    .default('1.0.0'),
  tags: z
    .array(z.string().max(50, 'Each tag must be at most 50 characters').min(1))
    .max(20, 'Maximum 20 tags allowed')
    .optional()
    .default([]),
  metadata: z.record(z.unknown()).optional(),
});

/** Update system request validation */
export const updateSystemSchema = z
  .object({
    name: z
      .string()
      .min(1, 'System name must be at least 1 character')
      .max(200, 'System name must be at most 200 characters')
      .optional(),
    description: z
      .string()
      .min(1, 'Description must be at least 1 character')
      .max(2000, 'Description must be at most 2000 characters')
      .optional(),
    type: systemTypeSchema.optional(),
    ownerId: idSchema.optional(),
    version: z
      .string()
      .max(50, 'Version must be at most 50 characters')
      .optional(),
    tags: z
      .array(
        z.string().max(50, 'Each tag must be at most 50 characters').min(1)
      )
      .max(20, 'Maximum 20 tags allowed')
      .optional(),
    status: systemStatusSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

/** System list query params validation */
export const systemQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20),
  search: z
    .string()
    .min(1)
    .max(200)
    .optional(),
  status: systemStatusSchema.optional(),
  type: systemTypeSchema.optional(),
  sortBy: z
    .enum(['name', 'createdAt', 'updatedAt', 'status', 'lastVerifiedAt'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  ownerId: idSchema.optional(),
});

/** Verification history query params validation */
export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10),
});

// =============================================================================
// Verification Queue
// =============================================================================

/** Task status enum */
export const taskStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

/** Task priority enum */
export const taskPrioritySchema = z.enum([
  'low',
  'normal',
  'high',
  'critical',
]);

/** Create verification task request validation */
export const createTaskSchema = z.object({
  name: z
    .string()
    .min(1, 'Task name is required')
    .max(200, 'Task name must be at most 200 characters'),
  systemId: idSchema.min(1, 'System ID is required'),
  priority: taskPrioritySchema.optional().default('normal'),
  checkTypes: z
    .array(z.string().min(1))
    .min(1, 'At least one check type is required'),
  scheduledAt: z.string().datetime().nullable().optional(),
  assigneeId: idSchema.nullable().optional(),
});

/** Update verification task request validation */
export const updateTaskSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Task name must be at least 1 character')
      .max(200, 'Task name must be at most 200 characters')
      .optional(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
    assigneeId: idSchema.nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    checkTypes: z.array(z.string().min(1)).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

/** Batch operation request validation */
export const batchOperationSchema = z.object({
  operation: z.enum(['restart', 'cancel', 'delete'], {
    required_error: 'Operation is required',
    invalid_type_error: 'Operation must be restart, cancel, or delete',
  }),
  taskIds: z
    .array(idSchema, {
      required_error: 'Task IDs array is required',
    })
    .min(1, 'At least one task ID is required')
    .max(100, 'Maximum 100 task IDs allowed'),
});

/** Queue task list query params validation */
export const taskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  search: z
    .string()
    .min(1)
    .max(200)
    .optional(),
  sortBy: z
    .enum([
      'createdAt',
      'updatedAt',
      'priority',
      'status',
      'scheduledAt',
    ])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  assigneeId: idSchema.optional(),
});

/** Task log query params validation */
export const taskLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(100),
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  since: z.string().datetime().optional(),
});

// =============================================================================
// Type Exports (infer TypeScript types from Zod schemas)
// =============================================================================

/** Inferred type for register request */
export type RegisterInput = z.infer<typeof registerSchema>;

/** Inferred type for login request */
export type LoginInput = z.infer<typeof loginSchema>;

/** Inferred type for token refresh request */
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/** Inferred type for profile update request */
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Inferred type for evidence upload metadata */
export type EvidenceUploadInput = z.infer<typeof evidenceUploadSchema>;

/** Inferred type for create system request */
export type CreateSystemInput = z.infer<typeof createSystemSchema>;

/** Inferred type for update system request */
export type UpdateSystemInput = z.infer<typeof updateSystemSchema>;

/** Inferred type for create task request */
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Inferred type for update task request */
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Inferred type for batch operation request */
export type BatchOperationInput = z.infer<typeof batchOperationSchema>;
