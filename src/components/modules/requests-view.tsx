'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  MinusCircle,
  Pencil,
  Plus,
  Search,
  Timer,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import {
  useApp,
  type RoleCode,
  type UserProfileOverride,
} from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchAttendanceMock } from '@/lib/mock-fetcher';
import {
  HRM_RUNTIME_EVENT,
  applyApprovedRequestSideEffects,
  evaluateDailyPunch,
  getAllRuntimeEmployees,
  getDailyAttendances,
  getLeaveBalances,
  getRuntimeDepartments,
  handleRequestLifecycleChange,
  mergeWithRuntimeRequests,
  pushNotification,
  saveRuntimeRequest,
} from '@/lib/runtime-store';
import { alertSwal, confirmSwal, promptTextSwal } from '@/lib/swal';
import { formatDateVN } from '@/lib/utils';
import type {
  AnnualLeaveBalance,
  ApprovalStep,
  Employee,
  LeaveOvertimeRequest,
  MultiStepRequestStatus,
  RequestCategory,
} from '@/mock/types';

type CategoryFilterGroup =
  | 'ALL'
  | 'LEAVE'
  | 'ANNUAL_LEAVE'
  | 'SICK_LEAVE'
  | 'UNPAID_LEAVE'
  | 'LATE_EXPLANATION'
  | 'OVERTIME'
  | 'REMOTE_WORK'
  | 'BUSINESS_TRIP';

type StatusFilterTab =
  | 'ALL'
  | 'PENDING_GROUP'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type OtDayType = 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';

function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const TECH_DIVISION_DEPARTMENTS = new Set([
  'Khối Công nghệ',
  'Phòng Kỹ thuật Phần mềm',
  'Phòng Dữ liệu & AI',
]);

const INTERNAL_CORP_DOMAINS = new Set(['lacviethrm.vn', 'hrm-enterprise.vn']);

function emailsMatchExactOrCorporateAlias(aRaw: string, bRaw: string): boolean {
  const a = aRaw.trim().toLowerCase();
  const b = bRaw.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const atA = a.lastIndexOf('@');
  const atB = b.lastIndexOf('@');
  if (atA <= 0 || atB <= 0) return false;
  const domA = a.slice(atA + 1);
  const domB = b.slice(atB + 1);
  return (
    INTERNAL_CORP_DOMAINS.has(domA) &&
    INTERNAL_CORP_DOMAINS.has(domB) &&
    a.slice(0, atA) === b.slice(0, atB)
  );
}

function resolveLoggedInEmployee(
  employees: Employee[],
  _role: RoleCode,
  profile: UserProfileOverride | null,
  email: string | null
): Employee | null {
  if (employees.length === 0) return null;

  const explicitCode = profile?.employee_code?.trim() || '';
  if (explicitCode && !explicitCode.toUpperCase().startsWith('UV-')) {
    const lowerCode = explicitCode.toLowerCase();
    const byCode = employees.find(
      (e) =>
        e.employee_code.trim().toLowerCase() === lowerCode ||
        e.id.trim().toLowerCase() === lowerCode
    );
    return byCode ?? null;
  }

  const candidateEmail = (email || profile?.email || '').trim().toLowerCase();
  if (candidateEmail) {
    const exactEmail = employees.find(
      (e) =>
        emailsMatchExactOrCorporateAlias(e.email, candidateEmail) ||
        Boolean(
          e.personal_email &&
            e.personal_email.trim().toLowerCase() === candidateEmail
        )
    );
    return exactEmail ?? null;
  }

  return null;
}

function getEffectiveStatus(req: LeaveOvertimeRequest): MultiStepRequestStatus {
  return req.status ?? req.approval_status;
}

const STATUS_BADGE: Record<
  MultiStepRequestStatus,
  {
    label: string;
    variant: 'warning' | 'teal' | 'success' | 'error' | 'muted';
    borderClass: string;
  }
> = {
  PENDING: {
    label: 'Chờ duyệt',
    variant: 'warning',
    borderClass: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
  },
  IN_PROGRESS: {
    label: 'Đang xử lý',
    variant: 'teal',
    borderClass: 'border-l-4 border-l-[#0F766E] dark:border-l-teal-400',
  },
  APPROVED: {
    label: 'Đã duyệt',
    variant: 'success',
    borderClass: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
  },
  REJECTED: {
    label: 'Từ chối',
    variant: 'error',
    borderClass: 'border-l-4 border-l-rose-500 dark:border-l-rose-400',
  },
  CANCELLED: {
    label: 'Đã hủy',
    variant: 'muted',
    borderClass: 'border-l-4 border-l-[#5C7871] dark:border-l-zinc-600',
  },
};

