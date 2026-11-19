'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  MinusCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
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
import { useApp, type RoleCode } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchAttendanceMock } from '@/lib/mock-fetcher';
import {
  HRM_RUNTIME_EVENT,
  mergeWithRuntimeRequests,
  pushNotification,
  saveRuntimeRequest,
} from '@/lib/runtime-store';
import { formatDateVN } from '@/lib/utils';
import type {
  ApprovalStep,
  LeaveOvertimeRequest,
  MultiStepRequestStatus,
  RequestCategory,
} from '@/mock/types';

type CategoryFilterGroup = 'ALL' | 'LEAVE' | 'OVERTIME' | 'REMOTE_WORK' | 'BUSINESS_TRIP';
type StatusFilterTab = 'ALL' | 'PENDING_GROUP' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

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

const ROLE_ACTOR_DEFAULT: Record<RoleCode, { code: string; name: string; dept: string; pos: string }> = {
  SUPER_ADMIN: {
    code: 'NV-2024-001',
    name: 'Nguyễn Văn An',
    dept: 'Ban Điều hành',
    pos: 'Quản trị Hệ thống Cấp cao',
  },
  DIRECTOR: {
    code: 'NV-2024-000',
    name: 'Trần Quốc Việt',
    dept: 'Ban Điều hành',
    pos: 'Giám đốc Điều hành',
  },
  HR_MANAGER: {
    code: 'NV-2024-002',
    name: 'Trần Thị Bích Ngọc',
    dept: 'Phòng Nhân sự & Hành chính',
    pos: 'Trưởng phòng Nhân sự & Hành chính',
  },
  DEPT_MANAGER: {
    code: 'NV-2024-003',
    name: 'Lê Hoàng Nam',
    dept: 'Khối Công nghệ',
    pos: 'Trưởng khối Công nghệ',
  },
  EMPLOYEE: {
    code: 'NV-2024-004',
    name: 'Phạm Minh Tuấn',
    dept: 'Phòng Kỹ thuật Phần mềm',
    pos: 'Kỹ sư Phần mềm Cao cấp (Senior Fullstack)',
  },
};

function getEffectiveStatus(req: LeaveOvertimeRequest): MultiStepRequestStatus {
  return req.status ?? req.approval_status;
}

const STATUS_BADGE: Record<
  MultiStepRequestStatus,
  { label: string; variant: 'warning' | 'teal' | 'success' | 'error' | 'muted'; borderClass: string }
