import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FC } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Globe,
  Smartphone,
  Database,
  Cloud,
  Package,
  Search,
  X,
  Download,
  FileDown,
  Flag,
  ChevronLeft,
  ChevronRight,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { systemsApi, type System } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ────────────────────────────────────────────────────────────── */
/*  Types                                                        */
/* ────────────────────────────────────────────────────────────── */

type SystemType = 'API Service' | 'Web Application' | 'Mobile App' | 'Database' | 'Infrastructure' | 'Library' | 'Other';
type SystemStatus = 'Verified' | 'Pending Review' | 'At Risk' | 'Unknown';

interface CheckSegment {
  label: string;
  status: 'passed' | 'pending' | 'failed' | 'na';
}

interface TimelineEvent {
  title: string;
  description: string;
  date: string;
  status?: SystemStatus;
  dotColor: 'green' | 'blue' | 'amber' | 'red';
}

interface EvidenceFile {
  name: string;
  type: string;
  date: string;
  size: string;
  iconColor: string;
}

interface SystemData {
  id: number;
  name: string;
  version: string;
  type: SystemType;
  status: SystemStatus;
  description: string;
  tags: string[];
  checks: { passed: number; total: number };
  scans: number;
  lastScan: string;
  segments: CheckSegment[];
  timeline: TimelineEvent[];
  evidenceFiles: EvidenceFile[];
  totalChecks: number;
  reviewCycle: string;
  reviewers: string[];
}

/* ────────────────────────────────────────────────────────────── */
/*  Icon mapping                                                 */
/* ────────────────────────────────────────────────────────────── */

const typeIcons: Record<SystemType, typeof Server> = {
  'API Service': Server,
  'Web Application': Globe,
  'Mobile App': Smartphone,
  'Database': Database,
  'Infrastructure': Cloud,
  'Library': Package,
  'Other': Package,
};

const statusToBadgeVariant = (status: SystemStatus): 'verified' | 'pending' | 'threat' | 'neutral' => {
  switch (status) {
    case 'Verified': return 'verified';
    case 'Pending Review': return 'pending';
    case 'At Risk': return 'threat';
    case 'Unknown': return 'neutral';
  }
};

const statusColor = (status: SystemStatus): string => {
  switch (status) {
    case 'Verified': return '#10B981';
    case 'Pending Review': return '#F59E0B';
    case 'At Risk': return '#EF4444';
    case 'Unknown': return '#3B82F6';
  }
};

const segmentColor = (status: CheckSegment['status']): string => {
  switch (status) {
    case 'passed': return '#10B981';
    case 'pending': return '#F59E0B';
    case 'failed': return '#EF4444';
    case 'na': return '#334155';
  }
};

const dotColorHex = (color: TimelineEvent['dotColor']): string => {
  switch (color) {
    case 'green': return '#10B981';
    case 'blue': return '#3B82F6';
    case 'amber': return '#F59E0B';
    case 'red': return '#EF4444';
  }
};

/* ────────────────────────────────────────────────────────────── */
/*  Mock data — 12 systems                                       */
/* ────────────────────────────────────────────────────────────── */

