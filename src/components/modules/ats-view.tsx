'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
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
  Laptop,
  Layers,
  Mail,
  MapPin,
  MessageSquarePlus,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
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
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
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
import { Switch } from '@/components/ui/switch';

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

export const KANBAN_CARD_LIMIT = 8;

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

export function AtsView() {
  const { role, currentUserProfile, showToast, navigateWithIntent, navIntent, clearNavIntent } = useApp();
  const hideSalary = role === 'DEPT_MANAGER';
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
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>({});
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({});
  const [expandedLimits, setExpandedLimits] = useState<Record<string, boolean>>({});
  const [timeFilter, setTimeFilter] = useState<'30_DAYS' | 'CURRENT_MONTH' | 'ALL'>('30_DAYS');
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [isCompactMode, setIsCompactMode] = useState<boolean>(false);

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
    setTimeFilter('30_DAYS');
    setShowArchived(false);
    setIsCompactMode(false);
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

  const isCandidateArchived = useCallback((c: Candidate) => {
    if (c.stage !== 'ONBOARDED') return false;
    const onbRecords = getOnboardingRecords();
    const hasOnb = onbRecords.some(
      (rec) =>
        rec.full_name === c.full_name ||
        rec.candidate_code === c.candidate_code ||
        rec.id.toLowerCase().includes(c.id.toLowerCase())
    );
    if (hasOnb) return true;
    const appliedTime = new Date(c.applied_date).getTime();
    const diffDays = (Date.now() - appliedTime) / (1000 * 60 * 60 * 24);
    return diffDays >= 3;
  }, []);

  const filteredCandidates = useMemo(() => {
    let list = candidates;
    if (selectedJobId !== 'ALL') {
      list = list.filter((c) => c.job_id === selectedJobId);
    }
    if (selectedSource !== 'ALL') {
      list = list.filter((c) => c.source === selectedSource);
    }

    // Time filter
    if (timeFilter === '30_DAYS') {
      const now = Date.now();
      list = list.filter((c) => {
        if (showArchived && isCandidateArchived(c)) return true;
        const time = new Date(c.applied_date).getTime();
        const diffDays = (now - time) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 30;
      });
    } else if (timeFilter === 'CURRENT_MONTH') {
      list = list.filter((c) => {
        if (showArchived && isCandidateArchived(c)) return true;
        return c.applied_date.startsWith('2026-11');
      });
    }

    // Auto-Archive: hide archived ONBOARDED candidates unless showArchived is checked
    if (!showArchived) {
      list = list.filter((c) => !isCandidateArchived(c));
    }

    return list;
  }, [candidates, selectedJobId, selectedSource, timeFilter, showArchived, isCandidateArchived]);

  const archivedCount = useMemo(() => {
    return candidates.filter((c) => isCandidateArchived(c)).length;
  }, [candidates, isCandidateArchived]);

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
    setOnbSalary(String(suggestedProbationSalary || 22000000));
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

    const result = initiateCandidateOnboarding({
      candidate: onboardingCandidate,
      employeeCode: trimmedCode,
      email: trimmedEmail,
      departmentId: targetDept.id,
      departmentName: targetDept.department_name,
      positionName: onbPosition.trim() || onboardingCandidate.job_title,
      managerName: onbManagerName.trim() || targetDept.manager_name,
      startDate: onbStartDate || '2026-11-23',
      baseSalaryVnd: Number(onbSalary) || onboardingCandidate.expected_salary_vnd,
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
        c.id === onboardingCandidate.id ? { ...c, stage: 'ONBOARDED' } : c
      )
    );
    setSelectedCandidate(null);
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
    const updatedCandidate: Candidate = {
      ...candidate,
      reschedule_request: {
        ...candidate.reschedule_request,
        status: 'REJECTED',
      },
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
    if (schedulingCandidate && prevCandidateStage) {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === schedulingCandidate.id ? { ...c, stage: prevCandidateStage } : c
        )
      );
      setSelectedCandidate((prev) =>
        prev && prev.id === schedulingCandidate.id
          ? { ...prev, stage: prevCandidateStage }
          : prev
      );
      showToast(
        'Đã hủy lên lịch phỏng vấn',
        `Ứng viên ${schedulingCandidate.full_name} đã được giữ nguyên ở cột ban đầu (${getStageDisplayLabel(prevCandidateStage)}).`,
        'default'
      );
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
      },
      reschedule_request: schedulingCandidate.reschedule_request
        ? {
            ...schedulingCandidate.reschedule_request,
            status: 'ACCEPTED',
          }
        : undefined,
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
        : `${schedulingCandidate.full_name} -> Phỏng vấn (${interviewTime} ngày ${formatDateVN(interviewDate)})${interviewSendNotification ? ' · Đã gửi thông báo Real-time cho ứng viên.' : '.'}`,
      'success'
    );

    setIsInterviewModalOpen(false);
    setSchedulingCandidate(null);
    setPrevCandidateStage(null);
  };

  const handleMoveStage = (candidate: Candidate, targetStage: AtsStage) => {
    if (targetStage === 'ONBOARDED') {
      openOnboardingInitDialog(candidate);
      return;
    }
    if (targetStage === 'INTERVIEW' && candidate.stage !== 'INTERVIEW') {
      openInterviewScheduleModal(candidate);
      return;
    }

    const updatedCandidate: Candidate = { ...candidate, stage: targetStage };
    saveRuntimeCandidate(updatedCandidate);

    const stageLabel = getStageDisplayLabel(targetStage);

    // Real-time notification to Candidate & HR
    notifyCandidateStageChange(candidate, targetStage, stageLabel, actorName);

    setCandidates((prev) =>
      prev.map((c) => (c.id === candidate.id ? updatedCandidate : c))
    );
    setSelectedCandidate((prev) =>
      prev && prev.id === candidate.id ? updatedCandidate : prev
    );
    showToast(
      'Đã cập nhật trạng thái ứng viên',
      `${candidate.full_name} (${candidate.candidate_code}) -> ${stageLabel}. Đã đồng bộ thông báo Real-time cho ứng viên.`,
      'success'
    );
  };

  const handleQuickStageChange = (newStage: AtsStage) => {
    if (!selectedCandidate) return;
    if (newStage === selectedCandidate.stage) return;
    handleMoveStage(selectedCandidate, newStage);
  };

  const handleSaveInterviewNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    const trimmed = noteContent.trim();
    if (!trimmed) {
      showToast('Thiếu nội dung ghi chú', 'Vui lòng nhập nhận xét phỏng vấn trước khi lưu.', 'warning');
      return;
    }

    const newNote = {
      id: `note-${Date.now()}`,
      author: actorName,
      content: trimmed,
      created_at: new Date().toISOString(),
      rating: noteRating,
    };

    const updatedCand: Candidate = {
      ...selectedCandidate,
      notes: [newNote, ...(selectedCandidate.notes || [])],
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
      `Mã ${createdReq.request_code} đã gửi tới HR Manager và Giám đốc với thông báo Real-time.`,
      'success'
    );
  };

  const handleApproveDeptRequest = (req: DepartmentRecruitmentRequest) => {
    const result = approveDepartmentRecruitmentRequest(req.id, actorName);
    if (!result) return;
    setDeptRequests(getDepartmentRecruitmentRequests());
    setJobs(mergeWithRuntimeJobs(baseJobsRef.current));
    showToast(
      'Đã duyệt đề xuất & Mở tin tuyển dụng',
      `Đã khởi tạo tin ${result.job.job_code} (${result.job.title}) và đồng bộ sang Cổng việc làm.`,
      'success'
    );
  };

  const handleRejectDeptRequest = (req: DepartmentRecruitmentRequest) => {
    const reason = window.prompt(
      'Nhập lý do từ chối đề xuất tuyển dụng:',
      'Chưa phù hợp với định biên ngân sách Quý 4/2026'
    );
    if (reason === null) return;
    const result = rejectDepartmentRecruitmentRequest(req.id, reason, actorName);
    if (!result) return;
    setDeptRequests(getDepartmentRecruitmentRequests());
    showToast(
      'Đã từ chối đề xuất tuyển dụng',
      `Đã cập nhật trạng thái đề xuất ${req.request_code} và thông báo tới Trưởng phòng.`,
      'default'
    );
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Tuyển dụng & Quản trị Ứng viên (ATS)
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Quản lý đề xuất tuyển dụng phòng ban, tin tuyển dụng và theo dõi quy trình ứng viên theo Kanban
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddDeptReqOpen(true)}
            className="border-[#0F766E]/40 text-[#0F766E] hover:bg-[#E8F3EF] dark:border-teal-500/40 dark:text-teal-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Đề xuất tuyển dụng
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsAddJobOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Tạo tin tuyển dụng
          </Button>
        </div>
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
              Tự động đồng bộ Real-time tới HR & Trưởng phòng
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#D5E3DF] dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F2F7F5] text-[#415A54] dark:bg-zinc-800/80 dark:text-zinc-300">
                <tr>
                  <th className="px-3 py-2 font-semibold">Mã ĐX</th>
                  <th className="px-3 py-2 font-semibold">Vị trí & Cấp bậc</th>
                  <th className="px-3 py-2 font-semibold">Phòng ban</th>
                  <th className="px-3 py-2 font-semibold">Lý do tuyển dụng</th>
                  <th className="px-3 py-2 font-semibold">Mức lương & Hạn</th>
                  <th className="px-3 py-2 font-semibold">Người đề xuất</th>
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
                      className="hover:bg-[#F8FAF9] transition-colors dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-3 py-2.5 font-mono text-[11px] font-medium text-[#415A54] dark:text-zinc-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {req.urgency === 'URGENT' && (
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" title="Gấp" />
                          )}
                          {req.request_code}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                          {req.position_title}
                        </div>
                        <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                          Cấp bậc: {req.level} · SL: <span className="font-semibold text-[#11221E] dark:text-zinc-200">{req.quantity}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[#415A54] dark:text-zinc-300 whitespace-nowrap">
                        {req.department_name}
                      </td>
                      <td className="px-3 py-2.5 max-w-[240px]">
                        <p
                          className="line-clamp-1 text-[#415A54] dark:text-zinc-300"
                          title={req.reason}
                        >
                          {req.reason}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="font-mono text-[11px] text-[#11221E] dark:text-zinc-200">
                          {req.expected_salary_range}
                        </div>
                        <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                          Hạn: {formatDateVN(req.deadline_date)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[#5C7871] dark:text-zinc-400 whitespace-nowrap" title={req.requested_by_name}>
                        {req.requested_by_name.split(' (')[0]}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <Badge
                          variant={isApproved ? 'teal' : isRejected ? 'muted' : 'warning'}
                          className="text-[10px]"
                        >
                          {isApproved ? 'Đã lập tin' : isRejected ? 'Từ chối' : 'Chờ duyệt'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
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

      {/* Job Postings Section - Collapsible to Maximize Kanban Height */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
              <Briefcase className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
              Tin tuyển dụng đang mở ({jobs.length})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowJobCards((prev) => !prev)}
              className="h-7 text-xs text-[#5C7871] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {showJobCards ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-1" />
                  Thu gọn thẻ tin
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                  Xem {jobs.length} thẻ tin chi tiết
                </>
              )}
            </Button>
          </div>
          <div className="w-full sm:w-64">
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
        </div>

        {showJobCards && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {jobs.map((job) => {
              const statusMeta = JOB_STATUS_BADGE[job.status];
              const isSelected = selectedJobId === job.id;
              return (
                <Card
                  key={job.id}
                  onClick={() => setSelectedJobId(isSelected ? 'ALL' : job.id)}
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
      </div>

      {/* 5-Column Kanban Board */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-[#11221E] dark:text-zinc-100">
              Bảng Kanban quy trình ứng viên
              <span className="text-xs font-normal text-[#5C7871] dark:text-zinc-400">
                · {filteredCandidates.length} hồ sơ
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-[#5C7871] dark:text-zinc-400">
              Kéo thả thẻ để chuyển bước · Nhấn thẻ để xem chi tiết và điều chuyển
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48">
              <Select
                value={selectedJobId}
                onValueChange={setSelectedJobId}
                options={[
                  { label: `Tất cả vị trí (${candidates.length})`, value: 'ALL' },
                  ...jobs.map((j) => ({
                    label: `${j.job_code} — ${j.title}`,
                    value: j.id,
                  })),
                ]}
              />
            </div>

            <div className="w-32">
              <Select
                value={selectedSource}
                onValueChange={setSelectedSource}
                options={[
                  { label: 'Mọi nguồn', value: 'ALL' },
                  { label: 'CareerSite', value: 'CareerSite' },
                  { label: 'LinkedIn', value: 'LinkedIn' },
                  { label: 'TopCV', value: 'TopCV' },
                  { label: 'Referral', value: 'Referral' },
                  { label: 'ITviec', value: 'ITviec' },
                ]}
              />
            </div>

            <div className="w-44">
              <Select
                value={timeFilter}
                onValueChange={(val) => setTimeFilter(val as '30_DAYS' | 'CURRENT_MONTH' | 'ALL')}
                options={[
                  { label: '30 ngày gần nhất', value: '30_DAYS' },
                  { label: 'Kỳ hiện tại (Tháng 11/2026)', value: 'CURRENT_MONTH' },
                  { label: 'Tất cả thời gian', value: 'ALL' },
                ]}
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 py-1.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
              <Switch
                id="toggle-archive"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <label
                htmlFor="toggle-archive"
                className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#415A54] select-none dark:text-zinc-300"
              >
                <Archive className="h-3.5 w-3.5 text-[#5C7871] dark:text-zinc-400" />
                <span>Hiện hồ sơ đã bàn giao/lưu trữ</span>
                <span className="rounded-full bg-[#E4EEEB] px-1.5 py-0.2 font-mono text-[10px] font-semibold text-[#0B4F4A] dark:bg-zinc-800 dark:text-zinc-300">
                  {archivedCount}
                </span>
              </label>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCompactMode((prev) => !prev)}
              className={cn(
                'text-xs transition-colors',
                isCompactMode
                  ? 'border-[#0F766E] bg-[#CBE8E2] text-[#0B4F4A] font-semibold dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-200'
                  : 'text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
              )}
              title={isCompactMode ? 'Chuyển về thẻ chi tiết' : 'Chuyển về thẻ rút gọn tiết kiệm chiều cao'}
            >
              <Layers className="h-3.5 w-3.5" />
              {isCompactMode ? 'Thẻ chi tiết' : 'Thẻ rút gọn'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleResetCandidatesData}
              className="text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Đặt lại
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCandidatesCsv}
              className="text-xs text-[#0F766E] border-[#0F766E]/30 hover:bg-[#E8F3EF] dark:border-teal-500/30 dark:text-teal-300 dark:hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-stretch min-h-[480px]">
          {KANBAN_THREE_COLUMNS.map((col, colIdx) => {
            const colCandidates = filteredCandidates.filter((c) =>
              col.stages.includes(c.stage)
            );
            const offerCandidates = colCandidates.filter((c) => c.stage === 'OFFER');
            const onboardedCandidates = colCandidates.filter((c) => c.stage === 'ONBOARDED');
            const archivedInOfferColCount = candidates.filter(
              (c) => col.stages.includes(c.stage) && isCandidateArchived(c)
            ).length;
            const isColCollapsed = Boolean(collapsedCols[col.id]);

            const renderCandidateCard = (cand: Candidate, forceCompact = false) => {
              const isCompact = forceCompact || isCompactMode || cand.stage === 'ONBOARDED';
              const isArchived = isCandidateArchived(cand);
              const isReschedulePending = cand.reschedule_request?.status === 'PENDING';

              if (isCompact) {
                return (
                  <div
                    key={cand.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', cand.id);
                    }}
                    onClick={() => setSelectedCandidate(cand)}
                    className={`group cursor-pointer rounded-lg border px-2.5 py-2 shadow-2xs transition-all ${
                      isReschedulePending
                        ? 'border-amber-400 bg-amber-50/70 hover:border-amber-500 hover:bg-amber-100/70 dark:border-amber-600/70 dark:bg-amber-950/30 dark:hover:border-amber-500 ring-1 ring-amber-400/50'
                        : 'border-[#C6D9D3] bg-[#FCFEFD] hover:border-[#0F766E] hover:bg-[#E8F3EF]/60 dark:border-zinc-800 dark:bg-[#18181b] dark:hover:border-zinc-700 dark:hover:bg-[#202024]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={cand.full_name}
                        className="h-7 w-7 shrink-0 border-[#C6D9D3] bg-[#E4EEEB] text-[10px] font-bold text-[#0B4F4A] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-bold text-[#11221E] dark:text-zinc-100">
                            {cand.full_name}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-[#5C7871] dark:text-zinc-400">
                            {cand.candidate_code}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-1">
                          <span className="truncate text-[11px] text-[#415A54] dark:text-zinc-400">
                            {cand.job_title}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isReschedulePending && (
                              <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 dark:text-amber-200 animate-pulse">
                                ⚠️ Dời lịch
                              </span>
                            )}
                            {cand.stage === 'ONBOARDED' && (
                              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                                Đã nhận việc
                              </span>
                            )}
                            {isArchived && (
                              <span className="rounded border border-[#C6D9D3] bg-[#D5E3DF]/50 px-1 py-0.2 text-[9px] font-medium text-[#415A54] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                                Lưu trữ
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={cand.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', cand.id);
                  }}
                  onClick={() => setSelectedCandidate(cand)}
                  className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
                    isReschedulePending
                      ? 'border-amber-400 bg-amber-50/40 hover:border-amber-500 hover:bg-amber-100/60 dark:border-amber-600/70 dark:bg-amber-950/25 dark:hover:border-amber-500 ring-1 ring-amber-400/50'
                      : 'border-[#C6D9D3] bg-[#FCFEFD] hover:border-[#0F766E] hover:bg-[#E8F3EF]/60 dark:border-zinc-800 dark:bg-[#18181b] dark:hover:border-zinc-700 dark:hover:bg-[#202024]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[#5C7871] dark:text-zinc-400">
                      {cand.candidate_code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isReschedulePending && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-500/50 dark:bg-amber-900/40 dark:text-amber-200 animate-pulse">
                          ⚠️ Yêu cầu dời lịch
                        </span>
                      )}
                      {cand.stage === 'OFFER' && (
                        <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                          Đề nghị nhận việc
                        </span>
                      )}
                      {cand.stage === 'ONBOARDED' && (
                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          Đã nhận việc
                        </span>
                      )}
                      {isArchived && (
                        <span className="rounded-md border border-[#C6D9D3] bg-[#D5E3DF]/50 px-1.5 py-0.5 text-[10px] font-medium text-[#415A54] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                          Lưu trữ
                        </span>
                      )}
                      <span className="rounded-md border border-[#D5E3DF] bg-[#F2F7F5] px-2 py-0.5 text-[11px] font-medium text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                        {cand.source}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-bold text-[#11221E] dark:text-zinc-100">
                    {cand.full_name}
                  </div>
                  {selectedJobId === 'ALL' && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-[#415A54] dark:text-zinc-400">
                      {cand.job_title}
                    </div>
                  )}

                  {/* Badge cảnh báo dời lịch nổi bật kèm animation pulse */}
                  {isReschedulePending && (
                    <div className="mt-2 flex items-center justify-between gap-1.5 rounded-lg border border-amber-400/60 bg-amber-100/80 px-2.5 py-1 text-[11px] font-bold text-amber-950 dark:border-amber-600/60 dark:bg-amber-950/50 dark:text-amber-200 animate-pulse">
                      <div className="flex items-center gap-1 min-w-0">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="truncate">⚠️ Yêu cầu dời lịch:</span>
                      </div>
                      <span className="shrink-0 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                        {cand.reschedule_request?.proposed_time || 'Chờ duyệt'}
                      </span>
                    </div>
                  )}

                  {cand.stage === 'INTERVIEW' && cand.interview_schedule && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      <Clock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="truncate">
                        PV: {cand.interview_schedule.time} {formatDateVN(cand.interview_schedule.date)} ({cand.interview_schedule.format})
                      </span>
                    </div>
                  )}

                  <div className="mt-2.5 flex items-center justify-between border-t border-[#D5E3DF] pt-2 text-xs dark:border-zinc-800/80">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#5C7871] dark:text-zinc-400">
                      <Calendar className="h-3 w-3" strokeWidth={1.5} />
                      {formatDateVN(cand.applied_date)}
                    </span>
                    <span className="text-[11px] font-medium text-[#0F766E] hover:underline dark:text-teal-400">
                      Chi tiết ›
                    </span>
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
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const candId = e.dataTransfer.getData('text/plain');
                  const droppedCand = candidates.find((c) => c.id === candId);
                  if (!droppedCand) return;
                  if (
                    colIdx === 0 &&
                    droppedCand.stage !== 'APPLIED' &&
                    droppedCand.stage !== 'AI_SCREENED'
                  ) {
                    handleMoveStage(droppedCand, 'APPLIED');
                  } else if (colIdx === 1 && droppedCand.stage !== 'INTERVIEW') {
                    // Intercept sự kiện kéo thả thẻ vào cột 'Phỏng vấn' (cột 2):
                    // Khi nhả thẻ vào cột 'Phỏng vấn', KHÔNG cập nhật trạng thái ngay.
                    // Tự động mở Modal/Dialog 'Lên lịch phỏng vấn' cho ứng viên đó.
                    openInterviewScheduleModal(droppedCand);
                  } else if (
                    colIdx === 2 &&
                    droppedCand.stage !== 'OFFER' &&
                    droppedCand.stage !== 'ONBOARDED'
                  ) {
                    handleMoveStage(droppedCand, 'OFFER');
                  }
                }}
                className={cn(
                  'flex flex-1 flex-col rounded-xl border border-[#C6D9D3] bg-[#E8F1EE]/80 p-3 dark:border-zinc-800/80 dark:bg-[#121214] transition-all',
                  col.topBorder
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', col.dotColor)} />
                    <h3 className="truncate text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      {col.label}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      title={
                        archivedInOfferColCount > 0 && !showArchived
                          ? `Đang hiện ${colCandidates.length} hồ sơ (${archivedInOfferColCount} đã lưu trữ tự động)`
                          : undefined
                      }
                      className="rounded-full border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 font-mono text-[11px] font-medium text-[#415A54] dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300"
                    >
                      {colCandidates.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleColCollapse(col.id)}
                      title={colCandidates.length === 0 ? "Thu gọn cột trống" : "Thu gọn cột"}
                      aria-label="Thu gọn cột"
                      className="rounded p-1 text-[#5C7871] hover:bg-[#D5E3DF] hover:text-[#11221E] dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      <PanelLeftClose className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {col.id === 'col-offer-onboarded' ? (
                  <div className="flex-1 space-y-3">
                    {colCandidates.length === 0 ? (
                      <div className="space-y-2">
                        <div className="rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5] p-4 text-center text-xs text-[#5C7871] dark:border-zinc-800/80 dark:bg-transparent dark:text-zinc-500">
                          Chưa có ứng viên đang xử lý
                        </div>
                        {!showArchived && archivedInOfferColCount > 0 && (
                          <div className="flex items-center justify-between rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5] px-2.5 py-2 text-[11px] text-[#5C7871] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                            <span className="flex items-center gap-1.5 font-medium">
                              <Archive className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
                              Đã ẩn {archivedInOfferColCount} hồ sơ bàn giao (Auto-Archive)
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowArchived(true)}
                              className="font-semibold text-[#0F766E] hover:underline dark:text-teal-300"
                            >
                              Hiện lại
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {offerCandidates.length > 0 && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => toggleSubgroup('offer')}
                              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-900/20"
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-violet-500" />
                                Đề nghị nhận việc
                                <span className="rounded-full bg-violet-500/20 px-1.5 py-0.2 font-mono text-[10px] text-violet-700 dark:text-violet-300">
                                  {offerCandidates.length}
                                </span>
                              </span>
                              <span className="flex items-center gap-1 text-[10px] font-normal text-violet-600 dark:text-violet-400">
                                {collapsedSubgroups['offer'] ? (
                                  <>
                                    <span>Mở rộng</span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </>
                                ) : (
                                  <>
                                    <span>Thu gọn</span>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </>
                                )}
                              </span>
                            </button>
                            {!collapsedSubgroups['offer'] &&
                              renderSectionCards(offerCandidates, 'subgroup-offer')}
                          </div>
                        )}

                        {onboardedCandidates.length > 0 && (
                          <div
                            className={cn(
                              'space-y-2',
                              offerCandidates.length > 0 &&
                                'border-t border-[#C6D9D3]/70 pt-2.5 dark:border-zinc-800'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSubgroup('onboarded')}
                              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                Đã nhận việc
                                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                                  {onboardedCandidates.length}
                                </span>
                              </span>
                              <span className="flex items-center gap-1 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                                {collapsedSubgroups['onboarded'] ? (
                                  <>
                                    <span>Mở rộng</span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </>
                                ) : (
                                  <>
                                    <span>Thu gọn</span>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </>
                                )}
                              </span>
                            </button>
                            {!collapsedSubgroups['onboarded'] &&
                              renderSectionCards(onboardedCandidates, 'subgroup-onboarded', true)}
                          </div>
                        )}

                        {!showArchived && archivedInOfferColCount > 0 && (
                          <div className="flex items-center justify-between rounded-lg border border-dashed border-[#C6D9D3] bg-[#F2F7F5] px-2.5 py-2 text-[11px] text-[#5C7871] dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                            <span className="flex items-center gap-1.5 font-medium">
                              <Archive className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" />
                              Đã ẩn {archivedInOfferColCount} hồ sơ bàn giao (Auto-Archive)
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowArchived(true)}
                              className="font-semibold text-[#0F766E] hover:underline dark:text-teal-300"
                            >
                              Hiện lại
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 space-y-2.5">
                    {renderSectionCards(colCandidates, col.id)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
                      {selectedCandidate.current_company}
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
                {/* 1. Thay nút cứng tiến/lùi bằng Dropdown Select trạng thái */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/80 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-200 flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-[#0F766E] dark:text-teal-400" />
                      Trạng thái tuyển dụng (Chuyển nhanh)
                    </span>
                    <span className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                      Tự động đồng bộ Kanban &amp; Real-time
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

                {/* Khối Callout cảnh báo dời lịch phỏng vấn */}
                {selectedCandidate.reschedule_request?.status === 'PENDING' && (
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
                {selectedCandidate.stage === 'INTERVIEW' && !selectedCandidate.interview_schedule && (
                  <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 p-3 flex items-center justify-between gap-3 dark:border-amber-700/30 dark:bg-amber-950/20">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                        Chưa thiết lập lịch phỏng vấn
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => openInterviewScheduleModal(selectedCandidate)}
                      className="h-7 text-xs"
                    >
                      Lên lịch ngay
                    </Button>
                  </div>
                )}
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
                    Ứng viên sẽ nhận được thông báo Real-time kèm ngày giờ, người phỏng vấn và đường dẫn tham dự.
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
              Đề xuất bổ sung nhân sự từ Trưởng bộ phận. Sau khi gửi, thông báo Real-time sẽ gửi tới HR Manager và Giám đốc để phê duyệt và mở tin tuyển dụng.
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
    </div>
  );
}