> = {
  PENDING: {
    label: 'Chờ duyệt',
    variant: 'warning',
    borderClass: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
  },
  IN_PROGRESS: {
    label: 'Đang xử lý',
    variant: 'teal',
    borderClass: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
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
  if (cat === 'ANNUAL_LEAVE' || cat === 'SICK_LEAVE' || cat === 'UNPAID_LEAVE') {
    return 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400';
  }
  if (cat === 'OVERTIME') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
  if (cat === 'REMOTE_WORK') {
    return 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400';
  }
  return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
}

const NEW_REQUEST_OPTIONS: Array<{
  value: RequestCategory;
  label: string;
  defaultUnit: 'NGAY' | 'GIO';
}> = [
  { value: 'ANNUAL_LEAVE', label: 'Nghỉ phép năm có hưởng lương', defaultUnit: 'NGAY' },
  { value: 'UNPAID_LEAVE', label: 'Nghỉ không hưởng lương', defaultUnit: 'NGAY' },
  { value: 'OVERTIME', label: 'Đăng ký tăng ca (OT)', defaultUnit: 'GIO' },
  { value: 'REMOTE_WORK', label: 'Làm việc từ xa (WFH)', defaultUnit: 'NGAY' },
  { value: 'BUSINESS_TRIP', label: 'Công tác trong nước', defaultUnit: 'NGAY' },
  { value: 'OVERSEAS_BUSINESS_TRIP', label: 'Công tác nước ngoài', defaultUnit: 'NGAY' },
];

function matchesCategoryGroup(cat: RequestCategory, group: CategoryFilterGroup): boolean {
  if (group === 'ALL') return true;
  if (group === 'LEAVE') {
    return cat === 'ANNUAL_LEAVE' || cat === 'SICK_LEAVE' || cat === 'UNPAID_LEAVE';
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
    currentUserProfile,
    navIntent,
    clearNavIntent,
    uiState,
    setUiState,
    showToast,
  } = useApp();
  const actorInfo = ROLE_ACTOR_DEFAULT[role];
  const currentEmployeeCode = currentUserProfile?.employee_code ?? actorInfo.code;
  const currentEmployeeName = currentUserProfile?.fullName ?? actorInfo.name;
  const currentDepartment = currentUserProfile?.department ?? actorInfo.dept;

  const baseRequestsRef = useRef<LeaveOvertimeRequest[]>([]);
  const [requests, setRequests] = useState<LeaveOvertimeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterGroup>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;
    fetchAttendanceMock()
      .then((data) => {
        if (!active) return;
        baseRequestsRef.current = data.MOCK_LEAVE_OVERTIME_REQUESTS;
        setRequests(mergeWithRuntimeRequests(data.MOCK_LEAVE_OVERTIME_REQUESTS));
        setIsLoading(false);
      })
      .catch(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncFromRuntime = () => {
      const merged = mergeWithRuntimeRequests(baseRequestsRef.current);
      setRequests(merged);
      setSelectedRequest((prev) => {
        if (!prev) return null;
        return (
          merged.find(
            (item) => item.id === prev.id || item.request_code === prev.request_code
          ) ?? null
        );
      });
    };

    window.addEventListener(HRM_RUNTIME_EVENT, syncFromRuntime);
    window.addEventListener('storage', syncFromRuntime);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncFromRuntime);
      window.removeEventListener('storage', syncFromRuntime);
    };
  }, []);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveOvertimeRequest | null>(null);
  const [checklistChecked, setChecklistChecked] = useState(false);

  useEffect(() => {
    if (isLoading || !navIntent || navIntent.navId !== 'leaves') return;
    if (navIntent.entityId) {
      const matched = requests.find(
        (r) => r.request_code === navIntent.entityId || r.id === navIntent.entityId
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
  }, [isLoading, navIntent, requests, clearNavIntent]);

  const [rejectTarget, setRejectTarget] = useState<LeaveOvertimeRequest | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<LeaveOvertimeRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveOvertimeRequest | null>(null);
  const [isEditingRequest, setIsEditingRequest] = useState(false);
  const [editDuration, setEditDuration] = useState('1');
  const [editHandover, setEditHandover] = useState('');
  const [editReason, setEditReason] = useState('');

  const [formCategory, setFormCategory] = useState<RequestCategory>('ANNUAL_LEAVE');
  const [formStartDate, setFormStartDate] = useState('2026-11-25');
  const [formEndDate, setFormEndDate] = useState('2026-11-25');
  const [formDuration, setFormDuration] = useState('1');
  const [formUnit, setFormUnit] = useState<'NGAY' | 'GIO'>('NGAY');
  const [formHandover, setFormHandover] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formError, setFormError] = useState('');

  const scopedRequests = useMemo(() => {
    if (role === 'DEPT_MANAGER') {
      return requests.filter(
        (r) =>
          TECH_DIVISION_DEPARTMENTS.has(r.department_name) ||
          r.employee_code === currentEmployeeCode
      );
    }
    if (role === 'EMPLOYEE') {
      return requests.filter(
        (r) => r.employee_code === currentEmployeeCode || r.full_name === currentEmployeeName
      );
    }
    return requests;
  }, [requests, role, currentEmployeeCode, currentEmployeeName]);

  const statusCounts = useMemo(() => {
    return {
      ALL: scopedRequests.length,
      PENDING_GROUP: scopedRequests.filter((r) => {
        const s = getEffectiveStatus(r);
        return s === 'PENDING' || s === 'IN_PROGRESS';
      }).length,
      APPROVED: scopedRequests.filter((r) => getEffectiveStatus(r) === 'APPROVED').length,
      REJECTED: scopedRequests.filter((r) => getEffectiveStatus(r) === 'REJECTED').length,
      CANCELLED: scopedRequests.filter((r) => getEffectiveStatus(r) === 'CANCELLED').length,
    };
  }, [scopedRequests]);

  const filteredRequests = useMemo(() => {
    const q = normalizeVietnamese(searchQuery.trim());
    const list = scopedRequests.filter((req) => {
      const s = getEffectiveStatus(req);
      if (statusFilter === 'PENDING_GROUP' && s !== 'PENDING' && s !== 'IN_PROGRESS') {
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
          `${req.request_code} ${req.employee_code} ${req.full_name} ${req.department_name} ${req.category_label} ${req.reason}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (role === 'DIRECTOR') {
      return [...list].sort((a, b) => {
        const aPriority =
          (getEffectiveStatus(a) === 'PENDING' || getEffectiveStatus(a) === 'IN_PROGRESS') &&
          a.current_step_role === 'DIRECTOR'
            ? 0
            : 1;
        const bPriority =
          (getEffectiveStatus(b) === 'PENDING' || getEffectiveStatus(b) === 'IN_PROGRESS') &&
          b.current_step_role === 'DIRECTOR'
            ? 0
            : 1;
        return aPriority - bPriority;
      });
    }

    return list;
  }, [scopedRequests, statusFilter, categoryFilter, searchQuery, role]);

  const canRoleApproveRequest = (req: LeaveOvertimeRequest): boolean => {
    const eff = getEffectiveStatus(req);
    if (eff !== 'PENDING' && eff !== 'IN_PROGRESS') return false;
    if (role === 'EMPLOYEE') return false;
    if (role === 'SUPER_ADMIN') return true;
    if (req.current_step_role !== role) return false;
    if (role === 'DEPT_MANAGER' && !TECH_DIVISION_DEPARTMENTS.has(req.department_name)) {
      return false;
    }
    return true;
  };

  const canCancelRequest = (req: LeaveOvertimeRequest): boolean => {
    const eff = getEffectiveStatus(req);
    if (eff !== 'PENDING' && eff !== 'IN_PROGRESS') return false;
    return req.employee_code === currentEmployeeCode || req.requester_role === role;
  };

  const handleApproveStep = (req: LeaveOvertimeRequest) => {
    if (!canRoleApproveRequest(req)) return;
    const nowIso = new Date().toISOString();
    const currentSteps = req.approval_steps ?? [];
    const targetStepRole = req.current_step_role ?? role;
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
    const nextStatus: MultiStepRequestStatus = isFinal ? 'APPROVED' : 'IN_PROGRESS';
    const nextLeaveDeducted =
      req.leave_deducted ||
      ((role === 'HR_MANAGER' || role === 'SUPER_ADMIN') &&
        req.request_category === 'ANNUAL_LEAVE' &&
        isFinal);

    const updatedReq: LeaveOvertimeRequest = {
      ...req,
      approval_steps: updatedSteps,
      current_step_role: nextPendingStep ? nextPendingStep.role : null,
      status: nextStatus,
      approval_status: isFinal ? 'APPROVED' : 'PENDING',
      leave_deducted: nextLeaveDeducted,
      responded_at: isFinal ? nowIso : req.responded_at,
    };

    setRequests((prev) => prev.map((item) => (item.id === req.id ? updatedReq : item)));
    setSelectedRequest((prev) => (prev && prev.id === req.id ? updatedReq : prev));
    setChecklistChecked(false);
    saveRuntimeRequest(updatedReq);

    if (targetStepRole === 'DEPT_MANAGER' && nextPendingStep?.role === 'HR_MANAGER') {
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
        message: `Trưởng bộ phận đã duyệt bước 1, đơn đã chuyển tiếp tới Phòng Nhân sự kiểm tra.`,
        category: 'LEAVE_REQUEST',
        target_employee_codes: [req.employee_code],
        nav_id: 'leaves',
        entity_id: req.request_code,
      });
    } else if (targetStepRole === 'HR_MANAGER') {
      if (!isFinal && nextPendingStep?.role === 'DIRECTOR') {
        pushNotification({
          title: `Đơn ${req.request_code} chờ Giám đốc phê duyệt Cấp 3`,
          message: `Phòng Nhân sự đã kiểm tra hợp lệ đơn ${req.category_label.toLowerCase()} (${req.duration_days_or_hours} ${req.duration_unit === 'NGAY' ? 'ngày' : 'giờ'}) của ${req.full_name}.`,
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
          title: 'Đơn đã được phê duyệt',
          message: `Đơn ${req.request_code} (${req.category_label.toLowerCase()}) của ${req.full_name} đã được phê duyệt hoàn tất.`,
          category: 'LEAVE_REQUEST',
          target_employee_codes: [req.employee_code],
          nav_id: 'leaves',
          entity_id: req.request_code,
        });
      }
    } else if (isFinal) {
      pushNotification({
        title: 'Đơn đã được phê duyệt',
        message: `Giám đốc đã phê duyệt hoàn tất đơn ${req.request_code} (${req.category_label.toLowerCase()}).`,
        category: 'LEAVE_REQUEST',
        target_employee_codes: [req.employee_code],
        nav_id: 'leaves',
        entity_id: req.request_code,
      });
    }

    showToast(
      'Cập nhật thành công!',
      isFinal
        ? `Đã phê duyệt hoàn tất đơn ${req.request_code} (${req.category_label}).`
        : `Đã duyệt đơn ${req.request_code}, chuyển tiếp sang ${nextPendingStep?.label ?? 'cấp tiếp theo'}.`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'APPROVE',
      module: 'Đơn từ & Phê duyệt',
      target: `${req.request_code} (${req.full_name})`,
      detail: isFinal
        ? `Phê duyệt hoàn tất đơn ${req.category_label}`
        : `Duyệt bước ${targetStepRole}, chuyển tiếp sang ${nextPendingStep?.role}`,
    });
  };

  const openRejectModal = (req: LeaveOvertimeRequest) => {
    setRejectTarget(req);
    setRejectReasonInput('');
    setRejectError('');
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    const reasonTrimmed = rejectReasonInput.trim();
    if (reasonTrimmed.length < 3) {
      setRejectError('Vui lòng nhập lý do từ chối tối thiểu 3 ký tự.');
      showToast('Vui lòng nhập đầy đủ thông tin!', 'Vui lòng nhập lý do từ chối tối thiểu 3 ký tự.', 'warning');
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedSteps: ApprovalStep[] = (rejectTarget.approval_steps ?? []).map((step) =>
      step.role === rejectTarget.current_step_role && step.status === 'PENDING'
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
      ...rejectTarget,
      approval_steps: updatedSteps,
      current_step_role: null,
      status: 'REJECTED',
      approval_status: 'REJECTED',
      rejection_reason: reasonTrimmed,
      responded_at: nowIso,
    };

    setRequests((prev) => prev.map((item) => (item.id === rejectTarget.id ? updatedReq : item)));
    setSelectedRequest((prev) => (prev && prev.id === rejectTarget.id ? updatedReq : prev));
    saveRuntimeRequest(updatedReq);
    pushNotification({
      title: `Đơn ${rejectTarget.request_code} bị từ chối`,
      message: `${currentEmployeeName} đã từ chối đơn ${rejectTarget.category_label.toLowerCase()}. Lý do: ${reasonTrimmed}`,
      category: 'LEAVE_REQUEST',
      target_employee_codes: [rejectTarget.employee_code],
      nav_id: 'leaves',
      entity_id: rejectTarget.request_code,
    });
    setRejectTarget(null);
    setRejectReasonInput('');
    setRejectError('');

    showToast(
      'Cập nhật thành công!',
      `Đã từ chối đơn ${rejectTarget.request_code}. Lý do: ${reasonTrimmed}`,
      'warning'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'REJECT',
      module: 'Đơn từ & Phê duyệt',
      target: `${rejectTarget.request_code} (${rejectTarget.full_name})`,
      detail: `Từ chối đơn: ${reasonTrimmed}`,
      status: 'WARNING',
    });
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget || !canCancelRequest(cancelTarget)) return;
    const nowIso = new Date().toISOString();
    const updatedReq: LeaveOvertimeRequest = {
      ...cancelTarget,
      status: 'CANCELLED',
      current_step_role: null,
      responded_at: nowIso,
    };
    setRequests((prev) => prev.map((item) => (item.id === cancelTarget.id ? updatedReq : item)));
    setSelectedRequest((prev) => (prev && prev.id === cancelTarget.id ? updatedReq : prev));
    saveRuntimeRequest(updatedReq);
    showToast(
      'Cập nhật thành công!',
      `Đã hủy đơn ${cancelTarget.request_code}. Đơn đã được rút lại thành công.`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'CANCEL',
      module: 'Đơn từ & Phê duyệt',
      target: `${cancelTarget.request_code} (${cancelTarget.full_name})`,
      detail: `Người gửi hủy đơn ${cancelTarget.category_label}`,
    });
    setCancelTarget(null);
  };

  const startEditingRequest = (req: LeaveOvertimeRequest) => {
    setEditDuration(String(req.duration_days_or_hours));
    setEditHandover(req.handover_to_name ?? '');
    setEditReason(req.reason);
    setIsEditingRequest(true);
  };

  const handleSaveRequestEdit = () => {
    if (!selectedRequest) return;
    const numericDur = Math.max(0.5, Number(editDuration) || selectedRequest.duration_days_or_hours);
    const updatedReq: LeaveOvertimeRequest = {
      ...selectedRequest,
      duration_days_or_hours: numericDur,
      handover_to_name: editHandover.trim() || null,
      reason: editReason.trim() || selectedRequest.reason,
    };
    setRequests((prev) => prev.map((item) => (item.id === updatedReq.id ? updatedReq : item)));
    setSelectedRequest(updatedReq);
    setIsEditingRequest(false);
    saveRuntimeRequest(updatedReq);
    showToast(
      'Cập nhật thành công!',
      `Đơn ${updatedReq.request_code} (${updatedReq.full_name}) đã được lưu.`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'UPDATE_RECORD',
      module: 'Đơn từ & Phê duyệt',
      target: `${updatedReq.request_code} (${updatedReq.full_name})`,
      detail: `Chỉnh sửa thông tin đơn: ${numericDur} ${updatedReq.duration_unit === 'NGAY' ? 'ngày' : 'giờ'}`,
    });
  };

  const handleConfirmDeleteRequest = () => {
    if (!deleteTarget) return;
    setRequests((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    if (selectedRequest?.id === deleteTarget.id) {
      setSelectedRequest(null);
      setIsEditingRequest(false);
    }
    showToast(
      'Xóa thành công!',
      `Đã xóa đơn ${deleteTarget.request_code} (${deleteTarget.full_name}) khỏi hệ thống.`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'DELETE_RECORD',
      module: 'Đơn từ & Phê duyệt',
      target: `${deleteTarget.request_code} (${deleteTarget.full_name})`,
      detail: `Xóa đơn ${deleteTarget.category_label}`,
      status: 'WARNING',
    });
    setDeleteTarget(null);
  };

  const handleCategoryChange = (val: string) => {
    const nextCat = val as RequestCategory;
    setFormCategory(nextCat);
    const found = NEW_REQUEST_OPTIONS.find((opt) => opt.value === nextCat);
    if (found) {
      setFormUnit(found.defaultUnit);
      setFormDuration(found.defaultUnit === 'GIO' ? '4' : '1');
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericDuration = Number(formDuration);
    if (!formStartDate || !formEndDate) {
      setFormError('Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.');
      showToast('Vui lòng nhập đầy đủ thông tin!', 'Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.', 'warning');
      return;
    }
    if (Number.isNaN(numericDuration) || numericDuration <= 0) {
      setFormError('Số ngày hoặc số giờ phải lớn hơn 0.');
      showToast('Vui lòng nhập đầy đủ thông tin!', 'Số ngày hoặc số giờ phải lớn hơn 0.', 'warning');
      return;
    }
    if (formReason.trim().length < 5) {
      setFormError('Vui lòng nhập lý do tối thiểu 5 ký tự.');
      showToast('Vui lòng nhập đầy đủ thông tin!', 'Vui lòng nhập lý do tối thiểu 5 ký tự.', 'warning');
      return;
    }

    const directorMinDays = readDirectorMinDays();
    const needsDirector =
      (formUnit === 'NGAY' && numericDuration > directorMinDays) ||
      formCategory === 'UNPAID_LEAVE' ||
      formCategory === 'OVERSEAS_BUSINESS_TRIP';

    const isDeptMgr = role === 'DEPT_MANAGER';
    const steps: ApprovalStep[] = [
      {
        step_order: 1,
        role: 'DEPT_MANAGER',
        label: 'Cấp 1 · Trưởng bộ phận duyệt',
        status: isDeptMgr ? 'SKIPPED' : 'PENDING',
        actor_name: 'Lê Hoàng Nam',
        note: isDeptMgr ? 'Tự động bỏ qua do người gửi là Trưởng bộ phận' : undefined,
      },
      {
        step_order: 2,
        role: 'HR_MANAGER',
        label: 'Cấp 2 · Trưởng phòng Nhân sự kiểm tra',
        status: 'PENDING',
        actor_name: 'Trần Thị Bích Ngọc',
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
        actor_name: 'Trần Quốc Việt',
      });
    }

    const catOption = NEW_REQUEST_OPTIONS.find((o) => o.value === formCategory);
    const maxCodeNum = requests.reduce((max, r) => {
      const m = /^REQ-202611-(\d+)$/.exec(r.request_code);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 87);
    const nextCodeNum = String(maxCodeNum + 1).padStart(3, '0');
    const firstStepRole: 'DEPT_MANAGER' | 'HR_MANAGER' = isDeptMgr ? 'HR_MANAGER' : 'DEPT_MANAGER';
    const targetDeptId = resolveDepartmentId(currentDepartment, currentUserProfile?.department_id);

    const newItem: LeaveOvertimeRequest = {
      id: `req-${Date.now()}`,
      request_code: `REQ-202611-${nextCodeNum}`,
      employee_id: 'emp-004',
      employee_code: currentEmployeeCode,
      full_name: currentEmployeeName,
      department_name: currentDepartment,
      position_name: actorInfo.pos,
      requester_role: role,
      request_category: formCategory,
      category_label: catOption?.label ?? 'Đơn từ khác',
      start_datetime: `${formStartDate}T08:30:00+07:00`,
      end_datetime: `${formEndDate}T17:30:00+07:00`,
      duration_days_or_hours: numericDuration,
      duration_unit: formUnit,
      reason: formReason.trim(),
      handover_to_name: formHandover.trim() || null,
      approver_id: isDeptMgr ? 'emp-002' : 'emp-003',
      approver_name: isDeptMgr ? 'Trần Thị Bích Ngọc' : 'Lê Hoàng Nam',
      approval_status: 'PENDING',
      status: 'PENDING',
      current_step_role: firstStepRole,
      approval_steps: steps,
      leave_deducted: false,
      created_at: new Date().toISOString(),
      responded_at: null,
      source: 'MANUAL_FORM',
    };

    setRequests((prev) => [newItem, ...prev]);
    saveRuntimeRequest(newItem);

    if (isDeptMgr) {
      pushNotification({
        title: `Đơn mới ${newItem.request_code} chờ Nhân sự kiểm tra`,
        message: `${newItem.full_name} tạo đơn ${newItem.category_label.toLowerCase()} (${numericDuration} ${formUnit === 'NGAY' ? 'ngày' : 'giờ'}).`,
        category: 'LEAVE_REQUEST',
        target_roles: ['HR_MANAGER'],
        nav_id: 'leaves',
        entity_id: newItem.request_code,
      });
    } else {
      pushNotification({
        title: `Đơn mới ${newItem.request_code} chờ duyệt Cấp 1`,
        message: `${newItem.full_name} gửi đơn ${newItem.category_label.toLowerCase()} (${numericDuration} ${formUnit === 'NGAY' ? 'ngày' : 'giờ'}).`,
        category: 'LEAVE_REQUEST',
        target_roles: ['DEPT_MANAGER'],
        target_department_id: targetDeptId,
        nav_id: 'leaves',
        entity_id: newItem.request_code,
      });
    }

    setIsCreateOpen(false);
    setFormError('');
    setFormReason('');
    setFormHandover('');
    showToast(
      'Tạo thành công!',
      `Đơn ${newItem.request_code} (${newItem.category_label}) đã được chuyển tới ${isDeptMgr ? 'Cấp 2 (HR)' : 'Cấp 1 (Trưởng bộ phận)'}.`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'CREATE_REQUEST',
      module: 'Đơn từ & Phê duyệt',
      target: `${newItem.request_code} (${newItem.full_name})`,
      detail: `Tạo đơn mới: ${newItem.category_label} (${numericDuration} ${formUnit === 'NGAY' ? 'ngày' : 'giờ'})`,
    });
  };

  if (uiState === 'loading' || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (uiState === 'error') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
            Không thể tải danh sách đơn từ
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setUiState('ready')}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Đơn từ &amp; Phê duyệt đa cấp
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Luồng duyệt tuần tự: Trưởng bộ phận → Nhân sự (HR) → Giám đốc (khi vượt ngưỡng hoặc nghỉ không lương).
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setFormError('');
            setIsCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Tạo đơn mới
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Tổng số đơn từ
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {statusCounts.ALL}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Đang chờ / xử lý
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {statusCounts.PENDING_GROUP}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
              Đã phê duyệt
            </span>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {statusCounts.APPROVED}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500 dark:border-l-rose-400">
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

      <Card className="rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="flex flex-wrap items-center gap-1 rounded-xl border border-[#C6D9D3] bg-[#E4EEEB] p-1 dark:border-zinc-800/80 dark:bg-zinc-900/70"
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

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[460px]">
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
                onValueChange={(val) => setCategoryFilter(val as CategoryFilterGroup)}
                aria-label="Lọc theo loại đơn"
                options={[
                  { value: 'ALL', label: 'Tất cả loại đơn' },
                  { value: 'LEAVE', label: 'Nghỉ phép' },
                  { value: 'OVERTIME', label: 'Tăng ca OT' },
                  { value: 'REMOTE_WORK', label: 'Làm từ xa WFH' },
                  { value: 'BUSINESS_TRIP', label: 'Công tác' },
                ]}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {uiState === 'empty' || filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-8 w-8 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                Không có đơn từ nào khớp bộ lọc
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Thử chọn trạng thái khác hoặc tạo mới đơn đề xuất.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const effStatus = getEffectiveStatus(req);
                const statusInfo = STATUS_BADGE[effStatus];
                const canApproveHere = canRoleApproveRequest(req);
                const canCancelHere = canCancelRequest(req);

                return (
                  <div
                    key={req.id}
                    onClick={() => {
                      setChecklistChecked(false);
                      setSelectedRequest(req);
                    }}
                    className={`flex cursor-pointer flex-col gap-4 rounded-xl border border-[#C6D9D3] ${statusInfo.borderClass} odd:bg-[#FCFEFD] even:bg-[#F5FAF8] p-4 transition-colors hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:odd:bg-zinc-900/40 dark:even:bg-zinc-900/40 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/70 lg:flex-row lg:items-center lg:justify-between`}
                  >
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {req.request_code}
                        </span>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        <Badge className={getCategoryBadgeClass(req.request_category)}>
                          {req.category_label}
                        </Badge>
                        {req.leave_deducted && (
                          <Badge variant="success">Đã trừ quỹ phép</Badge>
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

                      {req.rejection_reason && (
                        <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-400">
                          Lý do từ chối: {req.rejection_reason}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#415A54] dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
                          <span className="font-mono tabular-nums">
                            {formatDateVN(req.start_datetime)} - {formatDateVN(req.end_datetime)}
                          </span>
                          <span className="font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-200">
                            ({req.duration_days_or_hours} {req.duration_unit === 'NGAY' ? 'ngày' : 'giờ'})
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <UserCheck className="h-4 w-4 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
                          <span>
                            Bàn giao:{' '}
                            <strong className="font-medium text-[#11221E] dark:text-zinc-200">
                              {req.handover_to_name ?? 'Không có'}
                            </strong>
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#D5E3DF] pt-3 dark:border-zinc-800/80 lg:border-t-0 lg:pt-0">
                      {canApproveHere && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRejectModal(req);
                            }}
                          >
                            <X className="h-4 w-4 text-red-600 dark:text-red-400" strokeWidth={1.5} />
                            Từ chối
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveStep(req);
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
                          className="border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCancelTarget(req);
                          }}
                        >
                          <Ban className="h-4 w-4" strokeWidth={1.5} />
                          Hủy đơn
                        </Button>
                      )}
                      {!canApproveHere && !canCancelHere && (
                        <div className="text-right text-xs text-[#415A54] dark:text-zinc-400">
                          <div>
                            {effStatus === 'APPROVED' || effStatus === 'REJECTED'
                              ? `Xử lý bởi: ${req.approver_name}`
                              : effStatus === 'CANCELLED'
                                ? 'Người gửi đã hủy'
                                : req.current_step_role
                                  ? `Đang chờ: ${
                                      req.current_step_role === 'DEPT_MANAGER'
                                        ? 'Trưởng bộ phận'
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tạo đơn từ mới</DialogTitle>
            <DialogDescription>
              Hệ thống tự động định tuyến cấp phê duyệt dựa trên vai trò và số ngày đề xuất.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="req-category"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Loại đơn
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="req-start"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Từ ngày
                </label>
                <Input
                  id="req-start"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
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
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="req-duration"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Số lượng ({formUnit === 'NGAY' ? 'ngày' : 'giờ'})
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
                <Select
                  id="req-unit"
                  value={formUnit}
                  onValueChange={(v) => setFormUnit(v as 'NGAY' | 'GIO')}
                  options={[
                    { value: 'NGAY', label: 'Ngày' },
                    { value: 'GIO', label: 'Giờ' },
                  ]}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="req-handover"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Người nhận bàn giao (không bắt buộc)
              </label>
              <Input
                id="req-handover"
                value={formHandover}
                onChange={(e) => setFormHandover(e.target.value)}
                placeholder="Ví dụ: Bùi Trọng Nghĩa"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="req-reason"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Lý do chi tiết
              </label>
              <textarea
                id="req-reason"
                rows={3}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Nhập lý do đề xuất..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] transition-colors placeholder:text-[#5C7871] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20"
              />
            </div>

            {formError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsCreateOpen(false)}>
                Hủy bỏ
              </Button>
              <Button variant="primary" type="submit">
                Gửi đơn phê duyệt
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
          {selectedRequest && (() => {
            const effStatus = getEffectiveStatus(selectedRequest);
            const canApproveModal = canRoleApproveRequest(selectedRequest);
            const canCancelModal = canCancelRequest(selectedRequest);
            const needsChecklist =
              canApproveModal && (role === 'DEPT_MANAGER' || role === 'HR_MANAGER');

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
                    <Badge className={getCategoryBadgeClass(selectedRequest.request_category)}>
                      {selectedRequest.category_label}
                    </Badge>
                    {selectedRequest.leave_deducted && (
                      <Badge variant="success">Đã trừ quỹ phép</Badge>
                    )}
                  </div>
                  <DialogTitle className="pt-1">
                    Chi tiết đơn từ — {selectedRequest.full_name}
                  </DialogTitle>
                  <DialogDescription>
                    <span className="font-mono tabular-nums">{selectedRequest.employee_code}</span> ·{' '}
                    {selectedRequest.position_name} · {selectedRequest.department_name}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-[#5C7871] dark:text-zinc-400">Thời gian đề xuất</div>
                      <div className="mt-1 font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatDateVN(selectedRequest.start_datetime)} -{' '}
                        {formatDateVN(selectedRequest.end_datetime)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#5C7871] dark:text-zinc-400">Tổng thời lượng</div>
                      <div className="mt-1 font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                        {selectedRequest.duration_days_or_hours}{' '}
                        {selectedRequest.duration_unit === 'NGAY' ? 'ngày' : 'giờ'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#5C7871] dark:text-zinc-400">Người nhận bàn giao</div>
                      <div className="mt-1 font-medium text-[#11221E] dark:text-zinc-100">
                        {selectedRequest.handover_to_name ?? 'Không có'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#5C7871] dark:text-zinc-400">Ngày gửi đơn</div>
                      <div className="mt-1 font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatDateVN(selectedRequest.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-transparent">
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
                            Thời lượng ({selectedRequest.duration_unit === 'NGAY' ? 'ngày' : 'giờ'})
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
                          className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100"
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
                      <div className="text-xs font-semibold">Lý do từ chối</div>
                      <p className="mt-1 text-sm">{selectedRequest.rejection_reason}</p>
                    </div>
                  )}

                  {selectedRequest.approval_steps && selectedRequest.approval_steps.length > 0 && (
                    <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-transparent">
                      <div className="mb-3 text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                        Tiến trình phê duyệt đa cấp
                      </div>
                      <div className="space-y-3">
                        {selectedRequest.approval_steps.map((step) => {
                          const isCurrent =
                            (effStatus === 'PENDING' || effStatus === 'IN_PROGRESS') &&
                            selectedRequest.current_step_role === step.role;
                          return (
                            <div
                              key={step.step_order}
                              className="flex flex-col gap-1 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] p-3 dark:border-zinc-800/70 dark:bg-zinc-900/40"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <StepperBadge step={step} isCurrent={isCurrent} />
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
                        onChange={(e) => setChecklistChecked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#C6D9D3] text-[#0F766E] focus:ring-[#0F766E]"
                      />
                      <span>
                        {role === 'DEPT_MANAGER'
                          ? 'Xác nhận đã kiểm tra bàn giao công việc và không ảnh hưởng deadline của team.'
                          : 'Xác nhận đã kiểm tra quy chế công ty, quỹ phép năm còn lại và lịch nghỉ trùng của bộ phận.'}
                      </span>
                    </label>
                  )}
                </div>

                <DialogFooter className="mt-0 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
                  <Button variant="outline" onClick={() => setSelectedRequest(null)}>
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
                  {role === 'SUPER_ADMIN' && (
                    <Button
                      variant="destructive"
                      className="border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
                      onClick={() => setDeleteTarget(selectedRequest)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      Xóa đơn
                    </Button>
                  )}
                  {canCancelModal && (
                    <Button
                      variant="destructive"
                      className="border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
                      onClick={() => setCancelTarget(selectedRequest)}
                    >
                      <Ban className="h-4 w-4" strokeWidth={1.5} />
                      Hủy đơn
                    </Button>
                  )}
                  {canApproveModal && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => openRejectModal(selectedRequest)}
                      >
                        <X className="h-4 w-4 text-red-600 dark:text-red-400" strokeWidth={1.5} />
                        Từ chối
                      </Button>
                      <Button
                        variant="primary"
                        disabled={needsChecklist && !checklistChecked}
                        onClick={() => handleApproveStep(selectedRequest)}
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

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReasonInput('');
            setRejectError('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận từ chối đơn {rejectTarget?.request_code}</DialogTitle>
            <DialogDescription>
              Vui lòng nhập lý do từ chối để thông báo tới {rejectTarget?.full_name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmReject} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="reject-reason-input"
                className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Lý do từ chối (bắt buộc)
              </label>
              <textarea
                id="reject-reason-input"
                rows={3}
                value={rejectReasonInput}
                onChange={(e) => {
                  setRejectReasonInput(e.target.value);
                  if (rejectError) setRejectError('');
                }}
                placeholder="Ví dụ: Trùng lịch triển khai dự án hoặc vượt định mức phép năm..."
                className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] transition-colors placeholder:text-[#5C7871] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-teal-400 dark:focus-visible:ring-teal-400/20"
              />
            </div>
            {rejectError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                {rejectError}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setRejectTarget(null)}
              >
                Quay lại
              </Button>
              <Button variant="destructive" type="submit">
                Xác nhận từ chối
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận hủy đơn</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn hủy đơn{' '}
              <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                {cancelTarget?.request_code}
              </span>{' '}
              này không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setCancelTarget(null)}>
              Giữ lại
            </Button>
            <Button
              variant="destructive"
              type="button"
              className="border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
              onClick={handleConfirmCancel}
            >
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa đơn từ</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa vĩnh viễn đơn{' '}
              <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                {deleteTarget?.request_code}
              </span>{' '}
              của {deleteTarget?.full_name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              type="button"
              className="border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
              onClick={handleConfirmDeleteRequest}
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RequestsView;