const systemsData: SystemData[] = [
  {
    id: 1, name: 'Payment Gateway', version: 'v3.2.0', type: 'API Service', status: 'Verified',
    description: 'Handles all payment transactions and webhook processing for the platform.',
    tags: ['backend', 'payment', 'critical'],
    checks: { passed: 14, total: 14 }, scans: 3, lastScan: '2d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'passed' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'passed' },
      { label: 'Infrastructure', status: 'passed' },
    ],
    totalChecks: 14, reviewCycle: '30 days', reviewers: ['A. Chen', 'B. Rossi'],
    timeline: [
      { title: 'Full Verification Complete', description: 'All 14 security checks passed', date: 'Jan 15, 2025 at 14:32 UTC', status: 'Verified', dotColor: 'green' },
      { title: 'Infrastructure Scan Submitted', description: 'Automated scan of AWS configuration', date: 'Jan 14, 2025 at 09:15 UTC', dotColor: 'blue' },
      { title: 'Dynamic Analysis Passed', description: 'No runtime vulnerabilities detected', date: 'Jan 13, 2025 at 16:45 UTC', dotColor: 'green' },
      { title: 'Dependency Audit Clean', description: 'All 127 dependencies verified', date: 'Jan 12, 2025 at 11:20 UTC', dotColor: 'green' },
      { title: 'Manual Review Pending', description: 'Awaiting senior security engineer sign-off', date: 'Jan 11, 2025 at 10:00 UTC', dotColor: 'amber' },
    ],
    evidenceFiles: [
      { name: 'payment-gateway-scan.pdf', type: 'PDF', date: 'Jan 15, 2025', size: '2.4 MB', iconColor: '#EF4444' },
      { name: 'dependency-report.json', type: 'JSON', date: 'Jan 12, 2025', size: '156 KB', iconColor: '#3B82F6' },
    ],
  },
  {
    id: 2, name: 'User Authentication Service', version: 'v4.1.2', type: 'API Service', status: 'Verified',
    description: 'OAuth2 and SAML-based identity provider for all platform services.',
    tags: ['auth', 'security', 'backend'],
    checks: { passed: 12, total: 12 }, scans: 2, lastScan: '4d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'passed' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'passed' },
      { label: 'Infrastructure', status: 'passed' },
    ],
    totalChecks: 12, reviewCycle: '14 days', reviewers: ['C. Martinez'],
    timeline: [
      { title: 'Full Verification Complete', description: 'All 12 security checks passed', date: 'Jan 13, 2025 at 11:00 UTC', status: 'Verified', dotColor: 'green' },
      { title: 'Static Analysis Completed', description: 'No vulnerabilities found in 8,420 lines of code', date: 'Jan 12, 2025 at 15:30 UTC', dotColor: 'green' },
      { title: 'Penetration Test Passed', description: 'No exploitable vulnerabilities found', date: 'Jan 11, 2025 at 09:45 UTC', dotColor: 'green' },
      { title: 'Dependency Audit Clean', description: 'All 89 dependencies verified', date: 'Jan 10, 2025 at 14:20 UTC', dotColor: 'green' },
      { title: 'Code Review Approved', description: 'Peer review completed by 2 senior engineers', date: 'Jan 9, 2025 at 16:00 UTC', dotColor: 'green' },
    ],
    evidenceFiles: [
      { name: 'auth-service-pentest.pdf', type: 'PDF', date: 'Jan 11, 2025', size: '4.1 MB', iconColor: '#EF4444' },
      { name: 'static-analysis.json', type: 'JSON', date: 'Jan 12, 2025', size: '89 KB', iconColor: '#3B82F6' },
    ],
  },
  {
    id: 3, name: 'Admin Dashboard', version: 'v2.5.1', type: 'Web Application', status: 'Pending Review',
    description: 'Internal admin portal for system management and configuration.',
    tags: ['frontend', 'admin'],
    checks: { passed: 8, total: 11 }, scans: 2, lastScan: '1d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'pending' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'pending' },
      { label: 'Infrastructure', status: 'na' },
    ],
    totalChecks: 11, reviewCycle: '30 days', reviewers: ['D. Kim', 'E. Johnson'],
    timeline: [
      { title: 'Dynamic Scan Pending', description: 'Runtime vulnerability scan scheduled', date: 'Jan 15, 2025 at 08:00 UTC', dotColor: 'amber' },
      { title: 'Static Analysis Passed', description: 'No issues found in 12,300 lines', date: 'Jan 14, 2025 at 13:20 UTC', dotColor: 'green' },
      { title: 'Dependency Audit Complete', description: 'All 64 dependencies clean', date: 'Jan 13, 2025 at 10:45 UTC', dotColor: 'green' },
      { title: 'Manual Review Queued', description: 'Assigned to security team', date: 'Jan 12, 2025 at 16:30 UTC', dotColor: 'amber' },
      { title: 'Initial Scan Submitted', description: 'Automated scan triggered on v2.5.1', date: 'Jan 11, 2025 at 09:00 UTC', dotColor: 'blue' },
    ],
    evidenceFiles: [
      { name: 'admin-dashboard-scan.json', type: 'JSON', date: 'Jan 14, 2025', size: '234 KB', iconColor: '#3B82F6' },
    ],
  },
  {
    id: 4, name: 'Mobile SDK — iOS', version: 'v1.8.0', type: 'Mobile App', status: 'Verified',
    description: 'iOS client SDK for mobile payment integration and secure token storage.',
    tags: ['mobile', 'ios', 'sdk'],
    checks: { passed: 10, total: 10 }, scans: 2, lastScan: '5d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'passed' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'passed' },
      { label: 'Infrastructure', status: 'na' },
    ],
    totalChecks: 10, reviewCycle: '30 days', reviewers: ['F. Anderson'],
    timeline: [
      { title: 'Full Verification Complete', description: 'All 10 security checks passed', date: 'Jan 12, 2025 at 15:45 UTC', status: 'Verified', dotColor: 'green' },
      { title: 'iOS Binary Scan Passed', description: 'No malicious code detected in compiled binary', date: 'Jan 11, 2025 at 11:30 UTC', dotColor: 'green' },
      { title: 'Keychain Audit Clean', description: 'Secure token storage verified', date: 'Jan 10, 2025 at 14:00 UTC', dotColor: 'green' },
      { title: 'Network Layer Tested', description: 'Certificate pinning validated', date: 'Jan 9, 2025 at 09:15 UTC', dotColor: 'green' },
      { title: 'Code Review Approved', description: 'Peer review by mobile security specialist', date: 'Jan 8, 2025 at 16:20 UTC', dotColor: 'green' },
    ],
    evidenceFiles: [
      { name: 'ios-sdk-binary-scan.zip', type: 'ZIP', date: 'Jan 11, 2025', size: '12.8 MB', iconColor: '#F59E0B' },
      { name: 'network-test-results.json', type: 'JSON', date: 'Jan 9, 2025', size: '45 KB', iconColor: '#3B82F6' },
    ],
  },
  {
    id: 5, name: 'Analytics Pipeline', version: 'v2.0.4', type: 'Infrastructure', status: 'At Risk',
    description: 'Data processing pipeline for business intelligence and reporting.',
    tags: ['data', 'pipeline', 'infra'],
    checks: { passed: 6, total: 14 }, scans: 1, lastScan: '6d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'failed' },
      { label: 'Dependency', status: 'failed' }, { label: 'Manual', status: 'pending' },
      { label: 'Infrastructure', status: 'failed' },
    ],
    totalChecks: 14, reviewCycle: '60 days', reviewers: ['G. Patel', 'H. Nguyen'],
    timeline: [
      { title: 'Threat Detected', description: 'Unencrypted data transfer found in pipeline stage 3', date: 'Jan 15, 2025 at 10:20 UTC', status: 'At Risk', dotColor: 'red' },
      { title: 'Infrastructure Scan Failed', description: 'S3 bucket permissions overly permissive', date: 'Jan 14, 2025 at 16:00 UTC', dotColor: 'red' },
      { title: 'Dependency Vulnerability Found', description: 'Log4j 2.14.1 flagged as critical CVE', date: 'Jan 13, 2025 at 11:30 UTC', dotColor: 'red' },
      { title: 'Static Analysis Passed', description: 'No code-level vulnerabilities', date: 'Jan 12, 2025 at 09:45 UTC', dotColor: 'green' },
      { title: 'Scan Initiated', description: 'Full security audit triggered', date: 'Jan 11, 2025 at 08:00 UTC', dotColor: 'blue' },
    ],
    evidenceFiles: [
      { name: 'analytics-threat-report.pdf', type: 'PDF', date: 'Jan 15, 2025', size: '3.2 MB', iconColor: '#EF4444' },
      { name: 'infrastructure-scan.json', type: 'JSON', date: 'Jan 14, 2025', size: '512 KB', iconColor: '#3B82F6' },
      { name: 'cve-analysis.zip', type: 'ZIP', date: 'Jan 13, 2025', size: '1.8 MB', iconColor: '#F59E0B' },
    ],
  },
  {
    id: 6, name: 'Notification Service', version: 'v3.0.1', type: 'API Service', status: 'Pending Review',
    description: 'Multi-channel notification delivery system supporting email, SMS, and push.',
    tags: ['backend', 'messaging'],
    checks: { passed: 9, total: 11 }, scans: 2, lastScan: '3d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'passed' },
      { label: 'Dependency', status: 'pending' }, { label: 'Manual', status: 'pending' },
      { label: 'Infrastructure', status: 'na' },
    ],
    totalChecks: 11, reviewCycle: '30 days', reviewers: ['I. Wilson'],
    timeline: [
      { title: 'Dependency Scan Pending', description: 'Waiting for npm audit completion', date: 'Jan 15, 2025 at 12:00 UTC', dotColor: 'amber' },
      { title: 'Manual Review Queued', description: 'Awaiting security team assignment', date: 'Jan 14, 2025 at 10:30 UTC', dotColor: 'amber' },
      { title: 'Dynamic Analysis Passed', description: 'No runtime vulnerabilities', date: 'Jan 13, 2025 at 15:45 UTC', dotColor: 'green' },
      { title: 'Static Analysis Passed', description: 'Clean code scan', date: 'Jan 12, 2025 at 08:20 UTC', dotColor: 'green' },
      { title: 'Scan Job Created', description: 'Notification service v3.0.1 queued', date: 'Jan 11, 2025 at 14:00 UTC', dotColor: 'blue' },
    ],
    evidenceFiles: [
      { name: 'notification-scan.json', type: 'JSON', date: 'Jan 13, 2025', size: '178 KB', iconColor: '#3B82F6' },
    ],
  },
  {
    id: 7, name: 'Database Migration Tool', version: 'v1.2.0', type: 'Library', status: 'Verified',
    description: 'Schema migration utility for PostgreSQL with rollback support.',
    tags: ['database', 'tool'],
    checks: { passed: 8, total: 8 }, scans: 1, lastScan: '7d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'na' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'passed' },
      { label: 'Infrastructure', status: 'na' },
    ],
    totalChecks: 8, reviewCycle: '90 days', reviewers: ['J. Smith'],
    timeline: [
      { title: 'Full Verification Complete', description: 'All 8 security checks passed', date: 'Jan 10, 2025 at 14:30 UTC', status: 'Verified', dotColor: 'green' },
      { title: 'Manual Review Approved', description: 'Database operations deemed safe', date: 'Jan 9, 2025 at 11:00 UTC', dotColor: 'green' },
      { title: 'Dependency Audit Clean', description: 'All 12 dependencies verified', date: 'Jan 8, 2025 at 16:15 UTC', dotColor: 'green' },
      { title: 'Static Analysis Passed', description: 'No vulnerabilities in 3,200 lines', date: 'Jan 7, 2025 at 09:30 UTC', dotColor: 'green' },
      { title: 'Library Submitted', description: 'Database migration tool v1.2.0 added', date: 'Jan 6, 2025 at 10:00 UTC', dotColor: 'blue' },
    ],
    evidenceFiles: [
      { name: 'migration-tool-scan.json', type: 'JSON', date: 'Jan 10, 2025', size: '67 KB', iconColor: '#3B82F6' },
    ],
  },
  {
    id: 8, name: 'API Gateway', version: 'v5.0.0', type: 'Infrastructure', status: 'Verified',
    description: 'Edge gateway handling rate limiting, routing, and authentication.',
    tags: ['infrastructure', 'gateway'],
    checks: { passed: 16, total: 16 }, scans: 4, lastScan: '1d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'passed' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'passed' },
      { label: 'Infrastructure', status: 'passed' },
    ],
    totalChecks: 16, reviewCycle: '14 days', reviewers: ['K. Lee', 'L. Brown'],
    timeline: [
      { title: 'Full Verification Complete', description: 'All 16 security checks passed', date: 'Jan 15, 2025 at 18:00 UTC', status: 'Verified', dotColor: 'green' },
      { title: 'Infrastructure Scan Passed', description: 'Kong gateway configuration secure', date: 'Jan 14, 2025 at 12:30 UTC', dotColor: 'green' },
      { title: 'Rate Limiting Validated', description: 'DDoS protection thresholds confirmed', date: 'Jan 13, 2025 at 15:00 UTC', dotColor: 'green' },
      { title: 'Auth Middleware Tested', description: 'JWT validation and refresh working', date: 'Jan 12, 2025 at 10:45 UTC', dotColor: 'green' },
      { title: 'Penetration Test Passed', description: 'No bypass vulnerabilities found', date: 'Jan 11, 2025 at 09:20 UTC', dotColor: 'green' },
    ],
    evidenceFiles: [
      { name: 'gateway-pentest.pdf', type: 'PDF', date: 'Jan 11, 2025', size: '5.6 MB', iconColor: '#EF4444' },
      { name: 'infrastructure-config.json', type: 'JSON', date: 'Jan 14, 2025', size: '89 KB', iconColor: '#3B82F6' },
    ],
  },
  {
    id: 9, name: 'Customer Portal', version: 'v2.1.0', type: 'Web Application', status: 'Verified',
    description: 'Self-service customer account management portal.',
    tags: ['frontend', 'customer'],
    checks: { passed: 11, total: 11 }, scans: 2, lastScan: '4d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'passed' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'passed' },
      { label: 'Infrastructure', status: 'na' },
    ],
    totalChecks: 11, reviewCycle: '30 days', reviewers: ['M. Davis'],
    timeline: [
      { title: 'Full Verification Complete', description: 'All 11 security checks passed', date: 'Jan 13, 2025 at 12:00 UTC', status: 'Verified', dotColor: 'green' },
      { title: 'XSS Testing Passed', description: 'No cross-site scripting vulnerabilities', date: 'Jan 12, 2025 at 14:30 UTC', dotColor: 'green' },
      { title: 'Auth Flow Verified', description: 'Login and session management secure', date: 'Jan 11, 2025 at 10:00 UTC', dotColor: 'green' },
      { title: 'Dependency Audit Clean', description: 'All 156 dependencies verified', date: 'Jan 10, 2025 at 16:45 UTC', dotColor: 'green' },
      { title: 'Static Analysis Passed', description: 'No code issues found', date: 'Jan 9, 2025 at 09:30 UTC', dotColor: 'green' },
    ],
    evidenceFiles: [
      { name: 'portal-xss-test.json', type: 'JSON', date: 'Jan 12, 2025', size: '312 KB', iconColor: '#3B82F6' },
      { name: 'portal-verification.pdf', type: 'PDF', date: 'Jan 13, 2025', size: '1.9 MB', iconColor: '#EF4444' },
    ],
  },
  {
    id: 10, name: 'Fraud Detection Engine', version: 'v3.4.0', type: 'API Service', status: 'At Risk',
    description: 'ML-powered transaction fraud detection with real-time scoring.',
    tags: ['ml', 'fraud', 'backend'],
    checks: { passed: 7, total: 13 }, scans: 2, lastScan: '2d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'failed' },
      { label: 'Dependency', status: 'failed' }, { label: 'Manual', status: 'pending' },
      { label: 'Infrastructure', status: 'pending' },
    ],
    totalChecks: 13, reviewCycle: '14 days', reviewers: ['N. O\'Brien', 'O. Garcia'],
    timeline: [
      { title: 'Dynamic Scan Failed', description: 'Race condition in scoring endpoint', date: 'Jan 15, 2025 at 09:45 UTC', status: 'At Risk', dotColor: 'red' },
      { title: 'Model Poisoning Alert', description: 'Unusual training data pattern detected', date: 'Jan 14, 2025 at 14:20 UTC', dotColor: 'red' },
      { title: 'Infrastructure Scan Pending', description: 'AWS ECS configuration under review', date: 'Jan 13, 2025 at 11:00 UTC', dotColor: 'amber' },
      { title: 'Static Analysis Passed', description: 'Clean code scan', date: 'Jan 12, 2025 at 16:30 UTC', dotColor: 'green' },
      { title: 'Initial Audit Started', description: 'Fraud engine v3.4.0 entered queue', date: 'Jan 11, 2025 at 08:15 UTC', dotColor: 'blue' },
    ],
    evidenceFiles: [
      { name: 'fraud-engine-alert.pdf', type: 'PDF', date: 'Jan 14, 2025', size: '2.8 MB', iconColor: '#EF4444' },
      { name: 'model-analysis.zip', type: 'ZIP', date: 'Jan 14, 2025', size: '45.2 MB', iconColor: '#F59E0B' },
    ],
  },
  {
    id: 11, name: 'Cache Layer — Redis', version: 'v1.0.0', type: 'Infrastructure', status: 'Unknown',
    description: 'Distributed caching layer for session storage and rate limiting.',
    tags: ['cache', 'infra'],
    checks: { passed: 0, total: 0 }, scans: 0, lastScan: '—',
    segments: [
      { label: 'Static', status: 'na' }, { label: 'Dynamic', status: 'na' },
      { label: 'Dependency', status: 'na' }, { label: 'Manual', status: 'na' },
      { label: 'Infrastructure', status: 'na' },
    ],
    totalChecks: 0, reviewCycle: '—', reviewers: ['P. Taylor'],
    timeline: [
      { title: 'System Registered', description: 'Redis cache layer added to portfolio', date: 'Jan 15, 2025 at 10:00 UTC', dotColor: 'blue' },
      { title: 'Awaiting First Scan', description: 'No verification jobs run yet', date: 'Jan 15, 2025 at 10:00 UTC', dotColor: 'amber' },
      { title: 'Baseline Pending', description: 'Security baseline not established', date: 'Jan 14, 2025 at 16:00 UTC', dotColor: 'amber' },
      { title: 'Added to Queue', description: 'Scheduled for initial assessment', date: 'Jan 13, 2025 at 09:00 UTC', dotColor: 'blue' },
      { title: 'Discovery Complete', description: 'Infrastructure inventory finalized', date: 'Jan 12, 2025 at 14:30 UTC', dotColor: 'blue' },
    ],
    evidenceFiles: [],
  },
  {
    id: 12, name: 'Report Generator', version: 'v2.2.0', type: 'Library', status: 'Verified',
    description: 'PDF and CSV report generation utility with template support.',
    tags: ['tool', 'reporting'],
    checks: { passed: 7, total: 7 }, scans: 1, lastScan: '8d ago',
    segments: [
      { label: 'Static', status: 'passed' }, { label: 'Dynamic', status: 'na' },
      { label: 'Dependency', status: 'passed' }, { label: 'Manual', status: 'passed' },
      { label: 'Infrastructure', status: 'na' },
    ],
    totalChecks: 7, reviewCycle: '90 days', reviewers: ['Q. Martinez'],
    timeline: [
      { title: 'Full Verification Complete', description: 'All 7 security checks passed', date: 'Jan 9, 2025 at 15:30 UTC', status: 'Verified', dotColor: 'green' },
      { title: 'PDF Generation Tested', description: 'No injection vulnerabilities', date: 'Jan 8, 2025 at 11:00 UTC', dotColor: 'green' },
      { title: 'Template Audit Clean', description: 'All templates sanitized', date: 'Jan 7, 2025 at 14:45 UTC', dotColor: 'green' },
      { title: 'Dependency Audit Passed', description: 'All 23 dependencies verified', date: 'Jan 6, 2025 at 10:30 UTC', dotColor: 'green' },
      { title: 'Library Submitted', description: 'Report generator v2.2.0 added', date: 'Jan 5, 2025 at 09:00 UTC', dotColor: 'blue' },
    ],
    evidenceFiles: [
      { name: 'report-gen-scan.json', type: 'JSON', date: 'Jan 9, 2025', size: '134 KB', iconColor: '#3B82F6' },
    ],
  },
];