function getCategoryBadgeClass(cat: RequestCategory): string {
  if (
    cat === 'ANNUAL_LEAVE' ||
    cat === 'SICK_LEAVE' ||
    cat === 'UNPAID_LEAVE'
  ) {
    return 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  }
  if (cat === 'OVERTIME') {
    return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300';
  }
  if (cat === 'LATE_EXPLANATION') {
    return 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  }
  if (cat === 'REMOTE_WORK') {
    return 'border-[#0F766E]/25 bg-[#CBE8E2]/60 text-[#0B4F4A] dark:border-teal-400/25 dark:bg-teal-950/40 dark:text-teal-300';
  }
  return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

const NEW_REQUEST_OPTIONS: Array<{
  value: RequestCategory;
  label: string;
  defaultUnit: 'NGAY' | 'GIO';
}> = [
  {
    value: 'ANNUAL_LEAVE',
    label: 'Nghỉ phép năm có hưởng lương',
    defaultUnit: 'NGAY',
  },
  {
    value: 'UNPAID_LEAVE',
    label: 'Nghỉ không hưởng lương',
    defaultUnit: 'NGAY',
  },
  {
    value: 'SICK_LEAVE',
    label: 'Nghỉ ốm / Chế độ BHXH',
    defaultUnit: 'NGAY',
  },
  {
    value: 'OVERTIME',
    label: 'Làm thêm giờ (OT)',
    defaultUnit: 'GIO',
  },
  {
    value: 'REMOTE_WORK',
    label: 'Làm việc từ xa (WFH)',
    defaultUnit: 'NGAY',
  },
  {
    value: 'LATE_EXPLANATION',
    label: 'Giải trình chấm công (Quên chấm / Đi muộn)',
    defaultUnit: 'NGAY',
  },
  {
    value: 'BUSINESS_TRIP',
    label: 'Công tác trong nước',
    defaultUnit: 'NGAY',
  },
  {
    value: 'OVERSEAS_BUSINESS_TRIP',
    label: 'Công tác nước ngoài',
    defaultUnit: 'NGAY',
  },
];

const OT_DAY_TYPE_CONFIG: Record<
  OtDayType,
  { label: string; multiplier: number; shortLabel: string }
> = {
  WEEKDAY: {
    label: 'Ngày thường — Hệ số 1.5x (150%)',
    multiplier: 1.5,
    shortLabel: 'Ngày thường 1.5x',
  },
  WEEKEND: {
    label: 'Cuối tuần — Hệ số 2.0x (200%)',
    multiplier: 2.0,
    shortLabel: 'Cuối tuần 2.0x',
  },
  HOLIDAY: {
    label: 'Ngày lễ / Tết — Hệ số 3.0x (300%)',
    multiplier: 3.0,
    shortLabel: 'Ngày lễ 3.0x',
  },
};

function matchesCategoryGroup(
  cat: RequestCategory,
  group: CategoryFilterGroup
): boolean {
  if (group === 'ALL') return true;
  if (group === 'LEAVE') {
    return (
      cat === 'ANNUAL_LEAVE' || cat === 'SICK_LEAVE' || cat === 'UNPAID_LEAVE'
    );
  }
  if (group === 'BUSINESS_TRIP') {
    return cat === 'BUSINESS_TRIP' || cat === 'OVERSEAS_BUSINESS_TRIP';
  }
  return cat === group;
}

function readDirectorMinDays(): number {
  if (typeof window === 'undefined') return 3;
  const raw = window.localStorage.getItem('hrm_director_min_days');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

function StepperBadge({
  step,
  isCurrent,
}: {
  step: ApprovalStep;
  isCurrent: boolean;
}) {
  if (step.status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        {step.label}
      </span>
    );
  }
  if (step.status === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
        <XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
        {step.label}
      </span>
    );
  }
  if (step.status === 'SKIPPED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-0.5 text-[11px] font-medium text-[#5C7871] line-through dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
        <MinusCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
        {step.label} (Bỏ qua)
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
        {step.label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#C6D9D3] bg-[#F2F7F5] px-2 py-0.5 text-[11px] text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
      <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
      {step.label}
    </span>
  );
}

function resolveDepartmentId(deptName: string, fallbackDeptId?: string): string {
  if (fallbackDeptId && fallbackDeptId.trim()) return fallbackDeptId.trim();
  if (TECH_DIVISION_DEPARTMENTS.has(deptName)) return 'dept-tech';
  if (deptName === 'Phòng Nhân sự & Hành chính') return 'dept-hr';
  if (deptName === 'Phòng Tài chính - Kế toán') return 'dept-fin';
  if (deptName === 'Khối Kinh doanh') return 'dept-sales';
  return 'dept-board';
}

export function RequestsView() {
  const {
    role,
    currentUserEmail,
    currentUserProfile,
    navIntent,
    clearNavIntent,
    uiState,
    setUiState,
    showToast,
  } = useApp();

  const baseRequestsRef = useRef<LeaveOvertimeRequest[]>([]);
  const [requests, setRequests] = useState<LeaveOvertimeRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<AnnualLeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('ALL');
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilterGroup>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal & detail states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<LeaveOvertimeRequest | null>(null);
  const [checklistChecked, setChecklistChecked] = useState(false);

  // Admin inline edit state
  const [isEditingRequest, setIsEditingRequest] = useState(false);
  const [editDuration, setEditDuration] = useState('1');
  const [editHandover, setEditHandover] = useState('');
  const [editReason, setEditReason] = useState('');

  // Create Request Form States
  const [formEmployeeCode, setFormEmployeeCode] = useState('');
  const [formCategory, setFormCategory] =
    useState<RequestCategory>('ANNUAL_LEAVE');
  const [formStartDate, setFormStartDate] = useState('2026-11-25');
  const [formEndDate, setFormEndDate] = useState('2026-11-25');
  const [formDuration, setFormDuration] = useState('1');
  const [formUnit, setFormUnit] = useState<'NGAY' | 'GIO'>('NGAY');
  const [formHandover, setFormHandover] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formMedicalDocNote, setFormMedicalDocNote] = useState('');
  const [formOtDayType, setFormOtDayType] = useState<OtDayType>('WEEKDAY');
  const [formTargetDate, setFormTargetDate] = useState('2026-11-18');
  const [formActualCheckIn, setFormActualCheckIn] = useState('08:30');
  const [formActualCheckOut, setFormActualCheckOut] = useState('17:30');
  const [formError, setFormError] = useState('');
  const [createSource, setCreateSource] = useState<'MANUAL_FORM' | 'AI_COPILOT'>(
    'MANUAL_FORM'
  );

  const syncFromRuntime = useCallback(() => {
    const mergedRequests = mergeWithRuntimeRequests(baseRequestsRef.current);
    setRequests(mergedRequests);
    setEmployees(getAllRuntimeEmployees());
    setLeaveBalances(getLeaveBalances(2026));
    setSelectedRequest((prev) => {
      if (!prev) return null;
      return (
        mergedRequests.find(
          (item) =>
            item.id === prev.id || item.request_code === prev.request_code
        ) ?? null
      );
    });
  }, []);

  useEffect(() => {
    let active = true;
    fetchAttendanceMock()
      .then((data) => {
        if (!active) return;
        baseRequestsRef.current = data.MOCK_LEAVE_OVERTIME_REQUESTS;
        syncFromRuntime();
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        syncFromRuntime();
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [syncFromRuntime]);

  useEffect(() => {
    window.addEventListener(HRM_RUNTIME_EVENT, syncFromRuntime);
    window.addEventListener('storage', syncFromRuntime);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncFromRuntime);
      window.removeEventListener('storage', syncFromRuntime);
    };
  }, [syncFromRuntime]);

  const currentEmp = useMemo(
    () =>
      resolveLoggedInEmployee(
        employees,
        role,
        currentUserProfile,
        currentUserEmail
      ),
    [employees, role, currentUserProfile, currentUserEmail]
  );

  const currentEmployeeCode = currentEmp?.employee_code ?? '';
  const currentEmployeeName =
    currentEmp?.full_name ??
    currentUserProfile?.fullName?.trim() ??
    currentUserEmail?.trim() ??
    '';
  const currentDepartment =
    currentEmp?.department_name ??
    currentUserProfile?.department?.trim() ??
    '';

  // Keep formEmployeeCode synced to logged-in employee when not explicitly overridden
  useEffect(() => {
    if (!isCreateOpen) {
      setFormEmployeeCode(currentEmployeeCode);
    }
  }, [currentEmployeeCode, isCreateOpen]);

  // Scoped requests strictly isolated by role and matched employee identity
  const scopedRequests = useMemo(() => {
    if (!currentEmp || role === 'CANDIDATE') {
      return [];
    }

    if (
      role === 'SUPER_ADMIN' ||
      role === 'DIRECTOR' ||
      role === 'HR_MANAGER'
    ) {
      return requests;
    }

    if (role === 'DEPT_MANAGER') {
      const depts = getRuntimeDepartments();
      const managedDeptIds = new Set(
        depts.filter((d) => d.manager_id === currentEmp.id).map((d) => d.id)
      );
      const managedDeptNames = new Set(
        depts
          .filter((d) => d.manager_id === currentEmp.id)
          .map((d) => d.department_name)
      );
      if (currentEmp.department_id) managedDeptIds.add(currentEmp.department_id);
      if (currentEmp.department_name) {
        managedDeptNames.add(currentEmp.department_name);
      }

      return requests.filter((r) => {
        if (
          r.employee_code === currentEmp.employee_code ||
          r.employee_id === currentEmp.id
        ) {
          return true;
        }
        const reqEmp = employees.find(
          (e) => e.id === r.employee_id || e.employee_code === r.employee_code
        );
        if (
          reqEmp &&
          (currentEmp.manager_id === reqEmp.id ||
            reqEmp.role_code === 'SUPER_ADMIN' ||
            reqEmp.role_code === 'DIRECTOR')
        ) {
          return false;
        }
        if (
          r.current_approver_id === currentEmp.id ||
          r.approver_id === currentEmp.id
        ) {
          return true;
        }
        if (reqEmp?.manager_id === currentEmp.id) return true;
        if (reqEmp?.department_id && managedDeptIds.has(reqEmp.department_id)) {
          return true;
        }
        if (r.department_name && managedDeptNames.has(r.department_name)) {
          return true;
        }
        return false;
      });
    }

    // EMPLOYEE: strictly own requests only (by employee_code or employee_id)
    return requests.filter(
      (r) =>
        (Boolean(currentEmployeeCode) &&
          r.employee_code === currentEmployeeCode) ||
        r.employee_id === currentEmp.id
    );
  }, [requests, role, currentEmp, currentEmployeeCode, employees]);

  // Close open request modal immediately if role/user switch removes visibility
  useEffect(() => {
    if (!selectedRequest) return;
    const stillVisible = scopedRequests.some(
      (item) =>
        item.id === selectedRequest.id ||
        item.request_code === selectedRequest.request_code
    );
    if (!stillVisible) {
      setSelectedRequest(null);
      setChecklistChecked(false);
      setIsEditingRequest(false);
    }
  }, [scopedRequests, selectedRequest]);

  // Handle incoming navIntent (both Explanation creation from Attendance & deep link to request)
  useEffect(() => {
    if (isLoading || !navIntent || navIntent.navId !== 'leaves') return;

    if (navIntent.subTab === 'explanation') {
      if (!currentEmp && role !== 'SUPER_ADMIN' && role !== 'HR_MANAGER') {
        clearNavIntent();
        return;
      }
      const rawEntity = navIntent.entityId || '';
      const [parsedEmpCode, parsedDate] = rawEntity.includes('|')
        ? rawEntity.split('|')
        : ['', rawEntity];

      const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(parsedDate || '')
        ? parsedDate!
        : '2026-11-18';
      const canCreateOnBehalf =
        role === 'SUPER_ADMIN' || role === 'HR_MANAGER';
      const resolvedCode =
        parsedEmpCode &&
        (canCreateOnBehalf || parsedEmpCode === currentEmployeeCode)
          ? parsedEmpCode
          : currentEmployeeCode;

      const dailyMatch = resolvedCode
        ? getDailyAttendances(effectiveDate.slice(0, 7), resolvedCode).find(
            (d) => d.date === effectiveDate
          )
        : undefined;

      setFormEmployeeCode(resolvedCode);
      setFormCategory('LATE_EXPLANATION');
      setFormUnit('NGAY');
      setFormDuration('1');
      setFormTargetDate(effectiveDate);
      setFormStartDate(effectiveDate);
      setFormEndDate(effectiveDate);
      setFormActualCheckIn(dailyMatch?.check_in || '08:30');
      setFormActualCheckOut(dailyMatch?.check_out || '17:30');
      setFormReason(
        dailyMatch?.status === 'MISSING_PUNCH'
          ? `Giải trình bổ sung giờ chấm công ngày ${formatDateVN(effectiveDate)} do quên quẹt thẻ vân tay.`
          : ''
      );
      setFormError('');
      setStatusFilter('ALL');
      setCategoryFilter('ALL');
      setIsCreateOpen(true);
      clearNavIntent();
      return;
    } else if (navIntent.subTab === 'copilot-draft' && navIntent.leaveDraft) {
      if (role === 'CANDIDATE' || !currentEmp) {
        clearNavIntent();
        return;
      }

      const draft = navIntent.leaveDraft;
      const matchedCatOption = NEW_REQUEST_OPTIONS.find(
        (opt) => opt.value === draft.parsed_category
      );
      const safeCategory: RequestCategory = matchedCatOption
        ? matchedCatOption.value
        : 'ANNUAL_LEAVE';
      const safeUnit = matchedCatOption?.defaultUnit ?? 'NGAY';
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const safeStart = isoDateRegex.test(draft.parsed_start_date || '')
        ? draft.parsed_start_date
        : '2026-11-25';
      const rawEnd = isoDateRegex.test(draft.parsed_end_date || '')
        ? draft.parsed_end_date
        : safeStart;
      const safeEnd = rawEnd < safeStart ? safeStart : rawEnd;
      const parsedDuration = Number(draft.parsed_duration_days);
      const safeDuration =
        safeCategory === 'LATE_EXPLANATION'
          ? '1'
          : Number.isFinite(parsedDuration) && parsedDuration > 0
            ? String(parsedDuration)
            : '1';

      setFormEmployeeCode(currentEmployeeCode);
      setFormCategory(safeCategory);
      setFormUnit(safeUnit);
      setFormDuration(safeDuration);
      setFormStartDate(safeStart);
      setFormEndDate(safeEnd);
      if (safeCategory === 'LATE_EXPLANATION') {
        setFormTargetDate(safeStart);
      }
      setFormHandover((draft.parsed_handover_to || '').trim());
      setFormReason((draft.parsed_reason || draft.sample_input || '').trim());
      setFormMedicalDocNote('');
      setFormError('');
      setStatusFilter('ALL');
      setCategoryFilter('ALL');
      setCreateSource('AI_COPILOT');
      setIsCreateOpen(true);
      clearNavIntent();
      return;
    }

    if (navIntent.entityId) {
      const matched = scopedRequests.find(
        (r) =>
          r.request_code === navIntent.entityId || r.id === navIntent.entityId
      );
      if (matched) {
        setStatusFilter('ALL');
        setCategoryFilter('ALL');
        setSearchQuery('');
        setChecklistChecked(false);
        setIsEditingRequest(false);
        setSelectedRequest(matched);
      }
    }
    clearNavIntent();
  }, [
    isLoading,
    navIntent,
    scopedRequests,
    role,
    currentEmp,
    currentEmployeeCode,
    clearNavIntent,
  ]);

  const canSelectRequester = role === 'SUPER_ADMIN' || role === 'HR_MANAGER';

  const targetRequesterEmp = useMemo(() => {
    if (canSelectRequester && formEmployeeCode) {
      const found = employees.find(
        (e) => e.employee_code === formEmployeeCode
      );
      if (found) return found;
    }
    return currentEmp;
  }, [canSelectRequester, formEmployeeCode, employees, currentEmp]);

  const myLeaveBalance = useMemo(() => {
    if (!currentEmployeeCode && !currentEmp) return null;
    return (
      leaveBalances.find(
        (b) =>
          (Boolean(currentEmployeeCode) &&
            b.employee_code === currentEmployeeCode) ||
          (currentEmp && b.employee_id === currentEmp.id)
      ) ?? null
    );
  }, [leaveBalances, currentEmployeeCode, currentEmp]);

  const formRequesterBalance = useMemo(() => {
    const targetCode =
      targetRequesterEmp?.employee_code ?? currentEmployeeCode;
    const targetId = targetRequesterEmp?.id;
    if (!targetCode && !targetId) return null;
    return (
      leaveBalances.find(
        (b) =>
          (Boolean(targetCode) && b.employee_code === targetCode) ||
          (targetId && b.employee_id === targetId)
      ) ?? null
    );
  }, [leaveBalances, targetRequesterEmp, currentEmployeeCode]);

  const explanationPreview = useMemo(() => {
    if (formCategory !== 'LATE_EXPLANATION') return null;
    const targetCode =
      targetRequesterEmp?.employee_code ?? currentEmployeeCode;
    const shiftCode = targetRequesterEmp?.work_shift_code || 'HC-08:30';
    const existingDaily = targetCode
      ? getDailyAttendances(formTargetDate.slice(0, 7), targetCode).find(
          (d) => d.date === formTargetDate
        )
      : undefined;

    const evalRes = evaluateDailyPunch({
      shiftCode: existingDaily?.shift_code || shiftCode,
      checkIn: formActualCheckIn || null,
      checkOut: formActualCheckOut || null,
    });
    const recoveredWorkday =
      evalRes.workday_value > 0 ? evalRes.workday_value : 1;

    return {
      existingDaily,
      evalRes,
      recoveredWorkday,
      shiftCode: existingDaily?.shift_code || shiftCode,
    };
  }, [
    formCategory,
    formTargetDate,
    formActualCheckIn,
    formActualCheckOut,
    targetRequesterEmp,
    currentEmployeeCode,
  ]);

  const statusCounts = useMemo(() => {
    return {
      ALL: scopedRequests.length,
      PENDING_GROUP: scopedRequests.filter((r) => {
        const s = getEffectiveStatus(r);
        return s === 'PENDING' || s === 'IN_PROGRESS';
      }).length,
      APPROVED: scopedRequests.filter(
        (r) => getEffectiveStatus(r) === 'APPROVED'
      ).length,
      REJECTED: scopedRequests.filter(
        (r) => getEffectiveStatus(r) === 'REJECTED'
      ).length,
      CANCELLED: scopedRequests.filter(
        (r) => getEffectiveStatus(r) === 'CANCELLED'
      ).length,
    };
  }, [scopedRequests]);

  const filteredRequests = useMemo(() => {
    const q = normalizeVietnamese(searchQuery.trim());
    const list = scopedRequests.filter((req) => {
      const s = getEffectiveStatus(req);
      if (
        statusFilter === 'PENDING_GROUP' &&
        s !== 'PENDING' &&
        s !== 'IN_PROGRESS'
      ) {
        return false;
      }
      if (statusFilter === 'APPROVED' && s !== 'APPROVED') return false;
      if (statusFilter === 'REJECTED' && s !== 'REJECTED') return false;
      if (statusFilter === 'CANCELLED' && s !== 'CANCELLED') return false;

      if (!matchesCategoryGroup(req.request_category, categoryFilter)) {
        return false;
      }
      if (q) {
        const haystack = normalizeVietnamese(
          `${req.request_code} ${req.employee_code} ${req.full_name} ${req.department_name} ${req.category_label} ${req.reason} ${req.medical_doc_note ?? ''}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (role === 'DIRECTOR') {
      return [...list].sort((a, b) => {
        const aPriority =
          (getEffectiveStatus(a) === 'PENDING' ||
            getEffectiveStatus(a) === 'IN_PROGRESS') &&
          a.current_step_role === 'DIRECTOR'
            ? 0
            : 1;
        const bPriority =
          (getEffectiveStatus(b) === 'PENDING' ||
            getEffectiveStatus(b) === 'IN_PROGRESS') &&
          b.current_step_role === 'DIRECTOR'
            ? 0
            : 1;
        return aPriority - bPriority;
      });
    }

    return list;
  }, [scopedRequests, statusFilter, categoryFilter, searchQuery, role]);

  const canRoleApproveRequest = useCallback(
    (req: LeaveOvertimeRequest): boolean => {
      if (role === 'EMPLOYEE' || role === 'CANDIDATE') return false;

      const eff = getEffectiveStatus(req);
      const rawStatus = String(eff);
      if (
        eff !== 'PENDING' &&
        eff !== 'IN_PROGRESS' &&
        rawStatus !== 'PENDING_DIRECTOR'
      ) {
        return false;
      }

      if (!currentEmp && role !== 'SUPER_ADMIN') return false;

      const isOwnRequest =
        (Boolean(currentEmployeeCode) &&
          req.employee_code === currentEmployeeCode) ||
        Boolean(currentEmp && req.employee_id === currentEmp.id);
      if (
        isOwnRequest &&
        (role === 'DEPT_MANAGER' || role === 'HR_MANAGER')
      ) {
        return false;
      }

      const stepRole =
        rawStatus === 'PENDING_DIRECTOR' ? 'DIRECTOR' : req.current_step_role;

      // Long leave (> 3 days) at Director step (or PENDING_DIRECTOR): ONLY DIRECTOR or SUPER_ADMIN
      if (stepRole === 'DIRECTOR') {
        return role === 'DIRECTOR' || role === 'SUPER_ADMIN';
      }

      if (role === 'SUPER_ADMIN') return true;

      if (stepRole === 'DEPT_MANAGER') {
        if (role !== 'DEPT_MANAGER' || !currentEmp) return false;
        const reqEmp = employees.find(
          (e) =>
            e.id === req.employee_id || e.employee_code === req.employee_code
        );
        // Block approving superior's or executive/HR manager's request
        if (
          reqEmp &&
          (currentEmp.manager_id === reqEmp.id ||
            reqEmp.role_code === 'SUPER_ADMIN' ||
            reqEmp.role_code === 'DIRECTOR' ||
            reqEmp.role_code === 'HR_MANAGER')
        ) {
          return false;
        }
        if (req.current_approver_id) {
          return req.current_approver_id === currentEmp.id;
        }
        if (req.approver_id === currentEmp.id) return true;
        if (reqEmp?.manager_id === currentEmp.id) return true;

        const depts = getRuntimeDepartments();
        const managedDeptIds = new Set(
          depts.filter((d) => d.manager_id === currentEmp.id).map((d) => d.id)
        );
        const managedDeptNames = new Set(
          depts
            .filter((d) => d.manager_id === currentEmp.id)
            .map((d) => d.department_name)
        );
        if (currentEmp.department_id) managedDeptIds.add(currentEmp.department_id);
        if (currentEmp.department_name) {
          managedDeptNames.add(currentEmp.department_name);
        }

        if (reqEmp?.department_id && managedDeptIds.has(reqEmp.department_id)) {
          return true;
        }
        if (req.department_name && managedDeptNames.has(req.department_name)) {
          return true;
        }
        return false;
      }

      if (stepRole === 'HR_MANAGER') {
        if (role === 'DIRECTOR' && req.requester_role === 'HR_MANAGER') {
          return true;
        }
        if (role !== 'HR_MANAGER' || !currentEmp) return false;
        return !isOwnRequest;
      }

      return false;
    },
    [role, currentEmp, currentEmployeeCode, employees]
  );

  const canCancelRequest = useCallback(
    (req: LeaveOvertimeRequest): boolean => {
      const eff = getEffectiveStatus(req);
      if (eff !== 'PENDING' && eff !== 'IN_PROGRESS') return false;
      return (
        (Boolean(currentEmployeeCode) &&
          req.employee_code === currentEmployeeCode) ||
        Boolean(currentEmp && req.employee_id === currentEmp.id)
      );
    },
    [currentEmployeeCode, currentEmp]
  );

  const handleApproveStep = async (req: LeaveOvertimeRequest) => {
    if (!canRoleApproveRequest(req)) return;

    const directorMinDays = readDirectorMinDays();
    const requiresDirectorStep =
      (req.duration_unit === 'NGAY' &&
        req.request_category !== 'LATE_EXPLANATION' &&
        req.duration_days_or_hours > directorMinDays) ||
      req.request_category === 'UNPAID_LEAVE' ||
      req.request_category === 'OVERSEAS_BUSINESS_TRIP';

    const baseSteps = [...(req.approval_steps ?? [])];
    if (
      requiresDirectorStep &&
      !baseSteps.some((step) => step.role === 'DIRECTOR')
    ) {
      const dirEmpForStep = employees.find((e) => e.role_code === 'DIRECTOR');
      baseSteps.push({
        step_order: baseSteps.length + 1,
        role: 'DIRECTOR',
        label: `Cấp 3 · Giám đốc phê duyệt (> ${directorMinDays} ngày)`,
        status: 'PENDING',
        actor_name: dirEmpForStep?.full_name ?? 'Trần Quốc Việt',
      });
    }
    const currentSteps = baseSteps;
    const targetStepRole = req.current_step_role ?? role;
    const simulatedSteps = currentSteps.map((step) =>
      step.role === targetStepRole && step.status === 'PENDING'
        ? { ...step, status: 'APPROVED' as const }
        : step
    );
    const nextPendingPreview = simulatedSteps.find((s) => s.status === 'PENDING');
    const willBeFinal = !nextPendingPreview;

    let sideEffectHtml = '';
    if (willBeFinal) {
      if (req.request_category === 'ANNUAL_LEAVE') {
        sideEffectHtml = `<br/><span style="color:#0F766E">• Tự động trừ <b>${req.duration_days_or_hours} ngày</b> quỹ phép năm 2026 &amp; ghi nhận <b>1.0 công hưởng lương/ngày</b>.</span>`;
      } else if (req.request_category === 'OVERTIME') {
        const hrs = req.ot_hours ?? req.duration_days_or_hours;
        const mult = req.ot_multiplier ?? 1.5;
        sideEffectHtml = `<br/><span style="color:#0F766E">• Tự động cộng <b>+${hrs} giờ OT (${mult.toFixed(1)}x)</b> vào bảng tổng hợp công tháng.</span>`;
      } else if (req.request_category === 'LATE_EXPLANATION') {
        sideEffectHtml = `<br/><span style="color:#0F766E">• Tự động xóa trạng thái <b>Quên chấm công (0.0 công)</b> ngày <b>${formatDateVN(
          req.target_date || req.start_datetime
        )}</b> và khôi phục công hợp lệ.</span>`;
      } else {
        sideEffectHtml = `<br/><span style="color:#0F766E">• Tự động đồng bộ trạng thái công sang bảng chấm công tháng.</span>`;
      }
    }

    const confirmed = await confirmSwal({
      title: willBeFinal
        ? `Phê duyệt hoàn tất đơn ${req.request_code}?`
        : `Duyệt bước hiện tại đơn ${req.request_code}?`,
      html: `Nhân sự: <b>${req.full_name}</b> (${req.employee_code})<br/>Loại đơn: <b>${req.category_label}</b> · Thời lượng: <b>${req.duration_days_or_hours} ${
        req.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
      }</b>${
        nextPendingPreview
          ? `<br/>Bước tiếp theo: <b>${nextPendingPreview.label}</b>`
          : sideEffectHtml
      }`,
      confirmText: willBeFinal ? 'Phê duyệt hoàn tất' : 'Xác nhận duyệt bước này',
      cancelText: 'Hủy bỏ',
      variant: 'primary',
    });

    if (!confirmed) return;

    const prevStatus = getEffectiveStatus(req);
    const nowIso = new Date().toISOString();
    const updatedSteps: ApprovalStep[] = currentSteps.map((step) =>
      step.role === targetStepRole && step.status === 'PENDING'
        ? {
            ...step,
            status: 'APPROVED',
            actor_name: currentEmployeeName,
            acted_at: nowIso,
          }
        : step
    );

    const nextPendingStep = updatedSteps.find((s) => s.status === 'PENDING');
    const isFinal = !nextPendingStep;
    const nextStatus: MultiStepRequestStatus = isFinal
      ? 'APPROVED'
      : 'IN_PROGRESS';

    const hrEmp = employees.find((e) => e.role_code === 'HR_MANAGER');
    const dirEmp = employees.find((e) => e.role_code === 'DIRECTOR');
    const nextApproverId = nextPendingStep
      ? nextPendingStep.role === 'HR_MANAGER'
        ? hrEmp?.id ?? 'emp-002'
        : nextPendingStep.role === 'DIRECTOR'
          ? dirEmp?.id ?? 'emp-000'
          : req.current_approver_id ?? req.approver_id
      : null;

    const nextApproverName = nextPendingStep
      ? nextPendingStep.actor_name ||
        (nextPendingStep.role === 'HR_MANAGER'
          ? hrEmp?.full_name ?? 'Trần Thị Bích Ngọc'
          : dirEmp?.full_name ?? 'Trần Quốc Việt')
      : currentEmployeeName;

    const draftUpdatedReq: LeaveOvertimeRequest = {
      ...req,
      approval_steps: updatedSteps,
      current_step_role: nextPendingStep ? nextPendingStep.role : null,
      current_approver_id: nextApproverId,
      approver_id: nextApproverId ?? currentEmp?.id ?? req.approver_id,
      approver_name: nextApproverName,
      status: nextStatus,
      approval_status: isFinal ? 'APPROVED' : 'PENDING',
      responded_at: isFinal ? nowIso : req.responded_at,
    };

    let finalizedReq = handleRequestLifecycleChange(draftUpdatedReq, prevStatus);
    if (isFinal && !finalizedReq.side_effects_applied) {
      finalizedReq = applyApprovedRequestSideEffects(finalizedReq).request;
    }

    syncFromRuntime();
    setChecklistChecked(false);

    if (
      targetStepRole === 'DEPT_MANAGER' &&
      nextPendingStep?.role === 'HR_MANAGER'
    ) {
      pushNotification({
        title: `Đơn ${req.request_code} chờ Nhân sự kiểm tra`,
        message: `${currentEmployeeName} đã duyệt Cấp 1 cho đơn ${req.category_label.toLowerCase()} của ${req.full_name}.`,
        category: 'LEAVE_REQUEST',
        target_roles: ['HR_MANAGER'],
        nav_id: 'leaves',
        entity_id: req.request_code,
      });
      pushNotification({
        title: `Đơn ${req.request_code} đã qua duyệt Cấp 1`,
        message: `Quản lý đã duyệt bước 1, đơn đã chuyển tiếp tới Phòng Nhân sự kiểm tra.`,
        category: 'LEAVE_REQUEST',
        target_employee_codes: [req.employee_code],
        nav_id: 'leaves',
        entity_id: req.request_code,
      });
    } else if (targetStepRole === 'HR_MANAGER') {
      if (!isFinal && nextPendingStep?.role === 'DIRECTOR') {
        pushNotification({
          title: `Đơn ${req.request_code} chờ Giám đốc phê duyệt Cấp 3`,
          message: `Phòng Nhân sự đã kiểm tra hợp lệ đơn ${req.category_label.toLowerCase()} (${req.duration_days_or_hours} ${
            req.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
          }) của ${req.full_name}.`,
          category: 'LEAVE_REQUEST',
          target_roles: ['DIRECTOR'],
          nav_id: 'leaves',
          entity_id: req.request_code,
        });
        pushNotification({
          title: `Đơn ${req.request_code} đã chuyển Giám đốc phê duyệt`,
          message: `Phòng Nhân sự đã duyệt Cấp 2, đơn đang chờ Giám đốc phê duyệt bước cuối.`,
          category: 'LEAVE_REQUEST',
          target_employee_codes: [req.employee_code],
          nav_id: 'leaves',
          entity_id: req.request_code,
        });
      } else {
        pushNotification({
          title: `Đơn ${req.request_code} đã được phê duyệt hoàn tất`,
          message: `Đơn ${req.category_label.toLowerCase()} của ${req.full_name} đã được phê duyệt và đồng bộ bảng chấm công.`,
          category: 'LEAVE_REQUEST',
          target_employee_codes: [req.employee_code],
          nav_id: 'leaves',
          entity_id: req.request_code,
        });
      }
    } else if (isFinal) {
      pushNotification({
        title: `Đơn ${req.request_code} đã được phê duyệt hoàn tất`,
        message: `${currentEmployeeName} đã phê duyệt bước cuối đơn ${req.category_label.toLowerCase()} và đồng bộ dữ liệu công.`,
        category: 'LEAVE_REQUEST',
        target_employee_codes: [req.employee_code],
        nav_id: 'leaves',
        entity_id: req.request_code,
      });
    }

    showToast(
      isFinal
        ? `Đã phê duyệt hoàn tất đơn ${finalizedReq.request_code}`
        : `Đã duyệt bước ${
            targetStepRole === 'DEPT_MANAGER' ? 'Cấp 1' : 'Cấp 2'
          } đơn ${finalizedReq.request_code}`,
      nextPendingStep
        ? `Đơn đã chuyển tiếp sang ${nextPendingStep.label}.`
        : `${finalizedReq.full_name} — Đã đồng bộ công & quỹ phép tự động.`,
      'success'
    );

    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'APPROVE_LEAVE',
      module: 'Đơn từ & Phê duyệt',
      target: `${finalizedReq.request_code} (${finalizedReq.full_name})`,
      detail: isFinal
        ? `Phê duyệt hoàn tất đơn ${finalizedReq.category_label} và kích hoạt đồng bộ bảng công/quỹ phép.`
        : `Duyệt bước ${targetStepRole}, chuyển tiếp sang ${nextPendingStep?.role}.`,
    });
  };

  const handleRejectRequest = async (req: LeaveOvertimeRequest) => {
    if (!canRoleApproveRequest(req)) return;

    const reasonInput = await promptTextSwal({
      title: `Từ chối đơn ${req.request_code}`,
      label: 'Lý do từ chối phê duyệt (bắt buộc)',
      html: `Đơn <b>${req.category_label}</b> của <b>${req.full_name}</b> (${req.employee_code}).`,
      placeholder:
        'Nhập lý do từ chối cụ thể (ví dụ: Trùng lịch golive dự án, thiếu chứng từ BHXH...)',
      required: true,
      confirmText: 'Xác nhận từ chối',
      cancelText: 'Quay lại',
      variant: 'danger',
    });

    if (reasonInput === null) return;
    const reasonTrimmed = reasonInput.trim();
    if (reasonTrimmed.length < 3) {
      await alertSwal({
        title: 'Lý do từ chối quá ngắn',
        text: 'Vui lòng nhập lý do từ chối tối thiểu 3 ký tự.',
        icon: 'warning',
      });
      return;
    }

    const prevStatus = getEffectiveStatus(req);
    const nowIso = new Date().toISOString();
    const updatedSteps: ApprovalStep[] = (req.approval_steps ?? []).map(
      (step) =>
        step.role === req.current_step_role && step.status === 'PENDING'
          ? {
              ...step,
              status: 'REJECTED',
              actor_name: currentEmployeeName,
              acted_at: nowIso,
              note: reasonTrimmed,
            }
          : step
    );

    const updatedReq: LeaveOvertimeRequest = {
      ...req,
      approval_steps: updatedSteps,
      current_step_role: null,
      current_approver_id: null,
      approver_name: currentEmployeeName,
      status: 'REJECTED',
      approval_status: 'REJECTED',
      rejection_reason: reasonTrimmed,
      responded_at: nowIso,
    };

    handleRequestLifecycleChange(updatedReq, prevStatus);
    syncFromRuntime();

    pushNotification({
      title: `Đơn ${req.request_code} bị từ chối`,
      message: `${currentEmployeeName} đã từ chối đơn ${req.category_label.toLowerCase()}. Lý do: ${reasonTrimmed}`,
      category: 'LEAVE_REQUEST',
      target_employee_codes: [req.employee_code],
      nav_id: 'leaves',
      entity_id: req.request_code,
    });

    showToast(
      `Đã từ chối đơn ${req.request_code}`,
      `Lý do: ${reasonTrimmed}`,
      'warning'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'APPROVE_LEAVE',
      module: 'Đơn từ & Phê duyệt',
      target: `${req.request_code} (${req.full_name})`,
      detail: `Từ chối đơn ${req.category_label}: ${reasonTrimmed}`,
      status: 'WARNING',
    });
  };

  const handleCancelRequest = async (req: LeaveOvertimeRequest) => {
    if (!canCancelRequest(req)) return;

    const confirmed = await confirmSwal({
      title: `Xác nhận hủy đơn ${req.request_code}?`,
      html: `Đơn <b>${req.category_label}</b> sẽ chuyển sang trạng thái <b>Đã hủy</b>${
        req.request_category === 'ANNUAL_LEAVE'
          ? ' và hoàn trả lại số ngày phép đang giữ chỗ chờ duyệt.'
          : '.'
      }`,
      confirmText: 'Xác nhận hủy đơn',
      cancelText: 'Giữ lại',
      variant: 'danger',
    });

    if (!confirmed) return;

    const prevStatus = getEffectiveStatus(req);
    const nowIso = new Date().toISOString();
    const updatedReq: LeaveOvertimeRequest = {
      ...req,
      status: 'CANCELLED',
      current_step_role: null,
      current_approver_id: null,
      responded_at: nowIso,
    };

    handleRequestLifecycleChange(updatedReq, prevStatus);
    syncFromRuntime();

    showToast(
      `Đã hủy đơn ${req.request_code}`,
      'Đơn đề xuất đã được rút lại thành công.',
      'default'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'CREATE_REQUEST',
      module: 'Đơn từ & Phê duyệt',
      target: `${req.request_code} (${req.full_name})`,
      detail: `Người gửi chủ động hủy đơn ${req.category_label}`,
    });
  };

  const startEditingRequest = (req: LeaveOvertimeRequest) => {
    setEditDuration(String(req.duration_days_or_hours));
    setEditHandover(req.handover_to_name ?? '');
    setEditReason(req.reason);
    setIsEditingRequest(true);
  };

  const handleSaveRequestEdit = () => {
    if (!selectedRequest) return;
    const numericDur = Math.max(
      0.5,
      Number(editDuration) || selectedRequest.duration_days_or_hours
    );
    const updatedReq: LeaveOvertimeRequest = {
      ...selectedRequest,
      duration_days_or_hours: numericDur,
      ot_hours:
        selectedRequest.request_category === 'OVERTIME'
          ? numericDur
          : selectedRequest.ot_hours,
      handover_to_name: editHandover.trim() || null,
      reason: editReason.trim() || selectedRequest.reason,
    };
    saveRuntimeRequest(updatedReq);
    syncFromRuntime();
    setIsEditingRequest(false);

    showToast(
      `Đã cập nhật đơn ${updatedReq.request_code}`,
      `${updatedReq.full_name} — ${numericDur} ${
        updatedReq.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
      }`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'UPDATE_RECORD',
      module: 'Đơn từ & Phê duyệt',
      target: `${updatedReq.request_code} (${updatedReq.full_name})`,
      detail: `Chỉnh sửa thông tin đơn: ${numericDur} ${
        updatedReq.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
      }`,
    });
  };

  const handleCategoryChange = (val: string) => {
    const nextCat = val as RequestCategory;
    setFormCategory(nextCat);
    setFormError('');
    const found = NEW_REQUEST_OPTIONS.find((opt) => opt.value === nextCat);
    if (found) {
      setFormUnit(found.defaultUnit);
      if (nextCat === 'OVERTIME') {
        setFormDuration('3');
      } else if (nextCat === 'LATE_EXPLANATION') {
        setFormDuration('1');
        setFormStartDate(formTargetDate);
        setFormEndDate(formTargetDate);
      } else {
        setFormDuration('1');
      }
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const effectiveStart =
      formCategory === 'LATE_EXPLANATION' ? formTargetDate : formStartDate;
    const effectiveEnd =
      formCategory === 'LATE_EXPLANATION'
        ? formTargetDate
        : formCategory === 'OVERTIME'
          ? formStartDate
          : formEndDate;

    if (!effectiveStart || !effectiveEnd) {
      setFormError('Vui lòng chọn đầy đủ ngày áp dụng đơn từ.');
      return;
    }
    if (effectiveEnd < effectiveStart) {
      setFormError('Ngày kết thúc không được nhỏ hơn ngày bắt đầu.');
      return;
    }

    const numericDuration =
      formCategory === 'LATE_EXPLANATION' ? 1 : Number(formDuration);
    if (Number.isNaN(numericDuration) || numericDuration <= 0) {
      setFormError('Số ngày hoặc số giờ đề xuất phải lớn hơn 0.');
      return;
    }

    if (formCategory === 'LATE_EXPLANATION') {
      if (!formActualCheckIn || !formActualCheckOut) {
        setFormError(
          'Vui lòng nhập đầy đủ Giờ vào thực tế và Giờ ra thực tế để giải trình công.'
        );
        return;
      }
      if (formActualCheckOut <= formActualCheckIn) {
        setFormError('Giờ ra thực tế phải sau giờ vào thực tế.');
        return;
      }
    }

    if (
      formCategory === 'SICK_LEAVE' &&
      formMedicalDocNote.trim().length < 3
    ) {
      setFormError(
        'Đơn nghỉ ốm hưởng BHXH bắt buộc ghi chú mã Giấy chứng nhận nghỉ ốm hoặc nơi khám.'
      );
      return;
    }

    if (formReason.trim().length < 5) {
      setFormError('Vui lòng nhập lý do chi tiết tối thiểu 5 ký tự.');
      return;
    }

    // Annual Leave live balance check & block if exceeding remaining_days
    if (formCategory === 'ANNUAL_LEAVE') {
      const availableDays = formRequesterBalance
        ? formRequesterBalance.remaining_days
        : 0;

      if (numericDuration > availableDays) {
        const msg =
          availableDays <= 0
            ? `Nhân sự ${
                targetRequesterEmp?.full_name ?? currentEmployeeName
              } hiện còn 0 ngày phép năm (đang thử việc hoặc đã dùng hết phép). Vui lòng chọn loại đơn "Nghỉ không hưởng lương".`
            : `Số ngày xin nghỉ phép năm (${numericDuration} ngày) vượt quá quỹ phép còn lại (${availableDays} ngày). Vui lòng giảm số ngày hoặc tách phần vượt sang "Nghỉ không hưởng lương".`;
        setFormError(msg);
        await alertSwal({
          title: 'Vượt quá quỹ phép năm còn lại',
          text: msg,
          icon: 'warning',
        });
        return;
      }
    }

    const reqEmp = targetRequesterEmp;
    if (!reqEmp) {
      const noEmpMsg =
        'Tài khoản hiện tại chưa được liên kết với hồ sơ nhân sự chính thức trên hệ thống. Vui lòng liên hệ Phòng Nhân sự.';
      setFormError(noEmpMsg);
      await alertSwal({
        title: 'Chưa liên kết hồ sơ nhân sự',
        text: noEmpMsg,
        icon: 'warning',
      });
      return;
    }
    const reqEmpId = reqEmp.id;
    const reqEmpCode = reqEmp.employee_code;
    const reqEmpName = reqEmp.full_name;
    const reqDeptName = reqEmp.department_name;
    const reqPosName =
      reqEmp.position_name ||
      currentUserProfile?.title?.trim() ||
      'Nhân viên';
    const reqRoleCode: RoleCode = reqEmp.role_code ?? role;

    const depts = getRuntimeDepartments();
    const matchedDept = depts.find(
      (d) =>
        d.id === reqEmp?.department_id || d.department_name === reqDeptName
    );
    const directManager =
      (reqEmp?.manager_id
        ? employees.find((emp) => emp.id === reqEmp.manager_id)
        : null) ??
      (matchedDept?.manager_id
        ? employees.find((emp) => emp.id === matchedDept.manager_id)
        : null) ??
      employees.find((emp) => emp.employee_code === 'NV-2024-003') ??
      null;

    const hrManager =
      employees.find((emp) => emp.role_code === 'HR_MANAGER') ?? null;
    const directorEmp =
      employees.find((emp) => emp.role_code === 'DIRECTOR') ?? null;

    const skipDeptManagerStep =
      reqRoleCode === 'DEPT_MANAGER' ||
      reqRoleCode === 'HR_MANAGER' ||
      reqRoleCode === 'DIRECTOR' ||
      reqRoleCode === 'SUPER_ADMIN';

    const directorMinDays = readDirectorMinDays();
    const needsDirector =
      (formUnit === 'NGAY' &&
        formCategory !== 'LATE_EXPLANATION' &&
        numericDuration > directorMinDays) ||
      formCategory === 'UNPAID_LEAVE' ||
      formCategory === 'OVERSEAS_BUSINESS_TRIP';

    const steps: ApprovalStep[] = [
      {
        step_order: 1,
        role: 'DEPT_MANAGER',
        label: 'Cấp 1 · Trưởng bộ phận duyệt',
        status: skipDeptManagerStep ? 'SKIPPED' : 'PENDING',
        actor_name: directManager?.full_name ?? 'Lê Hoàng Nam',
        note: skipDeptManagerStep
          ? 'Tự động bỏ qua do người đề xuất thuộc cấp Quản lý'
          : undefined,
      },
      {
        step_order: 2,
        role: 'HR_MANAGER',
        label: 'Cấp 2 · Trưởng phòng Nhân sự kiểm tra',
        status: 'PENDING',
        actor_name: hrManager?.full_name ?? 'Trần Thị Bích Ngọc',
      },
    ];

    if (needsDirector) {
      steps.push({
        step_order: 3,
        role: 'DIRECTOR',
        label: `Cấp 3 · Giám đốc phê duyệt (${
          formCategory === 'UNPAID_LEAVE'
            ? 'Nghỉ không lương'
            : formCategory === 'OVERSEAS_BUSINESS_TRIP'
              ? 'Công tác nước ngoài'
              : `> ${directorMinDays} ngày`
        })`,
        status: 'PENDING',
        actor_name: directorEmp?.full_name ?? 'Trần Quốc Việt',
      });
    }

    const catOption = NEW_REQUEST_OPTIONS.find((o) => o.value === formCategory);
    const maxCodeNum = requests.reduce((max, r) => {
      const m = /^REQ-202611-(\d+)$/.exec(r.request_code);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 87);
    const nextCodeNum = String(maxCodeNum + 1).padStart(3, '0');

    const firstStepRole: 'DEPT_MANAGER' | 'HR_MANAGER' = skipDeptManagerStep
      ? 'HR_MANAGER'
      : 'DEPT_MANAGER';
    const firstApproverId = skipDeptManagerStep
      ? hrManager?.id ?? 'emp-002'
      : directManager?.id ?? 'emp-003';
    const firstApproverName = skipDeptManagerStep
      ? hrManager?.full_name ?? 'Trần Thị Bích Ngọc'
      : directManager?.full_name ?? 'Lê Hoàng Nam';

    const otMultiplier =
      formCategory === 'OVERTIME'
        ? OT_DAY_TYPE_CONFIG[formOtDayType].multiplier
        : undefined;

    const newItem: LeaveOvertimeRequest = {
      id: `req-${Date.now()}`,
      request_code: `REQ-202611-${nextCodeNum}`,
      employee_id: reqEmpId,
      employee_code: reqEmpCode,
      full_name: reqEmpName,
      department_name: reqDeptName,
      position_name: reqPosName,
      requester_role: reqRoleCode,
      request_category: formCategory,
      category_label: catOption?.label ?? 'Đơn từ nhân sự',
      start_datetime: `${effectiveStart}T${
        formCategory === 'LATE_EXPLANATION' ? formActualCheckIn : '08:30'
      }:00+07:00`,
      end_datetime: `${effectiveEnd}T${
        formCategory === 'LATE_EXPLANATION' ? formActualCheckOut : '17:30'
      }:00+07:00`,
      duration_days_or_hours: numericDuration,
      duration_unit: formCategory === 'OVERTIME' ? 'GIO' : 'NGAY',
      reason: formReason.trim(),
      handover_to_name: formHandover.trim() || null,
      approver_id: firstApproverId,
      approver_name: firstApproverName,
      current_approver_id: firstApproverId,
      approval_status: 'PENDING',
      status: 'PENDING',
      current_step_role: firstStepRole,
      approval_steps: steps,
      leave_deducted: false,
      created_at: new Date().toISOString(),
      responded_at: null,
      source: createSource,
      ...(formCategory === 'SICK_LEAVE'
        ? { medical_doc_note: formMedicalDocNote.trim() }
        : {}),
      ...(formCategory === 'OVERTIME'
        ? {
            ot_hours: numericDuration,
            ot_day_type: formOtDayType,
            ot_multiplier: otMultiplier,
          }
        : {}),
      ...(formCategory === 'LATE_EXPLANATION'
        ? {
            target_date: formTargetDate,
            actual_check_in: formActualCheckIn,
            actual_check_out: formActualCheckOut,
          }
        : {}),
    };

    try {
      handleRequestLifecycleChange(newItem);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Không thể khởi tạo đơn từ.';
      setFormError(message);
      await alertSwal({
        title: 'Không thể gửi đơn',
        text: message,
        icon: 'warning',
      });
      return;
    }

    syncFromRuntime();
    const targetDeptId = resolveDepartmentId(
      reqDeptName,
      reqEmp?.department_id
    );

    if (skipDeptManagerStep) {
      pushNotification({
        title: `Đơn mới ${newItem.request_code} chờ Nhân sự kiểm tra`,
        message: `${newItem.full_name} gửi đơn ${newItem.category_label.toLowerCase()} (${numericDuration} ${
          newItem.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
        }).`,
        category: 'LEAVE_REQUEST',
        target_roles: ['HR_MANAGER'],
        nav_id: 'leaves',
        entity_id: newItem.request_code,
      });
    } else {
      pushNotification({
        title: `Đơn mới ${newItem.request_code} chờ duyệt Cấp 1`,
        message: `${newItem.full_name} gửi đơn ${newItem.category_label.toLowerCase()} (${numericDuration} ${
          newItem.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
        }).`,
        category: 'LEAVE_REQUEST',
        target_roles: ['DEPT_MANAGER'],
        target_employee_codes: directManager
          ? [directManager.employee_code]
          : undefined,
        target_department_id: targetDeptId,
        nav_id: 'leaves',
        entity_id: newItem.request_code,
      });
    }

    setIsCreateOpen(false);
    setCreateSource('MANUAL_FORM');
    setFormError('');
    setFormReason('');
    setFormHandover('');
    setFormMedicalDocNote('');

    showToast(
      `Đã tạo đơn ${newItem.request_code}`,
      `Đơn đã định tuyến tới ${firstApproverName} (${
        skipDeptManagerStep ? 'Cấp 2 · HR' : 'Cấp 1 · Quản lý trực tiếp'
      }).`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'CREATE_REQUEST',
      module: 'Đơn từ & Phê duyệt',
      target: `${newItem.request_code} (${newItem.full_name})`,
      detail: `Tạo đơn mới: ${newItem.category_label} (${numericDuration} ${
        newItem.duration_unit === 'NGAY' ? 'ngày' : 'giờ'
      })`,
    });
  };

  if (uiState === 'loading' || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (uiState === 'error') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle
            className="h-8 w-8 text-red-600 dark:text-red-400"
            strokeWidth={1.5}
          />
          <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
            Không thể tải danh sách đơn từ
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setUiState('ready')}
          >
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formExceedsBalance =
    formCategory === 'ANNUAL_LEAVE' &&
    Number(formDuration) >
      (formRequesterBalance ? formRequesterBalance.remaining_days : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Đơn từ, Giải trình công &amp; Phê duyệt đa cấp
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Luồng duyệt tuần tự Quản lý trực tiếp → Nhân sự (HR) → Giám đốc, tự động khấu trừ quỹ phép, cộng giờ OT và phục hồi công giải trình.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setFormEmployeeCode(currentEmployeeCode);
              setFormCategory('LATE_EXPLANATION');
              setFormUnit('NGAY');
              setFormDuration('1');
              setFormError('');
              setCreateSource('MANUAL_FORM');
              setIsCreateOpen(true);
            }}
          >
            <Clock className="h-4 w-4" strokeWidth={1.5} />
            Giải trình chấm công
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setFormEmployeeCode(currentEmployeeCode);
              setFormCategory('ANNUAL_LEAVE');
              setFormUnit('NGAY');
              setFormDuration('1');
              setFormError('');
              setCreateSource('MANUAL_FORM');
              setIsCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Tạo đơn mới
          </Button>
        </div>
      </div>

      {/* KPI & Live Personal Leave Balance Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="col-span-2 border-l-4 border-l-[#0F766E] dark:border-l-teal-400 dark:bg-[#121214] lg:col-span-1">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Phép năm còn lại (2026)
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
              {myLeaveBalance
                ? `${myLeaveBalance.remaining_days} ngày`
                : '0 ngày'}
            </p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
              {myLeaveBalance
                ? `Đã nghỉ ${myLeaveBalance.used_days} · Chờ duyệt ${myLeaveBalance.pending_days}`
                : currentEmployeeCode}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400 dark:bg-[#121214]">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Tổng số đơn từ
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {statusCounts.ALL}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400 dark:bg-[#121214]">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Đang chờ / xử lý
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {statusCounts.PENDING_GROUP}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400 dark:bg-[#121214]">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Đã phê duyệt
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {statusCounts.APPROVED}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500 dark:border-l-rose-400 dark:bg-[#121214]">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Đã từ chối
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {statusCounts.REJECTED}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main List Card */}
      <Card className="rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800 dark:bg-[#121214]">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="flex flex-wrap items-center gap-1 rounded-xl border border-[#C6D9D3] bg-[#E4EEEB] p-1 dark:border-zinc-800 dark:bg-zinc-900/70"
              role="group"
              aria-label="Lọc trạng thái đơn"
            >
              {(
                [
                  { key: 'ALL', label: 'Tất cả' },
                  { key: 'PENDING_GROUP', label: 'Chờ duyệt' },
                  { key: 'APPROVED', label: 'Đã duyệt' },
                  { key: 'REJECTED', label: 'Từ chối' },
                  { key: 'CANCELLED', label: 'Đã hủy' },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={
                      active
                        ? 'inline-flex items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 text-xs font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-teal-400 dark:bg-teal-400 dark:text-zinc-950'
                        : 'inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-[#415A54] transition-colors hover:bg-[#D8E6E2] hover:text-[#11221E] dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }
                  >
                    <span>{tab.label}</span>
                    <span className="font-mono tabular-nums opacity-80">
                      ({statusCounts[tab.key]})
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[480px]">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã đơn, nhân viên, lý do..."
                  aria-label="Tìm kiếm đơn từ"
                  className="pl-9"
                />
              </div>
              <Select
                value={categoryFilter}
                onValueChange={(val) =>
                  setCategoryFilter(val as CategoryFilterGroup)
                }
                aria-label="Lọc theo loại đơn"
                options={[
                  { value: 'ALL', label: 'Tất cả loại đơn' },
                  { value: 'LEAVE', label: 'Nhóm Nghỉ phép / Ốm / KL' },
                  { value: 'ANNUAL_LEAVE', label: 'Nghỉ phép năm' },
                  { value: 'SICK_LEAVE', label: 'Nghỉ ốm / BHXH' },
                  { value: 'UNPAID_LEAVE', label: 'Nghỉ không lương' },
                  { value: 'LATE_EXPLANATION', label: 'Giải trình chấm công' },
                  { value: 'OVERTIME', label: 'Làm thêm giờ (OT)' },
                  { value: 'REMOTE_WORK', label: 'Làm việc từ xa (WFH)' },
                  { value: 'BUSINESS_TRIP', label: 'Công tác' },
                ]}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {uiState === 'empty' || filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText
                className="h-8 w-8 text-[#5C7871] dark:text-zinc-400"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                {!currentEmp
                  ? 'Chưa có đơn từ cá nhân'
                  : 'Không có đơn từ nào khớp bộ lọc'}
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                {!currentEmp
                  ? 'Tài khoản hiện tại chưa liên kết với mã nhân sự hoặc chưa phát sinh đơn từ.'
                  : 'Thử chọn trạng thái khác hoặc tạo mới đơn đề xuất.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const effStatus = getEffectiveStatus(req);
                const statusInfo = STATUS_BADGE[effStatus];
                const canApproveHere =
                  role !== 'EMPLOYEE' &&
                  role !== 'CANDIDATE' &&
                  canRoleApproveRequest(req);
                const canCancelHere = canCancelRequest(req);
                const isReassignedToMe = Boolean(
                  canApproveHere &&
                    currentEmp &&
                    req.current_approver_id === currentEmp.id &&
                    (effStatus === 'PENDING' || effStatus === 'IN_PROGRESS')
                );

                return (
                  <div
                    key={req.id}
                    onClick={() => {
                      setChecklistChecked(false);
                      setIsEditingRequest(false);
                      setSelectedRequest(req);
                    }}
                    className={`flex cursor-pointer flex-col gap-4 rounded-xl border border-[#C6D9D3] ${statusInfo.borderClass} odd:bg-[#FCFEFD] even:bg-[#F5FAF8] p-4 transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800 dark:odd:bg-zinc-900/40 dark:even:bg-zinc-900/40 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/70 lg:flex-row lg:items-center lg:justify-between`}
                  >
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {req.request_code}
                        </span>
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                        <Badge
                          className={getCategoryBadgeClass(
                            req.request_category
                          )}
                        >
                          {req.category_label}
                        </Badge>
                        {req.request_category === 'OVERTIME' && (
                          <Badge variant="warning" className="font-mono tabular-nums">
                            <Timer className="h-3 w-3" strokeWidth={1.5} />
                            {req.ot_day_type
                              ? OT_DAY_TYPE_CONFIG[req.ot_day_type].shortLabel
                              : `Hệ số ${(req.ot_multiplier ?? 1.5).toFixed(1)}x`}
                          </Badge>
                        )}
                        {req.request_category === 'LATE_EXPLANATION' &&
                          req.actual_check_in &&
                          req.actual_check_out && (
                            <Badge variant="outline" className="font-mono tabular-nums">
                              Giờ thực tế: {req.actual_check_in} -{' '}
                              {req.actual_check_out}
                            </Badge>
                          )}
                        {req.leave_deducted && (
                          <Badge variant="success">Đã trừ quỹ phép</Badge>
                        )}
                        {req.side_effects_applied &&
                          req.request_category !== 'ANNUAL_LEAVE' && (
                            <Badge variant="teal">Đã đồng bộ bảng công</Badge>
                          )}
                        {isReassignedToMe && (
                          <Badge variant="teal">Chờ bạn duyệt</Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                          {req.full_name}
                        </span>
                        <span className="whitespace-nowrap font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                          {req.employee_code}
                        </span>
                        <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                          {req.department_name}
                        </span>
                      </div>

                      <p className="text-sm leading-5 text-[#11221E] dark:text-zinc-300">
                        {req.reason}
                      </p>

                      {req.medical_doc_note && (
                        <p className="text-xs text-[#0F766E] dark:text-teal-400">
                          Chứng từ y tế / BHXH:{' '}
                          <span className="font-medium">
                            {req.medical_doc_note}
                          </span>
                        </p>
                      )}

                      {req.rejection_reason && (
                        <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-400">
                          Lý do từ chối: {req.rejection_reason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#415A54] dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar
                            className="h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                            strokeWidth={1.5}
                          />
                          <span className="font-mono tabular-nums">
                            {req.request_category === 'LATE_EXPLANATION' &&
                            req.target_date
                              ? formatDateVN(req.target_date)
                              : `${formatDateVN(req.start_datetime)} - ${formatDateVN(
                                  req.end_datetime
                                )}`}
                          </span>
                          <span className="font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-200">
                            ({req.duration_days_or_hours}{' '}
                            {req.duration_unit === 'NGAY' ? 'ngày' : 'giờ'})
                          </span>
                        </span>
                        {req.handover_to_name && (
                          <span className="inline-flex items-center gap-1.5">
                            <UserCheck
                              className="h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                              strokeWidth={1.5}
                            />
                            <span>
                              Bàn giao:{' '}
                              <strong className="font-medium text-[#11221E] dark:text-zinc-200">
                                {req.handover_to_name}
                              </strong>
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#D5E3DF] pt-3 dark:border-zinc-800 lg:border-t-0 lg:pt-0">
                      {canApproveHere && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRejectRequest(req);
                            }}
                          >
                            <X
                              className="h-4 w-4 text-red-600 dark:text-red-400"
                              strokeWidth={1.5}
                            />
                            Từ chối
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleApproveStep(req);
                            }}
                          >
                            <Check className="h-4 w-4" strokeWidth={1.5} />
                            Duyệt
                          </Button>
                        </>
                      )}
                      {canCancelHere && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCancelRequest(req);
                          }}
                        >
                          <Ban className="h-4 w-4" strokeWidth={1.5} />
                          Hủy đơn
                        </Button>
                      )}
                      {!canApproveHere && !canCancelHere && (
                        <div className="text-right text-xs text-[#415A54] dark:text-zinc-400">
                          <div>
                            {effStatus === 'APPROVED' ||
                            effStatus === 'REJECTED'
                              ? `Xử lý bởi: ${req.approver_name}`
                              : effStatus === 'CANCELLED'
                                ? 'Người gửi đã hủy'
                                : req.current_step_role
                                  ? `Đang chờ: ${
                                      req.current_step_role === 'DEPT_MANAGER'
                                        ? req.approver_name || 'Trưởng bộ phận'
                                        : req.current_step_role === 'HR_MANAGER'
                                          ? 'Nhân sự (HR)'
                                          : 'Giám đốc'
                                    }`
                                  : ''}
                          </div>
                          {req.responded_at && (
                            <div className="font-mono tabular-nums text-[#5C7871] dark:text-zinc-400">
                              {formatDateVN(req.responded_at)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CREATE REQUEST MODAL */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setCreateSource('MANUAL_FORM');
          }
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2 pr-6">
              <DialogTitle>Tạo đơn từ / Giải trình chấm công</DialogTitle>
              {createSource === 'AI_COPILOT' && (
                <Badge variant="teal">Điền nháp từ Lạc Việt Copilot</Badge>
              )}
            </div>
            <DialogDescription>
              Hệ thống tự động kiểm tra quỹ phép năm, xác định người duyệt trực tiếp và đồng bộ dữ liệu công ngay khi hoàn tất phê duyệt.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleCreateSubmit}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {canSelectRequester && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="req-employee"
                    className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Nhân sự lập đơn
                  </label>
                  <Select
                    id="req-employee"
                    value={formEmployeeCode || currentEmployeeCode}
                    onValueChange={setFormEmployeeCode}
                    options={employees
                      .filter((e) => e.employment_status !== 'RESIGNED')
                      .map((e) => ({
                        value: e.employee_code,
                        label: `${e.employee_code} — ${e.full_name} (${e.department_name})`,
                      }))}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="req-category"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Loại đơn đề xuất
                </label>
                <Select
                  id="req-category"
                  value={formCategory}
                  onValueChange={handleCategoryChange}
                  options={NEW_REQUEST_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
              </div>

              {/* Live Annual Leave Balance Banner */}
              {formCategory === 'ANNUAL_LEAVE' && (
                <div
                  className={`rounded-xl border p-3.5 text-xs ${
                    formExceedsBalance
                      ? 'border-rose-500/35 bg-rose-50/80 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200'
                      : 'border-[#0F766E]/30 bg-[#CBE8E2]/45 text-[#11221E] dark:border-teal-400/25 dark:bg-teal-950/25 dark:text-zinc-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      Quỹ phép năm 2026 —{' '}
                      {targetRequesterEmp?.full_name ?? currentEmployeeName}
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                      Còn lại:{' '}
                      {formRequesterBalance
                        ? formRequesterBalance.remaining_days
                        : 0}{' '}
                      ngày
                    </span>
                  </div>
                  {formRequesterBalance && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
                      <span>
                        Tiêu chuẩn:{' '}
                        {formRequesterBalance.total_entitled_days +
                          formRequesterBalance.carried_over_days}{' '}
                        ngày
                      </span>
                      <span>Đã nghỉ: {formRequesterBalance.used_days} ngày</span>
                      <span>
                        Đang chờ duyệt: {formRequesterBalance.pending_days} ngày
                      </span>
                    </div>
                  )}
                  {formExceedsBalance && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-rose-500/20 pt-2">
                      <span className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-300">
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0"
                          strokeWidth={1.5}
                        />
                        Số ngày xin nghỉ vượt quá số ngày phép còn lại!
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleCategoryChange('UNPAID_LEAVE')}
                      >
                        Chuyển sang Nghỉ không lương
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Conditional Fields for LATE_EXPLANATION */}
              {formCategory === 'LATE_EXPLANATION' ? (
                <div className="space-y-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="req-target-date"
                        className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        Ngày cần giải trình
                      </label>
                      <Input
                        id="req-target-date"
                        type="date"
                        value={formTargetDate}
                        onChange={(e) => {
                          const d = e.target.value;
                          setFormTargetDate(d);
                          setFormStartDate(d);
                          setFormEndDate(d);
                        }}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="req-actual-in"
                        className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        Giờ vào thực tế
                      </label>
                      <Input
                        id="req-actual-in"
                        type="time"
                        value={formActualCheckIn}
                        onChange={(e) => setFormActualCheckIn(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="req-actual-out"
                        className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        Giờ ra thực tế
                      </label>
                      <Input
                        id="req-actual-out"
                        type="time"
                        value={formActualCheckOut}
                        onChange={(e) => setFormActualCheckOut(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  {explanationPreview && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        {explanationPreview.existingDaily ? (
                          <>
                            Bản ghi hiện tại:{' '}
                            <strong className="font-mono text-rose-700 dark:text-rose-400">
                              {explanationPreview.existingDaily.status === 'MISSING_PUNCH'
                                ? 'Quên chấm công'
                                : explanationPreview.existingDaily.status}{' '}
                              (
                              {explanationPreview.existingDaily.workday_value.toFixed(
                                1
                              )}{' '}
                              công)
                            </strong>
                          </>
                        ) : (
                          <>
                            Ca chuẩn áp dụng:{' '}
                            <strong className="font-mono">
                              {explanationPreview.shiftCode}
                            </strong>
                          </>
                        )}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                        Sau khi duyệt: +{explanationPreview.recoveredWorkday.toFixed(1)}{' '}
                        công hợp lệ
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Standard Date Range & Duration */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="req-start"
                        className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        {formCategory === 'OVERTIME' ? 'Ngày tăng ca' : 'Từ ngày'}
                      </label>
                      <Input
                        id="req-start"
                        type="date"
                        value={formStartDate}
                        onChange={(e) => {
                          setFormStartDate(e.target.value);
                          if (
                            formCategory === 'OVERTIME' ||
                            e.target.value > formEndDate
                          ) {
                            setFormEndDate(e.target.value);
                          }
                        }}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    {formCategory !== 'OVERTIME' ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="req-end"
                          className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                        >
                          Đến ngày
                        </label>
                        <Input
                          id="req-end"
                          type="date"
                          value={formEndDate}
                          onChange={(e) => setFormEndDate(e.target.value)}
                          className="font-mono tabular-nums"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="req-ot-day-type"
                          className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                        >
                          Loại ngày &amp; Hệ số lương OT
                        </label>
                        <Select
                          id="req-ot-day-type"
                          value={formOtDayType}
                          onValueChange={(v) => setFormOtDayType(v as OtDayType)}
                          options={[
                            {
                              value: 'WEEKDAY',
                              label: OT_DAY_TYPE_CONFIG.WEEKDAY.label,
                            },
                            {
                              value: 'WEEKEND',
                              label: OT_DAY_TYPE_CONFIG.WEEKEND.label,
                            },
                            {
                              value: 'HOLIDAY',
                              label: OT_DAY_TYPE_CONFIG.HOLIDAY.label,
                            },
                          ]}
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="req-duration"
                        className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        {formCategory === 'OVERTIME'
                          ? 'Số giờ tăng ca (ot_hours)'
                          : 'Số ngày đề xuất'}
                      </label>
                      <Input
                        id="req-duration"
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={formDuration}
                        onChange={(e) => setFormDuration(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="req-unit"
                        className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                      >
                        Đơn vị tính
                      </label>
                      <Input
                        id="req-unit"
                        readOnly
                        value={
                          formCategory === 'OVERTIME'
                            ? `Giờ (Hệ số ${OT_DAY_TYPE_CONFIG[formOtDayType].multiplier.toFixed(1)}x)`
                            : 'Ngày công'
                        }
                        className="bg-[#F2F7F5] font-mono text-xs tabular-nums dark:bg-zinc-900"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Conditional Medical Note for SICK_LEAVE */}
              {formCategory === 'SICK_LEAVE' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="req-medical-doc"
                    className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Số seri Giấy chứng nhận nghỉ ốm hưởng BHXH / Bệnh viện khám *
                  </label>
                  <Input
                    id="req-medical-doc"
                    value={formMedicalDocNote}
                    onChange={(e) => setFormMedicalDocNote(e.target.value)}
                    placeholder="Ví dụ: GCN-BHXH-2026-88412 · Bệnh viện Đại học Y Dược"
                  />
                </div>
              )}

              {formCategory !== 'LATE_EXPLANATION' &&
                formCategory !== 'OVERTIME' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="req-handover"
                      className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Người nhận bàn giao công việc (không bắt buộc)
                    </label>
                    <Input
                      id="req-handover"
                      value={formHandover}
                      onChange={(e) => setFormHandover(e.target.value)}
                      placeholder="Ví dụ: Bùi Trọng Nghĩa"
                    />
                  </div>
                )}

              <div className="space-y-1.5">
                <label
                  htmlFor="req-reason"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Lý do chi tiết *
                </label>
                <textarea
                  id="req-reason"
                  rows={3}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder={
                    formCategory === 'LATE_EXPLANATION'
                      ? 'Nhập lý do quên chấm công hoặc đi muộn (họp khách hàng, quên quẹt thẻ vân tay...)'
                      : 'Nhập lý do đề xuất chi tiết...'
                  }
                  className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] transition-colors placeholder:text-[#5C7871] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20"
                />
              </div>

              {formError && (
                <p
                  className="text-xs font-medium text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {formError}
                </p>
              )}
            </div>

            <DialogFooter className="mt-0 shrink-0 border-t border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsCreateOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={formExceedsBalance}
              >
                Gửi đơn phê duyệt
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REQUEST DETAIL & MULTI-STEP APPROVAL MODAL */}
      <Dialog
        open={selectedRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            setChecklistChecked(false);
            setIsEditingRequest(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden p-0">
          {selectedRequest &&
            (() => {
              const effStatus = getEffectiveStatus(selectedRequest);
              const canApproveModal =
                role !== 'EMPLOYEE' &&
                role !== 'CANDIDATE' &&
                canRoleApproveRequest(selectedRequest);
              const canCancelModal = canCancelRequest(selectedRequest);
              const needsChecklist =
                canApproveModal &&
                (role === 'DEPT_MANAGER' || role === 'HR_MANAGER');

              return (
                <>
                  <DialogHeader className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2 pr-8">
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                        {selectedRequest.request_code}
                      </span>
                      <Badge variant={STATUS_BADGE[effStatus].variant}>
                        {STATUS_BADGE[effStatus].label}
                      </Badge>
                      <Badge
                        className={getCategoryBadgeClass(
                          selectedRequest.request_category
                        )}
                      >
                        {selectedRequest.category_label}
                      </Badge>
                      {selectedRequest.leave_deducted && (
                        <Badge variant="success">Đã trừ quỹ phép</Badge>
                      )}
                      {selectedRequest.side_effects_applied && (
                        <Badge variant="teal">
                          <FileCheck2 className="h-3 w-3" strokeWidth={1.5} />
                          Đã đồng bộ công
                        </Badge>
                      )}
                    </div>
                    <DialogTitle className="pt-1">
                      Chi tiết đơn từ — {selectedRequest.full_name}
                    </DialogTitle>
                    <DialogDescription>
                      <span className="font-mono tabular-nums">
                        {selectedRequest.employee_code}
                      </span>{' '}
                      · {selectedRequest.position_name} ·{' '}
                      {selectedRequest.department_name}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
                    <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800 dark:bg-zinc-900/60 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-[#5C7871] dark:text-zinc-400">
                          {selectedRequest.request_category ===
                          'LATE_EXPLANATION'
                            ? 'Ngày công giải trình'
                            : 'Thời gian áp dụng'}
                        </div>
                        <div className="mt-1 font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                          {selectedRequest.request_category ===
                            'LATE_EXPLANATION' && selectedRequest.target_date
                            ? formatDateVN(selectedRequest.target_date)
                            : `${formatDateVN(
                                selectedRequest.start_datetime
                              )} - ${formatDateVN(selectedRequest.end_datetime)}`}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#5C7871] dark:text-zinc-400">
                          Tổng thời lượng
                        </div>
                        <div className="mt-1 font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                          {selectedRequest.duration_days_or_hours}{' '}
                          {selectedRequest.duration_unit === 'NGAY'
                            ? 'ngày'
                            : 'giờ'}
                          {selectedRequest.request_category === 'OVERTIME' && (
                            <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-400">
                              (
                              {selectedRequest.ot_day_type
                                ? OT_DAY_TYPE_CONFIG[selectedRequest.ot_day_type]
                                    .shortLabel
                                : `${(selectedRequest.ot_multiplier ?? 1.5).toFixed(1)}x`}
                              )
                            </span>
                          )}
                        </div>
                      </div>

                      {selectedRequest.request_category ===
                        'LATE_EXPLANATION' && (
                        <div>
                          <div className="text-xs text-[#5C7871] dark:text-zinc-400">
                            Giờ vào - Giờ ra thực tế
                          </div>
                          <div className="mt-1 font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                            {selectedRequest.actual_check_in ?? '08:30'} -{' '}
                            {selectedRequest.actual_check_out ?? '17:30'}
                          </div>
                        </div>
                      )}

                      {selectedRequest.medical_doc_note && (
                        <div>
                          <div className="text-xs text-[#5C7871] dark:text-zinc-400">
                            Chứng từ nghỉ ốm / BHXH
                          </div>
                          <div className="mt-1 font-medium text-[#11221E] dark:text-zinc-100">
                            {selectedRequest.medical_doc_note}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="text-xs text-[#5C7871] dark:text-zinc-400">
                          Người nhận bàn giao
                        </div>
                        <div className="mt-1 font-medium text-[#11221E] dark:text-zinc-100">
                          {selectedRequest.handover_to_name ?? 'Không có'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#5C7871] dark:text-zinc-400">
                          Ngày gửi đơn
                        </div>
                        <div className="mt-1 font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                          {formatDateVN(selectedRequest.created_at)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800 dark:bg-transparent">
                      <div className="text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                        Lý do chi tiết
                      </div>
                      <p className="mt-1.5 leading-6 text-[#11221E] dark:text-zinc-200">
                        {selectedRequest.reason}
                      </p>
                    </div>

                    {isEditingRequest && role === 'SUPER_ADMIN' && (
                      <div className="space-y-3 rounded-xl border border-[#0F766E]/25 bg-[#CBE8E2]/40 p-4 dark:border-teal-400/25 dark:bg-teal-950/20">
                        <div className="text-xs font-semibold text-[#0B4F4A] dark:text-teal-300">
                          Chỉnh sửa thông tin đơn từ (Quản trị viên)
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label
                              htmlFor="edit-req-duration"
                              className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                            >
                              Thời lượng (
                              {selectedRequest.duration_unit === 'NGAY'
                                ? 'ngày'
                                : 'giờ'}
                              )
                            </label>
                            <Input
                              id="edit-req-duration"
                              type="number"
                              min={0.5}
                              step={0.5}
                              value={editDuration}
                              onChange={(e) => setEditDuration(e.target.value)}
                              className="font-mono tabular-nums"
                            />
                          </div>
                          <div className="space-y-1">
                            <label
                              htmlFor="edit-req-handover"
                              className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                            >
                              Người nhận bàn giao
                            </label>
                            <Input
                              id="edit-req-handover"
                              value={editHandover}
                              onChange={(e) => setEditHandover(e.target.value)}
                              placeholder="Không có"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="edit-req-reason"
                            className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                          >
                            Lý do
                          </label>
                          <textarea
                            id="edit-req-reason"
                            rows={2}
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditingRequest(false)}
                          >
                            Hủy sửa
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleSaveRequestEdit}
                          >
                            Lưu chỉnh sửa
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedRequest.rejection_reason && (
                      <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-rose-800 dark:text-rose-300">
                        <div className="text-xs font-semibold">
                          Lý do từ chối
                        </div>
                        <p className="mt-1 text-sm">
                          {selectedRequest.rejection_reason}
                        </p>
                      </div>
                    )}

                    {selectedRequest.approval_steps &&
                      selectedRequest.approval_steps.length > 0 && (
                        <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800 dark:bg-transparent">
                          <div className="mb-3 text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                            Tiến trình phê duyệt đa cấp
                          </div>
                          <div className="space-y-3">
                            {selectedRequest.approval_steps.map((step) => {
                              const isCurrent =
                                (effStatus === 'PENDING' ||
                                  effStatus === 'IN_PROGRESS') &&
                                selectedRequest.current_step_role === step.role;
                              return (
                                <div
                                  key={step.step_order}
                                  className="flex flex-col gap-1 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] p-3 dark:border-zinc-800/70 dark:bg-zinc-900/40"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <StepperBadge
                                      step={step}
                                      isCurrent={isCurrent}
                                    />
                                    {step.actor_name && (
                                      <span className="text-xs text-[#415A54] dark:text-zinc-400">
                                        {step.actor_name}
                                        {step.acted_at && (
                                          <span className="ml-1.5 font-mono tabular-nums text-[#5C7871] dark:text-zinc-400">
                                            · {formatDateVN(step.acted_at)}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  {step.note && (
                                    <p className="text-xs text-[#415A54] dark:text-zinc-400">
                                      Ghi chú: {step.note}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {needsChecklist && (
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#0F766E]/25 bg-[#CBE8E2]/40 p-3.5 text-xs text-[#11221E] dark:border-teal-400/25 dark:bg-teal-950/30 dark:text-zinc-200">
                        <input
                          type="checkbox"
                          checked={checklistChecked}
                          onChange={(e) =>
                            setChecklistChecked(e.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 rounded border-[#C6D9D3] text-[#0F766E] focus:ring-[#0F766E]"
                        />
                        <span>
                          {role === 'DEPT_MANAGER'
                            ? 'Xác nhận đã kiểm tra bàn giao công việc / tính xác thực giờ công và không ảnh hưởng tiến độ bộ phận.'
                            : 'Xác nhận đã đối soát quy chế công ty, quỹ phép năm / hệ số OT / chứng từ BHXH hợp lệ.'}
                        </span>
                      </label>
                    )}
                  </div>

                  <DialogFooter className="mt-0 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedRequest(null)}
                    >
                      Đóng
                    </Button>
                    {role === 'SUPER_ADMIN' && !isEditingRequest && (
                      <Button
                        variant="outline"
                        onClick={() => startEditingRequest(selectedRequest)}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                        Chỉnh sửa
                      </Button>
                    )}
                    {canCancelModal && (
                      <Button
                        variant="destructive"
                        onClick={() => void handleCancelRequest(selectedRequest)}
                      >
                        <Ban className="h-4 w-4" strokeWidth={1.5} />
                        Hủy đơn
                      </Button>
                    )}
                    {canApproveModal && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void handleRejectRequest(selectedRequest)
                          }
                        >
                          <X
                            className="h-4 w-4 text-red-600 dark:text-red-400"
                            strokeWidth={1.5}
                          />
                          Từ chối
                        </Button>
                        <Button
                          variant="primary"
                          disabled={needsChecklist && !checklistChecked}
                          onClick={() =>
                            void handleApproveStep(selectedRequest)
                          }
                        >
                          <Check className="h-4 w-4" strokeWidth={1.5} />
                          Duyệt bước này
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RequestsView;
