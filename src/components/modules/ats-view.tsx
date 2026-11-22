'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building,
  Calendar,
  CalendarCheck,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Copy,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Laptop,
  Layers,
  Mail,
  MapPin,
  MessageSquarePlus,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Users,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { AtsKanbanStageItem, fetchAtsMock, fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  approveDepartmentRecruitmentRequest,
  createDepartmentRecruitmentRequest,
  generateNextEmployeeCode,
  getCompanyAssets,
  getDepartmentRecruitmentRequests,
  getOnboardingRecords,
  HRM_RUNTIME_EVENT,
  initiateCandidateOnboarding,
  mergeWithRuntimeCandidates,
  mergeWithRuntimeEmployees,
  mergeWithRuntimeJobs,
  notifyCandidateStageChange,
  pushNotification,
  rejectDepartmentRecruitmentRequest,
  saveDepartmentRecruitmentRequest,
  saveRuntimeCandidate,
  saveRuntimeJob,
  updateCandidateOfferSalary,
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import { formatDateTimeVN, sanitizeText } from '@/lib/hrm/format';
import type {
  AssetCategory,
  AtsStage,
  Candidate,
  CandidateAiEvaluation,
  CandidateInterviewSchedule,
  CandidateRescheduleRequest,
  CompanyAsset,
  Department,
  DepartmentRecruitmentRequest,
  Employee,
  JobPosting,
} from '@/mock/types';
import { Avatar } from '@/components/ui/avatar';
import { Badge, BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const JOB_STATUS_BADGE: Record<JobPosting['status'], { label: string; variant: BadgeVariant }> = {
  URGENT: { label: 'Tuyển gấp', variant: 'danger' },
  OPEN: { label: 'Đang mở', variant: 'teal' },
  CLOSED: { label: 'Đã đóng', variant: 'muted' },
};

const AI_REC_BADGE: Record<
  CandidateAiEvaluation['ai_recommendation'],
  { label: string; variant: BadgeVariant }
> = {
  STRONG_HIRE: { label: 'Đề xuất tuyển ngay', variant: 'success' },
  PROCEED_INTERVIEW: { label: 'Mời phỏng vấn', variant: 'teal' },
  HOLD: { label: 'Cân nhắc thêm', variant: 'warning' },
  REJECT: { label: 'Chưa phù hợp', variant: 'danger' },
};

const ASSET_CATEGORY_SHORT: Record<AssetCategory, string> = {
  LAPTOP: 'Laptop',
  MONITOR: 'Màn hình',
  ACCESS_CARD: 'Thẻ từ',
  PERIPHERAL: 'Ngoại vi',
};

export const CANDIDATE_SOURCE_BADGES: Record<
  Candidate['source'],
  { label: string; className: string }
> = {
  LinkedIn: {
    label: 'LinkedIn',
    className: 'border-sky-500/30 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-300',
  },
  TopCV: {
    label: 'TopCV',
    className: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  ITviec: {
    label: 'ITviec',
    className: 'border-rose-500/30 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300',
  },
  Referral: {
    label: 'Referral',
    className: 'border-purple-500/30 bg-purple-50 text-purple-700 dark:border-purple-500/40 dark:bg-purple-950/40 dark:text-purple-300',
  },
  CareerSite: {
    label: 'CareerSite',
    className: 'border-teal-500/30 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300',
  },
};

export const CANDIDATE_STAGE_BADGES: Record<
  AtsStage,
  { label: string; className: string; variant: BadgeVariant }
> = {
  APPLIED: {
    label: 'Hồ sơ mới',
    variant: 'secondary',
    className: 'border-sky-500/30 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-300',
  },
  AI_SCREENED: {
    label: 'Sàng lọc AI',
    variant: 'teal',
    className: 'border-teal-500/30 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300',
  },
  INTERVIEW: {
    label: 'Phỏng vấn',
    variant: 'warning',
    className: 'border-amber-500/30 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300',
  },
  OFFER: {
    label: 'Đề nghị nhận việc',
    variant: 'default',
    className: 'border-violet-500/30 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-950/40 dark:text-violet-300',
  },
  ONBOARDED: {
    label: 'Đã nhận việc',
    variant: 'success',
    className: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  REJECTED: {
    label: 'Đã loại',
    variant: 'danger',
    className: 'border-rose-500/30 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300',
  },
};

export interface AtsThreeColumnDef {
  id: 'col-received' | 'col-interview' | 'col-offer-onboarded';
  label: string;
  dotColor: string;
  topBorder: string;
  stages: AtsStage[];
}

export const KANBAN_THREE_COLUMNS: AtsThreeColumnDef[] = [
  {
    id: 'col-received',
    label: 'Hồ sơ đã nhận',
    dotColor: 'bg-sky-500',
    topBorder: 'border-t-2 border-t-sky-500',
    stages: ['APPLIED', 'AI_SCREENED'],
  },
  {
    id: 'col-interview',
    label: 'Phỏng vấn',
    dotColor: 'bg-amber-500',
    topBorder: 'border-t-2 border-t-amber-500',
    stages: ['INTERVIEW'],
  },
  {
    id: 'col-offer-onboarded',
    label: 'Đề nghị & Đã nhận việc',
    dotColor: 'bg-emerald-500',
    topBorder: 'border-t-2 border-t-emerald-500',
    stages: ['OFFER', 'ONBOARDED'],
  },
];

export interface AtsKanbanColumnDef {
  id: string;
  stage: AtsStage;
  label: string;
  dotColor: string;
  topBorder: string;
  isNeutral?: boolean;
}

export const KANBAN_5_COLUMNS: AtsKanbanColumnDef[] = [
  {
    id: 'col-applied',
    stage: 'APPLIED',
    label: 'Mới nhận',
    dotColor: 'bg-sky-500',
    topBorder: 'border-t-2 border-t-sky-500',
  },
  {
    id: 'col-screened',
    stage: 'AI_SCREENED',
    label: 'Sàng lọc',
    dotColor: 'bg-teal-500',
    topBorder: 'border-t-2 border-t-teal-500',
  },
  {
    id: 'col-interview',
    stage: 'INTERVIEW',
    label: 'Phỏng vấn',
    dotColor: 'bg-amber-500',
    topBorder: 'border-t-2 border-t-amber-500',
  },
  {
    id: 'col-offer',
    stage: 'OFFER',
    label: 'Offer',
    dotColor: 'bg-violet-500',
    topBorder: 'border-t-2 border-t-violet-500',
  },
  {
    id: 'col-onboarded',
    stage: 'ONBOARDED',
    label: 'Nhận việc',
    dotColor: 'bg-emerald-500',
    topBorder: 'border-t-2 border-t-emerald-500',
  },
  {
    id: 'col-rejected',
    stage: 'REJECTED',
    label: 'Đã loại / Đã rút',
    dotColor: 'bg-zinc-400',
    topBorder: 'border-t-2 border-t-zinc-400 dark:border-t-zinc-600',
    isNeutral: true,
  },
];

export const KANBAN_CARD_LIMIT = 8;

export function getDaysInStage(cand: Candidate): number {
  const now = new Date('2026-11-21T12:00:00Z').getTime();
  let lastDateStr = cand.applied_date;
  if (cand.activity_logs && cand.activity_logs.length > 0) {
    const stageLogs = cand.activity_logs.filter(
      (log) => log.type === 'STAGE_CHANGE' || log.type === 'STATUS_CHANGE'
    );
    if (stageLogs.length > 0) {
      lastDateStr = stageLogs[stageLogs.length - 1].created_at;
    }
  }
  const then = new Date(lastDateStr).getTime();
  if (isNaN(then)) return 1;
  const diffDays = Math.max(1, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
  return diffDays;
}

export function getStageDisplayLabel(stage: AtsStage): string {
  switch (stage) {
    case 'APPLIED':
      return 'Hồ sơ mới';
    case 'AI_SCREENED':
      return 'Sàng lọc';
    case 'INTERVIEW':
      return 'Phỏng vấn';
    case 'OFFER':
      return 'Đề nghị';
    case 'ONBOARDED':
      return 'Đã nhận việc';
    case 'REJECTED':
      return 'Đã loại';
    default:
      return stage;
  }
}

function stripVietnameseAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

function suggestCorporateEmail(fullName: string, existingEmployees: Employee[]): string {
  const tokens = stripVietnameseAccents(fullName).split(/\s+/).filter(Boolean);
  const baseLocal =
    tokens.length === 0
      ? 'nhansu.moi'
      : tokens.length === 1
      ? tokens[0]
      : `${tokens[tokens.length - 1]}.${tokens[0]}`;

  const taken = new Set(existingEmployees.map((e) => e.email.toLowerCase()));
  let candidateEmail = `${baseLocal}@lacviethrm.vn`;
  let counter = 2;
  while (taken.has(candidateEmail.toLowerCase())) {
    candidateEmail = `${baseLocal}${counter}@lacviethrm.vn`;
    counter += 1;
  }
  return candidateEmail;
}

function parseOfferSalaryVnd(rawInput: string): number {
  const normalized = rawInput
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
  if (!normalized) return 0;

  const trSplitMatch = normalized.match(/^(\d+)\s*(?:tr|trieu)\s*(\d+)$/);
  if (trSplitMatch) {
    const millions = Number(trSplitMatch[1]);
    const fracStr = trSplitMatch[2];
    const fracValue = Number(fracStr) / Math.pow(10, fracStr.length);
    return Math.round((millions + fracValue) * 1_000_000);
  }

  const millionMatch = normalized.match(/^(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|m)\b/);
  if (millionMatch) {
    const val = Number(millionMatch[1].replace(',', '.'));
    if (!Number.isNaN(val) && val > 0) {
      return Math.round(val * 1_000_000);
    }
  }

  const digitsOnly = normalized.replace(/[^\d]/g, '');
  if (!digitsOnly) return 0;
  const parsed = Number(digitsOnly);
  return Number.isNaN(parsed) || parsed <= 0 ? 0 : parsed;
}

export function AtsView() {
  const { role, currentUserProfile, showToast, navigateWithIntent, navIntent, clearNavIntent } = useApp();
  const hideSalary = role === 'DEPT_MANAGER';
  const canProposeRecruitment =
    role === 'SUPER_ADMIN' ||
    role === 'DIRECTOR' ||
    role === 'DEPT_MANAGER' ||
    role === 'HR_MANAGER';
  const canPostJob = role === 'SUPER_ADMIN' || role === 'HR_MANAGER';
  const defaultProfile = ROLE_DEFAULT_PROFILES[role];
  const actorName = currentUserProfile?.fullName || defaultProfile.fullName;
  const actorCode = currentUserProfile?.employee_code || defaultProfile.employee_code;

  const baseCandidatesRef = useRef<Candidate[]>([]);
  const baseEmployeesRef = useRef<Employee[]>([]);
  const baseJobsRef = useRef<JobPosting[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [kanbanStages, setKanbanStages] = useState<AtsKanbanStageItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('ALL');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isPreviewCvOpen, setIsPreviewCvOpen] = useState(false);
  const [isNoteFormOpen, setIsNoteFormOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteRating, setNoteRating] = useState<number>(5);
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [showJobCards, setShowJobCards] = useState(false);
  const [activeTab, setActiveTab] = useState<'candidates' | 'jobs' | 'requests'>('candidates');
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>({ 'col-rejected': true });
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({});
  const [expandedLimits, setExpandedLimits] = useState<Record<string, boolean>>({});
  const [candidateSearch, setCandidateSearch] = useState<string>('');
  const [selectedStageFilter, setSelectedStageFilter] = useState<AtsStage | 'ALL'>('ALL');
  const [timeFilter, setTimeFilter] = useState<'30_DAYS' | 'CURRENT_MONTH' | 'ALL'>('ALL');
  const [isCompactMode, setIsCompactMode] = useState<boolean>(true);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState<boolean>(false);
  const [dragOverColStage, setDragOverColStage] = useState<AtsStage | null>(null);
  const [activeCardMenuId, setActiveCardMenuId] = useState<string | null>(null);
  const [isMenuToolbarOpen, setIsMenuToolbarOpen] = useState(false);

  // Drag-and-drop & Step Transition confirmation dialog states
  const [offerDialogCandidate, setOfferDialogCandidate] = useState<Candidate | null>(null);
  const [offerSalaryInput, setOfferSalaryInput] = useState<string>('');
  const [offerStartDateInput, setOfferStartDateInput] = useState<string>('2026-12-01');
  const [offerNotesInput, setOfferNotesInput] = useState<string>('');
  const [rejectDialogCandidate, setRejectDialogCandidate] = useState<Candidate | null>(null);
  const [rejectReasonOption, setRejectReasonOption] = useState<string>('Kỹ năng chuyên môn chưa phù hợp');
  const [rejectDetailsInput, setRejectDetailsInput] = useState<string>('');
  const [lastMovedAction, setLastMovedAction] = useState<{
    candidateId: string;
    candidateName: string;
    fromStage: AtsStage;
    toStage: AtsStage;
  } | null>(null);

  const toggleColCollapse = (colId: string) => {
    setCollapsedCols((prev) => ({ ...prev, [colId]: !prev[colId] }));
  };

  const toggleSubgroup = (subgroupId: 'offer' | 'onboarded') => {
    setCollapsedSubgroups((prev) => ({ ...prev, [subgroupId]: !prev[subgroupId] }));
  };

  const toggleLimit = (sectionKey: string) => {
    setExpandedLimits((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  // Onboarding initiation dialog state
  const [onboardingCandidate, setOnboardingCandidate] = useState<Candidate | null>(null);
  const [onbPosition, setOnbPosition] = useState<string>('');
  const [onbEmpCode, setOnbEmpCode] = useState<string>('');
  const [onbEmail, setOnbEmail] = useState<string>('');
  const [onbDeptId, setOnbDeptId] = useState<string>('dept-tech-swe');
  const [onbManagerName, setOnbManagerName] = useState<string>('');
  const [onbStartDate, setOnbStartDate] = useState<string>('2026-11-23');
  const [onbSalary, setOnbSalary] = useState<string>('22000000');
  const [availableAssets, setAvailableAssets] = useState<CompanyAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [lastCreatedOnboarding, setLastCreatedOnboarding] = useState<{
    onboardingId: string;
    employeeCode: string;
    fullName: string;
  } | null>(null);

  // Interview schedule dialog state
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [schedulingCandidate, setSchedulingCandidate] = useState<Candidate | null>(null);
  const [prevCandidateStage, setPrevCandidateStage] = useState<AtsStage | null>(null);
  const [interviewDate, setInterviewDate] = useState<string>('');
  const [interviewTime, setInterviewTime] = useState<string>('09:30');
  const [interviewFormat, setInterviewFormat] = useState<'Online' | 'Offline'>('Online');
  const [interviewInterviewer, setInterviewInterviewer] = useState<string>('');
  const [interviewSendNotification, setInterviewSendNotification] = useState<boolean>(true);
  const [interviewLocationOrLink, setInterviewLocationOrLink] = useState<string>('');

  // New Job form state
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobDeptId, setNewJobDeptId] = useState('dept-tech-swe');
  const [newJobLevel, setNewJobLevel] = useState('Senior');
  const [newJobTarget, setNewJobTarget] = useState('1');
  const [newJobClosingDate, setNewJobClosingDate] = useState('2026-12-30');
  const [newJobUrgent, setNewJobUrgent] = useState<'OPEN' | 'URGENT'>('OPEN');
  const [newJobMinSalary, setNewJobMinSalary] = useState('25000000');
  const [newJobMaxSalary, setNewJobMaxSalary] = useState('40000000');
  const [newJobWorkMode, setNewJobWorkMode] = useState<'Hybrid' | 'Onsite' | 'Remote'>('Hybrid');
  const [newJobLocation, setNewJobLocation] = useState('Hà Nội / Hybrid');
  const [newJobOverview, setNewJobOverview] = useState('');

  // Department Recruitment Requests state
  const [deptRequests, setDeptRequests] = useState<DepartmentRecruitmentRequest[]>([]);
  const [isAddDeptReqOpen, setIsAddDeptReqOpen] = useState(false);
  const [reqDeptId, setReqDeptId] = useState('dept-tech-swe');
  const [reqPositionTitle, setReqPositionTitle] = useState('');
  const [reqLevel, setReqLevel] = useState('Senior');
  const [reqQuantity, setReqQuantity] = useState('1');
  const [reqUrgency, setReqUrgency] = useState<'NORMAL' | 'URGENT'>('URGENT');
  const [reqReason, setReqReason] = useState('');
  const [reqSalaryRange, setReqSalaryRange] = useState('25.000.000 - 40.000.000 đ');
  const [reqDeadline, setReqDeadline] = useState('2026-12-25');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');

  // Department Requests detail drawer & confirmation dialogs
  const [selectedDeptReq, setSelectedDeptReq] = useState<DepartmentRecruitmentRequest | null>(null);
  const [rejectTargetReq, setRejectTargetReq] = useState<DepartmentRecruitmentRequest | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState<string>('');
  const [rejectReasonError, setRejectReasonError] = useState<string | null>(null);
  const [approvePreviewReq, setApprovePreviewReq] = useState<DepartmentRecruitmentRequest | null>(null);

  const syncRuntimeData = useCallback(() => {
    if (baseJobsRef.current.length > 0) {
      setJobs(mergeWithRuntimeJobs(baseJobsRef.current));
    }
    if (baseCandidatesRef.current.length > 0) {
      setCandidates(mergeWithRuntimeCandidates(baseCandidatesRef.current));
    }
    if (baseEmployeesRef.current.length > 0) {
      setEmployees(mergeWithRuntimeEmployees(baseEmployeesRef.current));
    }
    setDeptRequests(getDepartmentRecruitmentRequests());
  }, []);

  const handleResetCandidatesData = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('hrm_runtime_candidates_v1');
        window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
      } catch {
        // ignore
      }
    }
    setCandidates(baseCandidatesRef.current);
    setSelectedJobId('ALL');
    setSelectedSource('ALL');
    setCandidateSearch('');
    setSelectedStageFilter('ALL');
    setTimeFilter('ALL');
    setIsCompactMode(true);
    setCollapsedSubgroups({});
    setExpandedLimits({});
    showToast('Đã đặt lại dữ liệu ứng viên', 'Bảng Kanban đã được đồng bộ về dữ liệu ban đầu.', 'success');
  };

  const handleExportCandidatesCsv = () => {
    const header = 'Mã UV,Họ tên,Vị trí,Phòng ban,Bước tuyển dụng,Nguồn,Ngày nộp,Lương kỳ vọng (VND)\n';
    const rows = filteredCandidates
      .map(
        (c) =>
          `"${c.candidate_code}","${c.full_name}","${c.job_title}","${c.department_name}","${c.stage}","${c.source}","${c.applied_date}","${c.expected_salary_vnd}"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `danh_sach_ung_vien_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã xuất danh sách ứng viên', `Đã tải tệp CSV (${filteredCandidates.length} hồ sơ).`, 'success');
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetchAtsMock(), fetchEmployeesMock()])
      .then(([atsData, empData]) => {
        if (!active) return;
        baseJobsRef.current = atsData.MOCK_JOB_POSTINGS;
        baseCandidatesRef.current = atsData.MOCK_CANDIDATES;
        baseEmployeesRef.current = empData.MOCK_EMPLOYEES;
        setKanbanStages(atsData.ATS_KANBAN_STAGES);
        setJobs(mergeWithRuntimeJobs(atsData.MOCK_JOB_POSTINGS));
        setCandidates(mergeWithRuntimeCandidates(atsData.MOCK_CANDIDATES));
        setEmployees(mergeWithRuntimeEmployees(empData.MOCK_EMPLOYEES));
        setDepartments(empData.MOCK_DEPARTMENTS);
        setDeptRequests(getDepartmentRecruitmentRequests());
        if (empData.MOCK_DEPARTMENTS[2]?.id) {
          setNewJobDeptId(empData.MOCK_DEPARTMENTS[2].id);
        }
      })
      .catch(() => {
        if (!active) return;
        showToast('Không thể tải dữ liệu Tuyển dụng ATS', 'Vui lòng thử làm mới lại trang.', 'error');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    window.addEventListener(HRM_RUNTIME_EVENT, syncRuntimeData);
    window.addEventListener('storage', syncRuntimeData);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncRuntimeData);
      window.removeEventListener('storage', syncRuntimeData);
    };
  }, [syncRuntimeData]);

  useEffect(() => {
    if (
      navIntent &&
      (navIntent.navId === 'ats' || navIntent.navId === 'recruitment') &&
      navIntent.entityId
    ) {
      const match = candidates.find(
        (c) => c.id === navIntent.entityId || c.candidate_code === navIntent.entityId
      );
      if (match) {
        setSelectedCandidate(match);
        clearNavIntent();
      }
    }
  }, [navIntent, candidates, clearNavIntent]);

  const stageOrder = useMemo(() => kanbanStages.map((s) => s.stage), [kanbanStages]);

  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (selectedJobId !== 'ALL') {
      list = list.filter((c) => c.job_id === selectedJobId);
    }
    if (selectedStageFilter !== 'ALL') {
      list = list.filter((c) => c.stage === selectedStageFilter);
    }
    if (selectedSource !== 'ALL') {
      list = list.filter((c) => c.source === selectedSource);
    }

    // Time filter
    if (timeFilter === '30_DAYS') {
      const now = Date.now();
      list = list.filter((c) => {
        const time = new Date(c.applied_date).getTime();
        const diffDays = (now - time) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 30;
      });
    } else if (timeFilter === 'CURRENT_MONTH') {
      list = list.filter((c) => c.applied_date.startsWith('2026-11'));
    }

    const rawQuery = candidateSearch.trim();
    if (rawQuery) {
      const normQuery = rawQuery
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .toLowerCase();
      const compactDigits = rawQuery.replace(/\s+/g, '').toLowerCase();

      list = list.filter((c) => {
        const searchableText = `${c.full_name} ${c.email} ${c.phone} ${c.job_title} ${c.candidate_code} ${c.department_name}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[đĐ]/g, 'd')
          .toLowerCase();
        if (searchableText.includes(normQuery)) return true;
        if (compactDigits && c.phone.replace(/\s+/g, '').toLowerCase().includes(compactDigits)) {
          return true;
        }
        return false;
      });
    }

    return list;
  }, [candidates, selectedJobId, selectedStageFilter, selectedSource, timeFilter, candidateSearch]);

  const openOnboardingInitDialog = (candidate: Candidate) => {
    const currentMergedEmployees = mergeWithRuntimeEmployees(
      baseEmployeesRef.current.length > 0 ? baseEmployeesRef.current : employees
    );
    setEmployees(currentMergedEmployees);

    const matchedJob = jobs.find((j) => j.id === candidate.job_id);
    const matchedDept =
      departments.find(
        (d) =>
          (matchedJob && d.id === matchedJob.department_id) ||
          d.department_name === candidate.department_name
      ) ?? departments[0];

    const suggestedCode = generateNextEmployeeCode(currentMergedEmployees);
    const suggestedEmail = suggestCorporateEmail(candidate.full_name, currentMergedEmployees);
    const suggestedProbationSalary =
      Math.round((candidate.expected_salary_vnd * 0.85) / 100000) * 100000;
    const defaultInitSalary =
      candidate.offered_salary_vnd && candidate.offered_salary_vnd > 0
        ? candidate.offered_salary_vnd
        : suggestedProbationSalary || 22000000;

    const currentAvailableAssets = getCompanyAssets().filter((a) => a.status === 'AVAILABLE');
    const preselectedLaptop = currentAvailableAssets.find((a) => a.category === 'LAPTOP');

    setOnboardingCandidate(candidate);
    setOnbPosition(candidate.job_title);
    setOnbEmpCode(suggestedCode);
    setOnbEmail(suggestedEmail);
    setOnbDeptId(matchedDept?.id ?? 'dept-tech-swe');
    setOnbManagerName(
      matchedJob?.hiring_manager_name || matchedDept?.manager_name || 'Lê Hoàng Nam'
    );
    setOnbStartDate('2026-11-23');
    setOnbSalary(String(defaultInitSalary));
    setAvailableAssets(currentAvailableAssets);
    setSelectedAssetIds(preselectedLaptop ? [preselectedLaptop.id] : []);
  };

  const handleOnbDeptChange = (nextDeptId: string) => {
    setOnbDeptId(nextDeptId);
    const dept = departments.find((d) => d.id === nextDeptId);
    if (dept) {
      setOnbManagerName(dept.manager_name);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const handleConfirmInitiateOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingCandidate) return;

    const trimmedCode = onbEmpCode.trim().toUpperCase();
    const trimmedEmail = onbEmail.trim();
    if (!trimmedCode || !trimmedEmail) {
      showToast(
        'Thiếu thông tin tiếp nhận',
        'Vui lòng kiểm tra mã nhân viên và địa chỉ email công ty.',
        'warning'
      );
      return;
    }

    const targetDept =
      departments.find((d) => d.id === onbDeptId) ??
      departments[0] ?? {
        id: 'dept-tech-swe',
        department_name: onboardingCandidate.department_name,
        manager_name: 'Lê Hoàng Nam',
      };

    const salaryNum =
      parseOfferSalaryVnd(onbSalary) ||
      Number(onbSalary) ||
      onboardingCandidate.offered_salary_vnd ||
      onboardingCandidate.expected_salary_vnd;

    const result = initiateCandidateOnboarding({
      candidate: onboardingCandidate,
      employeeCode: trimmedCode,
      email: trimmedEmail,
      departmentId: targetDept.id,
      departmentName: targetDept.department_name,
      positionName: onbPosition.trim() || onboardingCandidate.job_title,
      managerName: onbManagerName.trim() || targetDept.manager_name,
      startDate: onbStartDate || '2026-11-23',
      baseSalaryVnd: salaryNum,
      grossSalaryVnd: salaryNum,
      assetIds: selectedAssetIds,
      actorName,
    });

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Tuyển dụng & AI CV',
      target: `${result.onboarding.id} (${result.employee.employee_code} - ${onboardingCandidate.full_name})`,
      detail: `Chuyển ứng viên ${onboardingCandidate.candidate_code} sang Onboarding tại ${targetDept.department_name}, cấp phát ${selectedAssetIds.length} thiết bị.`,
      status: 'SUCCESS',
    });

    setCandidates((prev) =>
      prev.map((c) =>
        c.id === onboardingCandidate.id
          ? {
              ...c,
              stage: 'ONBOARDED',
              offered_salary_vnd:
                result.onboarding.official_salary_vnd ?? salaryNum ?? c.offered_salary_vnd,
              preboarding_token: result.invite.token,
            }
          : c
      )
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === onboardingCandidate.id
        ? {
            ...prev,
            stage: 'ONBOARDED',
            offered_salary_vnd:
              result.onboarding.official_salary_vnd ?? salaryNum ?? prev.offered_salary_vnd,
            preboarding_token: result.invite.token,
          }
        : prev
    );
    setOnboardingCandidate(null);
    setLastCreatedOnboarding({
      onboardingId: result.onboarding.id,
      employeeCode: result.employee.employee_code,
      fullName: result.employee.full_name,
    });

    showToast(
      `Đã khởi tạo Onboarding ${result.onboarding.id}`,
      `${result.employee.full_name} (${result.employee.employee_code}) đã đồng bộ sang Core HR và mở lộ trình hội nhập.`,
      'success'
    );
  };

  const openInterviewScheduleModal = (
    candidate: Candidate,
    initialDate?: string,
    initialTime?: string
  ) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDate = tomorrow.toISOString().split('T')[0];

    setSchedulingCandidate(candidate);
    setPrevCandidateStage(candidate.stage);
    setInterviewDate(initialDate || candidate.interview_schedule?.date || defaultDate);
    setInterviewTime(initialTime || candidate.interview_schedule?.time || '09:30');
    setInterviewFormat(candidate.interview_schedule?.format || 'Online');
    setInterviewInterviewer(
      candidate.interview_schedule?.interviewer ||
        actorName ||
        'Trần Trọng Trí (Engineering Lead)'
    );
    setInterviewSendNotification(
      candidate.interview_schedule ? candidate.interview_schedule.send_notification : true
    );
    setInterviewLocationOrLink(
      candidate.interview_schedule?.location_or_link ||
        `https://meet.google.com/hrm-${candidate.candidate_code.toLowerCase()}`
    );
    setIsInterviewModalOpen(true);
  };

  const handleAcceptReschedule = (candidate: Candidate) => {
    let prepDate = candidate.interview_schedule?.date;
    let prepTime = candidate.interview_schedule?.time;
    if (candidate.reschedule_request?.proposed_time) {
      const pt = candidate.reschedule_request.proposed_time.trim();
      const dateMatch = pt.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        prepDate = dateMatch[1];
      }
      const timeMatch = pt.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) {
        prepTime = timeMatch[1].padStart(5, '0');
      }
    }
    openInterviewScheduleModal(candidate, prepDate, prepTime);
  };

  const handleRejectReschedule = (candidate: Candidate) => {
    if (!candidate.reschedule_request) return;
    const newLogItem = {
      id: `log-${Date.now()}`,
      event_id: `evt-reject-resched-${Date.now()}`,
      type: 'RESCHEDULE_REJECTED',
      title: 'Từ chối đề xuất dời lịch',
      description: `Nhân sự đã từ chối yêu cầu dời lịch, giữ nguyên thời gian phỏng vấn cũ.`,
      actor_name: actorName,
      created_at: new Date().toISOString(),
    };
    const updatedCandidate: Candidate = {
      ...candidate,
      interview_schedule: candidate.interview_schedule
        ? { ...candidate.interview_schedule, status: 'invited' }
        : undefined,
      reschedule_request: {
        ...candidate.reschedule_request,
        status: 'REJECTED',
      },
      activity_logs: [newLogItem, ...(candidate.activity_logs || [])],
    };
    saveRuntimeCandidate(updatedCandidate);
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? updatedCandidate : c))
    );
    setSelectedCandidate(updatedCandidate);

    const scheduleInfo = candidate.interview_schedule
      ? `Lịch phỏng vấn vẫn giữ nguyên vào lúc ${candidate.interview_schedule.time} ngày ${formatDateVN(candidate.interview_schedule.date)} (${candidate.interview_schedule.format}).`
      : 'Vui lòng liên hệ bộ phận tuyển dụng để biết thêm chi tiết.';

    pushNotification({
      title: `Phản hồi yêu cầu dời lịch: ${candidate.job_title}`,
      message: `Chào ${candidate.full_name}, rất tiếc yêu cầu dời lịch phỏng vấn của bạn chưa được chấp thuận do lịch của người phỏng vấn đã kín. ${scheduleInfo} Vui lòng sắp xếp tham dự đúng giờ.`,
      category: 'ONBOARDING',
      target_roles: ['CANDIDATE', 'HR_MANAGER'],
      target_employee_codes: [candidate.candidate_code],
      nav_id: 'candidate',
    });

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT' as any,
      module: 'Tuyển dụng & AI CV',
      target: `${candidate.candidate_code} - ${candidate.full_name}`,
      detail: `Từ chối đề xuất dời lịch phỏng vấn của ứng viên ${candidate.full_name}, giữ nguyên lịch cũ.`,
    });

    showToast(
      'Đã từ chối dời lịch',
      `Giữ nguyên lịch phỏng vấn cũ và đã gửi thông báo phản hồi tới ứng viên ${candidate.full_name}.`,
      'default'
    );
  };

  const handleCancelInterviewModal = () => {
    if (schedulingCandidate) {
      const hasValidSchedule = Boolean(schedulingCandidate.interview_schedule?.date);
      let targetStage = prevCandidateStage || schedulingCandidate.stage;
      // Quy tắc cốt lõi: Nếu không thiết lập lịch phỏng vấn,
      // ứng viên tuyệt đối không thể sang hoặc ở lại cột 'Phỏng vấn' (INTERVIEW).
      if (!hasValidSchedule) {
        targetStage =
          prevCandidateStage && prevCandidateStage !== 'INTERVIEW'
            ? prevCandidateStage
            : 'AI_SCREENED';
      }

      const updatedCandidate: Candidate = {
        ...schedulingCandidate,
        stage: targetStage,
      };
      saveRuntimeCandidate(updatedCandidate);

      setCandidates((prev) =>
        prev.map((c) => (c.id === schedulingCandidate.id ? updatedCandidate : c))
      );
      setSelectedCandidate((prev) =>
        prev && prev.id === schedulingCandidate.id ? updatedCandidate : prev
      );

      if (!hasValidSchedule) {
        showToast(
          'Chưa thiết lập lịch phỏng vấn',
          `Ứng viên ${schedulingCandidate.full_name} không thể sang cột Phỏng vấn và đã được lưu ở cột 'Hồ sơ đã nhận'.`,
          'warning'
        );
      } else {
        showToast(
          'Đã hủy lên lịch phỏng vấn',
          `Ứng viên ${schedulingCandidate.full_name} được giữ nguyên trạng thái (${getStageDisplayLabel(targetStage)}).`,
          'default'
        );
      }
    }
    setIsInterviewModalOpen(false);
    setSchedulingCandidate(null);
    setPrevCandidateStage(null);
  };

  const handleConfirmInterviewSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingCandidate) return;

    if (!interviewDate) {
      showToast('Thiếu ngày phỏng vấn', 'Vui lòng chọn ngày phỏng vấn.', 'warning');
      return;
    }
    if (!interviewTime) {
      showToast('Thiếu giờ phỏng vấn', 'Vui lòng chọn thời gian phỏng vấn.', 'warning');
      return;
    }
    if (!interviewInterviewer.trim()) {
      showToast('Thiếu người phỏng vấn', 'Vui lòng nhập tên người phỏng vấn.', 'warning');
      return;
    }
    if (!interviewLocationOrLink.trim()) {
      showToast(
        'Thiếu địa điểm / link họp',
        `Vui lòng nhập ${interviewFormat === 'Online' ? 'đường dẫn Google Meet / Teams' : 'địa chỉ phòng họp'}.`,
        'warning'
      );
      return;
    }

    const isFromReschedule = schedulingCandidate.reschedule_request?.status === 'PENDING';
    const newStatus = isFromReschedule ? 'scheduled' : 'invited';
    const timeStr = `${interviewTime} ngày ${formatDateVN(interviewDate)}`;

    const newLogItem = {
      id: `log-${Date.now()}`,
      event_id: `evt-sched-${Date.now()}`,
      type: isFromReschedule ? 'INTERVIEW_RESCHEDULED' : 'INTERVIEW_SCHEDULED',
      title: isFromReschedule ? 'Xếp lại lịch phỏng vấn mới' : 'Thiết lập lịch phỏng vấn',
      description: `Lịch phỏng vấn mới vào lúc ${timeStr} (${interviewFormat}). Người PV: ${interviewInterviewer.trim()}.`,
      actor_name: actorName,
      created_at: new Date().toISOString(),
    };

    const updatedCandidate: Candidate = {
      ...schedulingCandidate,
      stage: 'INTERVIEW',
      interview_schedule: {
        date: interviewDate,
        time: interviewTime,
        format: interviewFormat,
        interviewer: interviewInterviewer.trim(),
        send_notification: interviewSendNotification,
        location_or_link: interviewLocationOrLink.trim(),
        scheduled_at: new Date().toISOString(),
        status: newStatus,
      },
      reschedule_request: schedulingCandidate.reschedule_request
        ? {
            ...schedulingCandidate.reschedule_request,
            status: 'ACCEPTED',
          }
        : undefined,
      activity_logs: [newLogItem, ...(schedulingCandidate.activity_logs || [])],
    };

    saveRuntimeCandidate(updatedCandidate);

    setCandidates((prev) =>
      prev.map((c) => (c.id === schedulingCandidate.id ? updatedCandidate : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === schedulingCandidate.id ? updatedCandidate : prev
    );

    if (isFromReschedule) {
      pushNotification({
        title: `Chấp thuận dời lịch phỏng vấn: ${schedulingCandidate.job_title}`,
        message: `Chào ${schedulingCandidate.full_name}, yêu cầu dời lịch phỏng vấn của bạn đã được chấp thuận. Lịch phỏng vấn mới đã được xếp vào lúc ${interviewTime} ngày ${formatDateVN(interviewDate)} (${interviewFormat === 'Online' ? 'Online: ' + interviewLocationOrLink.trim() : 'Địa điểm: ' + interviewLocationOrLink.trim()}). Người phỏng vấn: ${interviewInterviewer.trim()}.`,
        category: 'ONBOARDING',
        target_roles: ['CANDIDATE', 'HR_MANAGER'],
        target_employee_codes: [schedulingCandidate.candidate_code],
        nav_id: 'candidate',
      });
    } else if (interviewSendNotification) {
      pushNotification({
        title: `Lịch phỏng vấn: ${schedulingCandidate.job_title}`,
        message: `Chào ${schedulingCandidate.full_name}, bạn có lịch phỏng vấn vị trí ${schedulingCandidate.job_title} vào lúc ${interviewTime} ngày ${formatDateVN(interviewDate)} (${interviewFormat === 'Online' ? 'Online: ' + interviewLocationOrLink.trim() : 'Địa điểm: ' + interviewLocationOrLink.trim()}). Người phỏng vấn: ${interviewInterviewer.trim()}.`,
        category: 'ONBOARDING',
        target_roles: ['CANDIDATE', 'HR_MANAGER'],
        target_employee_codes: [schedulingCandidate.candidate_code],
        nav_id: 'candidate',
      });
    }

    notifyCandidateStageChange(
      schedulingCandidate,
      'INTERVIEW',
      'Phỏng vấn',
      actorName
    );

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT' as any,
      module: 'Tuyển dụng & AI CV',
      target: `${schedulingCandidate.candidate_code} - ${schedulingCandidate.full_name}`,
      detail: isFromReschedule
        ? `Chấp thuận dời lịch phỏng vấn và xếp lại: ${interviewTime} ngày ${formatDateVN(interviewDate)} (${interviewFormat}), người PV: ${interviewInterviewer.trim()}`
        : `Lên lịch phỏng vấn ${interviewTime} ngày ${formatDateVN(interviewDate)} (${interviewFormat}), người PV: ${interviewInterviewer.trim()}, địa điểm/link: ${interviewLocationOrLink.trim()}`,
    });

    showToast(
      isFromReschedule ? 'Đã xếp lại lịch phỏng vấn thành công' : 'Đã lên lịch phỏng vấn & cập nhật trạng thái',
      isFromReschedule
        ? `Đã chấp thuận đề xuất dời lịch của ${schedulingCandidate.full_name}. Lịch mới: ${interviewTime} ngày ${formatDateVN(interviewDate)}.`
        : `${schedulingCandidate.full_name} -> Phỏng vấn (${interviewTime} ngày ${formatDateVN(interviewDate)})${interviewSendNotification ? ' · Đã gửi thông báo thời gian thực cho ứng viên.' : '.'}`,
      'success'
    );

    setIsInterviewModalOpen(false);
    setSchedulingCandidate(null);
    setPrevCandidateStage(null);
  };

  const handleUndoStageMove = () => {
    if (!lastMovedAction) return;
    const cand = candidates.find((c) => c.id === lastMovedAction.candidateId);
    if (!cand) return;
    const targetStage = lastMovedAction.fromStage;
    const updatedCandidate: Candidate = { ...cand, stage: targetStage };
    saveRuntimeCandidate(updatedCandidate);
    setCandidates((prev) =>
      prev.map((c) => (c.id === cand.id ? updatedCandidate : c))
    );
    if (selectedCandidate && selectedCandidate.id === cand.id) {
      setSelectedCandidate(updatedCandidate);
    }
    showToast(
      'Đã hoàn tác chuyển bước',
      `Đã đưa ${cand.full_name} trở lại bước ${getStageDisplayLabel(targetStage)}.`,
      'info'
    );
    setLastMovedAction(null);
  };

  useEffect(() => {
    if (offerDialogCandidate) {
      const prefill =
        offerDialogCandidate.offered_salary_vnd && offerDialogCandidate.offered_salary_vnd > 0
          ? String(offerDialogCandidate.offered_salary_vnd)
          : offerDialogCandidate.expected_salary_vnd > 0
            ? String(offerDialogCandidate.expected_salary_vnd)
            : '';
      setOfferSalaryInput(prefill);
      setOfferNotesInput('');
    }
  }, [offerDialogCandidate]);

  const handleConfirmOfferDialog = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!offerDialogCandidate) return;
    const parsedVnd = parseOfferSalaryVnd(offerSalaryInput);
    const formattedSalary =
      parsedVnd > 0 ? formatVND(parsedVnd) : `${offerSalaryInput.trim()} đ`;
    const noteContent = `Đề xuất mức lương: ${formattedSalary}. Ngày bắt đầu: ${formatDateVN(offerStartDateInput)}. Ghi chú: ${offerNotesInput.trim()}`;
    const newNote = {
      id: `note-offer-${Date.now()}`,
      author: actorName,
      content: noteContent,
      created_at: new Date().toISOString(),
    };
    const candWithNote: Candidate = {
      ...offerDialogCandidate,
      ...(parsedVnd > 0 ? { offered_salary_vnd: parsedVnd } : {}),
      notes: [newNote, ...(offerDialogCandidate.notes || [])],
    };
    handleMoveStage(candWithNote, 'OFFER');
    if (parsedVnd > 0) {
      updateCandidateOfferSalary(candWithNote.id, parsedVnd);
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candWithNote.id ? { ...c, offered_salary_vnd: parsedVnd } : c
        )
      );
      setSelectedCandidate((prev) =>
        prev && prev.id === candWithNote.id
          ? { ...prev, offered_salary_vnd: parsedVnd }
          : prev
      );
    }
    setOfferDialogCandidate(null);
  };

  const handleConfirmRejectCandidateDialog = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rejectDialogCandidate) return;
    const fullReason = `${rejectReasonOption}${rejectDetailsInput.trim() ? ': ' + rejectDetailsInput.trim() : ''}`;
    const newNote = {
      id: `note-reject-${Date.now()}`,
      author: actorName,
      content: `Lý do loại hồ sơ: ${fullReason}`,
      created_at: new Date().toISOString(),
    };
    const candWithReject: Candidate = {
      ...rejectDialogCandidate,
      notes: [newNote, ...(rejectDialogCandidate.notes || [])],
    };
    handleMoveStage(candWithReject, 'REJECTED');
    setRejectDialogCandidate(null);
  };

  const handleMoveStage = (candidate: Candidate, targetStage: AtsStage) => {
    if (targetStage === 'ONBOARDED') {
      openOnboardingInitDialog(candidate);
      return;
    }
    if (targetStage === 'INTERVIEW') {
      if (!candidate.interview_schedule?.date) {
        openInterviewScheduleModal(candidate);
        return;
      }
    }

    const fromStage = candidate.stage;
    const updatedCandidate: Candidate = { ...candidate, stage: targetStage };
    saveRuntimeCandidate(updatedCandidate);

    const stageLabel = getStageDisplayLabel(targetStage);

    // Thông báo thời gian thực tới Ứng viên & HR
    notifyCandidateStageChange(candidate, targetStage, stageLabel, actorName);

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? updatedCandidate : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === candidate.id ? updatedCandidate : prev
    );

    setLastMovedAction({
      candidateId: candidate.id,
      candidateName: candidate.full_name,
      fromStage,
      toStage: targetStage,
    });

    showToast(
      'Đã cập nhật trạng thái ứng viên',
      `${candidate.full_name} (${candidate.candidate_code}) -> ${stageLabel}. Đã đồng bộ thông báo thời gian thực cho ứng viên.`,
      'success'
    );
  };

  const handleQuickStageChange = (newStage: AtsStage) => {
    if (!selectedCandidate) return;
    if (newStage === selectedCandidate.stage) return;
    if (newStage === 'OFFER') {
      setOfferDialogCandidate(selectedCandidate);
      return;
    }
    if (newStage === 'REJECTED') {
      setRejectDialogCandidate(selectedCandidate);
      return;
    }
    handleMoveStage(selectedCandidate, newStage);
  };

  const handleSaveInterviewNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    const trimmed = noteContent.trim();
    const check = sanitizeText(trimmed, 5, 500);
    if (!check.valid) {
      showToast('Nội dung không hợp lệ', check.error || 'Vui lòng kiểm tra độ dài ghi chú.', 'warning');
      return;
    }

    const noteId = `note-${Date.now()}`;
    const newNote = {
      id: noteId,
      author: actorName,
      content: check.value,
      created_at: new Date().toISOString(),
      rating: noteRating,
    };

    const newLogItem = {
      id: `log-${Date.now()}`,
      event_id: `evt-note-${Date.now()}`,
      type: 'INTERVIEW_NOTE',
      title: 'Thêm nhận xét phỏng vấn',
      description: `Đánh giá: ${noteRating}/5 sao · "${check.value.slice(0, 80)}${check.value.length > 80 ? '...' : ''}"`,
      actor_name: actorName,
      created_at: new Date().toISOString(),
    };

    const updatedCand: Candidate = {
      ...selectedCandidate,
      notes: [newNote, ...(selectedCandidate.notes || [])],
      activity_logs: [newLogItem, ...(selectedCandidate.activity_logs || [])],
    };

    saveRuntimeCandidate(updatedCand);
    setCandidates((prev) =>
      prev.map((c) => (c.id === updatedCand.id ? updatedCand : c))
    );
    setSelectedCandidate(updatedCand);
    setNoteContent('');
    setIsNoteFormOpen(false);
    showToast(
      'Đã lưu đánh giá & ghi chú phỏng vấn',
      `Đã cập nhật phản hồi của ${actorName} cho ứng viên ${updatedCand.full_name}.`,
      'success'
    );
  };

  const handleDownloadCvPdf = () => {
    if (!selectedCandidate) return;
    const cvText = `=====================================================
HỒ SƠ ỨNG VIÊN (CURRICULUM VITAE)
Tổng Công ty Công nghệ Lạc Việt - Ban Tuyển dụng ATS
=====================================================

1. THÔNG TIN CÁ NHÂN
- Họ và tên: ${selectedCandidate.full_name}
- Mã ứng viên: ${selectedCandidate.candidate_code}
- Vị trí ứng tuyển: ${selectedCandidate.job_title} (${selectedCandidate.job_code})
- Phòng ban: ${selectedCandidate.department_name}
- Nguồn nộp: ${selectedCandidate.source}
- Ngày nộp hồ sơ: ${formatDateVN(selectedCandidate.applied_date)}
- Email: ${selectedCandidate.email}
- Điện thoại: ${selectedCandidate.phone}
- Công ty hiện tại: ${selectedCandidate.current_company}
- Mức lương kỳ vọng: ${formatVND(selectedCandidate.expected_salary_vnd)} / tháng

2. TRÌNH ĐỘ HỌC VẤN & BẰNG CẤP
- ${selectedCandidate.ai_evaluation.education_fit}
- Số năm kinh nghiệm: ${selectedCandidate.ai_evaluation.experience_years} năm

3. ĐÁNH GIÁ NĂNG LỰC TỔNG QUAN (AI EVALUATION)
- Điểm khớp JD: ${selectedCandidate.ai_evaluation.match_score}%
- Khuyến nghị AI: ${AI_REC_BADGE[selectedCandidate.ai_evaluation.ai_recommendation].label}
- Kỹ năng cốt lõi: ${selectedCandidate.ai_evaluation.key_skills_matched.join(', ')}

* Điểm mạnh nổi bật:
${selectedCandidate.ai_evaluation.strengths.map((s) => `  + ${s}`).join('\n')}

* Điểm cần phỏng vấn thêm:
${selectedCandidate.ai_evaluation.gaps.map((g) => `  - ${g}`).join('\n')}

4. CÂU HỎI PHỎNG VẤN ĐỀ XUẤT
${selectedCandidate.ai_evaluation.interview_questions.map((q, idx) => `  ${idx + 1}. ${q}`).join('\n')}

=====================================================
Được xuất từ Hệ thống Quản trị Tuyển dụng Lạc Việt ATS
Ngày xuất: ${new Date().toLocaleString('vi-VN')}
=====================================================
`;
    const blob = new Blob([cvText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CV_${selectedCandidate.candidate_code}_${stripVietnameseAccents(selectedCandidate.full_name).replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Đã tải hồ sơ CV', `Tệp hồ sơ của ${selectedCandidate.full_name} đã được tải về.`, 'success');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPreviewCvOpen) {
          setIsPreviewCvOpen(false);
        } else if (selectedCandidate) {
          setSelectedCandidate(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCandidate, isPreviewCvOpen]);

  const handleStepStage = (candidate: Candidate, direction: -1 | 1) => {
    const currentCol =
      candidate.stage === 'INTERVIEW'
        ? 1
        : candidate.stage === 'OFFER' || candidate.stage === 'ONBOARDED'
        ? 2
        : 0;

    if (direction === 1) {
      if (currentCol === 0) {
        handleMoveStage(candidate, 'INTERVIEW');
      } else if (currentCol === 1) {
        handleMoveStage(candidate, 'OFFER');
      } else if (currentCol === 2 && candidate.stage === 'OFFER') {
        openOnboardingInitDialog(candidate);
      }
    } else if (direction === -1) {
      if (currentCol === 1) {
        handleMoveStage(candidate, 'APPLIED');
      } else if (currentCol === 2) {
        if (candidate.stage === 'ONBOARDED') {
          handleMoveStage(candidate, 'OFFER');
        } else {
          handleMoveStage(candidate, 'INTERVIEW');
        }
      }
    }
  };

  const handleCreateDeptRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqPositionTitle.trim()) {
      showToast('Thiếu tiêu đề vị trí', 'Vui lòng nhập tên vị trí cần tuyển dụng.', 'warning');
      return;
    }
    const dept = departments.find((d) => d.id === reqDeptId) ?? departments[0];
    const createdReq = createDepartmentRecruitmentRequest({
      department_id: dept?.id ?? 'dept-tech-swe',
      department_name: dept?.department_name ?? 'Phòng Kỹ thuật Phần mềm',
      position_title: reqPositionTitle.trim(),
      level: reqLevel,
      quantity: Math.max(1, Number(reqQuantity) || 1),
      urgency: reqUrgency,
      reason: reqReason.trim() || 'Mở rộng quy mô đội ngũ theo kế hoạch sản xuất kinh doanh.',
      expected_salary_range: reqSalaryRange.trim() || '25.000.000 - 45.000.000 đ',
      deadline_date: reqDeadline || '2026-12-25',
      requested_by_name: `${actorName} (${role === 'DEPT_MANAGER' ? 'Trưởng phòng' : 'Quản lý'})`,
    });

    setIsAddDeptReqOpen(false);
    setReqPositionTitle('');
    setReqReason('');
    setDeptRequests(getDepartmentRecruitmentRequests());
    showToast(
      'Đã gửi đề xuất tuyển dụng',
      `Mã ${createdReq.request_code} đã gửi tới HR Manager và Giám đốc với thông báo thời gian thực.`,
      'success'
    );
  };

  const handleOpenApprovePreview = (req: DepartmentRecruitmentRequest) => {
    setApprovePreviewReq(req);
  };

  const handleConfirmApproveDeptRequest = () => {
    if (!approvePreviewReq) return;
    const result = approveDepartmentRecruitmentRequest(approvePreviewReq.id, actorName);
    if (!result) return;
    setDeptRequests(getDepartmentRecruitmentRequests());
    setJobs(mergeWithRuntimeJobs(baseJobsRef.current));
    if (selectedDeptReq && selectedDeptReq.id === approvePreviewReq.id) {
      setSelectedDeptReq(result.request);
    }
    showToast(
      'Đã duyệt đề xuất & Mở tin tuyển dụng',
      `Đã khởi tạo tin ${result.job.job_code} (${result.job.title}) và đồng bộ sang Cổng việc làm.`,
      'success'
    );
    setApprovePreviewReq(null);
  };

  const handleOpenRejectDialog = (req: DepartmentRecruitmentRequest) => {
    setRejectTargetReq(req);
    setRejectReasonInput('');
    setRejectReasonError(null);
  };

  const handleConfirmRejectDeptRequest = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rejectTargetReq) return;
    const trimmed = rejectReasonInput.trim();
    if (!trimmed) {
      setRejectReasonError('Vui lòng nhập lý do từ chối (bắt buộc).');
      return;
    }
    const result = rejectDepartmentRecruitmentRequest(rejectTargetReq.id, trimmed, actorName);
    if (!result) return;
    setDeptRequests(getDepartmentRecruitmentRequests());
    if (selectedDeptReq && selectedDeptReq.id === rejectTargetReq.id) {
      setSelectedDeptReq(result);
    }
    showToast(
      'Đã từ chối đề xuất tuyển dụng',
      `Đã cập nhật trạng thái đề xuất ${rejectTargetReq.request_code} và thông báo tới Trưởng phòng.`,
      'default'
    );
    setRejectTargetReq(null);
    setRejectReasonInput('');
    setRejectReasonError(null);
  };

  const handleApproveDeptRequest = (req: DepartmentRecruitmentRequest) => {
    handleOpenApprovePreview(req);
  };

  const handleRejectDeptRequest = (req: DepartmentRecruitmentRequest) => {
    handleOpenRejectDialog(req);
  };

  const handleAddJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobTitle.trim()) {
      showToast('Thiếu tiêu đề vị trí', 'Vui lòng nhập tên vị trí cần tuyển dụng.', 'warning');
      return;
    }

    const dept = departments.find((d) => d.id === newJobDeptId) ?? departments[0];
    if (!dept) return;
    const nextNum = jobs.length + 1;
    const minSal = Number(newJobMinSalary) || 25000000;
    const maxSal = Number(newJobMaxSalary) || 40000000;

    const created: JobPosting = {
      id: `job-${Date.now()}`,
      job_code: `JD-2026-NEW0${nextNum}`,
      title: newJobTitle.trim(),
      department_id: dept.id,
      department_name: dept.department_name,
      level: newJobLevel.trim() || 'Mid',
      headcount_target: Math.max(1, Number(newJobTarget) || 1),
      hired_count: 0,
      applicants_count: 0,
      salary_range_min_vnd: minSal,
      salary_range_max_vnd: maxSal,
      status: newJobUrgent,
      hiring_manager_name: dept.manager_name,
      published_date: new Date().toISOString().slice(0, 10),
      closing_date: newJobClosingDate || '2026-12-30',
      location: newJobLocation || 'Hà Nội / Hybrid',
      work_mode: newJobWorkMode,
      employment_type: 'Toàn thời gian',
      overview:
        newJobOverview.trim() ||
        `Tuyển dụng ${newJobTitle.trim()} gia nhập ${dept.department_name} tại Tổng Công ty Lạc Việt.`,
      responsibilities: [
        `Phối hợp cùng đội ngũ ${dept.department_name} triển khai các dự án trọng điểm.`,
        'Đảm bảo chất lượng công việc, tiến độ giao hàng và tuân thủ quy chuẩn của tổ chức.',
        'Tham gia cải tiến quy trình nghiệp vụ và báo cáo tiến độ trực tiếp cho Quản lý.',
      ],
      requirements: [
        `Có kinh nghiệm thực tế ở cấp bậc ${newJobLevel.trim() || 'Mid'} trong lĩnh vực liên quan.`,
        'Tư duy giải quyết vấn đề tốt, trách nhiệm cao và kỹ năng làm việc nhóm hiệu quả.',
        'Khả năng thích ứng nhanh với môi trường công nghệ số năng động.',
      ],
      benefits: [
        `Mức thu nhập ${formatVND(minSal)} - ${formatVND(maxSal)} / tháng + Thưởng KPI theo hiệu suất.`,
        'Cấp laptop làm việc, bảo hiểm sức khỏe VIP toàn diện.',
        'Môi trường làm việc văn minh, minh bạch và lộ trình phát triển nghề nghiệp rộng mở.',
      ],
    };

    saveRuntimeJob(created);
    setJobs((prev) => [created, ...prev.filter((j) => j.id !== created.id)]);

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'CREATE_RECORD',
      module: 'Tuyển dụng ATS',
      target: `${created.job_code} — ${created.title}`,
      detail: `Đăng tin tuyển dụng mới cho ${created.department_name}, dải lương ${formatVND(minSal)} - ${formatVND(maxSal)}. Đã đồng bộ trực tiếp lên Cổng việc làm Lạc Việt Careers.`,
      status: 'SUCCESS',
    });

    pushNotification({
      title: `Tin tuyển dụng mới: ${created.title}`,
      message: `${created.job_code} đã được đăng tải và tự động đồng bộ sang Cổng việc làm cho ứng viên.`,
      category: 'ONBOARDING',
      target_roles: ['HR_MANAGER', 'SUPER_ADMIN', 'DEPT_MANAGER'],
      nav_id: 'recruitment',
    });

    setIsAddJobOpen(false);
    setNewJobTitle('');
    setNewJobOverview('');
    showToast(
      'Đã đăng tin & tự động đồng bộ sang Cổng việc làm',
      `${created.job_code} — ${created.title} đã xuất hiện trên Cổng Lạc Việt Careers và bảng ATS.`,
      'success'
    );
  };

  const openJobsCount = jobs.filter((j) => j.status === 'OPEN' || j.status === 'URGENT').length;
  const newCandidatesCount = candidates.filter((c) => c.stage === 'APPLIED').length;
  const interviewCandidatesCount = candidates.filter((c) => c.stage === 'INTERVIEW').length;
  const offerCandidatesCount = candidates.filter((c) => c.stage === 'OFFER').length;
  const pendingDeptRequestsCount = deptRequests.filter((r) => r.status === 'PENDING').length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <Skeleton key={idx} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((idx) => (
            <Skeleton key={idx} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-full overflow-hidden">
      {/* Top Bar: Shared Position Filter & Role-based Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-72">
          <Select
            value={selectedJobId}
            onValueChange={setSelectedJobId}
            options={[
              { label: `Tất cả vị trí (${candidates.length} ứng viên)`, value: 'ALL' },
              ...jobs.map((j) => ({
                label: `${j.job_code} — ${j.title}`,
                value: j.id,
              })),
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          {canProposeRecruitment && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddDeptReqOpen(true)}
              className="border-[#0F766E]/40 text-[#0F766E] hover:bg-[#E8F3EF] dark:border-teal-500/40 dark:text-teal-300 dark:hover:bg-zinc-800 min-h-[36px] text-xs font-semibold"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Đề xuất tuyển dụng
            </Button>
          )}
          {canPostJob && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAddJobOpen(true)}
              className="min-h-[36px] text-xs font-semibold"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Tạo tin tuyển dụng
            </Button>
          )}
        </div>
      </div>

      {/* KPI Metric Strip - 5 Clickable cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => setActiveTab('jobs')}
          className="flex flex-col justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3 text-left transition-all hover:border-[#0F766E] hover:shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-teal-400 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#5C7871] dark:text-zinc-400">
            <span className="font-medium">Tin đang mở</span>
            <Briefcase className="h-4 w-4 text-[#0F766E] dark:text-teal-400 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
              {openJobsCount}
            </span>
            <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">vị trí</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('candidates')}
          className="flex flex-col justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3 text-left transition-all hover:border-[#0F766E] hover:shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-teal-400 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#5C7871] dark:text-zinc-400">
            <span className="font-medium">Hồ sơ mới</span>
            <Users className="h-4 w-4 text-sky-600 dark:text-sky-400 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
              {newCandidatesCount}
            </span>
            <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">chưa xử lý</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('candidates')}
          className="flex flex-col justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3 text-left transition-all hover:border-[#0F766E] hover:shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-teal-400 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#5C7871] dark:text-zinc-400">
            <span className="font-medium">Phỏng vấn tuần này</span>
            <CalendarCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
              {interviewCandidatesCount}
            </span>
            <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">lịch hẹn</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('candidates')}
          className="flex flex-col justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3 text-left transition-all hover:border-[#0F766E] hover:shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-teal-400 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#5C7871] dark:text-zinc-400">
            <span className="font-medium">Offer chờ phản hồi</span>
            <Mail className="h-4 w-4 text-violet-600 dark:text-violet-400 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
              {offerCandidatesCount}
            </span>
            <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">hồ sơ</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className="flex flex-col justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3 text-left transition-all hover:border-[#0F766E] hover:shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-teal-400 group cursor-pointer col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between text-xs text-[#5C7871] dark:text-zinc-400">
            <span className="font-medium">Đề xuất chờ duyệt</span>
            <Building className="h-4 w-4 text-rose-600 dark:text-rose-400 transition-transform group-hover:scale-110" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-[#11221E] dark:text-zinc-100">
              {pendingDeptRequestsCount}
            </span>
            <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">yêu cầu</span>
          </div>
        </button>
      </div>

      {/* Main 3 Tabs Section */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full space-y-4">
        <div className="flex items-center justify-between border-b border-[#D5E3DF] pb-2 dark:border-zinc-800">
          <TabsList className="bg-[#E8F1EE]/80 dark:bg-zinc-800/60 p-1">
            <TabsTrigger value="candidates" className="text-xs font-semibold px-4 py-1.5">
              Ứng viên ({filteredCandidates.length})
            </TabsTrigger>
            <TabsTrigger value="jobs" className="text-xs font-semibold px-4 py-1.5">
              Tin tuyển dụng ({jobs.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="text-xs font-semibold px-4 py-1.5 flex items-center gap-1.5">
              <span>Đề xuất tuyển dụng</span>
              {pendingDeptRequestsCount > 0 && (
                <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[10px] font-mono font-bold">
                  {pendingDeptRequestsCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

      {lastCreatedOnboarding && (
        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-[#415A54] dark:text-zinc-300">
              Đã khởi tạo hồ sơ hội nhập{' '}
              <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {lastCreatedOnboarding.onboardingId}
              </span>{' '}
              cho <span className="font-semibold text-[#11221E] dark:text-zinc-100">{lastCreatedOnboarding.fullName}</span> (mã NV:{' '}
              <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-200">{lastCreatedOnboarding.employeeCode}</span>)
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigateWithIntent('onboarding', {
                  subTab: 'progress',
                  entityId: lastCreatedOnboarding.onboardingId,
                })
              }
            >
              <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
              Mở tiến độ Onboarding
            </Button>
          </CardContent>
        </Card>
      )}

        {/* TAB 3: ĐỀ XUẤT TUYỂN DỤNG */}
        <TabsContent value="requests" className="space-y-4 mt-0">
          {/* Department Recruitment Requests Section - Modern Data Table */}
          <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-zinc-900/60">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                <Building className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                Đề xuất Tuyển dụng từ các Phòng ban ({deptRequests.length})
              </h2>
              <Badge
                variant={deptRequests.some((r) => r.status === 'PENDING') ? 'warning' : 'outline'}
                className="font-mono text-[11px] tabular-nums"
              >
                {deptRequests.filter((r) => r.status === 'PENDING').length} Chờ duyệt
              </Badge>
            </div>
            <span className="text-xs text-[#5C7871] dark:text-zinc-400">
              Tự động đồng bộ thời gian thực tới HR & Trưởng phòng
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#D5E3DF] dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F2F7F5] text-[#415A54] dark:bg-zinc-800/80 dark:text-zinc-300">
                <tr>
                  <th className="px-3 py-2 font-semibold">Vị trí</th>
                  <th className="px-3 py-2 font-semibold">Phòng ban</th>
                  <th className="px-3 py-2 font-semibold text-center">SL</th>
                  <th className="px-3 py-2 font-semibold">Hạn</th>
                  <th className="px-3 py-2 font-semibold text-center">Trạng thái</th>
                  <th className="px-3 py-2 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800">
                {deptRequests.map((req) => {
                  const isPending = req.status === 'PENDING';
                  const isApproved = req.status === 'APPROVED';
                  const isRejected = req.status === 'REJECTED';

                  return (
                    <tr
                      key={req.id}
                      onClick={() => setSelectedDeptReq(req)}
                      className="cursor-pointer hover:bg-[#F8FAF9] transition-colors dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                            {req.position_title}
                          </span>
                          {req.urgency === 'URGENT' && (
                            <Badge variant="danger" className="text-[10px] px-1.5 py-0 font-medium">
                              Gấp
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#5C7871] dark:text-zinc-400">
                          {req.request_code} · {req.level}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[#415A54] dark:text-zinc-300 whitespace-nowrap">
                        {req.department_name}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-semibold text-[#11221E] dark:text-zinc-200">
                        {req.quantity}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#415A54] dark:text-zinc-300 whitespace-nowrap">
                        {formatDateVN(req.deadline_date)}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <Badge
                          variant={isApproved ? 'teal' : isRejected ? 'muted' : 'warning'}
                          className="text-[10px]"
                        >
                          {isApproved ? 'Đã lập tin' : isRejected ? 'Từ chối' : 'Chờ duyệt'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {isPending && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRejectDeptRequest(req)}
                              className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                            >
                              Từ chối
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveDeptRequest(req)}
                              className="rounded bg-[#0F766E] px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-[#0B5C56] dark:bg-teal-600 dark:hover:bg-teal-500"
                            >
                              Duyệt & Tạo tin
                            </button>
                          </div>
                        )}
                        {isApproved && req.job_code_created && (
                          <span className="font-mono text-[11px] font-semibold text-[#0F766E] dark:text-teal-400">
                            ✓ {req.job_code_created}
                          </span>
                        )}
                        {isRejected && (
                          <span className="text-[11px] italic text-rose-600 dark:text-rose-400" title={req.rejection_reason}>
                            Đã từ chối
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </TabsContent>

        {/* TAB 2: TIN TUYỂN DỤNG */}
        <TabsContent value="jobs" className="space-y-4 mt-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                <Briefcase className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                Tin tuyển dụng đang mở ({jobs.length})
              </h2>
              <p className="text-xs text-[#5C7871] dark:text-zinc-400">
                Nhấn vào thẻ tin để lọc danh sách ứng viên theo vị trí tuyển dụng tương ứng
              </p>
            </div>
            {canPostJob && (
              <Button variant="primary" size="sm" onClick={() => setIsAddJobOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Tạo tin tuyển dụng
              </Button>
            )}
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#C6D9D3] bg-[#FCFEFD] p-8 text-center text-sm text-[#5C7871] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
              Hiện chưa có tin tuyển dụng nào đang mở.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {jobs.map((job) => {
                const statusMeta = JOB_STATUS_BADGE[job.status];
                const isSelected = selectedJobId === job.id;
                return (
                  <Card
                    key={job.id}
                    onClick={() => {
                      setSelectedJobId(isSelected ? 'ALL' : job.id);
                      setActiveTab('candidates');
                    }}
                    className={cn(
                      'cursor-pointer border-l-4 transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF]/70 dark:hover:border-teal-400/50 dark:hover:bg-zinc-900/50',
                      job.status === 'URGENT'
                        ? 'border-l-rose-500 dark:border-l-rose-400'
                        : job.status === 'OPEN'
                        ? 'border-l-[#0F766E] dark:border-l-teal-400'
                        : 'border-l-[#5C7871] dark:border-l-zinc-500',
                      isSelected && 'border-[#0F766E] bg-[#E8F3EF]/80 ring-1 ring-[#0F766E]/25 dark:border-teal-400 dark:bg-zinc-900 dark:ring-teal-400/20'
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="whitespace-nowrap font-mono text-[11px] font-medium text-[#415A54] dark:text-zinc-400">
                          {job.job_code}
                        </span>
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[#11221E] dark:text-zinc-100">
                        {job.title}
                      </h3>
                      <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                        {job.department_name} · {job.level}
                      </p>
                      <div className="mt-3 flex items-center justify-between border-t border-[#D5E3DF] pt-3 text-xs dark:border-zinc-800/80">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                          <Users className="h-3.5 w-3.5 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
                          {job.applicants_count} hồ sơ
                        </span>
                        <span className="font-mono tabular-nums text-[#5C7871] dark:text-zinc-400">
                          Hạn: {formatDateVN(job.closing_date)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 1: ỨNG VIÊN (KANBAN 5 CỘT + 1 CỘT TRUNG TÍNH) */}
        <TabsContent value="candidates" className="space-y-3 mt-0">
          {/* Kanban Toolbar */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
            {/* Search & Stage Filter */}
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs md:max-w-sm flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C7871] dark:text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  placeholder="Tìm tên, email, SĐT, vị trí..."
                  aria-label="Tìm kiếm ứng viên theo tên, email, số điện thoại hoặc vị trí"
                  className="h-9 w-full pl-9 pr-8 text-xs"
                />
                {candidateSearch && (
                  <button
                    type="button"
                    onClick={() => setCandidateSearch('')}
                    aria-label="Xóa từ khóa tìm kiếm"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#5C7871] hover:bg-[#E8F3EF] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="w-full sm:w-48 shrink-0">
                <Select
                  value={selectedStageFilter}
                  onValueChange={(val) => setSelectedStageFilter(val as AtsStage | 'ALL')}
                  aria-label="Lọc theo giai đoạn tuyển dụng"
                  className="h-9 text-xs"
                  options={[
                    { label: 'Tất cả giai đoạn', value: 'ALL' },
                    ...KANBAN_5_COLUMNS.map((col) => ({
                      label: col.label,
                      value: col.stage,
                    })),
                  ]}
                />
              </div>

              {(candidateSearch.trim() !== '' || selectedStageFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setCandidateSearch('');
                    setSelectedStageFilter('ALL');
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#0F766E] hover:bg-[#E8F3EF] dark:text-teal-400 dark:hover:bg-zinc-800 shrink-0 min-h-[36px]"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Xóa lọc</span>
                </button>
              )}
            </div>

            {/* Count & Secondary Actions */}
            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
              <span className="font-mono text-xs font-medium tabular-nums text-[#5C7871] dark:text-zinc-400 px-1">
                {filteredCandidates.length} ứng viên
              </span>

              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMenuToolbarOpen((prev) => !prev)}
                  className="h-9 w-9 p-0 text-[#415A54] hover:text-[#11221E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 min-h-[36px] min-w-[36px]"
                  aria-label="Thao tác bổ sung"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                {isMenuToolbarOpen && (
                  <div
                    onClick={() => setIsMenuToolbarOpen(false)}
                    className="absolute right-0 top-full mt-1 z-30 w-40 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <button
                      type="button"
                      onClick={handleResetCandidatesData}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#11221E] hover:bg-[#F2F7F5] dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-[#5C7871] dark:text-zinc-400" />
                      <span>Đặt lại dữ liệu</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCandidatesCsv}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#0F766E] hover:bg-[#E8F3EF] dark:text-teal-300 dark:hover:bg-zinc-800/60"
                    >
                      <Download className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
                      <span>Xuất file CSV</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {candidates.length > 0 &&
            filteredCandidates.length === 0 &&
            (candidateSearch.trim() !== '' ||
              selectedStageFilter !== 'ALL' ||
              selectedJobId !== 'ALL') && (
              <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-dashed border-[#C6D9D3] bg-[#FCFEFD] px-4 py-3 text-xs text-[#415A54] sm:flex-row dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                <span>Không tìm thấy ứng viên phù hợp với điều kiện lọc hiện tại.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCandidateSearch('');
                    setSelectedStageFilter('ALL');
                    setSelectedJobId('ALL');
                  }}
                >
                  Hiển thị tất cả ứng viên
                </Button>
              </div>
            )}

          {/* Kanban Board Container - Horizontally scrollable */}
          <div className="overflow-x-auto pb-4 max-w-full">
            <div className="flex flex-row gap-3 items-stretch min-h-[520px] w-max">
              {(selectedStageFilter === 'ALL'
                ? KANBAN_5_COLUMNS
                : KANBAN_5_COLUMNS.filter((c) => c.stage === selectedStageFilter)
              ).map((col) => {
                const colCandidates = filteredCandidates.filter((c) => c.stage === col.stage);
                const isColCollapsed =
                  selectedStageFilter === 'ALL' && Boolean(collapsedCols[col.id]);

                const renderCandidateCard = (cand: Candidate, forceCompact = false) => {
                  const isCompact = forceCompact || isCompactMode;
                  const isInterviewConfirmed =
                    cand.stage === 'INTERVIEW' && cand.interview_schedule?.status === 'confirmed';
                  const isInterviewScheduled =
                    cand.stage === 'INTERVIEW' && cand.interview_schedule?.status === 'scheduled';
                  const isReschedulePending =
                    !isInterviewConfirmed &&
                    cand.reschedule_request?.status === 'PENDING' &&
                    cand.interview_schedule?.status !== 'scheduled';
                  const isInterviewUnscheduled =
                    cand.stage === 'INTERVIEW' && !cand.interview_schedule?.date;
                  const daysInStage = getDaysInStage(cand);
                  const isOverdue = daysInStage > 7;

                  return (
                    <div
                      key={cand.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', cand.id);
                      }}
                      onClick={() => setSelectedCandidate(cand)}
                      className={cn(
                        'group cursor-pointer rounded-xl border p-3 shadow-2xs transition-all relative',
                        isReschedulePending
                          ? 'border-amber-400 bg-amber-50/70 hover:border-amber-500 hover:bg-amber-100/70 dark:border-amber-600/70 dark:bg-amber-950/30 dark:hover:border-amber-500 ring-1 ring-amber-400/50'
                          : isInterviewConfirmed
                          ? 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/20'
                          : 'border-[#C6D9D3] bg-[#FCFEFD] hover:border-[#0F766E] hover:bg-[#E8F3EF]/60 dark:border-zinc-800 dark:bg-[#18181b] dark:hover:border-zinc-700 dark:hover:bg-[#202024]'
                      )}
                    >
                      {/* Card Header: Code + Source + Overdue Badge */}
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-[#5C7871] dark:text-zinc-400">
                          {cand.candidate_code}
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.2 text-[10px] font-medium border',
                              CANDIDATE_SOURCE_BADGES[cand.source]?.className ||
                                'border-[#D5E3DF] bg-[#F2F7F5] text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                            )}
                          >
                            {cand.source}
                          </span>
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-mono text-[10px] font-medium border',
                              isOverdue
                                ? 'border-rose-300 bg-rose-50 text-rose-700 font-bold dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 animate-pulse'
                                : 'border-[#D5E3DF] bg-[#F2F7F5] text-[#5C7871] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                            )}
                            title={isOverdue ? `Đã ở bước này ${daysInStage} ngày (vượt quá ngưỡng 7 ngày)` : `Đã ở bước này ${daysInStage} ngày`}
                          >
                            <Clock className={cn('h-2.5 w-2.5', isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-[#5C7871]')} />
                            <span>{isOverdue ? `Quá hạn ${daysInStage}d` : `${daysInStage}d`}</span>
                          </span>
                        </div>
                      </div>

                      {/* Card Body: Name + Job */}
                      <div className="mt-2 flex items-center gap-2">
                        <Avatar
                          name={cand.full_name}
                          className="h-7 w-7 shrink-0 border-[#C6D9D3] bg-[#E4EEEB] text-[10px] font-bold text-[#0B4F4A] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-xs font-bold text-[#11221E] dark:text-zinc-100">
                            {cand.full_name}
                          </h4>
                          <p className="truncate text-[11px] text-[#415A54] dark:text-zinc-400">
                            {cand.job_title}
                          </p>
                        </div>
                      </div>

                      {/* Interview Schedule badges */}
                      {isInterviewConfirmed && cand.interview_schedule && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span className="truncate">
                            Đã chốt: {cand.interview_schedule.time} {formatDateVN(cand.interview_schedule.date)}
                          </span>
                        </div>
                      )}

                      {isReschedulePending && (
                        <div className="mt-2 flex items-center justify-between gap-1.5 rounded-md border border-amber-400/60 bg-amber-100/80 px-2 py-1 text-[11px] font-bold text-amber-950 dark:border-amber-600/60 dark:bg-amber-950/50 dark:text-amber-200 animate-pulse">
                          <div className="flex items-center gap-1 min-w-0">
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                            <span className="truncate">Dời lịch:</span>
                          </div>
                          <span className="shrink-0 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                            {cand.reschedule_request?.proposed_time || 'Chờ duyệt'}
                          </span>
                        </div>
                      )}

                      {isInterviewUnscheduled && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInterviewScheduleModal(cand);
                          }}
                          className="mt-2 flex w-full items-center justify-between gap-1.5 rounded-md border border-rose-400/80 bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-500/25 hover:border-rose-500 dark:border-rose-700/80 dark:bg-rose-950/60 dark:text-rose-300 cursor-pointer"
                          title="Nhấp vào đây để thiết lập lịch phỏng vấn"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertCircle className="h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
                            <span className="truncate font-bold">Chưa có lịch phỏng vấn</span>
                          </div>
                          <span className="shrink-0 text-[10px] font-bold text-rose-600 hover:underline dark:text-rose-400">
                            Thiết lập ›
                          </span>
                        </button>
                      )}

                      {!isInterviewConfirmed && !isReschedulePending && !isInterviewUnscheduled && cand.stage === 'INTERVIEW' && cand.interview_schedule && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          <Clock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span className="truncate">
                            {isInterviewScheduled ? 'Lịch mới: ' : 'PV: '}
                            {cand.interview_schedule.time} {formatDateVN(cand.interview_schedule.date)}
                          </span>
                        </div>
                      )}

                      {/* Detailed mode extra info */}
                      {!isCompact && (
                        <div className="mt-2 space-y-1 border-t border-[#D5E3DF] pt-2 text-[11px] text-[#415A54] dark:border-zinc-800 dark:text-zinc-400">
                          <div className="flex items-center justify-between">
                            <span>Ngày nộp:</span>
                            <span className="font-mono text-[#11221E] dark:text-zinc-200">{formatDateVN(cand.applied_date)}</span>
                          </div>
                          {!hideSalary && cand.expected_salary_vnd && (
                            <div className="flex items-center justify-between">
                              <span>Lương kỳ vọng:</span>
                              <span className="font-mono font-medium text-[#11221E] dark:text-zinc-200">{formatVND(cand.expected_salary_vnd)}</span>
                            </div>
                          )}
                          {cand.ai_evaluation?.match_score && (
                            <div className="flex items-center justify-between">
                              <span>Điểm AI:</span>
                              <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{cand.ai_evaluation.match_score}/100</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Card Footer: Interviewer + Step Transition button + Detail link */}
                      <div className="mt-2.5 flex items-center justify-between border-t border-[#D5E3DF] pt-2 text-xs dark:border-zinc-800">
                        <div className="flex items-center gap-1 min-w-0 max-w-[110px]">
                          <Users className="h-3 w-3 shrink-0 text-[#5C7871] dark:text-zinc-400" />
                          <span className="truncate text-[11px] text-[#5C7871] dark:text-zinc-400" title={cand.interview_schedule?.interviewer || 'HR Tuyển dụng'}>
                            {cand.interview_schedule?.interviewer || 'HR Tuyển dụng'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Chuyển bước dropdown for touch/keyboard */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCardMenuId(activeCardMenuId === cand.id ? null : cand.id);
                              }}
                              className="inline-flex items-center gap-0.5 rounded border border-[#C6D9D3] bg-[#FCFEFD] px-1.5 py-0.5 text-[10px] font-medium text-[#415A54] hover:border-[#0F766E] hover:text-[#0F766E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-teal-400 min-h-[26px]"
                              aria-label={`Chuyển bước cho ${cand.full_name}`}
                              title="Chuyển bước (thao tác phím/touch)"
                            >
                              <span>Chuyển</span>
                              <ChevronDown className="h-2.5 w-2.5" />
                            </button>
                            {activeCardMenuId === cand.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 bottom-full mb-1 z-30 w-44 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                <div className="px-2 py-1 text-[10px] font-semibold text-[#5C7871] dark:text-zinc-400 border-b border-[#D5E3DF] dark:border-zinc-800">
                                  Chuyển đến bước:
                                </div>
                                {(['APPLIED', 'AI_SCREENED', 'INTERVIEW', 'OFFER', 'ONBOARDED', 'REJECTED'] as AtsStage[]).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    disabled={cand.stage === st}
                                    onClick={() => {
                                      setActiveCardMenuId(null);
                                      if (st === 'INTERVIEW' && !cand.interview_schedule?.date) {
                                        openInterviewScheduleModal(cand);
                                      } else if (st === 'OFFER') {
                                        setOfferDialogCandidate(cand);
                                      } else if (st === 'ONBOARDED') {
                                        openOnboardingInitDialog(cand);
                                      } else if (st === 'REJECTED') {
                                        setRejectDialogCandidate(cand);
                                      } else {
                                        handleMoveStage(cand, st);
                                      }
                                    }}
                                    className={cn(
                                      'flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs transition-colors',
                                      cand.stage === st
                                        ? 'bg-[#E8F1EE] font-bold text-[#0F766E] dark:bg-zinc-800 dark:text-teal-300'
                                        : 'text-[#11221E] hover:bg-[#F2F7F5] dark:text-zinc-200 dark:hover:bg-zinc-800/60'
                                    )}
                                  >
                                    <span>{getStageDisplayLabel(st)}</span>
                                    {cand.stage === st && <Check className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <span className="text-[11px] font-medium text-[#0F766E] hover:underline dark:text-teal-400">
                            Chi tiết ›
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                };

                const renderSectionCards = (cards: Candidate[], sectionKey: string, forceCompact = false) => {
                  if (cards.length === 0) {
                    return (
                      <div className="rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5] p-4 text-center text-xs text-[#5C7871] dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-500">
                        Chưa có ứng viên
                      </div>
                    );
                  }

                  const isExpanded = Boolean(expandedLimits[sectionKey]);
                  const visibleCards = isExpanded ? cards : cards.slice(0, KANBAN_CARD_LIMIT);
                  const remainingCount = cards.length - KANBAN_CARD_LIMIT;

                  return (
                    <div className="space-y-2">
                      {visibleCards.map((cand) => renderCandidateCard(cand, forceCompact))}
                      {cards.length > KANBAN_CARD_LIMIT && (
                        <div className="pt-1">
                          {!isExpanded ? (
                            <button
                              type="button"
                              onClick={() => toggleLimit(sectionKey)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#C6D9D3] bg-[#FCFEFD]/80 py-1.5 text-xs font-semibold text-[#0F766E] transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-teal-400 dark:hover:bg-zinc-800"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                              Xem thêm +{remainingCount} hồ sơ
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleLimit(sectionKey)}
                              className="flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-medium text-[#5C7871] transition-colors hover:text-[#11221E] hover:bg-[#D5E3DF]/50 dark:text-zinc-400 dark:hover:text-zinc-200"
                            >
                              <ChevronUp className="h-3 w-3" />
                              Thu gọn lại (hiện {KANBAN_CARD_LIMIT} thẻ)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                };

                if (isColCollapsed) {
                  return (
                    <div
                      key={col.id}
                      onClick={() => toggleColCollapse(col.id)}
                      className={cn(
                        'flex w-12 cursor-pointer flex-col items-center justify-between rounded-xl border border-[#C6D9D3] bg-[#E8F1EE]/80 py-4 hover:border-[#0F766E] dark:border-zinc-800/80 dark:bg-[#121214] transition-all shrink-0',
                        col.topBorder
                      )}
                      title={`Mở rộng cột: ${col.label} (${colCandidates.length} hồ sơ)`}
                      role="region"
                      aria-label={`Cột ${col.label} đang thu gọn, có ${colCandidates.length} hồ sơ`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', col.dotColor)} />
                        <span className="rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#415A54] dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                          {colCandidates.length}
                        </span>
                      </div>
                      <div
                        className="py-6 text-xs font-semibold tracking-wider text-[#415A54] dark:text-zinc-400 select-none whitespace-nowrap"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      >
                        {col.label}
                      </div>
                      <button
                        type="button"
                        className="text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400"
                        aria-label={`Mở rộng cột ${col.label}`}
                      >
                        <PanelLeftOpen className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverColStage !== col.stage) {
                        setDragOverColStage(col.stage);
                      }
                    }}
                    onDragLeave={() => {
                      setDragOverColStage(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverColStage(null);
                      const candId = e.dataTransfer.getData('text/plain');
                      const droppedCand = candidates.find((c) => c.id === candId);
                      if (!droppedCand) return;
                      if (col.stage === 'INTERVIEW') {
                        if (!droppedCand.interview_schedule?.date) {
                          openInterviewScheduleModal(droppedCand);
                        } else if (droppedCand.stage !== 'INTERVIEW') {
                          handleMoveStage(droppedCand, 'INTERVIEW');
                        }
                      } else if (col.stage === 'OFFER') {
                        setOfferDialogCandidate(droppedCand);
                      } else if (col.stage === 'ONBOARDED') {
                        openOnboardingInitDialog(droppedCand);
                      } else if (col.stage === 'REJECTED') {
                        setRejectDialogCandidate(droppedCand);
                      } else if (droppedCand.stage !== col.stage) {
                        handleMoveStage(droppedCand, col.stage);
                      }
                    }}
                    className={cn(
                      'flex w-[280px] min-w-[280px] shrink-0 flex-col rounded-xl border p-3 transition-all',
                      col.topBorder,
                      col.isNeutral
                        ? 'border-zinc-300 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40'
                        : 'border-[#C6D9D3] bg-[#E8F1EE]/80 dark:border-zinc-800/80 dark:bg-[#121214]',
                      dragOverColStage === col.stage &&
                        'ring-2 ring-[#0F766E] bg-teal-50/80 dark:bg-teal-950/40 dark:ring-teal-400'
                    )}
                    role="region"
                    aria-label={`Cột quy trình ${col.label}, có ${colCandidates.length} hồ sơ`}
                  >
                    {/* Sticky Column Header */}
                    <div className="sticky top-0 z-10 -mx-1 mb-2 px-1 pt-0.5 pb-2 flex items-center justify-between gap-2 border-b border-[#D5E3DF]/70 dark:border-zinc-800/80 bg-inherit">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', col.dotColor)} />
                        <h3 className="truncate text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                          {col.label}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 font-mono text-[11px] font-medium text-[#415A54] dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
                          {colCandidates.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleColCollapse(col.id)}
                          title="Thu gọn cột"
                          aria-label={`Thu gọn cột ${col.label}`}
                          className="rounded p-1 text-[#5C7871] hover:bg-[#D5E3DF] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          <PanelLeftClose className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Column Body Cards */}
                    <div className="flex-1 space-y-2.5">
                      {colCandidates.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5] p-4 text-center text-xs text-[#5C7871] dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-500">
                          Chưa có ứng viên
                        </div>
                      ) : (
                        renderSectionCards(colCandidates, col.id)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>


      {/* Candidate Profile Side-Drawer (Slide-over Panel) */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Light Backdrop (che nhẹ, không che mất bối cảnh Kanban) */}
          <div
            className="fixed inset-0 bg-[#11221E]/25 backdrop-blur-[1px] transition-opacity duration-300 dark:bg-zinc-950/40"
            onClick={() => setSelectedCandidate(null)}
            aria-hidden="true"
          />

          {/* Slide-over panel trượt từ mép phải màn hình */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="candidate-drawer-title"
              className="flex w-screen max-w-xl flex-col border-l border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] shadow-2xl transition-all duration-300 dark:border-zinc-800 dark:bg-[#18181b] dark:text-zinc-100"
            >
              {/* Drawer Top Header with Close (X) button at top-right */}
              <div className="flex items-start justify-between border-b border-[#D5E3DF] p-5 dark:border-zinc-800">
                <div className="min-w-0 flex-1 pr-3">
                  {/* Cấu trúc Meta-data chuẩn: Mã UV mono, Badge nguồn nộp màu sắc, Badge trạng thái */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-0.5 font-mono text-xs font-semibold text-[#11221E] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {selectedCandidate.candidate_code}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                        CANDIDATE_SOURCE_BADGES[selectedCandidate.source]?.className ||
                          'border-[#D5E3DF] bg-[#F2F7F5] text-[#415A54]'
                      )}
                    >
                      {CANDIDATE_SOURCE_BADGES[selectedCandidate.source]?.label || selectedCandidate.source}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                        CANDIDATE_STAGE_BADGES[selectedCandidate.stage]?.className ||
                          'border-[#D5E3DF] bg-[#F2F7F5] text-[#415A54]'
                      )}
                    >
                      {getStageDisplayLabel(selectedCandidate.stage)}
                    </span>
                  </div>

                  <h3
                    id="candidate-drawer-title"
                    className="mt-2 text-xl font-bold tracking-tight text-[#11221E] dark:text-white"
                  >
                    {selectedCandidate.full_name}
                  </h3>
                  <p className="mt-0.5 text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    {selectedCandidate.job_title} · {selectedCandidate.department_name}
                  </p>

                  {/* Icon Calendar + ngày nộp & Thông tin bổ sung */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#5C7871] dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <Calendar className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
                      Nộp ngày: <strong className="text-[#11221E] dark:text-zinc-200">{formatDateVN(selectedCandidate.applied_date)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building className="h-3.5 w-3.5 text-[#5C7871] dark:text-zinc-400" />
                      {selectedCandidate.current_company ? selectedCandidate.current_company.split('·')[0].trim() : 'Chưa cập nhật'}
                    </span>
                    {!hideSalary && (
                      <span className="inline-flex items-center gap-1 font-mono text-emerald-700 dark:text-emerald-400">
                        Kỳ vọng: {formatVND(selectedCandidate.expected_salary_vnd)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Nút X đóng ở góc trên bên phải */}
                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="rounded-lg p-1.5 text-[#5C7871] hover:bg-[#E8F3EF] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
                  aria-label="Đóng chi tiết ứng viên"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Drawer Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {selectedCandidate.stage === 'REJECTED' && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50/80 p-3.5 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>
                        Hồ sơ này đã <strong>Rút hồ sơ</strong> hoặc bị loại khỏi quy trình tuyển dụng.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickStageChange('AI_SCREENED')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-300 cursor-pointer transition-all shadow-2xs shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Khôi phục hồ sơ
                    </button>
                  </div>
                )}

                {/* 1. Thay nút cứng tiến/lùi bằng Dropdown Select trạng thái */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/80 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-200 flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
                      Trạng thái tuyển dụng (Chuyển nhanh)
                    </span>
                    <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                      Tự động đồng bộ Kanban &amp; thời gian thực
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        value={selectedCandidate.stage}
                        onValueChange={(val) => handleQuickStageChange(val as AtsStage)}
                        options={[
                          { label: 'Hồ sơ mới', value: 'APPLIED' },
                          { label: 'Sàng lọc', value: 'AI_SCREENED' },
                          { label: 'Phỏng vấn', value: 'INTERVIEW' },
                          { label: 'Đề nghị', value: 'OFFER' },
                          { label: 'Đã nhận việc', value: 'ONBOARDED' },
                          { label: 'Đã loại', value: 'REJECTED' },
                        ]}
                      />
                    </div>
                    {selectedCandidate.stage === 'ONBOARDED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const matchedOnb = getOnboardingRecords().find(
                            (r) =>
                              r.candidate_id === selectedCandidate.id ||
                              r.candidate_code === selectedCandidate.candidate_code
                          );
                          setSelectedCandidate(null);
                          navigateWithIntent('onboarding', {
                            subTab: 'progress',
                            entityId: matchedOnb?.id ?? selectedCandidate.candidate_code,
                          });
                        }}
                        className="shrink-0 text-xs font-semibold"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                        Xem Onboarding
                      </Button>
                    )}
                  </div>
                </div>

                {/* 2. Thao tác cốt lõi: Nút 'Xem CV' và Nút 'Thêm đánh giá/Ghi chú' */}
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPreviewCvOpen(true)}
                    className="w-full border-[#0F766E]/40 text-[#0F766E] hover:bg-[#E8F3EF] dark:border-teal-500/40 dark:text-teal-300 dark:hover:bg-zinc-800 font-semibold"
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    Xem CV ứng viên
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsNoteFormOpen((prev) => !prev)}
                    className={cn(
                      'w-full font-semibold transition-colors',
                      isNoteFormOpen
                        ? 'border-[#0F766E] bg-[#E8F3EF] text-[#0F766E] dark:border-teal-400 dark:bg-zinc-800 dark:text-teal-300'
                        : 'border-[#C6D9D3] text-[#11221E] hover:bg-[#F2F7F5] dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                    )}
                  >
                    <MessageSquarePlus className="h-4 w-4 mr-1.5" />
                    {isNoteFormOpen ? 'Thu gọn form' : 'Thêm đánh giá / Ghi chú'}
                  </Button>
                </div>

                {/* Form thêm đánh giá / ghi chú phỏng vấn của HR */}
                {isNoteFormOpen && (
                  <form
                    onSubmit={handleSaveInterviewNote}
                    className="rounded-xl border border-[#0F766E]/30 bg-[#F2F7F5] p-3.5 dark:border-teal-500/30 dark:bg-zinc-900/80 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        Ghi nhận xét &amp; đánh giá phỏng vấn
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-[#5C7871] mr-1">Xếp loại:</span>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setNoteRating(star)}
                            className="p-0.5 text-amber-500 hover:scale-110 transition-transform"
                            title={`${star} sao`}
                          >
                            <Star
                              className={cn(
                                'h-4 w-4',
                                star <= noteRating
                                  ? 'fill-amber-400 text-amber-500'
                                  : 'text-zinc-300 dark:text-zinc-600'
                              )}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Nhập nhận xét phỏng vấn, năng lực chuyên môn, sự phù hợp văn hóa..."
                      className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      required
                    />

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsNoteFormOpen(false);
                          setNoteContent('');
                        }}
                        className="text-xs"
                      >
                        Hủy
                      </Button>
                      <Button type="submit" variant="primary" size="sm" className="text-xs">
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Lưu ghi chú
                      </Button>
                    </div>
                  </form>
                )}

                {/* Danh sách ghi chú phỏng vấn đã lưu của ứng viên */}
                {selectedCandidate.notes && selectedCandidate.notes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[#11221E] dark:text-zinc-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MessageSquareText className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
                        Ghi chú phỏng vấn đã lưu ({selectedCandidate.notes.length})
                      </span>
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {selectedCandidate.notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-lg border border-[#D5E3DF] bg-[#FCFEFD] p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                              {note.author}
                            </span>
                            <div className="flex items-center gap-2">
                              {note.rating && (
                                <div className="flex items-center text-amber-500">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      className={cn(
                                        'h-3 w-3',
                                        s <= note.rating!
                                          ? 'fill-amber-400 text-amber-500'
                                          : 'text-zinc-200 dark:text-zinc-700'
                                      )}
                                    />
                                  ))}
                                </div>
                              )}
                              <span className="font-mono text-[10px] text-[#5C7871] dark:text-zinc-500">
                                {formatDateVN(note.created_at)}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1.5 text-[#415A54] dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {note.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Tóm tắt Đánh giá năng lực AI */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
                      <h4 className="text-xs font-bold text-[#11221E] dark:text-zinc-100 uppercase tracking-wider">
                        Đánh giá năng lực AI
                      </h4>
                    </div>
                    <Badge variant={AI_REC_BADGE[selectedCandidate.ai_evaluation.ai_recommendation].variant}>
                      {AI_REC_BADGE[selectedCandidate.ai_evaluation.ai_recommendation].label}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0F766E]/10 font-mono text-sm font-bold text-[#0F766E] dark:bg-teal-500/20 dark:text-teal-300">
                      {selectedCandidate.ai_evaluation.match_score}%
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        {selectedCandidate.ai_evaluation.education_fit}
                      </div>
                      <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                        Kinh nghiệm: {selectedCandidate.ai_evaluation.experience_years} năm · Mô hình: {selectedCandidate.ai_evaluation.evaluated_by_model}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedCandidate.ai_evaluation.key_skills_matched.map((skill, sIdx) => (
                      <span
                        key={sIdx}
                        className="rounded border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-0.5 text-[11px] font-medium text-[#415A54] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
                    <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-800 dark:text-emerald-300">
                      <span className="font-semibold block mb-1">Điểm mạnh nổi bật:</span>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {selectedCandidate.ai_evaluation.strengths.map((str, sIdx) => (
                          <li key={sIdx}>{str}</li>
                        ))}
                      </ul>
                    </div>

                    {selectedCandidate.ai_evaluation.gaps.length > 0 && (
                      <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-300">
                        <span className="font-semibold block mb-1">Cần phỏng vấn thêm:</span>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                          {selectedCandidate.ai_evaluation.gaps.map((gap, gIdx) => (
                            <li key={gIdx}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Khối Callout cảnh báo dời lịch phỏng vấn (Chỉ hiện khi PENDING và chưa xếp lại) */}
                {selectedCandidate.reschedule_request?.status === 'PENDING' &&
                  selectedCandidate.interview_schedule?.status !== 'scheduled' &&
                  selectedCandidate.interview_schedule?.status !== 'confirmed' && (
                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50/90 p-4 shadow-sm space-y-3 dark:border-amber-600/80 dark:bg-amber-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 animate-pulse">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-amber-950 dark:text-amber-100 flex items-center gap-1.5 uppercase tracking-wide">
                            ⚠️ Ứng viên yêu cầu dời lịch phỏng vấn
                          </h4>
                          <span className="text-[11px] text-amber-800 dark:text-amber-300">
                            Gửi lúc: {selectedCandidate.reschedule_request.requested_at ? new Date(selectedCandidate.reschedule_request.requested_at).toLocaleString('vi-VN') : 'Gần đây'}
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-500/50 dark:bg-amber-900/40 dark:text-amber-200 animate-pulse">
                        Chờ duyệt
                      </span>
                    </div>

                    <div className="space-y-2 rounded-lg bg-white/90 p-3 border border-amber-200/80 dark:bg-zinc-900/80 dark:border-zinc-800 text-xs">
                      <div>
                        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 block uppercase tracking-wider">
                          Lý do dời lịch:
                        </span>
                        <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap leading-relaxed">
                          {selectedCandidate.reschedule_request.reason || '(Không nêu lý do)'}
                        </p>
                      </div>

                      <div className="border-t border-amber-100 pt-2 dark:border-zinc-800">
                        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 block uppercase tracking-wider">
                          Thời gian đề xuất mới:
                        </span>
                        <div className="mt-1 flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                          <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          <span>{selectedCandidate.reschedule_request.proposed_time}</span>
                        </div>
                      </div>
                    </div>

                    {/* Nút thao tác */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => handleAcceptReschedule(selectedCandidate)}
                        className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white border-none shadow-xs"
                      >
                        <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
                        Chấp nhận &amp; Xếp lại lịch
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectReschedule(selectedCandidate)}
                        className="text-xs font-semibold border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      >
                        <CalendarX className="mr-1.5 h-3.5 w-3.5" />
                        Từ chối dời lịch
                      </Button>
                    </div>
                  </div>
                )}

                {/* Banner khi HR đã xếp lại lịch mới */}
                {selectedCandidate.interview_schedule?.status === 'scheduled' && (
                  <div className="rounded-xl border border-sky-300/80 bg-sky-50/80 p-3.5 text-xs text-sky-900 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-200 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <CalendarCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>
                        Lịch phỏng vấn mới: {selectedCandidate.interview_schedule.time} ngày {formatDateVN(selectedCandidate.interview_schedule.date)} ({selectedCandidate.interview_schedule.format})
                      </span>
                    </span>
                    <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-900 dark:text-sky-200 shrink-0">
                      Chờ ứng viên xác nhận
                    </span>
                  </div>
                )}

                {/* Banner khi ứng viên đã chốt xác nhận */}
                {selectedCandidate.interview_schedule?.status === 'confirmed' && (
                  <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/80 p-3.5 text-xs text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-200 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        Đã chốt lịch phỏng vấn: {selectedCandidate.interview_schedule.time} ngày {formatDateVN(selectedCandidate.interview_schedule.date)}
                      </span>
                    </span>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 shrink-0">
                      ✓ Đã xác nhận
                    </span>
                  </div>
                )}
                {selectedCandidate.reschedule_request?.status === 'ACCEPTED' && (
                  <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/20 dark:text-emerald-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Yêu cầu dời lịch đã được chấp thuận &amp; xếp lại lịch</span>
                    </span>
                  </div>
                )}
                {selectedCandidate.reschedule_request?.status === 'REJECTED' && (
                  <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CalendarX className="h-4 w-4 text-zinc-500" />
                      <span>Đã từ chối dời lịch (giữ nguyên lịch cũ)</span>
                    </span>
                  </div>
                )}

                {/* Thông tin lịch phỏng vấn đã xếp */}
                {selectedCandidate.interview_schedule && (
                  <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-3.5 space-y-3 dark:border-amber-700/40 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 uppercase tracking-wider">
                        <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        Lịch phỏng vấn đã xếp
                      </h4>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openInterviewScheduleModal(selectedCandidate)}
                        className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                      >
                        Đổi lịch
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-white/80 p-2 border border-amber-200/60 dark:bg-zinc-900/80 dark:border-zinc-800">
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">Thời gian</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 mt-0.5">
                          <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          {selectedCandidate.interview_schedule.time} · {formatDateVN(selectedCandidate.interview_schedule.date)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-white/80 p-2 border border-amber-200/60 dark:bg-zinc-900/80 dark:border-zinc-800">
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">Hình thức</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 mt-0.5">
                          {selectedCandidate.interview_schedule.format === 'Online' ? (
                            <>
                              <Video className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                              Online
                            </>
                          ) : (
                            <>
                              <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              Trực tiếp (Offline)
                            </>
                          )}
                        </span>
                      </div>
                      <div className="col-span-2 rounded-lg bg-white/80 p-2 border border-amber-200/60 dark:bg-zinc-900/80 dark:border-zinc-800">
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">Người phỏng vấn</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5 block">
                          {selectedCandidate.interview_schedule.interviewer}
                        </span>
                      </div>
                      <div className="col-span-2 rounded-lg bg-white/80 p-2 border border-amber-200/60 dark:bg-zinc-900/80 dark:border-zinc-800">
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">
                          {selectedCandidate.interview_schedule.format === 'Online' ? 'Đường dẫn phòng họp' : 'Địa điểm phòng họp'}
                        </span>
                        {selectedCandidate.interview_schedule.format === 'Online' ? (
                          <a
                            href={selectedCandidate.interview_schedule.location_or_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-mono truncate block mt-0.5"
                          >
                            {selectedCandidate.interview_schedule.location_or_link}
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5 block">
                            {selectedCandidate.interview_schedule.location_or_link}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {selectedCandidate.stage === 'INTERVIEW' && !selectedCandidate.interview_schedule?.date && (
                  <div className="rounded-xl border border-rose-300/80 bg-rose-500/15 p-3 flex items-center justify-between gap-3 dark:border-rose-800/80 dark:bg-rose-950/40">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-rose-900 dark:text-rose-200 block">
                          Chưa thiết lập lịch phỏng vấn
                        </span>
                        <span className="text-[11px] text-rose-700 dark:text-rose-300 block">
                          Bắt buộc phải có lịch phỏng vấn để duy trì ứng viên ở bước này.
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => openInterviewScheduleModal(selectedCandidate)}
                      className="h-7 text-xs shrink-0"
                    >
                      Thiết lập ngay
                    </Button>
                  </div>
                )}

                {/* 4. Nhật ký hoạt động & Phản hồi (Timeline - B1) */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
                      <h4 className="text-xs font-bold text-[#11221E] dark:text-zinc-100 uppercase tracking-wider">
                        Nhật ký hoạt động &amp; Phản hồi
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-[#5C7871] dark:text-zinc-400">
                      {(selectedCandidate.activity_logs || []).length} sự kiện
                    </span>
                  </div>

                  {(!selectedCandidate.activity_logs || selectedCandidate.activity_logs.length === 0) ? (
                    <p className="text-xs text-[#5C7871] dark:text-zinc-400 italic py-2">
                      Chưa có ghi nhận hoạt động mới.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {(isTimelineExpanded
                        ? selectedCandidate.activity_logs
                        : selectedCandidate.activity_logs.slice(0, 5)
                      ).map((item, idx) => (
                        <div
                          key={item.id || item.event_id || idx}
                          className="flex items-start gap-2.5 rounded-lg border border-[#D5E3DF] bg-[#F2F7F5]/50 p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/40"
                        >
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0F766E]/15 text-[#0F766E] dark:bg-teal-500/20 dark:text-teal-300">
                            <Clock className="h-3 w-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                                {item.title}
                              </span>
                              <span className="font-mono text-[10px] text-[#5C7871] dark:text-zinc-400 shrink-0">
                                {formatDateTimeVN(item.created_at)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[#415A54] dark:text-zinc-300 leading-relaxed">
                              {item.description}
                            </p>
                            <span className="mt-1 block text-[10px] text-[#5C7871] dark:text-zinc-400">
                              Người thực hiện: <strong className="text-zinc-700 dark:text-zinc-300">{item.actor_name}</strong>
                            </span>
                          </div>
                        </div>
                      ))}

                      {selectedCandidate.activity_logs.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                          className="w-full rounded-lg border border-dashed border-[#C6D9D3] py-1.5 text-center text-xs font-semibold text-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-700 dark:text-teal-400 dark:hover:bg-zinc-800/60"
                        >
                          {isTimelineExpanded ? 'Thu gọn nhật ký' : `Xem thêm ${selectedCandidate.activity_logs.length - 5} sự kiện trước`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog Lên lịch phỏng vấn ứng viên */}
      <Dialog
        open={isInterviewModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelInterviewModal();
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#11221E] dark:text-zinc-100">
              <Calendar className="h-5 w-5 text-[#0F766E] dark:text-teal-400" />
              {schedulingCandidate?.reschedule_request?.status === 'PENDING'
                ? 'Chấp thuận & Xếp lại lịch phỏng vấn'
                : 'Lên lịch phỏng vấn ứng viên'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5C7871] dark:text-zinc-400">
              {schedulingCandidate ? (
                <span>
                  Ứng viên: <strong className="text-[#11221E] dark:text-zinc-200">{schedulingCandidate.full_name}</strong> ({schedulingCandidate.candidate_code}) · Vị trí: <strong className="text-[#11221E] dark:text-zinc-200">{schedulingCandidate.job_title}</strong>
                </span>
              ) : (
                'Thiết lập thời gian và thông tin phỏng vấn'
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmInterviewSchedule} className="mt-4 space-y-4">
            {/* Cảnh báo nếu đang xử lý yêu cầu dời lịch */}
            {schedulingCandidate?.reschedule_request?.status === 'PENDING' && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Ứng viên đề xuất thời gian mới:</span>
                  <span className="font-mono text-amber-800 dark:text-amber-300">
                    {schedulingCandidate.reschedule_request.proposed_time}
                  </span>
                </div>
                {schedulingCandidate.reschedule_request.reason && (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 pl-5.5">
                    Lý do: <span className="italic">{schedulingCandidate.reschedule_request.reason}</span>
                  </p>
                )}
              </div>
            )}
            {/* Ngày và Giờ phỏng vấn */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                  Ngày phỏng vấn <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                  Giờ phỏng vấn <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="time"
                    required
                    value={interviewTime}
                    onChange={(e) => setInterviewTime(e.target.value)}
                    className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {/* Hình thức phỏng vấn (Online / Offline) */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                Hình thức phỏng vấn <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInterviewFormat('Online');
                    if (!interviewLocationOrLink || interviewLocationOrLink.includes('Phòng họp')) {
                      setInterviewLocationOrLink(
                        `https://meet.google.com/hrm-${schedulingCandidate?.candidate_code.toLowerCase() || 'interview'}`
                      );
                    }
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all',
                    interviewFormat === 'Online'
                      ? 'border-[#0F766E] bg-[#0F766E]/10 text-[#0F766E] font-semibold dark:border-teal-500 dark:bg-teal-500/20 dark:text-teal-300 shadow-2xs'
                      : 'border-[#C6D9D3] bg-[#FCFEFD] text-[#5C7871] hover:border-[#0F766E]/50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                  )}
                >
                  <Video className="h-4 w-4" />
                  Online (Google Meet)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInterviewFormat('Offline');
                    if (!interviewLocationOrLink || interviewLocationOrLink.includes('meet.google.com')) {
                      setInterviewLocationOrLink(
                        'Phòng họp Tầng 3 - Tòa nhà TechCorp, 123 Nguyễn Trãi, Q.1, TP.HCM'
                      );
                    }
                  }}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all',
                    interviewFormat === 'Offline'
                      ? 'border-[#0F766E] bg-[#0F766E]/10 text-[#0F766E] font-semibold dark:border-teal-500 dark:bg-teal-500/20 dark:text-teal-300 shadow-2xs'
                      : 'border-[#C6D9D3] bg-[#FCFEFD] text-[#5C7871] hover:border-[#0F766E]/50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                  )}
                >
                  <MapPin className="h-4 w-4" />
                  Trực tiếp tại văn phòng
                </button>
              </div>
            </div>

            {/* Người phỏng vấn (Interviewer) */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                Người phỏng vấn (Interviewer) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Nhập tên người phỏng vấn hoặc hội đồng..."
                value={interviewInterviewer}
                onChange={(e) => setInterviewInterviewer(e.target.value)}
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Link họp / Địa điểm */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                {interviewFormat === 'Online' ? 'Link phòng họp trực tuyến' : 'Địa điểm phòng họp'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder={
                  interviewFormat === 'Online'
                    ? 'https://meet.google.com/...'
                    : 'Địa chỉ phòng họp...'
                }
                value={interviewLocationOrLink}
                onChange={(e) => setInterviewLocationOrLink(e.target.value)}
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Checkbox mặc định bật 'Gửi thông báo & email cho ứng viên' */}
            <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={interviewSendNotification}
                  onChange={(e) => setInterviewSendNotification(e.target.checked)}
                  className="h-4 w-4 rounded border-[#C6D9D3] text-[#0F766E] focus:ring-[#0F766E] dark:border-zinc-700 dark:bg-zinc-800"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                    Gửi thông báo &amp; email cho ứng viên
                  </span>
                  <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                    Ứng viên sẽ nhận được thông báo thời gian thực kèm ngày giờ, người phỏng vấn và đường dẫn tham dự.
                  </span>
                </div>
              </label>
            </div>

            <DialogFooter className="mt-6 flex flex-row items-center justify-end gap-2 pt-2 border-t border-[#D5E3DF] dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelInterviewModal}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary">
                <Send className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
                {schedulingCandidate?.reschedule_request?.status === 'PENDING'
                  ? 'Chấp nhận & Cập nhật lịch mới'
                  : 'Xác nhận & Gửi thông báo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Candidate CV Preview Modal Dialog */}
      <Dialog open={isPreviewCvOpen} onOpenChange={setIsPreviewCvOpen}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto p-6">
          {selectedCandidate && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#D5E3DF] pb-4 dark:border-zinc-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded border border-[#C6D9D3] bg-[#F2F7F5] dark:border-zinc-700 dark:bg-zinc-800">
                      {selectedCandidate.candidate_code}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                        CANDIDATE_SOURCE_BADGES[selectedCandidate.source]?.className ||
                          'border-[#D5E3DF] bg-[#F2F7F5] text-[#415A54]'
                      )}
                    >
                      {CANDIDATE_SOURCE_BADGES[selectedCandidate.source]?.label || selectedCandidate.source}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                        CANDIDATE_STAGE_BADGES[selectedCandidate.stage]?.className ||
                          'border-[#D5E3DF] bg-[#F2F7F5] text-[#415A54]'
                      )}
                    >
                      {getStageDisplayLabel(selectedCandidate.stage)}
                    </span>
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-[#11221E] dark:text-zinc-100">
                    {selectedCandidate.full_name}
                  </h3>
                  <p className="text-sm font-medium text-[#415A54] dark:text-zinc-300">
                    {selectedCandidate.job_title} · {selectedCandidate.department_name}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleDownloadCvPdf}
                    className="text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Tải CV (PDF/TXT)
                  </Button>
                </div>
              </div>

              {/* CV Document Body */}
              <div className="rounded-xl border border-[#D5E3DF] bg-[#FCFEFD] p-6 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 space-y-6">
                {/* 1. Contact Info */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F766E] dark:text-teal-400">
                    1. Thông tin liên hệ &amp; Kỳ vọng đãi ngộ
                  </h4>
                  <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
                    <div className="flex items-center gap-2 text-[#415A54] dark:text-zinc-300">
                      <Mail className="h-3.5 w-3.5 text-[#5C7871]" />
                      <span>Email: <strong className="text-[#11221E] dark:text-zinc-100">{selectedCandidate.email}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-[#415A54] dark:text-zinc-300">
                      <Phone className="h-3.5 w-3.5 text-[#5C7871]" />
                      <span>Số điện thoại: <strong className="text-[#11221E] dark:text-zinc-100">{selectedCandidate.phone}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-[#415A54] dark:text-zinc-300">
                      <Building className="h-3.5 w-3.5 text-[#5C7871]" />
                      <span>Công ty hiện tại: <strong className="text-[#11221E] dark:text-zinc-100">{selectedCandidate.current_company}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-[#415A54] dark:text-zinc-300">
                      <Calendar className="h-3.5 w-3.5 text-[#5C7871]" />
                      <span>Ngày nộp đơn: <strong className="text-[#11221E] dark:text-zinc-100">{formatDateVN(selectedCandidate.applied_date)}</strong></span>
                    </div>
                    {!hideSalary && (
                      <div className="flex items-center gap-2 text-[#415A54] dark:text-zinc-300 sm:col-span-2">
                        <span>Mức lương kỳ vọng:</span>
                        <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                          {formatVND(selectedCandidate.expected_salary_vnd)} / tháng
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Education */}
                <div className="border-t border-[#D5E3DF] pt-4 dark:border-zinc-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F766E] dark:text-teal-400">
                    2. Trình độ học vấn &amp; Bằng cấp
                  </h4>
                  <div className="mt-2 text-xs text-[#11221E] dark:text-zinc-200">
                    <p className="font-semibold">{selectedCandidate.ai_evaluation.education_fit}</p>
                    <p className="text-[#5C7871] dark:text-zinc-400 mt-0.5">
                      Kinh nghiệm làm việc chuyên môn: {selectedCandidate.ai_evaluation.experience_years} năm
                    </p>
                  </div>
                </div>

                {/* 3. Key Skills */}
                <div className="border-t border-[#D5E3DF] pt-4 dark:border-zinc-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F766E] dark:text-teal-400">
                    3. Kỹ năng chuyên môn cốt lõi
                  </h4>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedCandidate.ai_evaluation.key_skills_matched.map((skill, idx) => (
                      <Badge key={idx} variant="teal">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* 4. AI Matching Insights */}
                <div className="border-t border-[#D5E3DF] pt-4 dark:border-zinc-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F766E] dark:text-teal-400">
                    4. Đánh giá sơ bộ từ AI Matching ({selectedCandidate.ai_evaluation.match_score}% Fit)
                  </h4>
                  <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-lg bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-300">
                      <span className="font-bold block mb-1">Điểm mạnh ghi nhận:</span>
                      <ul className="list-disc pl-4 space-y-1">
                        {selectedCandidate.ai_evaluation.strengths.map((str, idx) => (
                          <li key={idx}>{str}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                      <span className="font-bold block mb-1">Điểm cần làm rõ khi phỏng vấn:</span>
                      <ul className="list-disc pl-4 space-y-1">
                        {selectedCandidate.ai_evaluation.gaps.map((gap, idx) => (
                          <li key={idx}>{gap}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Initiate Onboarding & Asset Assignment Dialog */}
      <Dialog
        open={Boolean(onboardingCandidate)}
        onOpenChange={(open) => {
          if (!open) setOnboardingCandidate(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          {onboardingCandidate && (
            <>
              <DialogHeader>
                <DialogTitle>Khởi tạo Onboarding &amp; Cấp phát tài sản</DialogTitle>
                <DialogDescription>
                  Tạo mã nhân viên chính thức trên Core HR, mở lộ trình hội nhập 8 hạng mục và bàn giao thiết bị công tác
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleConfirmInitiateOnboarding} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="onb-cand-name"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Họ tên ứng viên
                    </label>
                    <Input
                      id="onb-cand-name"
                      value={`${onboardingCandidate.full_name} (${onboardingCandidate.candidate_code})`}
                      readOnly
                      className="bg-[#F2F7F5] text-[#415A54] dark:bg-zinc-900 dark:text-zinc-400"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onb-emp-code"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Mã nhân viên tự sinh *
                    </label>
                    <Input
                      id="onb-emp-code"
                      value={onbEmpCode}
                      onChange={(e) => setOnbEmpCode(e.target.value)}
                      className="font-mono tabular-nums"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="onb-email"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Email công ty *
                    </label>
                    <Input
                      id="onb-email"
                      type="email"
                      value={onbEmail}
                      onChange={(e) => setOnbEmail(e.target.value)}
                      className="font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onb-position"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Chức danh tiếp nhận *
                    </label>
                    <Input
                      id="onb-position"
                      value={onbPosition}
                      onChange={(e) => setOnbPosition(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="onb-dept"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Phòng ban tiếp nhận *
                    </label>
                    <Select
                      id="onb-dept"
                      value={onbDeptId}
                      onValueChange={handleOnbDeptChange}
                      options={departments.map((d) => ({
                        label: d.department_name,
                        value: d.id,
                      }))}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="onb-manager"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Quản lý trực tiếp *
                    </label>
                    <Input
                      id="onb-manager"
                      value={onbManagerName}
                      onChange={(e) => setOnbManagerName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className={cn('grid grid-cols-1 gap-3', !hideSalary && 'sm:grid-cols-2')}>
                  <div>
                    <label
                      htmlFor="onb-start-date"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Ngày nhận việc *
                    </label>
                    <Input
                      id="onb-start-date"
                      type="date"
                      value={onbStartDate}
                      onChange={(e) => setOnbStartDate(e.target.value)}
                      className="font-mono tabular-nums"
                      required
                    />
                  </div>

                  {!hideSalary && (
                    <div>
                      <label
                        htmlFor="onb-probation-salary"
                        className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        Mức lương thử việc gợi ý (VND) *
                      </label>
                      <Input
                        id="onb-probation-salary"
                        type="text"
                        inputMode="numeric"
                        value={onbSalary ? formatNumberVN(Number(onbSalary)) : ''}
                        onChange={(e) => setOnbSalary(e.target.value.replace(/\D/g, ''))}
                        className="font-mono tabular-nums"
                        required
                      />
                      <p className="mt-1 text-[11px] text-[#5C7871] dark:text-zinc-400">
                        Đề xuất 85% mức kỳ vọng (
                        <span className="font-mono tabular-nums">
                          {formatVND(onboardingCandidate.expected_salary_vnd)}
                        </span>
                        )
                      </p>
                    </div>
                  )}
                </div>

                {/* Available Assets Selection */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-3.5 dark:border-zinc-800/80 dark:bg-transparent">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      <Laptop className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                      Cấp phát thiết bị sẵn sàng trong kho
                    </span>
                    <span className="font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                      Đã chọn: {selectedAssetIds.length}/{availableAssets.length}
                    </span>
                  </div>

                  {availableAssets.length === 0 ? (
                    <p className="mt-2 text-xs text-[#5C7871] dark:text-zinc-400">
                      Hiện không còn thiết bị trống trong kho, có thể cấp phát bổ sung sau tại phân hệ Onboarding &amp; Tài sản
                    </p>
                  ) : (
                    <div className="mt-2.5 max-h-48 space-y-2 overflow-y-auto pr-1">
                      {availableAssets.map((asset) => {
                        const checked = selectedAssetIds.includes(asset.id);
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggleAssetSelection(asset.id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                              checked
                                ? 'border-[#0F766E] bg-[#CBE8E2]/60 dark:border-teal-400/50 dark:bg-teal-950/30'
                                : 'border-[#C6D9D3] bg-[#FCFEFD] hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/60'
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                  checked
                                    ? 'border-[#0F766E] bg-[#0F766E] text-white dark:border-teal-400 dark:bg-teal-400 dark:text-zinc-950'
                                    : 'border-[#5C7871] bg-[#FCFEFD] dark:border-zinc-600 dark:bg-zinc-900'
                                )}
                              >
                                {checked && <Check className="h-3 w-3" strokeWidth={2} />}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-[#11221E] dark:text-zinc-100">
                                  {asset.name}
                                </div>
                                <div className="font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
                                  {asset.asset_code} · S/N: {asset.serial_number}
                                </div>
                              </div>
                            </div>
                            <Badge variant="secondary" className="shrink-0">
                              {ASSET_CATEGORY_SHORT[asset.category]}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOnboardingCandidate(null)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" variant="primary">
                    <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
                    Xác nhận &amp; Khởi tạo Onboarding
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Job Posting Dialog */}
      <Dialog open={isAddJobOpen} onOpenChange={setIsAddJobOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tạo tin tuyển dụng mới</DialogTitle>
            <DialogDescription>
              Tin tuyển dụng mới sẽ hiển thị ngay trên bảng Kanban ATS và tự động đồng bộ trực tiếp sang Cổng việc làm Lạc Việt Careers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddJob} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tiêu đề vị trí *
              </label>
              <Input
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="Ví dụ: Product Designer (B2B SaaS)"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Phòng ban yêu cầu
                </label>
                <Select
                  value={newJobDeptId}
                  onValueChange={setNewJobDeptId}
                  options={departments.map((d) => ({
                    label: d.department_name,
                    value: d.id,
                  }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Cấp bậc
                </label>
                <Input
                  value={newJobLevel}
                  onChange={(e) => setNewJobLevel(e.target.value)}
                  placeholder="Senior / Mid"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Lương tối thiểu (VNĐ/tháng)
                </label>
                <Input
                  type="number"
                  value={newJobMinSalary}
                  onChange={(e) => setNewJobMinSalary(e.target.value)}
                  placeholder="25000000"
                  className="font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Lương tối đa (VNĐ/tháng)
                </label>
                <Input
                  type="number"
                  value={newJobMaxSalary}
                  onChange={(e) => setNewJobMaxSalary(e.target.value)}
                  placeholder="40000000"
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Hình thức làm việc
                </label>
                <Select
                  value={newJobWorkMode}
                  onValueChange={(v) => setNewJobWorkMode(v as 'Hybrid' | 'Onsite' | 'Remote')}
                  options={[
                    { label: 'Linh hoạt (Hybrid)', value: 'Hybrid' },
                    { label: 'Tại văn phòng (Onsite)', value: 'Onsite' },
                    { label: 'Làm việc từ xa (Remote)', value: 'Remote' },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Địa điểm làm việc
                </label>
                <Input
                  value={newJobLocation}
                  onChange={(e) => setNewJobLocation(e.target.value)}
                  placeholder="Hà Nội / TP.HCM / Toàn quốc"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Số lượng tuyển
                </label>
                <Input
                  type="number"
                  min={1}
                  value={newJobTarget}
                  onChange={(e) => setNewJobTarget(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Mức độ ưu tiên
                </label>
                <Select
                  value={newJobUrgent}
                  onValueChange={(v) => setNewJobUrgent(v as 'OPEN' | 'URGENT')}
                  options={[
                    { label: 'Đang mở', value: 'OPEN' },
                    { label: 'Tuyển gấp', value: 'URGENT' },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Hạn nhận hồ sơ
                </label>
                <Input
                  type="date"
                  value={newJobClosingDate}
                  onChange={(e) => setNewJobClosingDate(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tóm tắt trách nhiệm & Yêu cầu vị trí
              </label>
              <textarea
                rows={2}
                value={newJobOverview}
                onChange={(e) => setNewJobOverview(e.target.value)}
                placeholder="Mô tả ngắn gọn về vai trò và định hướng công việc cho ứng viên..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddJobOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Đăng tin & Đồng bộ Cổng việc làm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Department Recruitment Request Dialog */}
      <Dialog open={isAddDeptReqOpen} onOpenChange={setIsAddDeptReqOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo Đề xuất Tuyển dụng từ Phòng ban</DialogTitle>
            <DialogDescription>
              Đề xuất bổ sung nhân sự từ Trưởng bộ phận. Sau khi gửi, thông báo thời gian thực sẽ gửi tới HR Manager và Giám đốc để phê duyệt và mở tin tuyển dụng.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateDeptRequestSubmit} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Phòng ban đề xuất *
              </label>
              <Select
                value={reqDeptId}
                onValueChange={setReqDeptId}
                options={departments.map((d) => ({
                  label: `${d.department_name} (${d.manager_name})`,
                  value: d.id,
                }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Chức danh / Vị trí tuyển dụng *
              </label>
              <Input
                value={reqPositionTitle}
                onChange={(e) => setReqPositionTitle(e.target.value)}
                placeholder="Ví dụ: Kỹ sư Hạ tầng Cloud & DevOps"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Cấp bậc chuyên môn
                </label>
                <Select
                  value={reqLevel}
                  onValueChange={setReqLevel}
                  options={[
                    { label: 'Intern / Thực tập sinh', value: 'Intern' },
                    { label: 'Junior (1-2 năm)', value: 'Junior' },
                    { label: 'Mid-level (2-4 năm)', value: 'Mid' },
                    { label: 'Senior (4+ năm)', value: 'Senior' },
                    { label: 'Lead / Principal', value: 'Lead' },
                    { label: 'Manager / Trưởng phòng', value: 'Manager' },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Số lượng cần tuyển
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={reqQuantity}
                  onChange={(e) => setReqQuantity(e.target.value)}
                  className="font-mono tabular-nums"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Mức độ ưu tiên
                </label>
                <Select
                  value={reqUrgency}
                  onValueChange={(v) => setReqUrgency(v as 'NORMAL' | 'URGENT')}
                  options={[
                    { label: 'Tiêu chuẩn', value: 'NORMAL' },
                    { label: 'Tuyển gấp', value: 'URGENT' },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Hạn chót cần nhân sự
                </label>
                <Input
                  type="date"
                  value={reqDeadline}
                  onChange={(e) => setReqDeadline(e.target.value)}
                  className="font-mono tabular-nums"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Khung lương dự kiến (VNĐ/tháng)
              </label>
              <Input
                value={reqSalaryRange}
                onChange={(e) => setReqSalaryRange(e.target.value)}
                placeholder="25.000.000 - 45.000.000 đ"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Lý do & Mục tiêu tuyển dụng *
              </label>
              <textarea
                rows={3}
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Mô tả lý do cần tuyển bổ sung, khối lượng công việc phát sinh hoặc dự án mới..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2 text-xs text-[#11221E] placeholder:text-[#5C7871] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddDeptReqOpen(false)}>
                Hủy bỏ
              </Button>
              <Button type="submit" variant="primary">
                <Send className="h-4 w-4" strokeWidth={1.5} />
                Gửi đề xuất tới HR
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Department Request Details Slide-over Drawer */}
      {selectedDeptReq && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="fixed inset-0 bg-[#11221E]/25 backdrop-blur-[1px] transition-opacity duration-300 dark:bg-zinc-950/40"
            onClick={() => setSelectedDeptReq(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="dept-req-drawer-title"
              className="flex w-screen max-w-md flex-col border-l border-[#C6D9D3] bg-[#FCFEFD] text-[#11221E] shadow-2xl transition-all duration-300 dark:border-zinc-800 dark:bg-[#18181b] dark:text-zinc-100"
            >
              <div className="flex items-start justify-between border-b border-[#D5E3DF] p-5 dark:border-zinc-800">
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded border border-[#C6D9D3] bg-[#F2F7F5] dark:border-zinc-700 dark:bg-zinc-800">
                      {selectedDeptReq.request_code}
                    </span>
                    {selectedDeptReq.urgency === 'URGENT' && (
                      <Badge variant="danger" className="text-[10px] px-1.5 py-0 font-medium">
                        Gấp
                      </Badge>
                    )}
                    <Badge
                      variant={
                        selectedDeptReq.status === 'APPROVED'
                          ? 'teal'
                          : selectedDeptReq.status === 'REJECTED'
                          ? 'muted'
                          : 'warning'
                      }
                      className="text-[10px]"
                    >
                      {selectedDeptReq.status === 'APPROVED'
                        ? 'Đã lập tin'
                        : selectedDeptReq.status === 'REJECTED'
                        ? 'Từ chối'
                        : 'Chờ duyệt'}
                    </Badge>
                  </div>
                  <h3
                    id="dept-req-drawer-title"
                    className="mt-2 text-base font-bold text-[#11221E] dark:text-zinc-100"
                  >
                    {selectedDeptReq.position_title}
                  </h3>
                  <p className="text-xs text-[#5C7871] dark:text-zinc-400">
                    {selectedDeptReq.department_name} · Cấp bậc: {selectedDeptReq.level}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDeptReq(null)}
                  className="rounded-lg p-1 text-[#5C7871] hover:bg-[#E8F3EF] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800"
                  aria-label="Đóng"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#D5E3DF] bg-[#F2F7F5]/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <div>
                    <span className="text-[#5C7871] dark:text-zinc-400">Số lượng cần tuyển:</span>
                    <p className="font-semibold text-sm text-[#11221E] dark:text-zinc-100 font-mono">
                      {selectedDeptReq.quantity} người
                    </p>
                  </div>
                  <div>
                    <span className="text-[#5C7871] dark:text-zinc-400">Hạn tuyển dụng:</span>
                    <p className="font-semibold text-sm text-[#11221E] dark:text-zinc-100 font-mono">
                      {formatDateVN(selectedDeptReq.deadline_date)}
                    </p>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-[#D5E3DF] dark:border-zinc-800">
                    <span className="text-[#5C7871] dark:text-zinc-400">Mức lương dự kiến:</span>
                    <p className="font-semibold text-[#0F766E] dark:text-teal-400 font-mono">
                      {selectedDeptReq.expected_salary_range}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-[#11221E] dark:text-zinc-200 mb-1">
                    Lý do tuyển dụng & Mục tiêu
                  </h4>
                  <div className="rounded-lg border border-[#D5E3DF] bg-white p-3 text-[#415A54] leading-relaxed dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                    {selectedDeptReq.reason}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-[#11221E] dark:text-zinc-200 mb-1">
                    Người đề xuất
                  </h4>
                  <div className="flex items-center gap-2 rounded-lg border border-[#D5E3DF] bg-[#FCFEFD] p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <Avatar
                      name={selectedDeptReq.requested_by_name}
                      className="h-8 w-8 text-xs font-bold"
                    />
                    <div>
                      <div className="font-medium text-[#11221E] dark:text-zinc-200">
                        {selectedDeptReq.requested_by_name}
                      </div>
                      <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                        {selectedDeptReq.department_name}
                      </div>
                    </div>
                  </div>
                </div>

                {selectedDeptReq.status === 'REJECTED' && selectedDeptReq.rejection_reason && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                    <span className="font-bold block mb-1">Lý do từ chối:</span>
                    <p>{selectedDeptReq.rejection_reason}</p>
                  </div>
                )}

                {selectedDeptReq.status === 'APPROVED' && selectedDeptReq.job_code_created && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-teal-800 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300">
                    <span className="font-bold block mb-1">Tin tuyển dụng đã lập:</span>
                    <p className="font-mono font-semibold">{selectedDeptReq.job_code_created}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-[#D5E3DF] p-4 flex items-center justify-between gap-2 dark:border-zinc-800">
                <Button variant="outline" size="sm" onClick={() => setSelectedDeptReq(null)}>
                  Đóng
                </Button>
                {selectedDeptReq.status === 'PENDING' && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleOpenRejectDialog(selectedDeptReq);
                      }}
                      className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400"
                    >
                      Từ chối
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        handleOpenApprovePreview(selectedDeptReq);
                      }}
                    >
                      Duyệt & Tạo tin
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Department Request Dialog */}
      <Dialog
        open={Boolean(rejectTargetReq)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTargetReq(null);
            setRejectReasonInput('');
            setRejectReasonError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Từ chối Đề xuất Tuyển dụng</DialogTitle>
            <DialogDescription>
              Vui lòng nhập lý do từ chối đề xuất {rejectTargetReq?.request_code} ({rejectTargetReq?.position_title}) để phản hồi cho Trưởng bộ phận.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmRejectDeptRequest} className="mt-3 space-y-3">
            <div>
              <label
                htmlFor="reject-reason"
                className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Lý do từ chối *
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                required
                value={rejectReasonInput}
                onChange={(e) => {
                  setRejectReasonInput(e.target.value);
                  setRejectReasonError(null);
                }}
                placeholder="Nhập lý do từ chối (bắt buộc, ví dụ: Chưa phù hợp với ngân sách Q4/2026, hoãn sang năm sau...)"
                className={cn(
                  'w-full rounded-md border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 text-xs text-[#11221E] placeholder:text-[#5C7871] shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
                  rejectReasonError && 'border-rose-500 ring-1 ring-rose-500'
                )}
              />
              {rejectReasonError && (
                <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                  {rejectReasonError}
                </p>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectTargetReq(null);
                  setRejectReasonInput('');
                  setRejectReasonError(null);
                }}
              >
                Hủy
              </Button>
              <Button type="submit" variant="danger" size="sm">
                Xác nhận từ chối
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approve Department Request & Create Job Preview Dialog */}
      <Dialog
        open={Boolean(approvePreviewReq)}
        onOpenChange={(open) => {
          if (!open) setApprovePreviewReq(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Xem trước &amp; Xác nhận Duyệt Đề xuất</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ phê duyệt đề xuất và tự động tạo tin tuyển dụng mới đồng bộ sang Cổng việc làm.
            </DialogDescription>
          </DialogHeader>

          {approvePreviewReq && (
            <div className="mt-3 space-y-3.5 text-xs">
              <div className="rounded-xl border border-[#0F766E]/30 bg-[#E8F3EF]/60 p-4 dark:border-teal-500/30 dark:bg-zinc-900/60">
                <div className="flex items-center justify-between gap-2 border-b border-[#D5E3DF] pb-2 dark:border-zinc-800">
                  <div>
                    <span className="font-mono text-[11px] font-semibold text-[#0F766E] dark:text-teal-400">
                      Mã đề xuất: {approvePreviewReq.request_code}
                    </span>
                    <h4 className="text-sm font-bold text-[#11221E] dark:text-zinc-100 mt-0.5">
                      {approvePreviewReq.position_title}
                    </h4>
                  </div>
                  <Badge variant={approvePreviewReq.urgency === 'URGENT' ? 'danger' : 'teal'}>
                    {approvePreviewReq.urgency === 'URGENT' ? 'Tuyển gấp' : 'Tiêu chuẩn'}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5 text-[#415A54] dark:text-zinc-300">
                  <div>
                    <span className="text-[#5C7871] dark:text-zinc-400">Phòng ban:</span>{' '}
                    <span className="font-semibold text-[#11221E] dark:text-zinc-200">
                      {approvePreviewReq.department_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#5C7871] dark:text-zinc-400">Cấp bậc:</span>{' '}
                    <span className="font-semibold text-[#11221E] dark:text-zinc-200">
                      {approvePreviewReq.level}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#5C7871] dark:text-zinc-400">Chỉ tiêu:</span>{' '}
                    <span className="font-mono font-semibold text-[#11221E] dark:text-zinc-200">
                      {approvePreviewReq.quantity} người
                    </span>
                  </div>
                  <div>
                    <span className="text-[#5C7871] dark:text-zinc-400">Hạn nộp:</span>{' '}
                    <span className="font-mono font-semibold text-[#11221E] dark:text-zinc-200">
                      {formatDateVN(approvePreviewReq.deadline_date)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#5C7871] dark:text-zinc-400">Mức lương:</span>{' '}
                    <span className="font-mono font-semibold text-[#0F766E] dark:text-teal-400">
                      {approvePreviewReq.expected_salary_range}
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setApprovePreviewReq(null)}
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleConfirmApproveDeptRequest}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Xác nhận Duyệt &amp; Đăng tin
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Drag & Drop to Offer Confirmation Dialog */}
      <Dialog
        open={Boolean(offerDialogCandidate)}
        onOpenChange={(open) => {
          if (!open) setOfferDialogCandidate(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gửi Thư Mời Nhận Việc (Offer)</DialogTitle>
            <DialogDescription>
              Thiết lập mức lương và ngày nhận việc dự kiến cho ứng viên {offerDialogCandidate?.full_name} ({offerDialogCandidate?.candidate_code}).
            </DialogDescription>
          </DialogHeader>

          {offerDialogCandidate && (
            <form onSubmit={handleConfirmOfferDialog} className="mt-3 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Vị trí tuyển dụng
                </label>
                <Input
                  value={`${offerDialogCandidate.job_title} · ${offerDialogCandidate.department_name}`}
                  readOnly
                  className="bg-[#F2F7F5] dark:bg-zinc-900"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Mức lương đề xuất (VNĐ/tháng) *
                </label>
                <Input
                  type="text"
                  value={offerSalaryInput}
                  onChange={(e) => setOfferSalaryInput(e.target.value)}
                  placeholder="30.000.000"
                  className="font-mono tabular-nums"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Ngày nhận việc dự kiến *
                </label>
                <Input
                  type="date"
                  value={offerStartDateInput}
                  onChange={(e) => setOfferStartDateInput(e.target.value)}
                  className="font-mono tabular-nums"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Ghi chú điều khoản offer
                </label>
                <textarea
                  rows={2}
                  value={offerNotesInput}
                  onChange={(e) => setOfferNotesInput(e.target.value)}
                  className="w-full rounded-md border border-[#C6D9D3] bg-[#FCFEFD] p-2 text-xs text-[#11221E] shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  placeholder="Ghi chú thêm về phụ cấp, bảo hiểm hoặc thời gian thử việc..."
                />
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setOfferDialogCandidate(null)}>
                  Hủy
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Xác nhận Offer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Drag & Drop to Reject Candidate Confirmation Dialog */}
      <Dialog
        open={Boolean(rejectDialogCandidate)}
        onOpenChange={(open) => {
          if (!open) setRejectDialogCandidate(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Loại Hồ Sơ Ứng Viên</DialogTitle>
            <DialogDescription>
              Ghi nhận lý do không tiếp tục quy trình tuyển dụng đối với {rejectDialogCandidate?.full_name} ({rejectDialogCandidate?.candidate_code}).
            </DialogDescription>
          </DialogHeader>

          {rejectDialogCandidate && (
            <form onSubmit={handleConfirmRejectCandidateDialog} className="mt-3 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Lý do loại hồ sơ *
                </label>
                <Select
                  value={rejectReasonOption}
                  onValueChange={setRejectReasonOption}
                  options={[
                    { label: 'Kỹ năng chuyên môn chưa phù hợp', value: 'Kỹ năng chuyên môn chưa phù hợp' },
                    { label: 'Mức lương kỳ vọng vượt khung ngân sách', value: 'Mức lương kỳ vọng vượt khung ngân sách' },
                    { label: 'Không tham gia buổi phỏng vấn', value: 'Không tham gia buổi phỏng vấn' },
                    { label: 'Ứng viên từ chối nhận offer', value: 'Ứng viên từ chối nhận offer' },
                    { label: 'Văn hóa / định hướng chưa phù hợp', value: 'Văn hóa / định hướng chưa phù hợp' },
                    { label: 'Lý do khác', value: 'Lý do khác' },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Ghi chú chi tiết
                </label>
                <textarea
                  rows={3}
                  value={rejectDetailsInput}
                  onChange={(e) => setRejectDetailsInput(e.target.value)}
                  placeholder="Ghi chú thêm thông tin phản hồi từ hội đồng tuyển dụng..."
                  className="w-full rounded-md border border-[#C6D9D3] bg-[#FCFEFD] p-2 text-xs text-[#11221E] shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setRejectDialogCandidate(null)}>
                  Hủy
                </Button>
                <Button type="submit" variant="danger" size="sm">
                  Xác nhận loại hồ sơ
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Undo Stage Move Floating Toast Notification */}
      {lastMovedAction && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-[#0F766E]/40 bg-[#11221E] px-4 py-3 text-white shadow-xl dark:border-teal-500/40 dark:bg-zinc-900 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="text-xs">
            Đã chuyển <span className="font-semibold text-teal-300">{lastMovedAction.candidateName}</span> sang bước{' '}
            <span className="font-semibold text-teal-200">
              {getStageDisplayLabel(lastMovedAction.toStage)}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleUndoStageMove}
            className="h-7 border-teal-400/50 bg-teal-900/60 text-xs font-semibold text-teal-200 hover:bg-teal-800"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Hoàn tác
          </Button>
          <button
            onClick={() => setLastMovedAction(null)}
            className="rounded p-1 text-zinc-400 hover:text-white"
            aria-label="Đóng thông báo hoàn tác"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