/* ────────────────────────────────────────────────────────────── */
/*  Filter types                                                 */
/* ────────────────────────────────────────────────────────────── */

type StatusFilter = 'All' | 'Verified' | 'Pending Review' | 'At Risk' | 'Unknown';
type TypeFilter = 'All' | SystemType;
type SortOption = 'Recently Verified' | 'Name A-Z' | 'Name Z-A' | 'Highest Risk First' | 'Oldest First';

/* ────────────────────────────────────────────────────────────── */
/*  Card animation                                               */
/* ────────────────────────────────────────────────────────────── */

const cardContainerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardItemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

/* ────────────────────────────────────────────────────────────── */
/*  Status dot for select options                                */
/* ────────────────────────────────────────────────────────────── */

const StatusDot: FC<{ color: string }> = ({ color }) => (
  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
);

/* ────────────────────────────────────────────────────────────── */
/*  Segmented verification bar                                   */
/* ────────────────────────────────────────────────────────────── */

const SegmentedBar: FC<{ segments: CheckSegment[] }> = ({ segments }) => (
  <div className="flex gap-[3px]">
    {segments.map((seg, i) => (
      <div
        key={i}
        title={`${seg.label}: ${seg.status}`}
        className="h-5 flex-1 rounded-[3px] transition-opacity hover:opacity-80"
        style={{ backgroundColor: segmentColor(seg.status) }}
      />
    ))}
  </div>
);

