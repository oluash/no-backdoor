import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FC } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Clock,
  Loader,
  CheckCircle,
  XCircle,
  List,
  Search,
  Plus,
  MoreHorizontal,
  Play,
  RotateCcw,
  Trash2,
  FileText,
  Zap,
  Inbox,
  ThumbsUp,
  Ban,
  Eye,
  Download,
  AlertCircle,
  Server,
  User,
  Calendar,
  Flag,
  Activity,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { queueApi } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';
type Priority = 'Critical' | 'High' | 'Normal' | 'Low';
type TaskType = 'Static Analysis' | 'Dynamic Scan' | 'Manual Review' | 'Dependency Audit' | 'Infrastructure' | 'Full Verification';

interface Task {
  id: string;
  system: string;
  version: string;
  type: TaskType;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  assignedTo: string;
  assignedAvatar: string;
  dateSubmitted: string;
  dateStarted?: string;
  dateCompleted?: string;
  estimatedCompletion?: string;
  submittedBy: string;
  logs?: LogEntry[];
}

interface LogEntry {
  time: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_LOGS: Record<string, LogEntry[]> = {
  'VQ-2025-0147': [
    { time: '14:32:01', level: 'INFO', message: 'Initializing scan environment...' },
    { time: '14:32:04', level: 'INFO', message: 'Loading source code (14,203 files)...' },
    { time: '14:32:15', level: 'WARN', message: 'Deprecated dependency detected: lodash@3.2.1' },
    { time: '14:32:18', level: 'INFO', message: 'Running static analysis...' },
    { time: '14:32:25', level: 'INFO', message: 'Analyzing control flow graphs...' },
    { time: '14:32:31', level: 'INFO', message: 'Checking for hardcoded credentials...' },
    { time: '14:32:40', level: 'SUCCESS', message: 'Credential scan passed — no findings' },
    { time: '14:32:45', level: 'INFO', message: 'Running dynamic scan on staging env...' },
    { time: '14:33:02', level: 'WARN', message: 'Slow response time on /api/v2/verify (>2000ms)' },
    { time: '14:33:10', level: 'INFO', message: 'Dependency audit started...' },
    { time: '14:33:18', level: 'INFO', message: 'Checking 1,243 npm packages...' },
    { time: '14:33:25', level: 'ERROR', message: 'Vulnerability found: semver@5.7.1 (CVE-2022-25883)' },
  ],
  'VQ-2025-0146': [
    { time: '13:15:01', level: 'INFO', message: 'Initializing dynamic scan environment...' },
    { time: '13:15:08', level: 'INFO', message: 'Loading test suite (342 cases)...' },
    { time: '13:15:20', level: 'INFO', message: 'Starting fuzzing on API endpoints...' },
    { time: '13:15:35', level: 'WARN', message: 'Rate limit triggered on /notifications/send' },
    { time: '13:15:42', level: 'INFO', message: 'Retrying with throttled requests...' },
    { time: '13:16:01', level: 'INFO', message: 'Scanning for injection vulnerabilities...' },
  ],
  'VQ-2025-0145': [
    { time: '12:45:01', level: 'INFO', message: 'Initializing static analysis...' },
    { time: '12:45:05', level: 'INFO', message: 'Parsing TypeScript/JSX files...' },
    { time: '12:45:15', level: 'INFO', message: 'Building AST for 8,432 files...' },
    { time: '12:45:30', level: 'INFO', message: 'Running taint analysis...' },
    { time: '12:45:42', level: 'WARN', message: 'Complex cyclomatic depth in migration-engine.ts (47)' },
    { time: '12:45:50', level: 'INFO', message: 'Checking for unsafe eval() usage...' },
    { time: '12:46:01', level: 'SUCCESS', message: 'No unsafe eval patterns found' },
  ],
  'VQ-2025-0144': [
    { time: '11:20:01', level: 'INFO', message: 'Initializing dependency audit...' },
    { time: '11:20:05', level: 'INFO', message: 'Parsing package.json and lock files...' },
    { time: '11:20:12', level: 'INFO', message: 'Checking 892 dependencies against NVD...' },
    { time: '11:20:25', level: 'WARN', message: 'Outdated package: express@4.17.1 (latest: 4.21.0)' },
    { time: '11:20:30', level: 'INFO', message: 'Cross-referencing with Snyk vulnerability DB...' },
  ],
};

const INITIAL_TASKS: Task[] = [
  // Pending (8)
  { id: 'VQ-2025-0155', system: 'Payment Gateway', version: 'v3.2', type: 'Static Analysis', priority: 'High', status: 'pending', progress: 0, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-16T08:30:00Z', submittedBy: 'David Kim' },
  { id: 'VQ-2025-0154', system: 'Auth Service', version: 'v4.1', type: 'Dynamic Scan', priority: 'Critical', status: 'pending', progress: 0, assignedTo: 'Unassigned', assignedAvatar: '--', dateSubmitted: '2025-01-16T09:15:00Z', submittedBy: 'Emily Zhang' },
  { id: 'VQ-2025-0153', system: 'Admin Dashboard', version: 'v2.5', type: 'Manual Review', priority: 'Normal', status: 'pending', progress: 0, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-15T14:20:00Z', submittedBy: 'Lisa Park' },
  { id: 'VQ-2025-0152', system: 'Mobile SDK', version: 'v1.8', type: 'Dependency Audit', priority: 'Normal', status: 'pending', progress: 0, assignedTo: 'Unassigned', assignedAvatar: '--', dateSubmitted: '2025-01-15T11:00:00Z', submittedBy: 'James Wilson' },
  { id: 'VQ-2025-0151', system: 'API Gateway', version: 'v5.0', type: 'Infrastructure', priority: 'High', status: 'pending', progress: 0, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-15T10:30:00Z', submittedBy: 'Sarah Chen' },
  { id: 'VQ-2025-0150', system: 'Analytics Pipeline', version: 'v2.0', type: 'Full Verification', priority: 'Critical', status: 'pending', progress: 0, assignedTo: 'Unassigned', assignedAvatar: '--', dateSubmitted: '2025-01-14T16:45:00Z', submittedBy: 'Mike Torres' },
  { id: 'VQ-2025-0149', system: 'Cache Layer', version: 'v1.0', type: 'Static Analysis', priority: 'Low', status: 'pending', progress: 0, assignedTo: 'James Wilson', assignedAvatar: 'JW', dateSubmitted: '2025-01-14T13:30:00Z', submittedBy: 'Lisa Park' },
  { id: 'VQ-2025-0148', system: 'Fraud Engine', version: 'v3.4', type: 'Dynamic Scan', priority: 'High', status: 'pending', progress: 0, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-14T09:00:00Z', submittedBy: 'David Kim' },
  // Processing (4)
  { id: 'VQ-2025-0147', system: 'Customer Portal', version: 'v2.1', type: 'Full Verification', priority: 'High', status: 'processing', progress: 78, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-16T07:30:00Z', dateStarted: '2025-01-16T08:00:00Z', estimatedCompletion: '2025-01-16T15:30:00Z', submittedBy: 'Emily Zhang', logs: MOCK_LOGS['VQ-2025-0147'] },
  { id: 'VQ-2025-0146', system: 'Notification Service', version: 'v3.0', type: 'Dynamic Scan', priority: 'Normal', status: 'processing', progress: 45, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-16T09:00:00Z', dateStarted: '2025-01-16T09:30:00Z', estimatedCompletion: '2025-01-16T16:00:00Z', submittedBy: 'James Wilson', logs: MOCK_LOGS['VQ-2025-0146'] },
  { id: 'VQ-2025-0145', system: 'DB Migration Tool', version: 'v1.2', type: 'Static Analysis', priority: 'Normal', status: 'processing', progress: 92, assignedTo: 'James Wilson', assignedAvatar: 'JW', dateSubmitted: '2025-01-16T06:15:00Z', dateStarted: '2025-01-16T06:45:00Z', estimatedCompletion: '2025-01-16T12:30:00Z', submittedBy: 'Sarah Chen', logs: MOCK_LOGS['VQ-2025-0145'] },
  { id: 'VQ-2025-0144', system: 'Report Generator', version: 'v2.2', type: 'Dependency Audit', priority: 'Low', status: 'processing', progress: 34, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-15T15:00:00Z', dateStarted: '2025-01-16T07:00:00Z', estimatedCompletion: '2025-01-16T18:00:00Z', submittedBy: 'Mike Torres', logs: MOCK_LOGS['VQ-2025-0144'] },
  // Completed (12+)
  { id: 'VQ-2025-0143', system: 'Payment Gateway', version: 'v3.1', type: 'Full Verification', priority: 'Critical', status: 'completed', progress: 100, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-15T10:00:00Z', dateStarted: '2025-01-15T10:30:00Z', dateCompleted: '2025-01-15T14:20:00Z', submittedBy: 'David Kim' },
  { id: 'VQ-2025-0142', system: 'User Auth', version: 'v4.0', type: 'Dynamic Scan', priority: 'High', status: 'completed', progress: 100, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-15T08:30:00Z', dateStarted: '2025-01-15T09:00:00Z', dateCompleted: '2025-01-15T12:45:00Z', submittedBy: 'Emily Zhang' },
  { id: 'VQ-2025-0141', system: 'Data Exporter', version: 'v1.5', type: 'Static Analysis', priority: 'Normal', status: 'completed', progress: 100, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-14T16:00:00Z', dateStarted: '2025-01-14T16:30:00Z', dateCompleted: '2025-01-14T20:10:00Z', submittedBy: 'James Wilson' },
  { id: 'VQ-2025-0140', system: 'Webhook Handler', version: 'v2.3', type: 'Infrastructure', priority: 'High', status: 'completed', progress: 100, assignedTo: 'James Wilson', assignedAvatar: 'JW', dateSubmitted: '2025-01-14T13:30:00Z', dateStarted: '2025-01-14T14:00:00Z', dateCompleted: '2025-01-14T18:30:00Z', submittedBy: 'Lisa Park' },
  { id: 'VQ-2025-0139', system: 'Search Indexer', version: 'v1.1', type: 'Dependency Audit', priority: 'Low', status: 'completed', progress: 100, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-14T11:00:00Z', dateStarted: '2025-01-14T11:30:00Z', dateCompleted: '2025-01-14T15:00:00Z', submittedBy: 'Mike Torres' },
  { id: 'VQ-2025-0138', system: 'Email Service', version: 'v3.5', type: 'Full Verification', priority: 'Critical', status: 'completed', progress: 100, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-13T15:30:00Z', dateStarted: '2025-01-13T16:00:00Z', dateCompleted: '2025-01-14T08:45:00Z', submittedBy: 'David Kim' },
  { id: 'VQ-2025-0137', system: 'Config Manager', version: 'v2.0', type: 'Manual Review', priority: 'Normal', status: 'completed', progress: 100, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-13T10:00:00Z', dateStarted: '2025-01-13T10:30:00Z', dateCompleted: '2025-01-13T16:00:00Z', submittedBy: 'Sarah Chen' },
  { id: 'VQ-2025-0136', system: 'Rate Limiter', version: 'v1.3', type: 'Static Analysis', priority: 'High', status: 'completed', progress: 100, assignedTo: 'James Wilson', assignedAvatar: 'JW', dateSubmitted: '2025-01-13T09:00:00Z', dateStarted: '2025-01-13T09:30:00Z', dateCompleted: '2025-01-13T13:00:00Z', submittedBy: 'Emily Zhang' },
  { id: 'VQ-2025-0135', system: 'Backup Service', version: 'v2.4', type: 'Dynamic Scan', priority: 'Normal', status: 'completed', progress: 100, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-12T14:00:00Z', dateStarted: '2025-01-12T14:30:00Z', dateCompleted: '2025-01-12T20:00:00Z', submittedBy: 'James Wilson' },
  { id: 'VQ-2025-0134', system: 'Metrics Collector', version: 'v1.0', type: 'Infrastructure', priority: 'Low', status: 'completed', progress: 100, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-12T11:00:00Z', dateStarted: '2025-01-12T11:30:00Z', dateCompleted: '2025-01-12T15:00:00Z', submittedBy: 'Lisa Park' },
  { id: 'VQ-2025-0133', system: 'Order Processor', version: 'v4.2', type: 'Full Verification', priority: 'Critical', status: 'completed', progress: 100, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-11T16:00:00Z', dateStarted: '2025-01-11T16:30:00Z', dateCompleted: '2025-01-12T08:30:00Z', submittedBy: 'David Kim' },
  { id: 'VQ-2025-0132', system: 'Inventory API', version: 'v2.7', type: 'Static Analysis', priority: 'High', status: 'completed', progress: 100, assignedTo: 'James Wilson', assignedAvatar: 'JW', dateSubmitted: '2025-01-11T10:30:00Z', dateStarted: '2025-01-11T11:00:00Z', dateCompleted: '2025-01-11T15:30:00Z', submittedBy: 'Mike Torres' },
  { id: 'VQ-2025-0131', system: 'Notification Queue', version: 'v1.4', type: 'Dependency Audit', priority: 'Normal', status: 'completed', progress: 100, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-10T13:00:00Z', dateStarted: '2025-01-10T13:30:00Z', dateCompleted: '2025-01-10T17:00:00Z', submittedBy: 'Emily Zhang' },
  { id: 'VQ-2025-0130', system: 'User Preferences', version: 'v3.0', type: 'Manual Review', priority: 'Low', status: 'completed', progress: 100, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-10T09:00:00Z', dateStarted: '2025-01-10T09:30:00Z', dateCompleted: '2025-01-10T14:00:00Z', submittedBy: 'Sarah Chen' },
  // Failed (12)
  { id: 'VQ-2025-0129', system: 'Legacy Import Tool', version: 'v1.8', type: 'Dynamic Scan', priority: 'Critical', status: 'failed', progress: 67, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-15T12:00:00Z', dateStarted: '2025-01-15T12:30:00Z', submittedBy: 'David Kim', logs: [{ time: '12:45:02', level: 'ERROR', message: 'Heap limit exceeded during fuzzing test #2847' }, { time: '12:45:03', level: 'ERROR', message: 'Process terminated with exit code 137 (OOM)' }] },
  { id: 'VQ-2025-0128', system: 'PDF Renderer', version: 'v2.1', type: 'Static Analysis', priority: 'High', status: 'failed', progress: 45, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-15T09:30:00Z', dateStarted: '2025-01-15T10:00:00Z', submittedBy: 'Emily Zhang', logs: [{ time: '10:32:01', level: 'ERROR', message: 'Malformed PDF structure detected in test asset' }, { time: '10:32:05', level: 'ERROR', message: 'Scanner crashed: null pointer dereference' }] },
  { id: 'VQ-2025-0127', system: 'Cron Scheduler', version: 'v1.5', type: 'Infrastructure', priority: 'Normal', status: 'failed', progress: 23, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-14T15:00:00Z', dateStarted: '2025-01-14T15:30:00Z', submittedBy: 'James Wilson', logs: [{ time: '15:42:01', level: 'ERROR', message: 'SSH connection timeout to staging-server-03' }, { time: '15:42:10', level: 'ERROR', message: 'Failed to retrieve configuration files' }] },
  { id: 'VQ-2025-0126', system: 'Chat Service', version: 'v3.3', type: 'Full Verification', priority: 'High', status: 'failed', progress: 82, assignedTo: 'James Wilson', assignedAvatar: 'JW', dateSubmitted: '2025-01-14T11:30:00Z', dateStarted: '2025-01-14T12:00:00Z', submittedBy: 'Lisa Park', logs: [{ time: '13:15:01', level: 'ERROR', message: 'WebSocket handshake test failed with 502 Bad Gateway' }, { time: '13:15:05', level: 'ERROR', message: 'Real-time message delivery verification aborted' }] },
  { id: 'VQ-2025-0125', system: 'Image Processor', version: 'v2.0', type: 'Dependency Audit', priority: 'Low', status: 'failed', progress: 15, assignedTo: 'Unassigned', assignedAvatar: '--', dateSubmitted: '2025-01-14T08:00:00Z', dateStarted: '2025-01-14T08:30:00Z', submittedBy: 'Mike Torres', logs: [{ time: '08:45:01', level: 'ERROR', message: 'npm audit failed: ENETUNREACHABLE' }, { time: '08:45:05', level: 'ERROR', message: 'Could not connect to registry.npmjs.org' }] },
  { id: 'VQ-2025-0124', system: 'Billing Engine', version: 'v4.0', type: 'Dynamic Scan', priority: 'Critical', status: 'failed', progress: 55, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-13T14:00:00Z', dateStarted: '2025-01-13T14:30:00Z', submittedBy: 'David Kim', logs: [{ time: '15:20:01', level: 'ERROR', message: 'SQL injection test triggered WAF block' }, { time: '15:20:05', level: 'ERROR', message: 'Scan cannot proceed — IP whitelisting required' }] },
  { id: 'VQ-2025-0123', system: 'Session Manager', version: 'v1.9', type: 'Static Analysis', priority: 'Normal', status: 'failed', progress: 38, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-13T10:00:00Z', dateStarted: '2025-01-13T10:30:00Z', submittedBy: 'Emily Zhang', logs: [{ time: '11:05:01', level: 'ERROR', message: 'Parser error: Unexpected token in session-store.js:142' }, { time: '11:05:03', level: 'ERROR', message: 'Cannot parse file with experimental syntax' }] },
  { id: 'VQ-2025-0122', system: 'Logging Service', version: 'v2.6', type: 'Infrastructure', priority: 'High', status: 'failed', progress: 71, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-12T16:00:00Z', dateStarted: '2025-01-12T16:30:00Z', submittedBy: 'James Wilson', logs: [{ time: '17:10:01', level: 'ERROR', message: 'Log retention policy check failed: 47 days > max 30' }, { time: '17:10:05', level: 'ERROR', message: 'Compliance violation detected' }] },
  { id: 'VQ-2025-0121', system: 'Push Notification', version: 'v1.2', type: 'Manual Review', priority: 'Normal', status: 'failed', progress: 10, assignedTo: 'James Wilson', assignedAvatar: 'JW', dateSubmitted: '2025-01-12T12:00:00Z', dateStarted: '2025-01-12T12:30:00Z', submittedBy: 'Lisa Park', logs: [{ time: '12:45:01', level: 'ERROR', message: 'APNs certificate expired on 2025-01-10' }, { time: '12:45:03', level: 'ERROR', message: 'Push delivery verification cannot proceed' }] },
  { id: 'VQ-2025-0120', system: 'Tax Calculator', version: 'v3.1', type: 'Full Verification', priority: 'High', status: 'failed', progress: 60, assignedTo: 'Sarah Chen', assignedAvatar: 'SC', dateSubmitted: '2025-01-11T15:00:00Z', dateStarted: '2025-01-11T15:30:00Z', submittedBy: 'David Kim', logs: [{ time: '16:30:01', level: 'ERROR', message: 'Floating point precision error in tax rounding' }, { time: '16:30:05', level: 'ERROR', message: 'Expected 10.00, got 9.999999999 — assertion failed' }] },
  { id: 'VQ-2025-0119', system: 'File Storage', version: 'v2.8', type: 'Static Analysis', priority: 'Low', status: 'failed', progress: 30, assignedTo: 'Mike Torres', assignedAvatar: 'MT', dateSubmitted: '2025-01-11T09:00:00Z', dateStarted: '2025-01-11T09:30:00Z', submittedBy: 'Emily Zhang', logs: [{ time: '10:15:01', level: 'ERROR', message: 'Race condition detected in concurrent upload handler' }, { time: '10:15:05', level: 'ERROR', message: 'Thread sanitizer reported 12 data races' }] },
  { id: 'VQ-2025-0118', system: 'Payment Webhook', version: 'v1.6', type: 'Dependency Audit', priority: 'Critical', status: 'failed', progress: 50, assignedTo: 'Lisa Park', assignedAvatar: 'LP', dateSubmitted: '2025-01-10T13:00:00Z', dateStarted: '2025-01-10T13:30:00Z', submittedBy: 'James Wilson', logs: [{ time: '14:00:01', level: 'ERROR', message: 'Critical CVE found: axios@0.21.1 (CVE-2021-3749)' }, { time: '14:00:03', level: 'ERROR', message: 'Dependency blocked by security policy' }] },
  { id: 'VQ-2025-0117', system: 'Audit Logger', version: 'v2.2', type: 'Dynamic Scan', priority: 'Normal', status: 'failed', progress: 5, assignedTo: 'Unassigned', assignedAvatar: '--', dateSubmitted: '2025-01-10T08:00:00Z', dateStarted: '2025-01-10T08:30:00Z', submittedBy: 'Mike Torres', logs: [{ time: '08:35:01', level: 'ERROR', message: 'Database connection pool exhausted' }, { time: '08:35:10', level: 'ERROR', message: 'Cannot initialize test fixtures' }] },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusCounts = (tasks: Task[]) => ({
  pending: tasks.filter((t) => t.status === 'pending').length,
  processing: tasks.filter((t) => t.status === 'processing').length,
  completed: tasks.filter((t) => t.status === 'completed').length,
  failed: tasks.filter((t) => t.status === 'failed').length,
  all: tasks.length,
});

const statusBadgeVariant = (s: TaskStatus): 'verified' | 'pending' | 'threat' | 'neutral' => {
  switch (s) {
    case 'completed': return 'verified';
    case 'pending': return 'pending';
    case 'failed': return 'threat';
    case 'processing': return 'neutral';
  }
};

const priorityColor = (p: Priority) => {
  switch (p) {
    case 'Critical': return 'text-[#EF4444]';
    case 'High': return 'text-[#F59E0B]';
    case 'Normal': return 'text-[#3B82F6]';
    case 'Low': return 'text-[#64748B]';
  }
};

const priorityDotColor = (p: Priority) => {
  switch (p) {
    case 'Critical': return 'bg-[#EF4444]';
    case 'High': return 'bg-[#F59E0B]';
    case 'Normal': return 'bg-[#3B82F6]';
    case 'Low': return 'bg-[#64748B]';
  }
};

const progressColor = (s: TaskStatus) => {
  switch (s) {
    case 'completed': return 'bg-[#10B981]';
    case 'failed': return 'bg-[#EF4444]';
    case 'processing': return 'bg-[#3B82F6]';
    case 'pending': return 'bg-[#334155]';
  }
};

const logLevelColor = (l: LogEntry['level']) => {
  switch (l) {
    case 'INFO': return 'text-[#94A3B8]';
    case 'WARN': return 'text-[#F59E0B]';
    case 'ERROR': return 'text-[#EF4444]';
    case 'SUCCESS': return 'text-[#10B981]';
  }
};

const formatDate = (iso: string) => format(new Date(iso), 'MMM d');
const formatFullDate = (iso: string) => format(new Date(iso), 'MMM d, yyyy HH:mm');

const STAGE_LABELS = ['Submitted', 'Queued', 'Running', 'Reviewing', 'Complete'] as const;

/* ------------------------------------------------------------------ */
/*  Animated Progress Bar (isolated micro-component)                   */
/* ------------------------------------------------------------------ */

const AnimatedProgressBar: FC<{ value: number; status: TaskStatus }> = ({ value, status }) => {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#1E293B]">
        <motion.div
          className={cn('absolute left-0 top-0 h-full rounded-full', progressColor(status))}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-[#F1F5F9]">{value}%</span>
    </div>
  );
};

const AnimatedProgressBarMemo = React.memo(AnimatedProgressBar);

/* ------------------------------------------------------------------ */
/*  Priority Badge                                                     */
/* ------------------------------------------------------------------ */

const PriorityBadge: FC<{ priority: Priority }> = ({ priority }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
    <span className={cn('h-1.5 w-1.5 rounded-full', priorityDotColor(priority))} />
    <span className={cn(priorityColor(priority))}>{priority}</span>
  </span>
);

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

const EmptyState: FC<{ tab: TaskStatus | 'all' }> = ({ tab }) => {
  const configs: Record<TaskStatus | 'all', { icon: React.ReactNode; title: string; desc: string; color: string }> = {
    pending: { icon: <CheckCircle className="h-8 w-8" />, title: 'All caught up!', desc: 'No pending verifications.', color: 'text-[#10B981]' },
    processing: { icon: <Zap className="h-8 w-8" />, title: 'No active verifications', desc: 'Nothing is running right now.', color: 'text-[#3B82F6]' },
    completed: { icon: <Inbox className="h-8 w-8" />, title: 'No completed verifications', desc: 'No completed tasks in this period.', color: 'text-[#94A3B8]' },
    failed: { icon: <ThumbsUp className="h-8 w-8" />, title: 'No failed tasks', desc: 'Great job! Everything is running smoothly.', color: 'text-[#10B981]' },
    all: { icon: <Inbox className="h-8 w-8" />, title: 'No tasks found', desc: 'Try adjusting your filters.', color: 'text-[#94A3B8]' },
  };
  const cfg = configs[tab];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className={cn('mb-4', cfg.color)}>{cfg.icon}</div>
      <h3 className="text-base font-semibold text-[#F1F5F9]">{cfg.title}</h3>
      <p className="mt-1 text-sm text-[#94A3B8]">{cfg.desc}</p>
    </motion.div>
  );
};

/* ------------------------------------------------------------------ */
/*  Log Window                                                         */
/* ------------------------------------------------------------------ */

const LogWindow: FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      className="max-h-[240px] overflow-y-auto rounded-md border border-[#1E293B] bg-[#0B0F19] p-3 font-mono text-xs"
    >
      {logs.map((log, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <span className="shrink-0 text-[#64748B]">[{log.time}]</span>
          <span className={cn('shrink-0 font-semibold', logLevelColor(log.level))}>{log.level}:</span>
          <span className="text-[#94A3B8]">{log.message}</span>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Progress Pipeline (5 stages)                                       */
/* ------------------------------------------------------------------ */

const ProgressPipeline: FC<{ status: TaskStatus; progress: number }> = ({ status, progress }) => {
  const currentStage = status === 'pending' ? 0 : status === 'processing' ? 2 : status === 'failed' ? 2 : 4;
  const completedStages = Math.floor((progress / 100) * 4);

  return (
    <div className="mt-6">
      <h4 className="mb-3 text-sm font-semibold text-[#F1F5F9]">Progress Pipeline</h4>
      <div className="relative">
        {/* Progress bar background */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#1E293B]">
            <motion.div
              className={cn('absolute left-0 top-0 h-full rounded-full', progressColor(status))}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            />
          </div>
          <span className="font-mono text-lg font-semibold text-[#F1F5F9]">{progress}%</span>
        </div>
        {/* Stage labels */}
        <div className="flex items-center justify-between">
          {STAGE_LABELS.map((stage, i) => {
            const isCompleted = i <= completedStages || status === 'completed';
            const isCurrent = i === currentStage && status === 'processing';
            const isFailed = i === currentStage && status === 'failed';
            return (
              <div key={stage} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border text-xs',
                      isCompleted && !isFailed
                        ? 'border-[#10B981] bg-[#10B981] text-[#0B0F19]'
                        : isCurrent
                          ? 'border-[#3B82F6] bg-[#3B82F6] text-white'
                          : isFailed
                            ? 'border-[#EF4444] bg-[#EF4444] text-white'
                            : 'border-[#334155] bg-[#111827] text-[#64748B]'
                    )}
                  >
                    {isCompleted && !isFailed ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : isFailed ? (
                      <XCircle className="h-3.5 w-3.5" />
                    ) : isCurrent ? (
                      <Loader className="h-3 w-3 animate-spin" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#64748B]" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-center text-[10px] font-medium leading-tight',
                      isCompleted && !isFailed
                        ? 'text-[#10B981]'
                        : isCurrent || isFailed
                          ? 'text-[#F1F5F9]'
                          : 'text-[#64748B]'
                    )}
                  >
                    {stage}
                  </span>
                </div>
                {i < STAGE_LABELS.length - 1 && (
                  <div
                    className={cn(
                      'mx-1 mb-5 h-px flex-1',
                      i < completedStages || status === 'completed'
                        ? 'bg-[#10B981]'
                        : i === currentStage && status === 'processing'
                          ? 'bg-gradient-to-r from-[#3B82F6] to-[#334155]'
                          : 'bg-[#334155]'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Task Detail Modal                                                  */
/* ------------------------------------------------------------------ */

const TaskDetailModal: FC<{
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onAction: (task: Task, action: string) => void;
}> = ({ task, open, onClose, onAction }) => {
  if (!task) return null;

  const modalActions = () => {
    switch (task.status) {
      case 'pending':
        return (
          <>
            <Button onClick={() => onAction(task, 'start')} className="bg-[#3B82F6] text-white hover:bg-[#2563EB]">
              <Play className="mr-1.5 h-4 w-4" /> Start Now
            </Button>
            <Button variant="outline" onClick={() => onAction(task, 'edit')} className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]">
              Edit
            </Button>
            <Button variant="destructive" onClick={() => onAction(task, 'cancel')} className="bg-[#EF4444] hover:bg-[#DC2626]">
              Cancel
            </Button>
          </>
        );
      case 'processing':
        return (
          <>
            <Button variant="outline" onClick={() => onAction(task, 'logs')} className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]">
              <FileText className="mr-1.5 h-4 w-4" /> View Full Logs
            </Button>
            <Button variant="outline" onClick={() => onAction(task, 'pause')} className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]">
              Pause
            </Button>
            <Button variant="destructive" onClick={() => onAction(task, 'cancel')} className="bg-[#EF4444] hover:bg-[#DC2626]">
              Cancel
            </Button>
          </>
        );
      case 'completed':
        return (
          <>
            <Button onClick={() => onAction(task, 'report')} className="bg-[#3B82F6] text-white hover:bg-[#2563EB]">
              <Eye className="mr-1.5 h-4 w-4" /> View Report
            </Button>
            <Button variant="outline" onClick={() => onAction(task, 'rerun')} className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Re-run
            </Button>
            <Button variant="outline" onClick={() => onAction(task, 'download')} className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]">
              <Download className="mr-1.5 h-4 w-4" /> Download
            </Button>
          </>
        );
      case 'failed':
        return (
          <>
            <Button onClick={() => onAction(task, 'retry')} className="bg-[#3B82F6] text-white hover:bg-[#2563EB]">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Retry
            </Button>
            <Button variant="outline" onClick={() => onAction(task, 'error')} className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]">
              <AlertCircle className="mr-1.5 h-4 w-4" /> View Error Details
            </Button>
            <Button variant="destructive" onClick={() => onAction(task, 'delete')} className="bg-[#EF4444] hover:bg-[#DC2626]">
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl border-[#1E293B] bg-[#111827] p-0 text-[#F1F5F9] shadow-modal sm:max-w-2xl">
        {/* Header */}
        <DialogHeader className="border-b border-[#1E293B] px-6 py-5 text-left">
          <div className="mb-1 font-mono text-sm text-[#3B82F6]">{task.id}</div>
          <DialogTitle className="text-xl font-semibold text-[#F1F5F9]">
            {task.system} <span className="text-[#94A3B8]">{task.version}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">Task details for {task.id}</DialogDescription>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge variant={statusBadgeVariant(task.status)}>
              {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
            </StatusBadge>
            <Badge variant="outline" className="border-[#1E293B] text-[#94A3B8]">{task.type}</Badge>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <InfoItem icon={<FileText className="h-4 w-4" />} label="Evidence Type" value={task.type} />
            <InfoItem icon={<Flag className="h-4 w-4" />} label="Priority" value={<PriorityBadge priority={task.priority} />} />
            <InfoItem icon={<User className="h-4 w-4" />} label="Submitted By" value={task.submittedBy} />
            <InfoItem
              icon={<User className="h-4 w-4" />}
              label="Assigned To"
              value={
                task.assignedTo === 'Unassigned' ? (
                  'Unassigned'
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Avatar className="h-5 w-5 border border-[#1E293B]">
                      <AvatarFallback className="bg-[#1A2235] text-[10px] text-[#94A3B8]">{task.assignedAvatar}</AvatarFallback>
                    </Avatar>
                    {task.assignedTo}
                  </span>
                )
              }
            />
            <InfoItem icon={<Calendar className="h-4 w-4" />} label="Created" value={formatFullDate(task.dateSubmitted)} />
            <InfoItem
              icon={<Activity className="h-4 w-4" />}
              label="Started"
              value={task.dateStarted ? formatFullDate(task.dateStarted) : 'Not started'}
            />
            <InfoItem
              icon={<Clock className="h-4 w-4" />}
              label="Estimated Completion"
              value={task.estimatedCompletion ? formatFullDate(task.estimatedCompletion) : '—'}
            />
            <InfoItem
              icon={<CheckCircle className="h-4 w-4" />}
              label="Completed"
              value={task.dateCompleted ? formatFullDate(task.dateCompleted) : '—'}
            />
          </div>

          {/* Progress Pipeline */}
          <ProgressPipeline status={task.status} progress={task.progress} />

          {/* Live Logs */}
          {task.logs && task.logs.length > 0 && (task.status === 'processing' || task.status === 'failed') && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#F1F5F9]">Live Logs</h4>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.12)] px-2 py-0.5 text-[10px] font-medium text-[#3B82F6]">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-[#3B82F6]" />
                  Auto-refreshing
                </span>
              </div>
              <LogWindow logs={task.logs} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[#1E293B] px-6 py-4">
          {modalActions()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const InfoItem: FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-start gap-2.5">
    <span className="mt-0.5 text-[#64748B]">{icon}</span>
    <div>
      <div className="text-xs text-[#64748B]">{label}</div>
      <div className="mt-0.5 text-sm text-[#F1F5F9]">{value}</div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Action Dropdown                                                    */
/* ------------------------------------------------------------------ */

const ActionDropdown: FC<{ task: Task; onView: (task: Task) => void; onAction: (task: Task, action: string) => void }> = ({
  task,
  onView,
  onAction,
}) => {
  const actions = () => {
    switch (task.status) {
      case 'pending':
        return (
          <>
            <DropdownMenuItem onClick={() => onView(task)} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <Eye className="mr-2 h-4 w-4 text-[#94A3B8]" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'start')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <Play className="mr-2 h-4 w-4 text-[#10B981]" /> Start
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'edit')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <FileText className="mr-2 h-4 w-4 text-[#94A3B8]" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#1E293B]" />
            <DropdownMenuItem variant="destructive" onClick={() => onAction(task, 'cancel')} className="focus:bg-[#1A2235]">
              <Ban className="mr-2 h-4 w-4" /> Cancel
            </DropdownMenuItem>
          </>
        );
      case 'processing':
        return (
          <>
            <DropdownMenuItem onClick={() => onView(task)} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <Eye className="mr-2 h-4 w-4 text-[#94A3B8]" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'logs')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <FileText className="mr-2 h-4 w-4 text-[#94A3B8]" /> View Logs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'pause')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <Ban className="mr-2 h-4 w-4 text-[#F59E0B]" /> Pause
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#1E293B]" />
            <DropdownMenuItem variant="destructive" onClick={() => onAction(task, 'cancel')} className="focus:bg-[#1A2235]">
              <XCircle className="mr-2 h-4 w-4" /> Cancel
            </DropdownMenuItem>
          </>
        );
      case 'completed':
        return (
          <>
            <DropdownMenuItem onClick={() => onView(task)} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <Eye className="mr-2 h-4 w-4 text-[#94A3B8]" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'report')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <FileText className="mr-2 h-4 w-4 text-[#3B82F6]" /> View Report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'rerun')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <RotateCcw className="mr-2 h-4 w-4 text-[#94A3B8]" /> Re-run
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'download')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <Download className="mr-2 h-4 w-4 text-[#94A3B8]" /> Download
            </DropdownMenuItem>
          </>
        );
      case 'failed':
        return (
          <>
            <DropdownMenuItem onClick={() => onView(task)} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <Eye className="mr-2 h-4 w-4 text-[#94A3B8]" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction(task, 'retry')} className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]">
              <RotateCcw className="mr-2 h-4 w-4 text-[#3B82F6]" /> Retry
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#1E293B]" />
            <DropdownMenuItem variant="destructive" onClick={() => onAction(task, 'delete')} className="focus:bg-[#1A2235]">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </>
        );
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8 text-[#64748B] hover:bg-[#1A2235] hover:text-[#F1F5F9]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 border-[#1E293B] bg-[#111827] text-[#F1F5F9]"
      >
        {actions()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/* ------------------------------------------------------------------ */
/*  Mobile Task Card                                                   */
/* ------------------------------------------------------------------ */

const MobileTaskCard: FC<{
  task: Task;
  selected: boolean;
  onSelect: (id: string) => void;
  onView: (task: Task) => void;
  onAction: (task: Task, action: string) => void;
}> = ({ task, selected, onSelect, onView, onAction }) => {
  const accentBorder =
    task.status === 'completed'
      ? 'border-l-[#10B981]'
      : task.status === 'failed'
        ? 'border-l-[#EF4444]'
        : task.status === 'processing'
          ? 'border-l-[#3B82F6]'
          : 'border-l-[#F59E0B]';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'rounded-lg border border-[#1E293B] border-l-[3px] bg-[#111827] p-4 transition-colors hover:bg-[#1A2235]',
        accentBorder
      )}
    >
      {/* Top row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onSelect(task.id)}
            className="border-[#334155]"
          />
          <button
            onClick={() => onView(task)}
            className="font-mono text-sm text-[#3B82F6] hover:underline"
          >
            {task.id}
          </button>
        </div>
        <StatusBadge variant={statusBadgeVariant(task.status)}>
          {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
        </StatusBadge>
      </div>

      {/* System name */}
      <div className="mb-2 text-sm font-medium text-[#F1F5F9]">
        {task.system} <span className="text-[#64748B]">{task.version}</span>
      </div>

      {/* Type + Priority */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-[#1E293B] text-[#94A3B8]">{task.type}</Badge>
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Progress */}
      <div className="mb-3">
        <AnimatedProgressBarMemo value={task.progress} status={task.status} />
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.assignedTo === 'Unassigned' ? (
            <span className="text-xs text-[#64748B]">Unassigned</span>
          ) : (
            <>
              <Avatar className="h-5 w-5 border border-[#1E293B]">
                <AvatarFallback className="bg-[#1A2235] text-[10px] text-[#94A3B8]">{task.assignedAvatar}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-[#94A3B8]">{task.assignedTo}</span>
            </>
          )}
        </div>
        <span className="font-mono text-xs text-[#64748B]">{formatDate(task.dateSubmitted)}</span>
      </div>

      {/* Quick actions */}
      <div className="mt-3 flex gap-2 border-t border-[#1E293B] pt-3">
        {task.status === 'pending' && (
          <>
            <Button size="sm" className="h-7 flex-1 bg-[#3B82F6] text-xs text-white hover:bg-[#2563EB]" onClick={() => onAction(task, 'start')}>
              <Play className="mr-1 h-3 w-3" /> Start
            </Button>
            <Button size="sm" variant="destructive" className="h-7 flex-1 bg-[#EF4444] text-xs hover:bg-[#DC2626]" onClick={() => onAction(task, 'cancel')}>
              <Ban className="mr-1 h-3 w-3" /> Cancel
            </Button>
          </>
        )}
        {task.status === 'processing' && (
          <>
            <Button size="sm" variant="outline" className="h-7 flex-1 border-[#1E293B] bg-[#1A2235] text-xs text-[#F1F5F9] hover:bg-[#1A2235]" onClick={() => onView(task)}>
              <Eye className="mr-1 h-3 w-3" /> View
            </Button>
            <Button size="sm" variant="destructive" className="h-7 flex-1 bg-[#EF4444] text-xs hover:bg-[#DC2626]" onClick={() => onAction(task, 'cancel')}>
              <Ban className="mr-1 h-3 w-3" /> Cancel
            </Button>
          </>
        )}
        {task.status === 'completed' && (
          <>
            <Button size="sm" className="h-7 flex-1 bg-[#3B82F6] text-xs text-white hover:bg-[#2563EB]" onClick={() => onAction(task, 'report')}>
              <Eye className="mr-1 h-3 w-3" /> Report
            </Button>
            <Button size="sm" variant="outline" className="h-7 flex-1 border-[#1E293B] bg-[#1A2235] text-xs text-[#F1F5F9] hover:bg-[#1A2235]" onClick={() => onAction(task, 'rerun')}>
              <RotateCcw className="mr-1 h-3 w-3" /> Re-run
            </Button>
          </>
        )}
        {task.status === 'failed' && (
          <>
            <Button size="sm" className="h-7 flex-1 bg-[#3B82F6] text-xs text-white hover:bg-[#2563EB]" onClick={() => onAction(task, 'retry')}>
              <RotateCcw className="mr-1 h-3 w-3" /> Retry
            </Button>
            <Button size="sm" variant="destructive" className="h-7 flex-1 bg-[#EF4444] text-xs hover:bg-[#DC2626]" onClick={() => onAction(task, 'delete')}>
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

import * as React from 'react';

const TABS = [
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'processing', label: 'Processing', icon: Loader },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
  { key: 'failed', label: 'Failed', icon: XCircle },
  { key: 'all', label: 'All Tasks', icon: List },
] as const;

const VerificationQueue: FC = () => {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [liveTasks, setLiveTasks] = useState<any[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);

  // Fetch live tasks from API
  useEffect(() => {
    queueApi
      .tasks({ limit: 50 })
      .then((data) => {
        setLiveTasks(data);
        setLiveLoading(false);
      })
      .catch(() => setLiveLoading(false));
  }, []);

  const counts = useMemo(() => statusCounts(tasks), [tasks]);

  /* Simulated real-time: processing tasks slowly advance */
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.status === 'processing' && t.progress < 100) {
            const increment = Math.random() * 3;
            const newProgress = Math.min(100, Math.round(t.progress + increment));
            return { ...t, progress: newProgress };
          }
          return t;
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  /* Simulated completion toast */
  useEffect(() => {
    const checkCompletions = setInterval(() => {
      setTasks((prev) => {
        const completing = prev.filter((t) => t.status === 'processing' && t.progress >= 100);
        if (completing.length > 0) {
          completing.forEach((task) => {
            toast.success(
              <div>
                <span className="font-mono text-sm font-medium">{task.id}</span>
                <p className="text-xs">Verification completed for {task.system}</p>
              </div>,
              { duration: 4000 }
            );
          });
          return prev.map((t) =>
            t.status === 'processing' && t.progress >= 100
              ? { ...t, status: 'completed' as TaskStatus, dateCompleted: new Date().toISOString() }
              : t
          );
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(checkCompletions);
  }, []);

  /* Filtered tasks */
  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // Tab filter
    if (activeTab !== 'all') {
      filtered = filtered.filter((t) => t.status === activeTab);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          t.system.toLowerCase().includes(q) ||
          t.assignedTo.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [tasks, activeTab, searchQuery]);

  /* Selection helpers */
  const allSelected = filteredTasks.length > 0 && filteredTasks.every((t) => selectedIds.has(t.id));
  const someSelected = filteredTasks.some((t) => selectedIds.has(t.id)) && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      filteredTasks.forEach((t) => next.delete(t.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredTasks.forEach((t) => next.add(t.id));
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  /* Actions */
  const handleView = (task: Task) => {
    setDetailTask(task);
    setDetailOpen(true);
  };

  const handleAction = useCallback((task: Task, action: string) => {
    switch (action) {
      case 'start':
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: 'processing', progress: 5, dateStarted: new Date().toISOString() }
              : t
          )
        );
        toast.info(`Task ${task.id} started`);
        break;
      case 'cancel':
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        toast.info(`Task ${task.id} cancelled`);
        break;
      case 'delete':
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        toast.success(`Task ${task.id} deleted`);
        break;
      case 'retry':
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: 'processing', progress: 0, dateStarted: new Date().toISOString() }
              : t
          )
        );
        toast.info(`Retrying ${task.id}`);
        break;
      case 'rerun':
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: 'processing', progress: 0, dateCompleted: undefined, dateStarted: new Date().toISOString() }
              : t
          )
        );
        toast.info(`Re-running ${task.id}`);
        break;
      case 'pause':
        toast.info(`Task ${task.id} paused`);
        break;
      case 'report':
        toast.success(`Opening report for ${task.id}`);
        break;
      case 'download':
        toast.success(`Downloading report for ${task.id}`);
        break;
      case 'edit':
        toast.info(`Edit mode for ${task.id}`);
        break;
      case 'logs':
        handleView(task);
        break;
      case 'error':
        handleView(task);
        break;
      default:
        toast.info(`Action "${action}" on ${task.id}`);
    }
    setDetailOpen(false);
  }, []);

  const selectedCount = selectedIds.size;
  const selectedTasks = tasks.filter((t) => selectedIds.has(t.id));

  return (
    <div className="min-h-[100dvh] bg-[#0B0F19] pt-[60px]">
      <div className="mx-auto max-w-container px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        {/* Toast container */}
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.015em] text-[#F1F5F9]">
                Verification Queue
              </h1>
              <p className="mt-1 text-base text-[#94A3B8]">
                Manage and track all verification tasks across your systems.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="h-8 border-[#1E293B] bg-[#111827] px-3 font-mono text-sm text-[#F1F5F9]"
              >
                {counts.all} tasks
              </Badge>
              <Button className="bg-[#3B82F6] text-white hover:bg-[#2563EB]">
                <Plus className="mr-1.5 h-4 w-4" /> New Task
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="mt-5 flex flex-wrap gap-3"
        >
          {[
            { label: 'Pending', count: counts.pending, dot: 'bg-[#F59E0B]' },
            { label: 'Processing', count: counts.processing, dot: 'bg-[#3B82F6]' },
            { label: 'Completed', count: counts.completed, dot: 'bg-[#10B981]' },
            { label: 'Failed', count: counts.failed, dot: 'bg-[#EF4444]' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.2 + i * 0.06 }}
              className="flex items-center gap-2.5 rounded-lg border border-[#1E293B] bg-[#111827] px-4 py-2.5"
            >
              <span className={cn('h-2 w-2 rounded-full', stat.dot)} />
              <span className="text-xs text-[#94A3B8]">{stat.label}:</span>
              <span className="font-mono text-sm font-semibold text-[#F1F5F9]">{stat.count}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Tabs + Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="mt-8"
        >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto w-full flex-wrap gap-1 border border-[#1E293B] bg-[#111827] p-1 sm:w-auto">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const count = counts[tab.key as keyof typeof counts];
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-[#64748B] transition-all data-[state=active]:bg-[#1A2235] data-[state=active]:text-[#F1F5F9] data-[state=active]:shadow-sm'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', tab.key === 'processing' && 'animate-spin')} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'ml-1 border-[#1E293B] bg-[#0B0F19] px-1.5 py-0 font-mono text-[10px] text-[#94A3B8]',
                        activeTab === tab.key && 'border-[#334155] text-[#F1F5F9]'
                      )}
                    >
                      {count}
                    </Badge>
                    {tab.key === 'processing' && (
                      <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[#10B981]" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Filter Bar */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                <Input
                  placeholder="Search by task ID, system name, or reviewer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-[#1E293B] bg-[#0E1525] pl-10 text-sm text-[#F1F5F9] placeholder:text-[#64748B] focus-visible:border-[#3B82F6] focus-visible:ring-[#3B82F6]/15"
                />
              </div>

              {/* Batch actions */}
              <AnimatePresence>
                {selectedCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2"
                  >
                    <Badge variant="outline" className="border-[#1E293B] bg-[#111827] text-[#94A3B8]">
                      {selectedCount} selected
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[#1E293B] bg-[#1A2235] text-xs text-[#F1F5F9] hover:bg-[#1A2235]"
                      onClick={() => {
                        selectedTasks.forEach((t) => handleAction(t, 'rerun'));
                        setSelectedIds(new Set());
                      }}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" /> Re-run
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 bg-[#EF4444] text-xs hover:bg-[#DC2626]"
                      onClick={() => {
                        selectedTasks.forEach((t) => handleAction(t, 'cancel'));
                        setSelectedIds(new Set());
                      }}
                    >
                      <Ban className="mr-1 h-3 w-3" /> Cancel
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tab Contents */}
            {TABS.map((tab) => (
              <TabsContent key={tab.key} value={tab.key} className="mt-6">
                <AnimatePresence mode="wait">
                  {filteredTasks.length === 0 ? (
                    <EmptyState tab={tab.key as TaskStatus | 'all'} />
                  ) : (
                    <>
                      {/* Desktop Table */}
                      <motion.div
                        key="table"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="hidden overflow-hidden rounded-lg border border-[#1E293B] lg:block"
                      >
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-[#1E293B] bg-[#1A2235]">
                                <th className="w-12 px-4 py-3">
                                  <Checkbox
                                    checked={allSelected}
                                    ref={(el) => {
                                      if (el) {
                                        (el as HTMLInputElement).indeterminate = someSelected;
                                      }
                                    }}
                                    onCheckedChange={toggleSelectAll}
                                    className="border-[#334155]"
                                  />
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  Task ID
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  System
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  Type
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  Priority
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  Status
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  Progress
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  Assigned
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                                  Date
                                </th>
                                <th className="w-16 px-4 py-3" />
                              </tr>
                            </thead>
                            <tbody>
                              <AnimatePresence>
                                {filteredTasks.map((task, i) => (
                                  <motion.tr
                                    key={task.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.2) }}
                                    className="border-b border-[#1E293B] transition-colors hover:bg-[#1A2235]"
                                  >
                                    <td className="px-4 py-3.5">
                                      <Checkbox
                                        checked={selectedIds.has(task.id)}
                                        onCheckedChange={() => toggleSelect(task.id)}
                                        className="border-[#334155]"
                                      />
                                    </td>
                                    <td className="px-4 py-3.5">
                                      <button
                                        onClick={() => handleView(task)}
                                        className="font-mono text-xs text-[#3B82F6] hover:underline"
                                      >
                                        {task.id}
                                      </button>
                                    </td>
                                    <td className="px-4 py-3.5">
                                      <div className="flex items-center gap-2">
                                        <Server className="h-4 w-4 shrink-0 text-[#64748B]" />
                                        <span className="text-[#F1F5F9]">{task.system}</span>
                                        <span className="text-[#64748B]">{task.version}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3.5">
                                      <Badge variant="outline" className="border-[#1E293B] text-[#94A3B8]">
                                        {task.type}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3.5">
                                      <PriorityBadge priority={task.priority} />
                                    </td>
                                    <td className="px-4 py-3.5">
                                      <StatusBadge variant={statusBadgeVariant(task.status)}>
                                        {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                                      </StatusBadge>
                                    </td>
                                    <td className="min-w-[140px] px-4 py-3.5">
                                      <AnimatedProgressBarMemo value={task.progress} status={task.status} />
                                    </td>
                                    <td className="px-4 py-3.5">
                                      {task.assignedTo === 'Unassigned' ? (
                                        <span className="text-xs text-[#64748B]">Unassigned</span>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <Avatar className="h-6 w-6 border border-[#1E293B]">
                                            <AvatarFallback className="bg-[#1A2235] text-[10px] text-[#94A3B8]">
                                              {task.assignedAvatar}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="text-sm text-[#94A3B8]">{task.assignedTo}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3.5 font-mono text-xs text-[#64748B]">
                                      {formatDate(task.dateSubmitted)}
                                    </td>
                                    <td className="px-4 py-3.5">
                                      <ActionDropdown task={task} onView={handleView} onAction={handleAction} />
                                    </td>
                                  </motion.tr>
                                ))}
                              </AnimatePresence>
                            </tbody>
                          </table>
                        </div>
                      </motion.div>

                      {/* Mobile Card View */}
                      <motion.div
                        key="cards"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col gap-3 lg:hidden"
                      >
                        <AnimatePresence>
                          {filteredTasks.map((task) => (
                            <MobileTaskCard
                              key={task.id}
                              task={task}
                              selected={selectedIds.has(task.id)}
                              onSelect={toggleSelect}
                              onView={handleView}
                              onAction={handleAction}
                            />
                          ))}
                        </AnimatePresence>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </TabsContent>
            ))}
          </Tabs>
        </motion.div>
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={detailTask}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailTask(null);
        }}
        onAction={handleAction}
      />
    </div>
  );
};

export default VerificationQueue;
