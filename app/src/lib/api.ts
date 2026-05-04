/**
 * API client for No-Backdoor System
 * Handles auth tokens, base URL, error handling, and request/response types.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── Token Management ────────────────────────────────────────────────

const TOKEN_KEY = 'nb_access_token';
const REFRESH_KEY = 'nb_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ── Types ───────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    timestamp?: string;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Auth Types ──────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

// ── Dashboard Types ─────────────────────────────────────────────────

export interface MetricsSummary {
  verifiedSystems: number;
  pendingReviews: number;
  activeThreats: number;
  queueDepth: number;
  totalTasks: number;
  totalEvidence: number;
}

export interface TrendPoint {
  date: string;
  status: string;
  count: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface ActivityItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: any;
  actor_id: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

// ── System Types ────────────────────────────────────────────────────

export interface System {
  id: string;
  name: string;
  version: string;
  description: string;
  type: string;
  status: string;
  verification_score: number;
  tags: string[];
  created_by: string;
  creator_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface SystemDetail extends System {
  evidence: EvidenceItem[];
  history: HistoryItem[];
}

// ── Evidence Types ──────────────────────────────────────────────────

export interface EvidenceItem {
  id: string;
  system_id: string;
  system_name?: string;
  uploaded_by: string;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  evidence_type: string;
  description: string;
  priority: string;
  tags: string[];
  status: string;
  checksum: string;
  created_at: string;
}

// ── Queue Types ─────────────────────────────────────────────────────

export interface Task {
  id: string;
  task_id: string;
  system_id: string;
  system_name?: string;
  task_type: string;
  priority: string;
  status: string;
  progress: number;
  error_message?: string;
  assigned_to?: string;
  assigned_name?: string;
  created_by: string;
  created_at: string;
  started_at?: string;
  updated_at?: string;
}

export interface TaskLog {
  id: string;
  task_id: string;
  level: string;
  message: string;
  created_at: string;
}

export interface QueueCounts {
  all: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

// ── History Types ───────────────────────────────────────────────────

export interface HistoryItem {
  id: string;
  system_id: string;
  action: string;
  performed_by: string;
  first_name?: string;
  created_at: string;
}

// ── Fetch Wrapper ───────────────────────────────────────────────────

class ApiErrorClass extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiError';
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data: ApiSuccess<{ accessToken: string; refreshToken: string }> = await res.json();
    if (data.success) {
      setTokens(data.data.accessToken, data.data.refreshToken);
      return data.data.accessToken;
    }
    return null;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Don't set Content-Type for FormData (multipart)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Handle 401 — try refreshing token once
  if (res.status === 401 && retry && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, options, false);
    }
    // Refresh failed — caller should redirect to login
    throw new ApiErrorClass('UNAUTHORIZED', 'Session expired', 401);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  const body = await res.json();

  if (!res.ok) {
    const err = body as ApiError;
    throw new ApiErrorClass(
      err.error?.code || 'UNKNOWN',
      err.error?.message || 'Request failed',
      res.status
    );
  }

  return (body as ApiSuccess<T>).data;
}

// ── Auth API ────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    apiFetch<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => apiFetch<UserProfile>('/auth/me'),

  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
};

// ── Dashboard API ───────────────────────────────────────────────────

export const dashboardApi = {
  summary: () => apiFetch<MetricsSummary>('/metrics/summary'),
  trends: () => apiFetch<TrendPoint[]>('/metrics/trends'),
  status: () => apiFetch<StatusBreakdown[]>('/metrics/status'),
  recentActivity: (page = 1, limit = 10) =>
    apiFetch<ActivityItem[]>(`/activity/recent?page=${page}&limit=${limit}`),
};

// ── Systems API ─────────────────────────────────────────────────────

export const systemsApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string; type?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.type) q.set('type', params.type);
    return apiFetch<System[]>(`/systems?${q.toString()}`);
  },

  get: (id: string) => apiFetch<SystemDetail>(`/systems/${id}`),

  create: (data: { name: string; version?: string; description?: string; type?: string; tags?: string }) =>
    apiFetch<System>('/systems', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<System>) =>
    apiFetch<System>(`/systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/systems/${id}`, { method: 'DELETE' }),
};

// ── Evidence API ────────────────────────────────────────────────────

export const evidenceApi = {
  upload: (formData: FormData) =>
    apiFetch<{ uploads: EvidenceItem[]; count: number }>('/evidence/upload', {
      method: 'POST',
      body: formData,
    }),

  list: (params?: { page?: number; limit?: number; status?: string; type?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.status) q.set('status', params.status);
    if (params?.type) q.set('type', params.type);
    return apiFetch<EvidenceItem[]>(`/evidence?${q.toString()}`);
  },

  get: (id: string) => apiFetch<EvidenceItem>(`/evidence/${id}`),

  delete: (id: string) => apiFetch<void>(`/evidence/${id}`, { method: 'DELETE' }),
};

// ── Queue API ───────────────────────────────────────────────────────

export const queueApi = {
  counts: () => apiFetch<QueueCounts>('/queue/counts'),

  tasks: (params?: { page?: number; limit?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.status) q.set('status', params.status);
    return apiFetch<Task[]>(`/queue/tasks?${q.toString()}`);
  },

  getTask: (id: string) => apiFetch<Task>(`/queue/tasks/${id}`),

  createTask: (data: { systemId: string; taskType?: string; priority?: string }) =>
    apiFetch<Task>('/queue/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: { priority?: string; status?: string; assignedTo?: string }) =>
    apiFetch<Task>(`/queue/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  restartTask: (id: string) =>
    apiFetch<Task>(`/queue/tasks/${id}/restart`, { method: 'POST' }),

  cancelTask: (id: string) =>
    apiFetch<Task>(`/queue/tasks/${id}/cancel`, { method: 'POST' }),

  deleteTask: (id: string) =>
    apiFetch<void>(`/queue/tasks/${id}`, { method: 'DELETE' }),

  taskLogs: (id: string) => apiFetch<TaskLog[]>(`/queue/tasks/${id}/logs`),

  batch: (operation: string, taskIds: string[]) =>
    apiFetch<{ processed: number; taskIds: string[] }>('/queue/batch', {
      method: 'POST',
      body: JSON.stringify({ operation, taskIds }),
    }),
};