/* ────────────────────────────────────────────────────────────── */
/*  Timeline component                                           */
/* ────────────────────────────────────────────────────────────── */

const Timeline: FC<{ events: TimelineEvent[] }> = ({ events }) => (
  <div className="relative pl-6">
    {events.map((event, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, delay: i * 0.08, ease: 'easeOut' }}
        className="relative pb-6 last:pb-0"
      >
        {/* Dot */}
        <div
          className="absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B0F19]"
          style={{ backgroundColor: dotColorHex(event.dotColor) }}
        />
        {/* Connector line */}
        {i < events.length - 1 && (
          <div className="absolute -left-[19px] top-4 h-[calc(100%-16px)] w-px bg-[#1E293B]" />
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#F1F5F9]">{event.title}</span>
            {event.status && (
              <StatusBadge variant={statusToBadgeVariant(event.status)}>
                {event.status}
              </StatusBadge>
            )}
          </div>
          <p className="text-xs text-[#64748B]">{event.description}</p>
          <p className="font-mono text-xs text-[#64748B]">{event.date}</p>
        </div>
      </motion.div>
    ))}
  </div>
);

/* ────────────────────────────────────────────────────────────── */
/*  Evidence files table                                         */
/* ────────────────────────────────────────────────────────────── */

const EvidenceFilesTable: FC<{ files: EvidenceFile[] }> = ({ files }) => {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center py-12">
        <Package className="mb-3 h-10 w-10 text-[#64748B]" />
        <p className="text-sm font-medium text-[#F1F5F9]">No evidence files</p>
        <p className="mt-1 text-xs text-[#64748B]">Evidence will appear after scans are run.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_100px_60px_40px] items-center gap-2 border-b border-[#1E293B] bg-[#1A2235] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
        <span>Filename</span>
        <span>Type</span>
        <span>Date</span>
        <span>Size</span>
        <span></span>
      </div>
      {files.map((file, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.05 }}
          className="grid grid-cols-[1fr_80px_100px_60px_40px] items-center gap-2 border-b border-[#1E293B] px-4 py-3 transition-colors hover:bg-[#1A2235]"
        >
          <span className="truncate text-sm text-[#F1F5F9]">{file.name}</span>
          <span className="rounded-full bg-[#1A2235] px-2 py-0.5 text-center font-mono text-xs text-[#94A3B8]">{file.type}</span>
          <span className="font-mono text-xs text-[#64748B]">{file.date}</span>
          <span className="font-mono text-xs text-[#64748B]">{file.size}</span>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#1A2235] hover:text-[#F1F5F9]">
            <Download className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      ))}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────── */
