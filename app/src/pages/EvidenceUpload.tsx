import { useState, useRef, useCallback, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { evidenceApi, type EvidenceItem } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  UploadCloud,
  FileText,

  Tag,
  AlertCircle,
  CheckCircle,
  X,
  File,
  FileCheck,
  Clock,
  Lock,

  Send,
  MoreHorizontal,
  Info,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface FormData {
  systemName: string;
  version: string;
  evidenceType: string;
  description: string;
  priority: 'Normal' | 'High' | 'Critical';
  tags: string[];
}

interface RecentUpload {
  id: string;
  fileName: string;
  system: string;
  type: string;
  status: 'verified' | 'pending' | 'threat' | 'neutral';
  date: string;
  size: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACCEPTED_TYPES = ['.zip', '.pdf', '.json', '.xml', '.csv', '.sarif', '.txt'];
const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const EVIDENCE_TYPE_OPTIONS = [
  'Static Code Analysis',
  'Dynamic Application Scan',
  'Dependency Vulnerability Audit',
  'Manual Security Review',
  'Penetration Test Report',
  'Infrastructure Audit',
  'Compliance Assessment',
  'Other',
];

const FILE_TYPE_CHIPS = [
  'Static Analysis Report',
  'Dynamic Scan Results',
  'Dependency Audit',
  'Manual Code Review',
  'Penetration Test',
];

const TAG_SUGGESTIONS = ['backend', 'frontend', 'api', 'database', 'auth', 'payment'];

const PRIORITY_OPTIONS: { label: 'Normal' | 'High' | 'Critical'; color: string; desc: string }[] = [
  { label: 'Normal', color: '#3B82F6', desc: 'Standard review timeline' },
  { label: 'High', color: '#F59E0B', desc: 'Expedited review' },
  { label: 'Critical', color: '#EF4444', desc: 'Immediate attention required' },
];

const RECENT_UPLOADS: RecentUpload[] = [
  { id: '1', fileName: 'api-gateway-scan.sarif', system: 'API Gateway', type: 'Static Analysis', status: 'neutral', date: 'Jan 15, 2025', size: '4.2 MB' },
  { id: '2', fileName: 'payment-audit.pdf', system: 'Payment Service', type: 'Penetration Test', status: 'verified', date: 'Jan 12, 2025', size: '8.7 MB' },
  { id: '3', fileName: 'auth-module-review.zip', system: 'Auth Service', type: 'Manual Review', status: 'pending', date: 'Jan 10, 2025', size: '12.3 MB' },
  { id: '4', fileName: 'infra-config-scan.json', system: 'Infrastructure', type: 'Config Review', status: 'verified', date: 'Jan 8, 2025', size: '1.1 MB' },
  { id: '5', fileName: 'dependency-check-report.xml', system: 'Order Service', type: 'Dependency Check', status: 'threat', date: 'Jan 5, 2025', size: '3.5 MB' },
  { id: '6', fileName: 'dynamic-scan-results.pdf', system: 'User Portal', type: 'Dynamic Analysis', status: 'verified', date: 'Jan 3, 2025', size: '6.8 MB' },
];

const STEP_LABELS = ['Upload Files', 'Enter Details', 'Review & Submit'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

const slideVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

const slideTransition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
};

const staggerTransition = {
  duration: 0.25,
  ease: 'easeOut' as const,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const EvidenceUpload: FC = () => {
  const navigate = useNavigate();

  /* -- Step state -- */
  const [currentStep, setCurrentStep] = useState(1);

  /* -- Evidence list state -- */
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(true);

  useEffect(() => {
    evidenceApi
      .list({ limit: 10 })
      .then(setEvidenceList)
      .catch(() => {})
      .finally(() => setEvidenceLoading(false));
  }, []);

  /* -- Step 1: Files -- */
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* -- Step 2: Form data -- */
  const [formData, setFormData] = useState<FormData>({
    systemName: '',
    version: '',
    evidenceType: '',
    description: '',
    priority: 'Normal',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');

  /* -- Step 3: Submit -- */
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* -- Drag & Drop handlers -- */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const validateAndAddFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    setError(null);

    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_SIZE_BYTES) {
        setError(`"${file.name}" exceeds the ${MAX_SIZE_MB}MB limit.`);
        return;
      }
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_TYPES.includes(ext)) {
        setError(`"${file.name}" is not a supported file type (${ACCEPTED_TYPES.join(', ')}).`);
        return;
      }
      newFiles.push({ id: generateId(), name: file.name, size: file.size, type: ext });
    }

    if (newFiles.length > 0) {
      setIsUploading(true);
      setUploadProgress(0);

      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 18 + 7;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setUploadProgress(100);
          setTimeout(() => {
            setFiles((prev) => [...prev, ...newFiles]);
            setIsUploading(false);
            setUploadProgress(0);
          }, 400);
        } else {
          setUploadProgress(Math.round(progress));
        }
      }, 200);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      validateAndAddFiles(e.dataTransfer.files);
    },
    [validateAndAddFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      validateAndAddFiles(e.target.files);
      e.target.value = '';
    },
    [validateAndAddFiles]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggleChip = useCallback((chip: string) => {
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  }, []);

  /* -- Tag handling -- */
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !formData.tags.includes(trimmed)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, trimmed] }));
    }
    setTagInput('');
  }, [tagInput, formData.tags]);

  const removeTag = useCallback((tag: string) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTag();
      }
      if (e.key === 'Backspace' && !tagInput && formData.tags.length > 0) {
        setFormData((prev) => ({ ...prev, tags: prev.tags.slice(0, -1) }));
      }
    },
    [addTag, tagInput, formData.tags.length]
  );

  /* -- Navigation -- */
  const canProceedStep1 = files.length > 0;
  const canProceedStep2 =
    formData.systemName.trim().length >= 2 &&
    formData.version.trim().length > 0 &&
    formData.evidenceType.length > 0;

  const nextStep = useCallback(() => {
    if (currentStep < 3) setCurrentStep((s) => s + 1);
  }, [currentStep]);

  const prevStep = useCallback(() => {
    if (currentStep > 1) setCurrentStep((s) => s - 1);
  }, [currentStep]);

  /* -- Submit -- */
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const formPayload = new FormData();

      // Append files
      for (const file of files) {
        // We need the actual File object — fetch from the file input ref
        if (fileInputRef.current?.files) {
          for (const f of Array.from(fileInputRef.current.files)) {
            if (f.name === file.name) {
              formPayload.append('files', f);
            }
          }
        }
      }

      // Append metadata
      formPayload.append('systemId', formData.systemName);
      formPayload.append('description', formData.description);
      formPayload.append('evidenceType', formData.evidenceType);
      formPayload.append('priority', formData.priority.toLowerCase());
      formPayload.append('tags', formData.tags.join(','));

      const result = await evidenceApi.upload(formPayload);
      toast.success(`Evidence submitted successfully. ${result.count} file(s) uploaded.`);
      setTimeout(() => {
        navigate('/queue');
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
      setIsSubmitting(false);
    }
  }, [files, formData, navigate]);

  /* -- Priority badge color helper for review -- */
  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'High':
        return '#F59E0B';
      case 'Critical':
        return '#EF4444';
      default:
        return '#3B82F6';
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-container px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      {/* ============ PAGE HEADER ============ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-[#3B82F6] transition-colors hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>
        <h1 className="mt-3 text-[28px] font-semibold leading-[1.15] tracking-[-0.015em] text-[#F1F5F9]">
          Submit Evidence
        </h1>
        <p className="mt-2 max-w-[640px] text-[16px] leading-[1.6] text-[#94A3B8]">
          Upload code scans, audit reports, and security evidence for verification review.
        </p>
      </motion.div>

      {/* ============ MAIN GRID ============ */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        {/* ---- LEFT: Wizard ---- */}
        <div>
          {/* --- Stepper --- */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <div className="flex items-start justify-between">
              {STEP_LABELS.map((label, idx) => {
                const stepNum = idx + 1;
                const isActive = currentStep === stepNum;
                const isCompleted = currentStep > stepNum;
                const isLast = idx === STEP_LABELS.length - 1;

                return (
                  <div key={stepNum} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center">
                      {/* Circle */}
                      <div className="relative">
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all duration-200',
                            isActive || isCompleted
                              ? 'bg-[#3B82F6] text-white'
                              : 'border border-[#1E293B] bg-[#1A2235] text-[#64748B]'
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            stepNum
                          )}
                        </div>
                        {/* Pulse ring on active */}
                        {isActive && (
                          <span className="absolute inset-0 rounded-full border border-[#3B82F6] opacity-0 animate-ping" />
                        )}
                      </div>
                      {/* Label */}
                      <span
                        className={cn(
                          'mt-2 text-[13px]',
                          isActive
                            ? 'font-medium text-[#F1F5F9]'
                            : 'text-[#64748B]'
                        )}
                      >
                        {label}
                      </span>
                    </div>

                    {/* Connector line */}
                    {!isLast && (
                      <div className="mx-2 mb-6 mt-4 flex-1">
                        <div
                          className={cn(
                            'h-[1px] transition-colors duration-300',
                            isCompleted ? 'bg-[#3B82F6]' : 'bg-[#1E293B]'
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* --- Step Content --- */}
          <div className="min-h-[360px]">
            <AnimatePresence mode="wait">
              {/* ===== STEP 1: UPLOAD FILES ===== */}
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  variants={slideVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={slideTransition}
                >
                  {/* Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    className={cn(
                      'relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-300',
                      isDragOver
                        ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.05)]'
                        : 'border-[#1E293B] bg-[#111827]',
                      isUploading && 'pointer-events-none'
                    )}
                  >
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-3 px-4">
                        <Progress value={uploadProgress} className="w-48" />
                        <span className="text-sm text-[#94A3B8]">
                          Uploading... {uploadProgress}%
                        </span>
                      </div>
                    ) : (
                      <>
                        <UploadCloud
                          className={cn(
                            'h-12 w-12 transition-colors duration-200',
                            isDragOver ? 'text-[#3B82F6]' : 'text-[#64748B]'
                          )}
                        />
                        <p className="mt-3 text-[16px] text-[#94A3B8]">
                          Drag and drop files here
                        </p>
                        <p className="mt-1 text-[13px] text-[#64748B]">
                          or click to browse — ZIP, PDF, JSON, XML up to 50MB
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPTED_TYPES.join(',')}
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </div>

                  {/* Error message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="mt-3 flex items-center gap-2 text-sm text-[#EF4444]"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* File Type Chips */}
                  <motion.div
                    className="mt-4 flex flex-wrap gap-2"
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                  >
                    {FILE_TYPE_CHIPS.map((chip) => (
                      <motion.button
                        key={chip}
                        variants={staggerItem}
                        transition={staggerTransition}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChip(chip);
                        }}
                        className={cn(
                          'rounded-md border px-3.5 py-2 text-[13px] transition-all duration-200',
                          selectedChips.includes(chip)
                            ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.12)] text-[#3B82F6]'
                            : 'border-[#1E293B] bg-[#1A2235] text-[#94A3B8] hover:border-[#334155]'
                        )}
                      >
                        {chip}
                      </motion.button>
                    ))}
                  </motion.div>

                  {/* Selected Files List */}
                  <AnimatePresence>
                    {files.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-5 space-y-2"
                      >
                        <p className="mb-2 text-[13px] font-medium text-[#F1F5F9]">
                          Selected Files ({files.length})
                        </p>
                        {files.map((file) => (
                          <motion.div
                            key={file.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-3 rounded-lg border border-[#1E293B] bg-[#111827] px-4 py-3"
                          >
                            <File className="h-5 w-5 shrink-0 text-[#3B82F6]" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-[#F1F5F9]">{file.name}</p>
                              <p className="text-xs text-[#64748B]">{formatFileSize(file.size)}</p>
                            </div>
                            <Badge
                              variant="outline"
                              className="shrink-0 border-[#1E293B] bg-[#0E1525] text-[#64748B]"
                            >
                              {file.type.toUpperCase().replace('.', '')}
                            </Badge>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(file.id);
                              }}
                              className="shrink-0 text-[#64748B] transition-colors hover:text-[#EF4444]"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Navigation */}
                  <div className="mt-6 flex justify-end">
                    <Button
                      onClick={nextStep}
                      disabled={!canProceedStep1}
                      className="bg-[#3B82F6] text-[#0B0F19] hover:bg-[#2563EB]"
                    >
                      Continue to Details
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ===== STEP 2: ENTER DETAILS ===== */}
              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  variants={slideVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={slideTransition}
                >
                  <motion.form
                    className="space-y-5"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      nextStep();
                    }}
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                  >
                    {/* System Name */}
                    <motion.div variants={staggerItem} transition={staggerTransition}>
                      <Label className="mb-2 block text-[16px] font-semibold text-[#F1F5F9]">
                        System / Product Name <span className="text-[#EF4444]">*</span>
                      </Label>
                      <Input
                        placeholder="e.g., Payment Processing API"
                        value={formData.systemName}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, systemName: e.target.value }))
                        }
                        className="border-[#1E293B] bg-[#0E1525] text-[#F1F5F9] placeholder:text-[#64748B] focus-visible:border-[#3B82F6]"
                        required
                        minLength={2}
                      />
                    </motion.div>

                    {/* Version */}
                    <motion.div variants={staggerItem} transition={staggerTransition}>
                      <Label className="mb-2 block text-[16px] font-semibold text-[#F1F5F9]">
                        Version <span className="text-[#EF4444]">*</span>
                      </Label>
                      <Input
                        placeholder="e.g., v3.2.1"
                        value={formData.version}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, version: e.target.value }))
                        }
                        className="w-1/2 border-[#1E293B] bg-[#0E1525] text-[#F1F5F9] placeholder:text-[#64748B] focus-visible:border-[#3B82F6]"
                        required
                      />
                    </motion.div>

                    {/* Evidence Type */}
                    <motion.div variants={staggerItem} transition={staggerTransition}>
                      <Label className="mb-2 block text-[16px] font-semibold text-[#F1F5F9]">
                        Evidence Type <span className="text-[#EF4444]">*</span>
                      </Label>
                      <Select
                        value={formData.evidenceType}
                        onValueChange={(v) =>
                          setFormData((p) => ({ ...p, evidenceType: v }))
                        }
                      >
                        <SelectTrigger className="w-full border-[#1E293B] bg-[#0E1525] text-[#F1F5F9] focus-visible:border-[#3B82F6]">
                          <SelectValue placeholder="Select evidence type" />
                        </SelectTrigger>
                        <SelectContent className="border-[#1E293B] bg-[#111827]">
                          {EVIDENCE_TYPE_OPTIONS.map((opt) => (
                            <SelectItem
                              key={opt}
                              value={opt}
                              className="text-[#F1F5F9] focus:bg-[#1A2235] focus:text-[#F1F5F9]"
                            >
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </motion.div>

                    {/* Description */}
                    <motion.div variants={staggerItem} transition={staggerTransition}>
                      <Label className="mb-2 block text-[16px] font-semibold text-[#F1F5F9]">
                        Additional Notes
                      </Label>
                      <Textarea
                        rows={4}
                        placeholder="Add any context that might help reviewers..."
                        value={formData.description}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, description: e.target.value }))
                        }
                        className="border-[#1E293B] bg-[#0E1525] text-[#F1F5F9] placeholder:text-[#64748B] focus-visible:border-[#3B82F6]"
                      />
                    </motion.div>

                    {/* Priority */}
                    <motion.div variants={staggerItem} transition={staggerTransition}>
                      <Label className="mb-3 block text-[16px] font-semibold text-[#F1F5F9]">
                        Priority
                      </Label>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {PRIORITY_OPTIONS.map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() =>
                              setFormData((p) => ({ ...p, priority: opt.label }))
                            }
                            className={cn(
                              'flex flex-col items-start rounded-lg border px-4 py-3 text-left transition-all duration-200',
                              formData.priority === opt.label
                                ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.08)]'
                                : 'border-[#1E293B] bg-[#111827] hover:border-[#334155]'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: opt.color }}
                              />
                              <span className="text-sm font-medium text-[#F1F5F9]">
                                {opt.label}
                              </span>
                            </div>
                            <span className="mt-1 text-xs text-[#64748B]">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>

                    {/* Tags */}
                    <motion.div variants={staggerItem} transition={staggerTransition}>
                      <Label className="mb-2 block text-[16px] font-semibold text-[#F1F5F9]">
                        Tags
                      </Label>
                      <div
                        className={cn(
                          'flex min-h-[42px] flex-wrap items-center gap-2 rounded-md border bg-[#0E1525] px-3 py-2',
                          'border-[#1E293B] focus-within:border-[#3B82F6] focus-within:ring-[3px] focus-within:ring-[rgba(59,130,246,0.15)]'
                        )}
                      >
                        {formData.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-[rgba(59,130,246,0.12)] px-2.5 py-0.5 text-xs font-medium text-[#3B82F6]"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-0.5 text-[#3B82F6] hover:text-[#F1F5F9]"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleTagKeyDown}
                          onBlur={addTag}
                          placeholder={
                            formData.tags.length === 0 ? 'Type to add tags...' : ''
                          }
                          className="min-w-[100px] flex-1 bg-transparent text-sm text-[#F1F5F9] placeholder:text-[#64748B] outline-none"
                        />
                      </div>
                      {/* Tag suggestions */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {TAG_SUGGESTIONS.filter((s) => !formData.tags.includes(s)).map(
                          (suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() =>
                                setFormData((p) => ({
                                  ...p,
                                  tags: [...p.tags, suggestion],
                                }))
                              }
                              className="rounded-md bg-[#1A2235] px-2 py-1 text-xs text-[#64748B] transition-colors hover:bg-[#334155] hover:text-[#94A3B8]"
                            >
                              + {suggestion}
                            </button>
                          )
                        )}
                      </div>
                    </motion.div>

                    {/* Navigation */}
                    <motion.div
                      variants={staggerItem}
                      transition={staggerTransition}
                      className="flex items-center justify-between pt-2"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        onClick={prevStep}
                        className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]"
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        disabled={!canProceedStep2}
                        className="bg-[#3B82F6] text-[#0B0F19] hover:bg-[#2563EB]"
                      >
                        Review Submission
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  </motion.form>
                </motion.div>
              )}

              {/* ===== STEP 3: REVIEW & SUBMIT ===== */}
              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  variants={slideVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={slideTransition}
                >
                  <motion.div
                    className="rounded-[10px] border border-[#1E293B] bg-[#111827] p-6"
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                  >
                    {/* Files Section */}
                    <motion.div variants={staggerItem} transition={staggerTransition}>
                      <h3 className="text-[16px] font-semibold text-[#F1F5F9]">
                        Uploaded Files
                      </h3>
                      <div className="mt-3 space-y-2">
                        {files.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-3 rounded-lg bg-[#0E1525] px-3 py-2.5"
                          >
                            <File className="h-4 w-4 text-[#3B82F6]" />
                            <span className="flex-1 text-sm text-[#F1F5F9]">
                              {file.name}
                            </span>
                            <span className="text-xs text-[#64748B]">
                              {formatFileSize(file.size)}
                            </span>
                            <Badge
                              variant="outline"
                              className="border-[#1E293B] bg-[#0E1525] text-[#64748B]"
                            >
                              {file.type.toUpperCase().replace('.', '')}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </motion.div>

                    {/* Divider */}
                    <div className="my-4 h-[1px] bg-[#1E293B]" />

                    {/* Details Section */}
                    <motion.div
                      variants={staggerItem}
                      transition={staggerTransition}
                      className="grid grid-cols-2 gap-x-6 gap-y-3"
                    >
                      <div>
                        <p className="text-[13px] text-[#64748B]">System</p>
                        <p className="mt-0.5 text-sm text-[#F1F5F9]">
                          {formData.systemName}
                        </p>
                      </div>
                      <div>
                        <p className="text-[13px] text-[#64748B]">Version</p>
                        <p className="mt-0.5 text-sm text-[#F1F5F9]">{formData.version}</p>
                      </div>
                      <div>
                        <p className="text-[13px] text-[#64748B]">Evidence Type</p>
                        <p className="mt-0.5 text-sm text-[#F1F5F9]">
                          {formData.evidenceType}
                        </p>
                      </div>
                      <div>
                        <p className="text-[13px] text-[#64748B]">Priority</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: getPriorityColor(formData.priority),
                            }}
                          />
                          <span className="text-sm text-[#F1F5F9]">
                            {formData.priority}
                          </span>
                        </div>
                      </div>
                      {formData.tags.length > 0 && (
                        <div className="col-span-2">
                          <p className="text-[13px] text-[#64748B]">Tags</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {formData.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="border-[rgba(59,130,246,0.25)] bg-[rgba(59,130,246,0.12)] text-[#3B82F6]"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>

                    {/* Notes Section */}
                    {formData.description && (
                      <>
                        <div className="my-4 h-[1px] bg-[#1E293B]" />
                        <motion.div
                          variants={staggerItem}
                          transition={staggerTransition}
                        >
                          <p className="text-[13px] text-[#64748B]">Additional Notes</p>
                          <div className="mt-2 border-l-[3px] border-[#1E293B] pl-3">
                            <p className="text-sm leading-relaxed text-[#94A3B8]">
                              {formData.description}
                            </p>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </motion.div>

                  {/* Actions */}
                  <motion.div
                    className="mt-6 flex items-center justify-between"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      className="border-[#1E293B] bg-[#1A2235] text-[#F1F5F9] hover:border-[#334155] hover:bg-[#1A2235]"
                    >
                      Back to Edit
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="bg-[#3B82F6] text-[#0B0F19] hover:bg-[#2563EB]"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0B0F19] border-t-transparent" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Submit Evidence
                        </>
                      )}
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ---- RIGHT: Guidelines Sidebar ---- */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <motion.div
            className="rounded-[10px] border border-[#1E293B] bg-[#111827] p-6"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.35, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="mb-5 flex items-center gap-2">
              <Info className="h-4 w-4 text-[#3B82F6]" />
              <h3 className="text-[16px] font-semibold text-[#F1F5F9]">
                Upload Guidelines
              </h3>
            </div>

            {/* Guidelines list */}
            <div className="space-y-5">
              {/* Supported Formats */}
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <FileCheck className="h-4 w-4 text-[#10B981]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#F1F5F9]">
                    Supported Formats
                  </p>
                  <p className="mt-0.5 text-[13px] leading-[1.5] text-[#94A3B8]">
                    We accept ZIP archives, PDF reports, SARIF, JSON, and XML
                    files up to 50MB each.
                  </p>
                </div>
              </div>

              {/* Review Timeline */}
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <Clock className="h-4 w-4 text-[#F59E0B]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#F1F5F9]">
                    Review Timeline
                  </p>
                  <p className="mt-0.5 text-[13px] leading-[1.5] text-[#94A3B8]">
                    Normal priority: 2-3 business days. High: 1 day. Critical: 4
                    hours.
                  </p>
                </div>
              </div>

              {/* Data Security */}
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <Lock className="h-4 w-4 text-[#3B82F6]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#F1F5F9]">
                    Data Security
                  </p>
                  <p className="mt-0.5 text-[13px] leading-[1.5] text-[#94A3B8]">
                    All uploads are encrypted at rest. Only authorized reviewers
                    can access your evidence.
                  </p>
                </div>
              </div>

              {/* Tagging Tips */}
              <div className="flex gap-3">
                <div className="mt-0.5 shrink-0">
                  <Tag className="h-4 w-4 text-[#8B5CF6]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#F1F5F9]">
                    Tagging Tips
                  </p>
                  <p className="mt-0.5 text-[13px] leading-[1.5] text-[#94A3B8]">
                    Use descriptive tags to help route your submission to the
                    right review team.
                  </p>
                </div>
              </div>
            </div>

            {/* SOC 2 Badge */}
            <div className="mt-6 flex flex-col items-center rounded-lg border border-[#1E293B] bg-[#0E1525] px-4 py-5 text-center">
              <ShieldCheck className="h-8 w-8 text-[#10B981]" />
              <p className="mt-2 text-[13px] font-medium text-[#94A3B8]">
                SOC 2 Type II Compliant
              </p>
              <p className="mt-0.5 text-[12px] leading-[1.4] text-[#64748B]">
                Your data is handled according to industry best practices
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ============ RECENT UPLOADS TABLE ============ */}
      <motion.div
        className="mt-12"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.35, ease: 'easeOut' }}
      >
        {/* Table header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold leading-[1.3] tracking-[-0.01em] text-[#F1F5F9]">
            Recent Uploads
          </h2>
          <Link
            to="/queue"
            className="inline-flex items-center gap-1 text-[13px] text-[#3B82F6] transition-colors hover:underline"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Table */}
        <div className="rounded-[10px] border border-[#1E293B] bg-[#111827] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b-[#1E293B] bg-[#1A2235] hover:bg-[#1A2235]">
                <TableHead className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                  File Name
                </TableHead>
                <TableHead className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                  System
                </TableHead>
                <TableHead className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                  Type
                </TableHead>
                <TableHead className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                  Status
                </TableHead>
                <TableHead className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                  Date
                </TableHead>
                <TableHead className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-[#64748B]">
                  Size
                </TableHead>
                <TableHead className="w-[60px] px-2 py-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {evidenceLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-[#64748B]">
                    Loading evidence...
                  </TableCell>
                </TableRow>
              ) : evidenceList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-[#64748B]">
                    No evidence uploaded yet
                  </TableCell>
                </TableRow>
              ) : evidenceList.map((row, idx) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.35 + idx * 0.04,
                    duration: 0.2,
                    ease: 'easeOut',
                  }}
                  className="border-b-[#1E293B] transition-colors hover:bg-[#1A2235]"
                >
                  <TableCell className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-[#64748B]" />
                      <span className="truncate text-sm text-[#F1F5F9]">
                        {row.original_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-sm text-[#94A3B8]">
                    {row.system_name || row.system_id || '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <Badge
                      variant="outline"
                      className="border-[#1E293B] bg-[#0E1525] text-[#94A3B8]"
                    >
                      {row.evidence_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <StatusBadge variant={row.status === 'verified' ? 'verified' : row.status === 'pending' ? 'pending' : row.status === 'threat' ? 'threat' : 'neutral'}>
                      {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 font-mono text-[12px] text-[#64748B]">
                    {new Date(row.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-[13px] text-[#64748B]">
                    {formatFileSize(row.file_size)}
                  </TableCell>
                  <TableCell className="px-2 py-3.5">
                    <button className="flex h-8 w-8 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#1A2235] hover:text-[#F1F5F9]">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </motion.div>
    </div>
  );
};

export default EvidenceUpload;