/*  System Card component                                        */
/* ────────────────────────────────────────────────────────────── */

interface SystemCardProps {
  system: SystemData;
  onClick: () => void;
  index: number;
}

const SystemCard: FC<SystemCardProps> = ({ system, onClick }) => {
  const TypeIcon = typeIcons[system.type];
  const allPassed = system.checks.passed === system.checks.total && system.checks.total > 0;

  return (
    <motion.div
      variants={cardItemVariants}
      onClick={onClick}
      className="group cursor-pointer rounded-[10px] border border-[#1E293B] bg-[#111827] transition-all duration-250 ease-out hover:-translate-y-0.5 hover:border-[#334155] hover:shadow-card"
    >
      {/* Top section */}
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: `${statusColor(system.status)}14` }}
          >
            <TypeIcon className="h-5 w-5" style={{ color: statusColor(system.status) }} />
          </div>
          <StatusBadge variant={statusToBadgeVariant(system.status)}>
            {system.status}
          </StatusBadge>
        </div>
        {/* Name + version */}
        <h3 className="mt-3 truncate text-xl font-semibold leading-tight tracking-tight text-[#F1F5F9]">
          {system.name}
        </h3>
        <p className="mt-1 font-mono text-xs text-[#64748B]">{system.version}</p>
        {/* Description */}
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#94A3B8]">
          {system.description}
        </p>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1E293B]" />

      {/* Middle section */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-[#64748B]">Checks </span>
            <span className={cn('font-mono text-xs', allPassed ? 'text-[#10B981]' : 'text-[#94A3B8]')}>
              {system.checks.passed}/{system.checks.total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-[#64748B]">Scans </span>
            <span className="font-mono text-xs text-[#94A3B8]">{system.scans}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-[#64748B]">Last </span>
            <span className="font-mono text-xs text-[#64748B]">{system.lastScan}</span>
          </div>
        </div>
        {/* Tags */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {system.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-[#1A2235] px-2 py-0.5 font-mono text-xs text-[#94A3B8]"
            >
              {tag}
            </span>
          ))}
          {system.tags.length > 3 && (
            <span className="rounded bg-[#1A2235] px-2 py-0.5 font-mono text-xs text-[#64748B]">
              +{system.tags.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* Bottom section */}
      <div className="border-t border-[#1E293B] px-5 py-3">
        <SegmentedBar segments={system.segments} />
        <div className="mt-2 text-right">
          <span className="text-sm text-[#3B82F6] transition-all group-hover:underline">
            View Details &rarr;
          </span>
        </div>
      </div>
    </motion.div>
  );
};

/* ────────────────────────────────────────────────────────────── */
/*  Detail Drawer                                                */
/* ────────────────────────────────────────────────────────────── */

interface DetailDrawerProps {
  system: SystemData | null;
  open: boolean;
  onClose: () => void;
}

const DetailDrawer: FC<DetailDrawerProps> = ({ system, open, onClose }) => {
  if (!system) return null;

  const TypeIcon = typeIcons[system.type];

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full border-l border-[#1E293B] bg-[#111827] p-0 shadow-drawer sm:max-w-[520px]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-[#1E293B] p-6 pb-5">
          <div className="flex items-start justify-between">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${statusColor(system.status)}14` }}
            >
              <TypeIcon className="h-5 w-5" style={{ color: statusColor(system.status) }} />
            </div>
            <SheetClose asChild>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#1A2235] hover:text-[#F1F5F9]"
              >
                <X className="h-5 w-5" />
              </button>
            </SheetClose>
          </div>
          <SheetTitle className="mt-3 text-2xl font-semibold tracking-tight text-[#F1F5F9]">
            {system.name}
          </SheetTitle>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-sm text-[#64748B]">{system.version}</span>
            <StatusBadge variant={statusToBadgeVariant(system.status)} className="text-xs">
              {system.status}
            </StatusBadge>
          </div>
          <p className="mt-1 text-sm text-[#64748B]">{system.type}</p>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="flex flex-1 flex-col">
          <div className="border-b border-[#1E293B] px-6">
            <TabsList className="mt-2 mb-0 h-9 gap-0 bg-transparent p-0">
              {['Overview', 'Verification History', 'Evidence Files'].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab.toLowerCase().replace(/ /g, '-')}
                  className="rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-[#64748B] transition-colors data-[state=active]:border-[#3B82F6] data-[state=active]:bg-transparent data-[state=active]:text-[#F1F5F9] data-[state=active]:shadow-none"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 flex-1 px-6 py-5">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-sm leading-relaxed text-[#94A3B8]">{system.description}</p>

              {/* Key Metrics */}
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { label: 'Total Checks', value: system.totalChecks.toString() },
                  { label: 'Last Scan', value: system.lastScan },
                  { label: 'Review Cycle', value: system.reviewCycle },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-[#1E293B] bg-[#0B0F19] p-3"
                  >
                    <p className="text-xs text-[#64748B]">{metric.label}</p>
                    <p className="mt-1 font-mono text-lg text-[#F1F5F9]">{metric.value}</p>
                  </div>
                ))}
              </div>

              {/* Verification bar */}
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-[#F1F5F9]">Verification Breakdown</p>
                <SegmentedBar segments={system.segments} />
                <div className="mt-2 flex gap-4">
                  {system.segments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: segmentColor(seg.status) }} />
                      <span className="text-xs text-[#64748B]">{seg.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-[#F1F5F9]">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {system.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-[#1A2235] px-2.5 py-1 font-mono text-xs text-[#94A3B8]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Reviewers */}
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-[#F1F5F9]">Reviewers</p>
                <div className="flex items-center">
                  {system.reviewers.map((reviewer, i) => (
                    <div
                      key={reviewer}
                      title={reviewer}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#111827] bg-[#1A2235] text-xs font-medium text-[#F1F5F9]"
                      style={{ marginLeft: i > 0 ? '-8px' : '0', zIndex: system.reviewers.length - i }}
                    >
                      {reviewer.charAt(0)}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* Verification History Tab */}
          <TabsContent value="verification-history" className="mt-0 flex-1 px-6 py-5">
            <Timeline events={system.timeline} />
          </TabsContent>

          {/* Evidence Files Tab */}
          <TabsContent value="evidence-files" className="mt-0 flex-1 px-0 py-5">
            <div className="px-6">
              <EvidenceFilesTable files={system.evidenceFiles} />
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer actions */}
        <div className="border-t border-[#1E293B] p-6">
          <div className="flex gap-3">
            <button className="rounded-md bg-[#3B82F6] px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#2563EB] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(59,130,246,0.25)] active:translate-y-0 active:shadow-none">
              Run New Scan
            </button>
            <button className="flex items-center gap-2 rounded-md border border-[#1E293B] bg-[#1A2235] px-4 py-2.5 text-sm font-medium text-[#F1F5F9] transition-all hover:border-[#334155]">
              <FileDown className="h-4 w-4" />
              Download Report
            </button>
            <button className="flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-[#94A3B8] transition-all hover:bg-[#1A2235] hover:text-[#F1F5F9]">
              <Flag className="h-4 w-4" />
              Flag
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

/* ── Convert API System to SystemData ── */
function convertSystemToCard(s: System): SystemData {
  const statusMap: Record<string, SystemStatus> = {
    verified: 'Verified',
    pending: 'Pending Review',
    threat: 'At Risk',
    unknown: 'Unknown',
  };

  return {
    id: parseInt(s.id.replace(/-/g, '').slice(0, 8), 16) || Math.random(),
    name: s.name,
    version: s.version || 'v1.0.0',
    type: (['API Service', 'Web Application', 'Mobile App', 'Database', 'Infrastructure', 'Library', 'Other'].includes(s.type)
      ? s.type
      : 'Other') as SystemType,
    status: statusMap[s.status] || 'Unknown',
    description: s.description || '',
    tags: s.tags || [],
    checks: { passed: Math.round(s.verification_score || 0), total: 10 },
    scans: 0,
    lastScan: s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—',
    segments: [
      { label: 'Static', status: s.verification_score > 75 ? 'passed' : s.verification_score > 50 ? 'pending' : 'failed' },
      { label: 'Dynamic', status: s.verification_score > 75 ? 'passed' : 'pending' },
      { label: 'Dependency', status: s.verification_score > 50 ? 'passed' : 'pending' },
      { label: 'Manual', status: s.verification_score > 80 ? 'passed' : 'pending' },
      { label: 'Infrastructure', status: s.verification_score > 60 ? 'passed' : 'na' },
    ],
    totalChecks: 10,
    reviewCycle: '30 days',
    reviewers: ['Team'],
    timeline: [
      { title: 'System Registered', description: `Added on ${new Date(s.created_at).toLocaleDateString()}`, date: s.created_at, dotColor: 'blue' },
    ],
    evidenceFiles: [],
  };
}

/* ────────────────────────────────────────────────────────────── */
/*  Main Portfolio Page                                          */
/* ────────────────────────────────────────────────────────────── */

const Portfolio: FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [sortOption, setSortOption] = useState<SortOption>('Recently Verified');
  const [selectedSystem, setSelectedSystem] = useState<SystemData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [liveSystems, setLiveSystems] = useState<System[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(true);
  const itemsPerPage = 12;

  useEffect(() => {
    systemsApi
      .list({ limit: 50 })
      .then(setLiveSystems)
      .catch(() => {})
      .finally(() => setSystemsLoading(false));
  }, []);

  const handleCardClick = useCallback((system: SystemData) => {
    setSelectedSystem(system);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setTimeout(() => setSelectedSystem(null), 300);
  }, []);

  const filteredSystems = useMemo(() => {
    let result = liveSystems.length > 0
      ? liveSystems.map((s) => convertSystemToCard(s))
      : [...systemsData];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.version.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter !== 'All') {
      result = result.filter((s) => s.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'All') {
      result = result.filter((s) => s.type === typeFilter);
    }

    // Sort
    switch (sortOption) {
      case 'Name A-Z':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'Name Z-A':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'Highest Risk First':
        result.sort((a, b) => {
          const riskOrder: Record<SystemStatus, number> = { 'At Risk': 0, 'Pending Review': 1, 'Unknown': 2, 'Verified': 3 };
          return riskOrder[a.status] - riskOrder[b.status];
        });
        break;
      case 'Oldest First':
        result.sort((a, b) => a.id - b.id);
        break;
      case 'Recently Verified':
      default:
        result.sort((a, b) => {
          const va = a.status === 'Verified' ? 1 : 0;
          const vb = b.status === 'Verified' ? 1 : 0;
          return vb - va;
        });
        break;
    }

    return result;
  }, [searchQuery, statusFilter, typeFilter, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredSystems.length / itemsPerPage));
  const paginatedSystems = filteredSystems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const hasActiveFilters = searchQuery || statusFilter !== 'All' || typeFilter !== 'All';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setTypeFilter('All');
    setSortOption('Recently Verified');
    setCurrentPage(1);
  };

  return (
    <div className="mx-auto max-w-container px-4 pt-5 pb-12 sm:px-6 lg:px-8">
      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.015em] text-[#F1F5F9]">
            Verified Systems Portfolio
          </h1>
          <p className="mt-2 max-w-[560px] text-base leading-relaxed text-[#94A3B8]">
            Browse all systems and their current security verification status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <motion.span
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="rounded-full border border-[#1E293B] px-3.5 py-1.5 font-mono text-sm text-[#64748B]"
          >
            {filteredSystems.length} systems
          </motion.span>
          <button className="flex items-center gap-2 rounded-md border border-[#1E293B] bg-[#1A2235] px-4 py-2.5 text-sm font-medium text-[#F1F5F9] transition-all hover:border-[#334155]">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </motion.div>

      {/* ── Filters Bar ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut', delay: 0.1 }}
        className="mt-8 flex flex-wrap gap-3 rounded-[10px] border border-[#1E293B] bg-[#111827] p-3 sm:p-4"
      >
        {/* Search input */}
        <div className="relative flex-[1_1_240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <Input
            placeholder="Search by system name, version, or tag..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="h-10 border-[#1E293B] bg-[#0B0F19] pl-10 pr-10 text-sm text-[#F1F5F9] placeholder:text-[#64748B] focus-visible:border-[#3B82F6] focus-visible:ring-[rgba(59,130,246,0.15)]"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#F1F5F9]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v as StatusFilter); setCurrentPage(1); }}
        >
          <SelectTrigger className="h-10 min-w-[160px] border-[#1E293B] bg-[#0B0F19] text-sm text-[#F1F5F9]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="border-[#1E293B] bg-[#111827]">
            {(['All', 'Verified', 'Pending Review', 'At Risk', 'Unknown'] as StatusFilter[]).map((s) => (
              <SelectItem
                key={s}
                value={s}
                className="text-sm text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]"
              >
                {s === 'All' ? (
                  <>
                    <StatusDot color="#64748B" />
                    All Statuses
                  </>
                ) : (
                  <>
                    <StatusDot color={statusColor(s)} />
                    {s}
                  </>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type filter */}
        <Select
          value={typeFilter}
          onValueChange={(v) => { setTypeFilter(v as TypeFilter); setCurrentPage(1); }}
        >
          <SelectTrigger className="h-10 min-w-[160px] border-[#1E293B] bg-[#0B0F19] text-sm text-[#F1F5F9]">
            <SelectValue placeholder="System Type" />
          </SelectTrigger>
          <SelectContent className="border-[#1E293B] bg-[#111827]">
            {(['All', 'API Service', 'Web Application', 'Mobile App', 'Database', 'Infrastructure', 'Library', 'Other'] as TypeFilter[]).map((t) => (
              <SelectItem
                key={t}
                value={t}
                className="text-sm text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]"
              >
                {t === 'All' ? 'All Types' : t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort dropdown */}
        <Select
          value={sortOption}
          onValueChange={(v) => setSortOption(v as SortOption)}
        >
          <SelectTrigger className="h-10 min-w-[180px] border-[#1E293B] bg-[#0B0F19] text-sm text-[#F1F5F9]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent className="border-[#1E293B] bg-[#111827]">
            {(['Recently Verified', 'Name A-Z', 'Name Z-A', 'Highest Risk First', 'Oldest First'] as SortOption[]).map((s) => (
              <SelectItem
                key={s}
                value={s}
                className="text-sm text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]"
              >
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {/* ── Systems Grid ── */}
      {paginatedSystems.length > 0 ? (
        <motion.div
          key={`${statusFilter}-${typeFilter}-${sortOption}-${searchQuery}-${currentPage}`}
          variants={cardContainerVariants}
          initial="hidden"
          animate="show"
          className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {paginatedSystems.map((system) => (
            <SystemCard
              key={system.id}
              system={system}
              onClick={() => handleCardClick(system)}
              index={system.id}
            />
          ))}
        </motion.div>
      ) : (
        /* ── Empty State ── */
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-16 flex flex-col items-center"
        >
          <Briefcase className="h-16 w-16 text-[#64748B]" />
          <h3 className="mt-4 text-xl font-semibold text-[#F1F5F9]">No systems found</h3>
          <p className="mt-2 max-w-md text-center text-sm text-[#94A3B8]">
            Try adjusting your filters or add a new system to the portfolio.
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-5 rounded-md border border-[#1E293B] bg-[#1A2235] px-4 py-2.5 text-sm font-medium text-[#F1F5F9] transition-all hover:border-[#334155]"
            >
              Clear Filters
            </button>
          )}
        </motion.div>
      )}

      {/* ── Pagination ── */}
      {filteredSystems.length > itemsPerPage && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#1A2235] hover:text-[#F1F5F9] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#94A3B8]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={cn(
                'h-8 min-w-[32px] rounded-md px-2.5 text-sm font-medium transition-colors',
                page === currentPage
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-[#94A3B8] hover:bg-[#1A2235] hover:text-[#F1F5F9]'
              )}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#1A2235] hover:text-[#F1F5F9] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#94A3B8]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Detail Drawer ── */}
      <AnimatePresence>
        {selectedSystem && (
          <DetailDrawer
            system={selectedSystem}
            open={drawerOpen}
            onClose={handleCloseDrawer}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Portfolio;
