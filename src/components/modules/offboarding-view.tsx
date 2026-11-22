'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  FilePlus2,
  FileText,
  KeyRound,
  Laptop,
  Lock,
  PackageCheck,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  ROLE_DEFAULT_PROFILES,
  useApp,
} from '@/context/app-context';
import {
  HRM_RUNTIME_EVENT,
  addHandoverItem,
  approveHandoverByManager,
  approveResignation,
  assignHandoverReceiver,
  calculateResignationNotice,
  checkClearance100Percent,
  confirmHandoverByReceiver,
  confirmHandoverBySender,
  executeFinalSettlement,
  executeManagerSuccessorReassign,
  getAllRuntimeEmployees,
  getClearanceChecklists,
  getContracts,
  getHandoverItems,
  getLeaveBalances,
  getManagerOffboardingDependencies,
  getMonthlyAttendances,
  getPayrollRecords,
  getResignations,
  getSystemUsers,
  reconcileClearanceAsset,
  rejectResignation,
  signOffClearanceDept,
  submitResignation,
} from '@/lib/runtime-store';
import {
  alertSwal,
  confirmSwal,
  escapeSwalHtml,
  promptTextSwal,
} from '@/lib/swal';
import { cn, formatDateVN, formatVND } from '@/lib/utils';
import {
  MOCK_PAYROLL_FORMULA,
  calculateProgressivePitVnd,
} from '@/mock/payroll';
import type {
  AssetConditionStatus,
  ClearanceAssetItem,
  ClearanceChecklist,
  ContractType,
  Employee,
  HandoverItem,
  HandoverItemCategory,
  PayrollRecord,
  ResignationReasonCategory,
  ResignationRequest,
  ResignationStatus,
} from '@/mock/types';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

const CONTRACT_TYPE_META: Record<
  ContractType,
  { label: string; shortLabel: string; legalNoticeDays: number; badgeVariant: BadgeVariant }
> = {
  PROBATION_2M: {
    label: 'HĐ Thử việc (02 tháng)',
    shortLabel: 'Thử việc 2T',
    legalNoticeDays: 3,
    badgeVariant: 'warning',
  },
  FIXED_TERM_12M: {
    label: 'HĐ Xác định thời hạn (12 tháng)',
    shortLabel: 'HĐ XĐTH 12T',
    legalNoticeDays: 30,
    badgeVariant: 'info',
  },
  FIXED_TERM_24M: {
    label: 'HĐ Xác định thời hạn (24 tháng)',
    shortLabel: 'HĐ XĐTH 24T',
    legalNoticeDays: 30,
    badgeVariant: 'info',
  },
  INDEFINITE_TERM: {
    label: 'HĐ Không xác định thời hạn',
    shortLabel: 'HĐ Không TH',
    legalNoticeDays: 45,
    badgeVariant: 'teal',
  },
  ADDENDUM: {
    label: 'Phụ lục Hợp đồng',
    shortLabel: 'Phụ lục HĐ',
    legalNoticeDays: 30,
    badgeVariant: 'secondary',
  },
};

const RESIGNATION_STATUS_META: Record<
  ResignationStatus,
  { label: string; shortLabel: string; variant: BadgeVariant }
> = {
  PENDING_MANAGER: {
    label: 'Chờ Quản lý / HR duyệt',
    shortLabel: 'Chờ duyệt',
    variant: 'warning',
  },
  PENDING_HR: {
    label: 'Chờ HR xác nhận',
    shortLabel: 'Chờ HR duyệt',
    variant: 'warning',
  },
  APPROVED: {
    label: 'Đã duyệt đơn',
    shortLabel: 'Đã duyệt',
    variant: 'teal',
  },
  NOTICE_PERIOD: {
    label: 'Đang báo trước (Bàn giao)',
    shortLabel: 'Đang báo trước',
    variant: 'info',
  },
  CLEARANCE_IN_PROGRESS: {
    label: 'Đang thu hồi & Thanh lý',
    shortLabel: 'Đang thu hồi',
    variant: 'info',
  },
  READY_FOR_SETTLEMENT: {
    label: 'Đủ 100% · Chờ quyết toán',
    shortLabel: 'Chờ quyết toán',
    variant: 'teal',
  },
  COMPLETED: {
    label: 'Đã quyết toán & Khóa TK',
    shortLabel: 'Đã tất toán',
    variant: 'success',
  },
  REJECTED: {
    label: 'Đã từ chối / Giữ chân',
    shortLabel: 'Đã từ chối',
    variant: 'destructive',
  },
  CANCELLED: {
    label: 'Đã hủy đơn',
    shortLabel: 'Đã hủy',
    variant: 'muted',
  },
};

const REASON_CATEGORY_OPTIONS: Array<{
  value: ResignationReasonCategory;
  label: string;
}> = [
  { value: 'CAREER_GROWTH', label: 'Định hướng phát triển nghề nghiệp / Học tập' },
  { value: 'COMPENSATION', label: 'Chế độ đãi ngộ & Phúc lợi' },
  { value: 'RELOCATION', label: 'Thay đổi nơi cư trú / Chuyển công tác xa' },
  { value: 'HEALTH_FAMILY', label: 'Lý do sức khỏe hoặc việc gia đình' },
  { value: 'CONTRACT_END', label: 'Hết hạn hợp đồng lao động, không gia hạn' },
  { value: 'PROBATION_END', label: 'Dừng hợp đồng trong giai đoạn thử việc' },
  { value: 'OTHER', label: 'Lý do cá nhân khác' },
];

const REASON_CATEGORY_LABEL: Record<ResignationReasonCategory, string> = {
  CAREER_GROWTH: 'Phát triển nghề nghiệp / Học tập',
  COMPENSATION: 'Đãi ngộ & Thu nhập',
  RELOCATION: 'Thay đổi nơi sinh sống',
  HEALTH_FAMILY: 'Sức khỏe / Gia đình',
  CONTRACT_END: 'Kết thúc thời hạn HĐLĐ',
  PROBATION_END: 'Dừng thử việc',
  OTHER: 'Lý do khác',
};

const HANDOVER_CATEGORY_OPTIONS: Array<{
  value: HandoverItemCategory;
  label: string;
}> = [
  { value: 'PROJECT', label: 'Đầu việc / Dự án đang triển khai' },
  { value: 'DOCUMENT', label: 'Tài liệu nghiệp vụ & Mã nguồn (Source code)' },
  { value: 'SYSTEM_ACCESS', label: 'Tài khoản hệ thống / Quyền quản trị dịch vụ' },
  { value: 'CLIENT_ACCOUNT', label: 'Danh mục khách hàng / Đối tác phụ trách' },
  { value: 'MANAGEMENT_DUTY', label: 'Trách nhiệm điều hành & Nhân sự cấp dưới' },
];

const HANDOVER_CATEGORY_LABEL: Record<HandoverItemCategory, string> = {
  PROJECT: 'Dự án / Đầu việc',
  DOCUMENT: 'Tài liệu / Source code',
  SYSTEM_ACCESS: 'Tài khoản dịch vụ',
  CLIENT_ACCOUNT: 'Khách hàng / Đối tác',
  MANAGEMENT_DUTY: 'Điều hành quản lý',
};

const ASSET_CONDITION_OPTIONS: Array<{
  value: AssetConditionStatus;
  label: string;
}> = [
  { value: 'GOOD', label: 'Tốt / Nguyên vẹn (GOOD)' },
  { value: 'FAIR', label: 'Hao mòn tự nhiên (FAIR)' },
  { value: 'DAMAGED', label: 'Hư hỏng - Đền bù (DAMAGED)' },
  { value: 'LOST', label: 'Làm mất thiết bị - Đền bù (LOST)' },
];

const TECH_SCOPE_SET = new Set([
  'dept-tech',
  'dept-tech-swe',
  'dept-tech-data',
  'dept-data',
  'Khối Công nghệ',
  'Phòng Kỹ thuật Phần mềm',
  'Phòng Dữ liệu & AI',
]);

function normalizeSearchVN(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function addDaysIsoLocal(dateIso: string, days: number): string {
  const parts = dateIso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date().toISOString().slice(0, 10);
  }
  const utc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return utc.toISOString().slice(0, 10);
}

function countWeekdaysInMonthUpTo(lastDayIso: string): number {
  const parts = lastDayIso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 15;
  const [year, month, endDay] = parts;
  let count = 0;
  for (let d = 1; d <= endDay; d += 1) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return Math.max(1, count);
}

interface AssetDraftRow {
  returnedDate: string;
  condition: AssetConditionStatus;
  penaltyVnd: string;
  note: string;
}

export function OffboardingView() {
  const {
    role,
    currentUserEmail,
    currentUserProfile,
    navIntent,
    clearNavIntent,
    showToast,
  } = useApp();

  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [resignations, setResignations] = useState<ResignationRequest[]>([]);
  const [allHandovers, setAllHandovers] = useState<HandoverItem[]>([]);
  const [allClearances, setAllClearances] = useState<ClearanceChecklist[]>([]);
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedResignationId, setSelectedResignationId] = useState<string>('');
  const [detailTab, setDetailTab] = useState<string>('overview');

  // Create Resignation Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formEmployeeId, setFormEmployeeId] = useState<string>('');
  const [formSubmittedDate, setFormSubmittedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [formDesiredLastDay, setFormDesiredLastDay] = useState<string>('');
  const [formReasonCategory, setFormReasonCategory] =
    useState<ResignationReasonCategory>('CAREER_GROWTH');
  const [formReason, setFormReason] = useState<string>('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Approval Form State (Tab 1)
  const [approveLastDayInput, setApproveLastDayInput] = useState<string>('');
  const [waiveShortfallInput, setWaiveShortfallInput] = useState<boolean>(false);
  const [exitInterviewInput, setExitInterviewInput] = useState<string>('');

  // Handover Form Modal & Manager Successor State (Tab 2)
  const [addHandoverModalOpen, setAddHandoverModalOpen] = useState(false);
  const [hoCategory, setHoCategory] = useState<HandoverItemCategory>('PROJECT');
  const [hoTitle, setHoTitle] = useState('');
  const [hoDescription, setHoDescription] = useState('');
  const [hoDocLinkNote, setHoDocLinkNote] = useState('');
  const [hoReceiverId, setHoReceiverId] = useState('');
  const [successorEmpId, setSuccessorEmpId] = useState('');

  // Clearance Draft State (Tab 3)
  const [assetDrafts, setAssetDrafts] = useState<Record<string, AssetDraftRow>>({});
  const [itNoteInput, setItNoteInput] = useState('');
  const [advanceVndInput, setAdvanceVndInput] = useState('0');
  const [accountingNoteInput, setAccountingNoteInput] = useState('');
  const [hrNoteInput, setHrNoteInput] = useState('');

  // Final Settlement State (Tab 4)
  const [isRehireable, setIsRehireable] = useState<boolean>(true);
  const [rehireNote, setRehireNote] = useState<string>('');

  const syncAllRuntime = useCallback(() => {
    setEmployees(getAllRuntimeEmployees());
    setResignations(getResignations());
    setAllHandovers(getHandoverItems());
    setAllClearances(getClearanceChecklists());
    setPayrolls(getPayrollRecords());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    syncAllRuntime();
    window.addEventListener(HRM_RUNTIME_EVENT, syncAllRuntime);
    window.addEventListener('storage', syncAllRuntime);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncAllRuntime);
      window.removeEventListener('storage', syncAllRuntime);
    };
  }, [syncAllRuntime]);

  // Resolve current logged-in actor
  const actorEmployee = useMemo(() => {
    const defaultProfile = ROLE_DEFAULT_PROFILES[role];
    const codeHint = currentUserProfile?.employee_code || defaultProfile?.employee_code;
    const emailHint = (currentUserEmail || defaultProfile?.email || '').toLowerCase();
    const localHint = emailHint.includes('@') ? emailHint.split('@')[0] : '';

    return (
      employees.find(
        (e) =>
          (codeHint && e.employee_code === codeHint) ||
          (emailHint && e.email.toLowerCase() === emailHint) ||
          (localHint && e.email.split('@')[0].toLowerCase() === localHint)
      ) ?? null
    );
  }, [employees, role, currentUserProfile, currentUserEmail]);

  const actorName =
    actorEmployee?.full_name ||
    currentUserProfile?.fullName ||
    ROLE_DEFAULT_PROFILES[role]?.fullName ||
    'Cán bộ điều hành';

  const canManageAll =
    role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'DIRECTOR';
  const canApproveResignation =
    canManageAll || role === 'DEPT_MANAGER';

  // Role-scoped resignations (EMPLOYEE sees own resignations + resignations where they are handover receiver)
  const scopedResignations = useMemo(() => {
    if (canManageAll) return resignations;

    if (role === 'DEPT_MANAGER') {
      const deptKey =
        actorEmployee?.department_id ||
        currentUserProfile?.department_id ||
        currentUserProfile?.department ||
        'dept-tech';
      const inTech = TECH_SCOPE_SET.has(deptKey);

      return resignations.filter((r) => {
        if (actorEmployee && r.employee_id === actorEmployee.id) return true;
        const isReceiver = allHandovers.some(
          (h) =>
            h.resignation_id === r.id &&
            actorEmployee &&
            (h.receiver_employee_id === actorEmployee.id ||
              h.receiver_employee_code === actorEmployee.employee_code)
        );
        if (isReceiver) return true;
        if (inTech) {
          return (
            TECH_SCOPE_SET.has(r.department_id) ||
            TECH_SCOPE_SET.has(r.department_name)
          );
        }
        return (
          r.department_id === deptKey ||
          r.department_name === (actorEmployee?.department_name || currentUserProfile?.department)
        );
      });
    }

    // EMPLOYEE
    return resignations.filter((r) => {
      if (
        actorEmployee &&
        (r.employee_id === actorEmployee.id ||
          r.employee_code === actorEmployee.employee_code)
      ) {
        return true;
      }
      return allHandovers.some(
        (h) =>
          h.resignation_id === r.id &&
          actorEmployee &&
          (h.receiver_employee_id === actorEmployee.id ||
            h.receiver_employee_code === actorEmployee.employee_code)
      );
    });
  }, [
    resignations,
    allHandovers,
    canManageAll,
    role,
    actorEmployee,
    currentUserProfile,
  ]);

  // Pending receiver handovers assigned to current actor
  const myPendingReceiverHandovers = useMemo(() => {
    if (!actorEmployee) return [];
    return allHandovers.filter(
      (h) =>
        !h.receiver_confirmed &&
        (h.receiver_employee_id === actorEmployee.id ||
          h.receiver_employee_code === actorEmployee.employee_code)
    );
  }, [allHandovers, actorEmployee]);

  // Eligible employees for creating a resignation
  const eligibleEmployeesForResignation = useMemo(() => {
    const nonResigned = employees.filter((e) => e.employment_status !== 'RESIGNED');
    if (role === 'EMPLOYEE') {
      return actorEmployee ? [actorEmployee] : nonResigned.slice(0, 1);
    }
    if (role === 'DEPT_MANAGER' && actorEmployee) {
      const deptKey = actorEmployee.department_id;
      const inTech = TECH_SCOPE_SET.has(deptKey);
      return nonResigned.filter((e) =>
        inTech
          ? TECH_SCOPE_SET.has(e.department_id)
          : e.department_id === deptKey || e.manager_id === actorEmployee.id || e.id === actorEmployee.id
      );
    }
    return nonResigned;
  }, [employees, role, actorEmployee]);

  // Open Create Modal helper
  const openCreateResignationModal = useCallback(
    (preselectedEmpId?: string) => {
      const targetEmp =
        (preselectedEmpId
          ? employees.find(
              (e) => e.id === preselectedEmpId || e.employee_code === preselectedEmpId
            )
          : null) ??
        (role === 'EMPLOYEE' ? actorEmployee : eligibleEmployeesForResignation[0]) ??
        null;

      const todayIso = new Date().toISOString().slice(0, 10);
      setFormSubmittedDate(todayIso);

      if (targetEmp) {
        setFormEmployeeId(targetEmp.id);
        const activeContract = getContracts().find(
          (c) =>
            (c.employee_id === targetEmp.id ||
              c.employee_code === targetEmp.employee_code) &&
            !c.is_addendum &&
            c.status !== 'EXPIRED'
        );
        const cType = activeContract?.contract_type ?? targetEmp.contract_type;
        const minDays = CONTRACT_TYPE_META[cType]?.legalNoticeDays ?? 30;
        setFormDesiredLastDay(addDaysIsoLocal(todayIso, minDays));
      } else {
        setFormEmployeeId('');
        setFormDesiredLastDay(addDaysIsoLocal(todayIso, 30));
      }

      setFormReasonCategory('CAREER_GROWTH');
      setFormReason('');
      setCreateModalOpen(true);
    },
    [employees, role, actorEmployee, eligibleEmployeesForResignation]
  );

  // Handle cross-module navIntent (e.g. from Core HR "Khởi tạo nghỉ việc" or Notification)
  useEffect(() => {
    if (!navIntent || isLoading) return;
    if (navIntent.navId !== 'offboarding') return;

    const targetId = navIntent.entityId;
    if (navIntent.subTab) {
      setDetailTab(navIntent.subTab);
    }

    if (targetId) {
      const matchedRes = resignations.find(
        (r) =>
          r.id === targetId ||
          r.resignation_code === targetId ||
          ((r.employee_id === targetId || r.employee_code === targetId) &&
            r.status !== 'REJECTED' &&
            r.status !== 'CANCELLED')
      );

      if (matchedRes) {
        setSelectedResignationId(matchedRes.id);
      } else {
        const matchedEmp = employees.find(
          (e) => e.id === targetId || e.employee_code === targetId
        );
        if (matchedEmp && matchedEmp.employment_status !== 'RESIGNED') {
          openCreateResignationModal(matchedEmp.id);
        }
      }
    }

    clearNavIntent();
  }, [
    navIntent,
    isLoading,
    resignations,
    employees,
    clearNavIntent,
    openCreateResignationModal,
  ]);

  // Filtered resignations list
  const filteredResignations = useMemo(() => {
    const q = normalizeSearchVN(searchQuery);
    return scopedResignations.filter((r) => {
      const matchesStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'PENDING'
            ? r.status === 'PENDING_MANAGER' || r.status === 'PENDING_HR'
            : statusFilter === 'ACTIVE_NOTICE'
              ? r.status === 'NOTICE_PERIOD' ||
                r.status === 'APPROVED' ||
                r.status === 'CLEARANCE_IN_PROGRESS' ||
                r.status === 'READY_FOR_SETTLEMENT'
              : r.status === statusFilter;

      const matchesQuery =
        !q ||
        normalizeSearchVN(r.full_name).includes(q) ||
        normalizeSearchVN(r.employee_code).includes(q) ||
        normalizeSearchVN(r.resignation_code).includes(q) ||
        normalizeSearchVN(r.department_name).includes(q);

      return matchesStatus && matchesQuery;
    });
  }, [scopedResignations, statusFilter, searchQuery]);

  // Keep selectedResignationId valid
  useEffect(() => {
    if (filteredResignations.length === 0) {
      if (scopedResignations.length === 0) setSelectedResignationId('');
      return;
    }
    const stillExists = scopedResignations.some(
      (r) => r.id === selectedResignationId
    );
    if (!selectedResignationId || !stillExists) {
      setSelectedResignationId(filteredResignations[0].id);
    }
  }, [filteredResignations, scopedResignations, selectedResignationId]);

  const selectedResignation = useMemo(
    () =>
      scopedResignations.find((r) => r.id === selectedResignationId) ??
      filteredResignations[0] ??
      null,
    [scopedResignations, filteredResignations, selectedResignationId]
  );

  // Sync approval & clearance & settlement inputs when selectedResignation changes
  useEffect(() => {
    if (!selectedResignation) return;
    const defaultLastDay =
      selectedResignation.approved_last_day ||
      (selectedResignation.desired_last_day >=
      selectedResignation.earliest_legal_last_day
        ? selectedResignation.desired_last_day
        : selectedResignation.earliest_legal_last_day);

    setApproveLastDayInput(defaultLastDay);
    setWaiveShortfallInput(Boolean(selectedResignation.waive_notice_shortfall));
    setExitInterviewInput(selectedResignation.exit_interview_note ?? '');
    setSuccessorEmpId(selectedResignation.successor_employee_id ?? '');
    setIsRehireable(selectedResignation.is_rehireable ?? true);
    setRehireNote(selectedResignation.rehire_note ?? '');

    const clr = allClearances.find(
      (c) => c.resignation_id === selectedResignation.id
    );
    if (clr) {
      setItNoteInput(clr.it_note ?? '');
      setAdvanceVndInput(String(clr.advance_deduction_vnd ?? 0));
      setAccountingNoteInput(clr.accounting_note ?? '');
      setHrNoteInput(clr.hr_note ?? '');

      const todayIso = new Date().toISOString().slice(0, 10);
      const nextDrafts: Record<string, AssetDraftRow> = {};
      for (const ast of clr.assets) {
        nextDrafts[ast.asset_id] = {
          returnedDate: ast.returned_date || todayIso,
          condition: (ast.return_condition as AssetConditionStatus) || 'GOOD',
          penaltyVnd: String(ast.penalty_amount_vnd ?? 0),
          note: ast.condition_note ?? '',
        };
      }
      setAssetDrafts(nextDrafts);
    }
  }, [selectedResignation, allClearances]);

  // KPI Strip Metrics
  const kpiStats = useMemo(() => {
    const pendingApprovalCount = scopedResignations.filter(
      (r) => r.status === 'PENDING_MANAGER' || r.status === 'PENDING_HR'
    ).length;

    const noticePeriodCount = canManageAll
      ? employees.filter((e) => e.employment_status === 'NOTICE_PERIOD').length ||
        scopedResignations.filter((r) => r.status === 'NOTICE_PERIOD').length
      : scopedResignations.filter((r) => r.status === 'NOTICE_PERIOD').length;

    const openHandovers = allHandovers.filter(
      (h) => h.status !== 'COMPLETED'
    ).length;
    const openAssets = allClearances.reduce(
      (sum, cl) =>
        sum +
        cl.assets.filter((a) => !a.returned && a.return_condition !== 'LOST')
          .length,
      0
    );

    const resignedSettledCount = canManageAll
      ? employees.filter((e) => e.employment_status === 'RESIGNED').length
      : scopedResignations.filter((r) => r.status === 'COMPLETED').length;

    return {
      pendingApprovalCount,
      noticePeriodCount,
      inFlightItemsCount: openHandovers + openAssets,
      resignedSettledCount,
    };
  }, [scopedResignations, employees, allHandovers, allClearances, canManageAll]);

  // Selected resignation sub-entities
  const selectedHandovers = useMemo(() => {
    if (!selectedResignation) return [];
    return allHandovers.filter((h) => h.resignation_id === selectedResignation.id);
  }, [allHandovers, selectedResignation]);

  const selectedClearance = useMemo(() => {
    if (!selectedResignation) return null;
    return (
      allClearances.find((c) => c.resignation_id === selectedResignation.id) ??
      null
    );
  }, [allClearances, selectedResignation]);

  const managerDependency = useMemo(() => {
    if (!selectedResignation) return null;
    return getManagerOffboardingDependencies(selectedResignation.employee_id);
  }, [selectedResignation, employees, resignations]);

  const clearanceGate = useMemo(() => {
    if (!selectedResignation) return null;
    if (
      selectedResignation.status === 'PENDING_MANAGER' ||
      selectedResignation.status === 'PENDING_HR' ||
      selectedResignation.status === 'REJECTED' ||
      selectedResignation.status === 'CANCELLED'
    ) {
      return null;
    }
    return checkClearance100Percent(selectedResignation.id);
  }, [selectedResignation, allHandovers, allClearances, employees]);

  // Live Notice Calculation inside Create Modal
  const selectedFormEmployee = useMemo(
    () => employees.find((e) => e.id === formEmployeeId) ?? null,
    [employees, formEmployeeId]
  );

  const selectedFormContractType: ContractType = useMemo(() => {
    if (!selectedFormEmployee) return 'FIXED_TERM_12M';
    const activeContract = getContracts().find(
      (c) =>
        (c.employee_id === selectedFormEmployee.id ||
          c.employee_code === selectedFormEmployee.employee_code) &&
        !c.is_addendum &&
        c.status !== 'EXPIRED'
    );
    return activeContract?.contract_type ?? selectedFormEmployee.contract_type;
  }, [selectedFormEmployee]);

  const liveNoticeCalculation = useMemo(() => {
    if (!formSubmittedDate || !formDesiredLastDay) return null;
    return calculateResignationNotice({
      contractType: selectedFormContractType,
      submittedDate: formSubmittedDate,
      desiredLastDay: formDesiredLastDay,
    });
  }, [selectedFormContractType, formSubmittedDate, formDesiredLastDay]);

  // Live Final Settlement Preview Calculation (Tab 4)
  const settlementPreview = useMemo(() => {
    if (!selectedResignation) return null;
    const emp = employees.find(
      (e) =>
        e.id === selectedResignation.employee_id ||
        e.employee_code === selectedResignation.employee_code
    );
    if (!emp) return null;

    // If already settled, locate saved final payslip
    const existingFinalPayslip = selectedResignation.final_payslip_id
      ? payrolls.find((p) => p.id === selectedResignation.final_payslip_id) ??
        payrolls.find(
          (p) => p.employee_id === emp.id && p.is_final_settlement
        ) ??
        null
      : null;

    const systemUser =
      getSystemUsers().find(
        (u) =>
          u.employee_code === emp.employee_code ||
          u.email.toLowerCase() === emp.email.toLowerCase()
      ) ?? null;

    const approvedLastDay =
      selectedResignation.approved_last_day ||
      selectedResignation.earliest_legal_last_day;
    const periodMonth = approvedLastDay.slice(0, 7);
    const yearNum = Number.parseInt(approvedLastDay.slice(0, 4), 10) || 2026;

    const att = getMonthlyAttendances(periodMonth).find(
      (m) => m.employee_code === emp.employee_code || m.employee_id === emp.id
    );
    const standardDays =
      att?.standard_work_days ?? MOCK_PAYROLL_FORMULA.standard_work_days_per_month;
    const actualPaidDays = att
      ? Math.min(
          standardDays,
          Math.max(1, att.actual_work_days + att.paid_leave_days)
        )
      : Math.min(standardDays, countWeekdaysInMonthUpTo(approvedLastDay));

    const leaveBal = getLeaveBalances(yearNum).find(
      (b) => b.employee_id === emp.id || b.employee_code === emp.employee_code
    );
    const unusedLeaveDays =
      existingFinalPayslip?.unused_leave_days ??
      Math.max(0, leaveBal?.remaining_days ?? 0);
    const dailyWage = Math.round(emp.base_salary_vnd / standardDays);
    const unusedLeavePayoutVnd =
      existingFinalPayslip?.unused_leave_payout_vnd ??
      Math.round(unusedLeaveDays * (emp.base_salary_vnd / standardDays));

    const proratedBaseVnd =
      existingFinalPayslip?.prorated_base_salary_vnd ??
      Math.round((emp.base_salary_vnd * actualPaidDays) / standardDays);
    const allowanceRatio = actualPaidDays / standardDays;
    const allowancesVnd = existingFinalPayslip
      ? existingFinalPayslip.allowance_meal_vnd +
        existingFinalPayslip.allowance_transport_vnd +
        existingFinalPayslip.allowance_position_vnd
      : Math.round(
          (emp.allowance_meal_vnd +
            emp.allowance_transport_vnd +
            emp.allowance_position_vnd) *
            allowanceRatio
        );
    const otPayVnd = existingFinalPayslip?.overtime_pay_vnd ?? 0;

    const grossSalaryVnd =
      existingFinalPayslip?.gross_salary_vnd ??
      proratedBaseVnd + allowancesVnd + otPayVnd + unusedLeavePayoutVnd;

    const isProbation =
      selectedResignation.contract_type === 'PROBATION_2M' ||
      emp.employment_status === 'PROBATION';
    const unpaidDays = Math.max(0, standardDays - actualPaidDays);
    const insuranceBaseVnd =
      isProbation || unpaidDays >= 14
        ? 0
        : Math.min(
            emp.base_salary_vnd,
            MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd
          );
    const totalInsuranceVnd =
      existingFinalPayslip?.total_insurance_employee_vnd ??
      Math.round(
        insuranceBaseVnd * MOCK_PAYROLL_FORMULA.total_insurance_employee_rate
      );

    const personalDeduction = MOCK_PAYROLL_FORMULA.personal_deduction_vnd;
    const dependentDeduction =
      emp.dependents_count * MOCK_PAYROLL_FORMULA.dependent_deduction_vnd;
    const taxableIncomeVnd = Math.max(
      0,
      grossSalaryVnd - totalInsuranceVnd - personalDeduction - dependentDeduction
    );
    const pitTaxVnd =
      existingFinalPayslip?.pit_tax_vnd ??
      calculateProgressivePitVnd(taxableIncomeVnd);

    const penaltyDeductionVnd =
      existingFinalPayslip?.penalty_deduction_vnd ??
      selectedClearance?.total_penalty_vnd ??
      0;
    const advanceDeductionVnd =
      existingFinalPayslip?.advance_deduction_vnd ??
      selectedClearance?.advance_deduction_vnd ??
      0;

    const netSalaryVnd =
      existingFinalPayslip?.net_salary_vnd ??
      Math.max(
        0,
        grossSalaryVnd -
          totalInsuranceVnd -
          pitTaxVnd -
          penaltyDeductionVnd -
          advanceDeductionVnd
      );

    return {
      employee: emp,
      systemUser,
      existingFinalPayslip,
      approvedLastDay,
      periodMonth,
      standardDays,
      actualPaidDays: existingFinalPayslip?.actual_paid_days ?? actualPaidDays,
      proratedWorkPayVnd: proratedBaseVnd + allowancesVnd + otPayVnd,
      unusedLeaveDays,
      dailyWage,
      unusedLeavePayoutVnd,
      grossSalaryVnd,
      totalInsuranceVnd,
      pitTaxVnd,
      penaltyDeductionVnd,
      advanceDeductionVnd,
      netSalaryVnd,
    };
  }, [selectedResignation, employees, payrolls, selectedClearance]);

  // Handlers
  const handleSelectEmployeeInForm = (empId: string) => {
    setFormEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const activeContract = getContracts().find(
      (c) =>
        (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
        !c.is_addendum &&
        c.status !== 'EXPIRED'
    );
    const cType = activeContract?.contract_type ?? emp.contract_type;
    const minDays = CONTRACT_TYPE_META[cType]?.legalNoticeDays ?? 30;
    setFormDesiredLastDay(addDaysIsoLocal(formSubmittedDate, minDays));
  };

  const handleSubmitResignationForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmployeeId || !formDesiredLastDay || !formReason.trim()) {
      await alertSwal({
        title: 'Thiếu thông tin bắt buộc',
        text: 'Vui lòng chọn nhân sự, ngày làm việc cuối cùng mong muốn và nhập lý do xin thôi việc.',
        icon: 'warning',
      });
      return;
    }

    if (liveNoticeCalculation && !liveNoticeCalculation.meets_legal_notice) {
      const proceedShort = await confirmSwal({
        title: 'Cảnh báo chưa đủ thời hạn báo trước',
        html: `Loại hợp đồng hiện tại yêu cầu báo trước tối thiểu <b>${escapeSwalHtml(liveNoticeCalculation.minimum_notice_days)} ngày</b> (ngày hợp pháp sớm nhất: <b>${escapeSwalHtml(formatDateVN(liveNoticeCalculation.earliest_legal_last_day))}</b>).<br/><br/>Ngày mong muốn hiện đang sớm hơn quy định <b>${escapeSwalHtml(liveNoticeCalculation.notice_shortfall_days)} ngày</b>. Bạn vẫn muốn gửi đơn để Quản lý & HR xem xét?`,
        confirmText: 'Vẫn gửi đơn thôi việc',
        cancelText: 'Chỉnh lại ngày nghỉ',
        variant: 'warning',
      });
      if (!proceedShort) return;
    } else {
      const confirmed = await confirmSwal({
        title: 'Xác nhận nộp đơn xin thôi việc',
        text: `Gửi đơn thôi việc với ngày làm việc cuối mong muốn ${formatDateVN(formDesiredLastDay)} lên Trưởng bộ phận và Phòng Nhân sự?`,
        confirmText: 'Gửi đơn thôi việc',
      });
      if (!confirmed) return;
    }

    setIsSubmittingCreate(true);
    try {
      const created = submitResignation({
        employeeId: formEmployeeId,
        submittedDate: formSubmittedDate,
        desiredLastDay: formDesiredLastDay,
        reasonCategory: formReasonCategory,
        reason: formReason,
        actorName,
      });
      syncAllRuntime();
      setSelectedResignationId(created.id);
      setDetailTab('overview');
      setCreateModalOpen(false);
      showToast(
        `Đã tạo đơn thôi việc ${created.resignation_code}`,
        `${created.full_name} (${created.employee_code}) · Chờ Quản lý & HR phê duyệt.`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Không thể tạo đơn thôi việc',
        text: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi lưu đơn.',
        icon: 'error',
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleApproveResignation = async (target: ResignationRequest) => {
    const chosenLastDay =
      target.id === selectedResignation?.id && approveLastDayInput
        ? approveLastDayInput
        : target.desired_last_day >= target.earliest_legal_last_day
          ? target.desired_last_day
          : target.earliest_legal_last_day;

    const confirmed = await confirmSwal({
      title: `Phê duyệt đơn thôi việc ${target.resignation_code}?`,
      html: `Nhân sự <b>${escapeSwalHtml(target.full_name)} (${escapeSwalHtml(target.employee_code)})</b> sẽ chuyển sang trạng thái <b>Đang báo trước (NOTICE_PERIOD)</b>.<br/>• Ngày làm việc cuối cùng được chốt: <b>${escapeSwalHtml(formatDateVN(chosenLastDay))}</b><br/>• Hệ thống tự động khởi tạo <b>Checklist Bàn giao 3 bên</b> và <b>Phiếu thu hồi tài sản / Clearance</b>.`,
      confirmText: 'Duyệt & Mở Bàn giao',
      variant: 'primary',
    });
    if (!confirmed) return;

    try {
      const approverRole =
        role === 'SUPER_ADMIN' ||
        role === 'DIRECTOR' ||
        role === 'HR_MANAGER' ||
        role === 'DEPT_MANAGER'
          ? role
          : 'HR_MANAGER';

      approveResignation({
        resignationId: target.id,
        approverRole,
        approverName: actorName,
        approvedLastDay: chosenLastDay,
        waiveNoticeShortfall: waiveShortfallInput,
        successorEmployeeId: successorEmpId || undefined,
        exitInterviewNote: exitInterviewInput.trim() || undefined,
      });
      syncAllRuntime();
      setSelectedResignationId(target.id);
      setDetailTab('handover');
      showToast(
        'Đã duyệt đơn & Mở quy trình Bàn giao',
        `${target.full_name} chuyển sang NOTICE_PERIOD đến ngày ${formatDateVN(chosenLastDay)}.`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Không thể phê duyệt đơn',
        text: err instanceof Error ? err.message : 'Lỗi phê duyệt đơn thôi việc.',
        icon: 'error',
      });
    }
  };

  const handleRejectResignation = async (target: ResignationRequest) => {
    const reason = await promptTextSwal({
      title: `Từ chối đơn thôi việc ${target.resignation_code}`,
      label: 'Lý do từ chối / Phương án giữ chân nhân sự (bắt buộc)',
      placeholder:
        'Ví dụ: Đã thống nhất điều chỉnh phụ cấp và lộ trình thăng tiến, nhân sự đồng ý rút đơn...',
      confirmText: 'Xác nhận từ chối',
      variant: 'danger',
    });
    if (reason === null) return;

    rejectResignation({
      resignationId: target.id,
      rejectorName: actorName,
      reason,
    });
    syncAllRuntime();
    showToast(
      `Đã từ chối đơn ${target.resignation_code}`,
      `Đã lưu lý do phản hồi cho ${target.full_name}.`,
      'warning'
    );
  };

  const handleExecuteManagerReassign = async () => {
    if (!selectedResignation || !successorEmpId) {
      await alertSwal({
        title: 'Chưa chọn Quản lý kế nhiệm',
        text: 'Vui lòng chọn một nhân sự kế nhiệm để nhận bàn giao đội ngũ trực thuộc và đơn từ chờ duyệt.',
        icon: 'warning',
      });
      return;
    }

    const successor = employees.find((e) => e.id === successorEmpId);
    const confirmed = await confirmSwal({
      title: 'Xác nhận chuyển giao Quản lý kế nhiệm',
      html: `Chuyển toàn bộ <b>${escapeSwalHtml(managerDependency?.subordinates.length ?? 0)} nhân sự trực thuộc</b> và <b>${escapeSwalHtml(managerDependency?.pending_requests.length ?? 0)} đơn từ đang chờ duyệt</b> của <b>${escapeSwalHtml(selectedResignation.full_name)}</b> sang cho <b>${escapeSwalHtml(successor?.full_name ?? successorEmpId)}</b>?`,
      confirmText: 'Chuyển giao ngay',
      variant: 'primary',
    });
    if (!confirmed) return;

    try {
      const res = executeManagerSuccessorReassign({
        resigningEmployeeId: selectedResignation.employee_id,
        successorEmployeeId: successorEmpId,
        resignationId: selectedResignation.id,
        actorName,
      });
      syncAllRuntime();
      showToast(
        'Đã chuyển giao Quản lý kế nhiệm thành công',
        `Bàn giao ${res.transferredSubordinatesCount} nhân sự & ${res.transferredRequestsCount} đơn chờ duyệt sang ${res.successor.full_name}.`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Lỗi chuyển giao kế nhiệm',
        text: err instanceof Error ? err.message : 'Không thể thực hiện chuyển giao.',
        icon: 'error',
      });
    }
  };

  const handleAddHandoverItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResignation || !hoTitle.trim()) return;

    addHandoverItem({
      resignationId: selectedResignation.id,
      employeeId: selectedResignation.employee_id,
      category: hoCategory,
      title: hoTitle.trim(),
      description: hoDescription.trim(),
      receiverEmployeeId: hoReceiverId || null,
      note: hoDocLinkNote.trim() || undefined,
    });
    syncAllRuntime();
    setHoTitle('');
    setHoDescription('');
    setHoDocLinkNote('');
    setHoReceiverId('');
    setAddHandoverModalOpen(false);
    showToast(
      'Đã thêm hạng mục bàn giao mới',
      'Hạng mục đã được đưa vào danh sách xác nhận 3 bên.',
      'success'
    );
  };

  const handleAssignReceiver = (itemId: string, receiverId: string) => {
    if (!receiverId) return;
    try {
      const updated = assignHandoverReceiver({
        handoverItemId: itemId,
        receiverEmployeeId: receiverId,
        senderConfirmed: true,
        actorName,
      });
      syncAllRuntime();
      if (updated?.receiver_name) {
        showToast(
          'Đã phân công người nhận bàn giao',
          `Đã gán "${updated.title}" cho ${updated.receiver_name}.`,
          'success'
        );
      }
    } catch (err) {
      void alertSwal({
        title: 'Không thể gán người nhận',
        text: err instanceof Error ? err.message : 'Lỗi phân công người nhận.',
        icon: 'error',
      });
    }
  };

  const handleReceiverConfirm = async (item: HandoverItem) => {
    if (!item.receiver_employee_id) {
      await alertSwal({
        title: 'Chưa chỉ định người nhận',
        text: 'Quản lý hoặc người bàn giao cần chọn đồng nghiệp tiếp nhận trước khi xác nhận.',
        icon: 'warning',
      });
      return;
    }

    const confirmed = await confirmSwal({
      title: 'Xác nhận đã nhận bàn giao công việc',
      html: `Xác nhận đồng nghiệp <b>${escapeSwalHtml(item.receiver_name)}</b> đã tiếp nhận đầy đủ tài liệu, mã nguồn và tiến độ của hạng mục:<br/><b>"${escapeSwalHtml(item.title)}"</b>?`,
      confirmText: 'Xác nhận đã nhận bàn giao',
    });
    if (!confirmed) return;

    try {
      confirmHandoverByReceiver({
        handoverItemId: item.id,
        receiverName: item.receiver_name || actorName,
      });
      syncAllRuntime();
      showToast(
        'Người nhận đã xác nhận tiếp nhận',
        `Hạng mục "${item.title}" chuyển sang chờ Quản lý nghiệm thu.`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Lỗi xác nhận tiếp nhận',
        text: err instanceof Error ? err.message : 'Không thể xác nhận.',
        icon: 'error',
      });
    }
  };

  const handleManagerApproveHandover = async (item: HandoverItem) => {
    const confirmed = await confirmSwal({
      title: 'Duyệt hoàn tất bàn giao chuyên môn (3 bên)',
      html: `Nghiệm thu hoàn tất bàn giao 3 bên giữa <b>${escapeSwalHtml(item.employee_name)}</b> và <b>${escapeSwalHtml(item.receiver_name)}</b> cho hạng mục:<br/><b>"${escapeSwalHtml(item.title)}"</b>?`,
      confirmText: 'Duyệt hoàn tất bàn giao',
    });
    if (!confirmed) return;

    try {
      approveHandoverByManager({
        handoverItemId: item.id,
        managerName: actorName,
      });
      syncAllRuntime();
      showToast(
        'Đã duyệt hoàn tất bàn giao 3 bên',
        `Hạng mục "${item.title}" đã đạt trạng thái COMPLETED.`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Chưa đủ điều kiện nghiệm thu',
        text: err instanceof Error ? err.message : 'Người nhận cần xác nhận trước.',
        icon: 'error',
      });
    }
  };

  const handleUpdateAssetDraft = (
    asset: ClearanceAssetItem,
    patch: Partial<AssetDraftRow>
  ) => {
    setAssetDrafts((prev) => {
      const current = prev[asset.asset_id] ?? {
        returnedDate: new Date().toISOString().slice(0, 10),
        condition: 'GOOD',
        penaltyVnd: '0',
        note: '',
      };
      const merged = { ...current, ...patch };

      // Auto-suggest penalty when condition changes
      if (patch.condition) {
        if (patch.condition === 'GOOD' || patch.condition === 'FAIR') {
          merged.penaltyVnd = '0';
        } else if (
          patch.condition === 'DAMAGED' &&
          (current.penaltyVnd === '0' || !current.penaltyVnd)
        ) {
          merged.penaltyVnd = String(Math.round(asset.asset_value_vnd * 0.2));
        } else if (patch.condition === 'LOST') {
          merged.penaltyVnd = String(asset.asset_value_vnd);
        }
      }

      return { ...prev, [asset.asset_id]: merged };
    });
  };

  const handleReconcileAsset = async (asset: ClearanceAssetItem) => {
    if (!selectedResignation || !selectedClearance) return;
    const draft = assetDrafts[asset.asset_id] ?? {
      returnedDate: new Date().toISOString().slice(0, 10),
      condition: 'GOOD' as AssetConditionStatus,
      penaltyVnd: '0',
      note: '',
    };
    const numericPenalty = Math.max(
      0,
      Number.parseInt(draft.penaltyVnd.replace(/[^\d]/g, ''), 10) || 0
    );

    if (
      draft.condition === 'DAMAGED' ||
      draft.condition === 'LOST' ||
      numericPenalty > 0
    ) {
      const confirmed = await confirmSwal({
        title: 'Xác nhận đối soát thiết bị & Tiền đền bù',
        html: `Thiết bị <b>${escapeSwalHtml(asset.asset_name)} (${escapeSwalHtml(asset.asset_code)})</b> ghi nhận tình trạng <b>${escapeSwalHtml(draft.condition)}</b>.<br/>• Khoản khấu trừ đền bù vào lương quyết toán: <b>${escapeSwalHtml(formatVND(numericPenalty))}</b>.`,
        confirmText: 'Xác nhận ghi nhận',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    reconcileClearanceAsset({
      checklistId: selectedClearance.id,
      resignationId: selectedResignation.id,
      assetId: asset.asset_id,
      returned: draft.condition !== 'LOST',
      returnCondition: draft.condition,
      penaltyAmountVnd: numericPenalty,
      conditionNote: draft.note.trim() || undefined,
      returnedDate: draft.returnedDate,
      actorName,
    });
    syncAllRuntime();
    showToast(
      `Đã đối soát thiết bị ${asset.asset_code}`,
      numericPenalty > 0
        ? `Ghi nhận tình trạng ${draft.condition} · Khấu trừ đền bù ${formatVND(numericPenalty)}.`
        : `Đã thu hồi thiết bị nguyên vẹn ngày ${formatDateVN(draft.returnedDate)}.`,
      'success'
    );
  };

  const handleDeptSignOff = async (
    dept: 'ADMIN' | 'IT' | 'ACCOUNTING' | 'HR',
    nextApproved: boolean
  ) => {
    if (!selectedResignation || !selectedClearance) return;

    const deptLabelMap = {
      ADMIN: 'Hành chính - Quản trị thiết bị',
      IT: 'Công nghệ thông tin (Thu hồi quyền & Email)',
      ACCOUNTING: 'Tài chính - Kế toán (Công nợ & Tạm ứng)',
      HR: 'Nhân sự & C&B (Chốt sổ BHXH)',
    };

    const advanceAmount =
      dept === 'ACCOUNTING'
        ? Math.max(
            0,
            Number.parseInt(advanceVndInput.replace(/[^\d]/g, ''), 10) || 0
          )
        : undefined;

    const confirmed = await confirmSwal({
      title: nextApproved
        ? `Ký xác nhận hoàn tất: ${deptLabelMap[dept]}`
        : `Mở lại đối soát: ${deptLabelMap[dept]}`,
      html:
        dept === 'ACCOUNTING' && nextApproved
          ? `Xác nhận chốt công nợ cho <b>${escapeSwalHtml(selectedResignation.full_name)}</b> với số tiền tạm ứng tồn khấu trừ vào kỳ lương cuối: <b>${escapeSwalHtml(formatVND(advanceAmount ?? 0))}</b>?`
          : `Xác nhận trạng thái đối soát thanh lý của bộ phận <b>${escapeSwalHtml(deptLabelMap[dept])}</b> đối với nhân sự <b>${escapeSwalHtml(selectedResignation.full_name)} (${escapeSwalHtml(selectedResignation.employee_code)})</b>?`,
      confirmText: nextApproved ? 'Xác nhận hoàn tất' : 'Mở lại mục này',
      variant: nextApproved ? 'primary' : 'warning',
    });
    if (!confirmed) return;

    try {
      const note =
        dept === 'IT'
          ? itNoteInput.trim()
          : dept === 'ACCOUNTING'
            ? accountingNoteInput.trim()
            : dept === 'HR'
              ? hrNoteInput.trim()
              : undefined;

      signOffClearanceDept({
        checklistId: selectedClearance.id,
        resignationId: selectedResignation.id,
        department: dept,
        approved: nextApproved,
        advanceDeductionVnd: advanceAmount,
        note: note || undefined,
        actorName,
      });
      syncAllRuntime();
      showToast(
        nextApproved
          ? `Đã ký xác nhận bộ phận ${dept}`
          : `Đã mở lại mục đối soát ${dept}`,
        `${selectedResignation.full_name} (${selectedResignation.employee_code})`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Chưa thể ký xác nhận tất toán',
        text: err instanceof Error ? err.message : 'Vui lòng đối soát hết thiết bị trước.',
        icon: 'error',
      });
    }
  };

  const handleExecuteFinalSettlement = async () => {
    if (!selectedResignation || !clearanceGate?.is_100_percent_cleared || !settlementPreview) {
      return;
    }

    const confirmed = await confirmSwal({
      title: 'Chốt Quyết toán kỳ cuối & Khóa tài khoản vĩnh viễn?',
      html: `Hồ sơ <b>${escapeSwalHtml(selectedResignation.full_name)} (${escapeSwalHtml(selectedResignation.employee_code)})</b> đã đạt <b>100% Clearance & Bàn giao 3 bên</b>.<br/><br/>• Thực lĩnh Quyết toán kỳ cuối (NET): <b>${escapeSwalHtml(formatVND(settlementPreview.netSalaryVnd))}</b><br/>• Đánh giá tuyển lại: <b>${escapeSwalHtml(isRehireable ? 'Có thể tuyển dụng lại' : 'Không tuyển dụng lại')}</b><br/>• Chuyển trạng thái nhân sự sang <b>Đã nghỉ việc</b> và <b>khóa tài khoản đăng nhập</b> ngay lập tức, giữ nguyên 100% lịch sử công tác & lương.`,
      confirmText: 'Chốt Quyết toán & Khóa tài khoản',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const result = executeFinalSettlement({
        resignationId: selectedResignation.id,
        isRehireable,
        rehireNote: rehireNote.trim() || undefined,
        actorName,
      });
      syncAllRuntime();
      await alertSwal({
        title: 'Hoàn tất Quyết toán nghỉ việc & Khóa tài khoản',
        html: `Đã phát hành phiếu lương quyết toán <b>${escapeSwalHtml(result.finalPayroll.payslip_code)}</b> (Thực lĩnh: <b>${escapeSwalHtml(formatVND(result.finalPayroll.net_salary_vnd))}</b>).<br/>Nhân sự <b>${escapeSwalHtml(result.employee.full_name)}</b> đã chuyển sang trạng thái <b>Đã nghỉ việc</b> và tài khoản <b>${escapeSwalHtml(result.lockedUser.email)}</b> đã bị khóa truy cập.`,
        icon: 'success',
      });
    } catch (err) {
      await alertSwal({
        title: 'Chặn Quyết toán kỳ cuối',
        text: err instanceof Error ? err.message : 'Chưa đạt 100% điều kiện Clearance.',
        icon: 'error',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-80" />
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <Skeleton key={idx} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const receiverCandidateOptions = employees
    .filter(
      (e) =>
        e.employment_status !== 'RESIGNED' &&
        e.id !== selectedResignation?.employee_id
    )
    .map((e) => ({
      value: e.id,
      label: `${e.full_name} (${e.employee_code} · ${e.department_name})`,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Nghỉ việc, Bàn giao 3 bên & Quyết toán hợp đồng
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Kiểm soát thời hạn báo trước (3 / 30 / 45 ngày), bàn giao công việc 3 bên, thu hồi tài sản, công nợ và khóa cổng quyết toán 100%.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => openCreateResignationModal()}
          >
            <FilePlus2 className="h-4 w-4" strokeWidth={1.5} />
            Tạo đơn xin nghỉ việc
          </Button>
        </div>
      </div>

      {/* Receiver Notification Banner if current user has pending handovers to accept */}
      {myPendingReceiverHandovers.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-[#0F766E]/35 border-l-4 border-l-[#0F766E] bg-[#CBE8E2]/45 p-4 dark:border-teal-500/30 dark:border-l-teal-400 dark:bg-teal-950/25 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ArrowRightLeft
              className="mt-0.5 h-5 w-5 shrink-0 text-[#0F766E] dark:text-teal-400"
              strokeWidth={1.5}
            />
            <div>
              <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                Bạn có{' '}
                <span className="font-mono tabular-nums">
                  {myPendingReceiverHandovers.length}
                </span>{' '}
                hạng mục công việc đang chờ xác nhận nhận bàn giao
              </p>
              <p className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                Vui lòng kiểm tra tài liệu / mã nguồn từ đồng nghiệp nghỉ việc và nhấn &ldquo;Xác nhận đã nhận bàn giao&rdquo;.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const firstHo = myPendingReceiverHandovers[0];
              if (firstHo) {
                setSelectedResignationId(firstHo.resignation_id);
                setDetailTab('handover');
              }
            }}
          >
            Mở danh sách nhận bàn giao
          </Button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Đơn xin nghỉ chờ duyệt
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {kpiStats.pendingApprovalCount}
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Đối chiếu hạn báo trước luật định
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-400">
              <Clock className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Nhân sự đang báo trước
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                {kpiStats.noticePeriodCount}
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Trạng thái NOTICE_PERIOD
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400">
              <CalendarClock className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500 dark:border-l-violet-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Bàn giao & Thu hồi đang xử lý
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-violet-700 dark:text-violet-400">
                {kpiStats.inFlightItemsCount}
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Đầu việc 3 bên & thiết bị cần thu hồi
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-950/30 dark:text-violet-400">
              <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Đã quyết toán & Khóa quyền
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {kpiStats.resignedSettledCount}
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                RESIGNED · Bảo toàn 100% lịch sử
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-400">
              <Lock className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Master List of Resignation Requests */}
      <Card className="overflow-hidden rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214]">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserMinus
                  className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                  strokeWidth={1.5}
                />
                Danh sách Hồ sơ Thôi việc & Thanh lý hợp đồng
              </CardTitle>
              <CardDescription className="mt-1">
                Chọn một hồ sơ bên dưới để điều phối Bàn giao 3 bên, Checklist Thu hồi tài sản & Quyết toán kỳ cuối.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C7871] dark:text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên, mã NV, mã đơn..."
                  aria-label="Tìm kiếm hồ sơ nghỉ việc"
                  className="pl-9"
                />
              </div>
              <div className="w-full sm:w-52">
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  aria-label="Lọc theo trạng thái thôi việc"
                  options={[
                    { value: 'ALL', label: 'Tất cả trạng thái' },
                    { value: 'PENDING', label: 'Chờ phê duyệt đơn' },
                    { value: 'ACTIVE_NOTICE', label: 'Đang báo trước & Bàn giao' },
                    { value: 'COMPLETED', label: 'Đã quyết toán (RESIGNED)' },
                    { value: 'REJECTED', label: 'Đã từ chối / Giữ chân' },
                  ]}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredResignations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <FileText className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  Chưa có hồ sơ thôi việc nào phù hợp
                </p>
                <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                  Nhấn &ldquo;Tạo đơn xin nghỉ việc&rdquo; để khởi tạo quy trình kiểm tra hạn báo trước và bàn giao công việc.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openCreateResignationModal()}
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Tạo đơn xin nghỉ việc
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-[#F2F7F5] dark:bg-zinc-900/60">
                  <tr className="border-b border-[#C6D9D3] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:text-zinc-400">
                    <th className="px-2.5 py-2.5">Đơn &amp; Nhân sự</th>
                    <th className="px-2.5 py-2.5">HĐ &amp; Báo trước</th>
                    <th className="whitespace-nowrap px-2.5 py-2.5">Nộp → Nghỉ</th>
                    <th className="px-2.5 py-2.5">Tiến độ</th>
                    <th className="px-2.5 py-2.5">Trạng thái</th>
                    <th className="px-2.5 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                  {filteredResignations.map((req) => {
                    const isSelected = req.id === selectedResignation?.id;
                    const contractMeta =
                      CONTRACT_TYPE_META[req.contract_type] ??
                      CONTRACT_TYPE_META.FIXED_TERM_12M;
                    const statusMeta =
                      RESIGNATION_STATUS_META[req.status] ??
                      RESIGNATION_STATUS_META.PENDING_MANAGER;
                    const isPending =
                      req.status === 'PENDING_MANAGER' || req.status === 'PENDING_HR';
                    const rowGate =
                      !isPending &&
                      req.status !== 'REJECTED' &&
                      req.status !== 'CANCELLED'
                        ? checkClearance100Percent(req.id)
                        : null;

                    return (
                      <tr
                        key={req.id}
                        onClick={() => setSelectedResignationId(req.id)}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isSelected
                            ? 'border-l-4 border-l-[#0F766E] bg-[#CBE8E2]/45 dark:border-l-teal-400 dark:bg-teal-950/20'
                            : 'odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40'
                        )}
                      >
                        <td className="px-2.5 py-2.5">
                          <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                            {req.full_name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#415A54] dark:text-zinc-400">
                            <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                              {req.resignation_code}
                            </span>{' '}
                            ·{' '}
                            <span className="font-mono tabular-nums">
                              {req.employee_code}
                            </span>{' '}
                            · {req.department_name}
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5">
                          <Badge
                            variant={contractMeta.badgeVariant}
                            title={contractMeta.label}
                          >
                            {contractMeta.shortLabel}
                          </Badge>
                          <div className="mt-1 font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                            Tối thiểu {req.minimum_notice_days}d
                            {req.notice_shortfall_days > 0 ? (
                              <span className="ml-1 font-semibold text-amber-700 dark:text-amber-400">
                                (Thiếu {req.notice_shortfall_days}d)
                              </span>
                            ) : (
                              <span className="ml-1 text-emerald-700 dark:text-emerald-400">
                                (Đúng luật)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-2.5 font-mono text-xs tabular-nums text-[#11221E] dark:text-zinc-200">
                          <div>Nộp: {formatDateVN(req.submitted_date)}</div>
                          <div className="mt-0.5 text-[#415A54] dark:text-zinc-400">
                            Nghỉ:{' '}
                            <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                              {formatDateVN(req.approved_last_day || req.desired_last_day)}
                            </span>
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5">
                          {req.status === 'COMPLETED' ? (
                            <div className="space-y-1">
                              <span className="font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                100% Đã tất toán
                              </span>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E4EEEB] dark:bg-zinc-800">
                                <div className="h-full w-full rounded-full bg-emerald-600 dark:bg-emerald-400" />
                              </div>
                            </div>
                          ) : rowGate ? (
                            <div className="space-y-1">
                              <span className="font-mono text-xs font-semibold tabular-nums text-[#11221E] dark:text-zinc-200">
                                {rowGate.completion_percent}% ({6 - rowGate.blocking_reasons.length}/6)
                              </span>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E4EEEB] dark:bg-zinc-800">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    rowGate.is_100_percent_cleared
                                      ? 'bg-emerald-600 dark:bg-emerald-400'
                                      : 'bg-[#0F766E] dark:bg-teal-400'
                                  )}
                                  style={{ width: `${rowGate.completion_percent}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-[#5C7871] dark:text-zinc-500">
                              Chờ duyệt
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2.5">
                          <Badge
                            variant={statusMeta.variant}
                            title={statusMeta.label}
                          >
                            {statusMeta.shortLabel}
                          </Badge>
                        </td>
                        <td
                          className="whitespace-nowrap px-2.5 py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            {isPending && canApproveResignation && (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => void handleApproveResignation(req)}
                                >
                                  Duyệt
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => void handleRejectResignation(req)}
                                >
                                  Từ chối
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant={isSelected ? 'secondary' : 'outline'}
                              className="h-7 px-2 text-xs"
                              onClick={() => setSelectedResignationId(req.id)}
                            >
                              Chi tiết
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Resignation 4-Stage Execution Workspace */}
      {selectedResignation && (
        <Card className="overflow-hidden rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214]">
          <CardHeader className="border-b border-[#C6D9D3] bg-[#F2F7F5]/60 pb-4 dark:border-zinc-800/80 dark:bg-zinc-900/40">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {selectedResignation.resignation_code}
                  </span>
                  <Badge
                    variant={
                      RESIGNATION_STATUS_META[selectedResignation.status]?.variant ??
                      'secondary'
                    }
                  >
                    {RESIGNATION_STATUS_META[selectedResignation.status]?.label ??
                      selectedResignation.status}
                  </Badge>
                  {selectedResignation.status === 'COMPLETED' && (
                    <Badge
                      variant={
                        selectedResignation.is_rehireable !== false
                          ? 'teal'
                          : 'destructive'
                      }
                    >
                      {selectedResignation.is_rehireable !== false
                        ? 'Có thể tuyển lại (Re-hireable)'
                        : 'Không tuyển lại (No Re-hire)'}
                    </Badge>
                  )}
                </div>
                <h2 className="mt-1.5 text-lg font-semibold text-[#11221E] dark:text-zinc-100">
                  {selectedResignation.full_name}{' '}
                  <span className="font-mono text-sm font-normal tabular-nums text-[#415A54] dark:text-zinc-400">
                    ({selectedResignation.employee_code})
                  </span>
                </h2>
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  {selectedResignation.position_name} ·{' '}
                  {selectedResignation.department_name} · Ngày làm việc cuối:{' '}
                  <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-200">
                    {formatDateVN(
                      selectedResignation.approved_last_day ||
                        selectedResignation.desired_last_day
                    )}
                  </span>
                </p>
              </div>

              {clearanceGate && (
                <div className="flex items-center gap-3 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div>
                    <p className="text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">
                      Cổng kiểm soát Clearance 100%
                    </p>
                    <p className="font-mono text-base font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {selectedResignation.status === 'COMPLETED'
                        ? '100% Đã khóa & Quyết toán'
                        : `${clearanceGate.completion_percent}% hoàn tất`}
                    </p>
                  </div>
                  {clearanceGate.is_100_percent_cleared ||
                  selectedResignation.status === 'COMPLETED' ? (
                    <CheckCircle2
                      className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <ShieldAlert
                      className="h-6 w-6 text-amber-600 dark:text-amber-400"
                      strokeWidth={1.5}
                    />
                  )}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-5">
            <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-5">
              <TabsList className="flex flex-wrap gap-1">
                <TabsTrigger value="overview">
                  1. Đơn & Thời hạn báo trước
                </TabsTrigger>
                <TabsTrigger value="handover">
                  2. Bàn giao 3 bên & Kế nhiệm ({selectedHandovers.filter((h) => h.status === 'COMPLETED').length}/{selectedHandovers.length})
                </TabsTrigger>
                <TabsTrigger value="clearance">
                  3. Thu hồi Tài sản & Công nợ
                </TabsTrigger>
                <TabsTrigger value="settlement">
                  4. Quyết toán kỳ cuối & Khóa TK
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: OVERVIEW & LEGAL NOTICE APPROVAL */}
              <TabsContent value="overview" className="space-y-5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                      Hợp đồng lao động hiện hành
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      {CONTRACT_TYPE_META[selectedResignation.contract_type]?.label ??
                        selectedResignation.contract_type}
                    </p>
                    <p className="mt-1 font-mono text-xs tabular-nums text-[#0F766E] dark:text-teal-400">
                      Luật Lao động: Báo trước tối thiểu{' '}
                      {selectedResignation.minimum_notice_days} ngày
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                      Mốc thời gian báo trước
                    </p>
                    <div className="mt-1 space-y-1 font-mono text-xs tabular-nums text-[#11221E] dark:text-zinc-200">
                      <div>Ngày nộp đơn: {formatDateVN(selectedResignation.submitted_date)}</div>
                      <div>
                        Hợp pháp sớm nhất:{' '}
                        <span className="font-semibold text-[#0F766E] dark:text-teal-400">
                          {formatDateVN(selectedResignation.earliest_legal_last_day)}
                        </span>
                      </div>
                      <div>
                        Ngày mong muốn: {formatDateVN(selectedResignation.desired_last_day)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                      Nhóm lý do thôi việc
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      {REASON_CATEGORY_LABEL[selectedResignation.reason_category] ??
                        selectedResignation.reason_category}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#415A54] dark:text-zinc-300">
                      {selectedResignation.reason}
                    </p>
                  </div>
                </div>

                {selectedResignation.notice_shortfall_days > 0 && (
                  <div className="rounded-xl border border-amber-500/40 border-l-4 border-l-amber-500 bg-amber-50/70 p-4 dark:border-amber-500/30 dark:border-l-amber-400 dark:bg-amber-950/20">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                        strokeWidth={1.5}
                      />
                      <div className="text-xs leading-5 text-amber-900 dark:text-amber-200">
                        <span className="font-semibold">
                          Cảnh báo thiếu thời hạn báo trước luật định:
                        </span>{' '}
                        Ngày nghỉ mong muốn ({formatDateVN(selectedResignation.desired_last_day)}) sớm hơn mốc tối thiểu{' '}
                        <span className="font-mono font-semibold tabular-nums">
                          {selectedResignation.notice_shortfall_days} ngày
                        </span>{' '}
                        (yêu cầu từ ngày{' '}
                        <span className="font-mono font-semibold tabular-nums">
                          {formatDateVN(selectedResignation.earliest_legal_last_day)}
                        </span>
                        ). HR có thể ấn định ngày làm việc cuối cùng đúng hạn luật định hoặc tích chọn thỏa thuận rút ngắn.
                      </div>
                    </div>
                  </div>
                )}

                {(selectedResignation.status === 'PENDING_MANAGER' ||
                  selectedResignation.status === 'PENDING_HR') &&
                canApproveResignation ? (
                  <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      Phê duyệt Đơn thôi việc & Chốt ngày làm việc cuối cùng
                    </h3>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label
                          htmlFor="approve-last-day"
                          className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                        >
                          Ngày làm việc cuối cùng được phê duyệt
                        </label>
                        <Input
                          id="approve-last-day"
                          type="date"
                          value={approveLastDayInput}
                          onChange={(e) => setApproveLastDayInput(e.target.value)}
                          className="mt-1.5 font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="exit-interview-note"
                          className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                        >
                          Ghi chú phỏng vấn nghỉ việc (Exit Interview)
                        </label>
                        <Input
                          id="exit-interview-note"
                          value={exitInterviewInput}
                          onChange={(e) => setExitInterviewInput(e.target.value)}
                          placeholder="Ghi nhận ý kiến đóng góp & thỏa thuận bàn giao..."
                          className="mt-1.5"
                        />
                      </div>
                    </div>

                    {selectedResignation.notice_shortfall_days > 0 && (
                      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-[#415A54] dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={waiveShortfallInput}
                          onChange={(e) => setWaiveShortfallInput(e.target.checked)}
                          className="h-4 w-4 rounded border-[#C6D9D3] text-[#0F766E]"
                        />
                        <span>
                          Đồng ý miễn trừ số ngày báo trước còn thiếu theo thỏa thuận hai bên
                        </span>
                      </label>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-2.5">
                      <Button
                        variant="primary"
                        onClick={() =>
                          void handleApproveResignation(selectedResignation)
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                        Phê duyệt & Chuyển sang NOTICE_PERIOD
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          void handleRejectResignation(selectedResignation)
                        }
                      >
                        <XCircle className="h-4 w-4" strokeWidth={1.5} />
                        Từ chối đơn (Giữ chân nhân sự)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/50 p-4 text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
                    {selectedResignation.status === 'REJECTED' ? (
                      <p>
                        <span className="font-semibold text-rose-700 dark:text-rose-400">
                          Đơn đã từ chối:
                        </span>{' '}
                        {selectedResignation.rejection_reason}
                      </p>
                    ) : selectedResignation.approved_last_day ? (
                      <p>
                        Đơn đã được phê duyệt bởi{' '}
                        <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                          {selectedResignation.hr_approved_by ||
                            selectedResignation.manager_approved_by ||
                            'Phòng Nhân sự'}
                        </span>
                        . Ngày làm việc cuối cùng đã chốt:{' '}
                        <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {formatDateVN(selectedResignation.approved_last_day)}
                        </span>
                        . Vui lòng chuyển sang Tab 2 & Tab 3 để thực hiện Bàn giao 3 bên và Thu hồi tài sản.
                      </p>
                    ) : (
                      <p>
                        Đơn đang chờ Trưởng bộ phận và Phòng Nhân sự rà soát phê duyệt.
                      </p>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: 3-WAY HANDOVER & MANDATORY MANAGER RE-ASSIGN */}
              <TabsContent value="handover" className="space-y-5">
                {/* Mandatory Manager Re-assign Card */}
                {managerDependency &&
                  (managerDependency.is_manager ||
                    managerDependency.requires_successor_reassign ||
                    Boolean(selectedResignation.successor_employee_id)) && (() => {
                    const requiresSuccessorReassign = Boolean(
                      managerDependency.requires_successor_reassign
                    );
                    const hasAssignedSuccessor = Boolean(
                      selectedResignation.successor_employee_id
                    );

                    return (
                      <div
                        className={cn(
                          'rounded-xl border p-4',
                          requiresSuccessorReassign
                            ? 'border-amber-500/45 border-l-4 border-l-amber-500 bg-amber-50/70 dark:border-amber-500/30 dark:border-l-amber-400 dark:bg-amber-950/20'
                            : 'border-emerald-500/35 border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:border-emerald-500/25 dark:border-l-emerald-400 dark:bg-emerald-950/20'
                        )}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Users
                                className={cn(
                                  'h-4 w-4',
                                  requiresSuccessorReassign
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                )}
                                strokeWidth={1.5}
                              />
                              <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                                Bắt buộc Chuyển giao Quản lý kế nhiệm (Re-assign Subordinates & Pending Requests)
                              </h3>
                            </div>

                            {requiresSuccessorReassign ? (
                              <>
                                <p className="text-xs leading-5 text-[#415A54] dark:text-zinc-300">
                                  Nhân sự nghỉ việc đang quản lý trực tiếp{' '}
                                  <span className="font-mono font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                                    {managerDependency.subordinates.length} nhân viên cấp dưới
                                  </span>{' '}
                                  và có{' '}
                                  <span className="font-mono font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                                    {managerDependency.pending_requests.length} đơn từ đang chờ duyệt (PENDING)
                                  </span>
                                  . Bắt buộc chuyển quyền phê duyệt sang Quản lý kế nhiệm trước khi quyết toán!
                                </p>
                                {managerDependency.subordinates.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {managerDependency.subordinates.map((sub) => (
                                      <Badge key={sub.id} variant="outline" className="text-[11px]">
                                        {sub.full_name} ({sub.employee_code})
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                                {hasAssignedSuccessor ? (
                                  <>
                                    Đã hoàn tất chuyển giao toàn bộ nhân sự trực thuộc và luồng duyệt đơn sang Quản lý kế nhiệm:{' '}
                                    <span className="font-semibold">
                                      {selectedResignation.successor_employee_name ||
                                        selectedResignation.successor_employee_id}
                                    </span>
                                    .
                                  </>
                                ) : (
                                  'Đã hoàn tất chuyển giao kế nhiệm (hiện không có nhân sự trực thuộc hay đơn từ chờ duyệt cần bàn giao).'
                                )}
                              </p>
                            )}
                          </div>

                          {requiresSuccessorReassign &&
                            canApproveResignation && (
                              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                                <div className="w-full sm:w-72">
                                  <Select
                                    value={successorEmpId}
                                    onValueChange={setSuccessorEmpId}
                                    aria-label="Chọn Quản lý kế nhiệm"
                                    options={[
                                      {
                                        value: '',
                                        label: '-- Chọn Quản lý kế nhiệm --',
                                      },
                                      ...receiverCandidateOptions,
                                    ]}
                                  />
                                </div>
                                <Button
                                  variant="primary"
                                  onClick={() => void handleExecuteManagerReassign()}
                                >
                                  <ArrowRightLeft className="h-4 w-4" strokeWidth={1.5} />
                                  Chuyển giao kế nhiệm
                                </Button>
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })()}

                {/* 3-Way Handover Items Header */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      Danh mục Bàn giao công việc 3 bên (Người nghỉ → Đồng nghiệp tiếp nhận → Quản lý duyệt)
                    </h3>
                    <p className="text-xs text-[#5C7871] dark:text-zinc-400">
                      Mỗi đầu việc chỉ được tính hoàn tất khi đủ xác nhận của cả 3 bên.
                    </p>
                  </div>
                  {selectedResignation.status !== 'COMPLETED' &&
                    selectedResignation.status !== 'REJECTED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAddHandoverModalOpen(true)}
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.5} />
                        Thêm hạng mục bàn giao
                      </Button>
                    )}
                </div>

                {selectedHandovers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#C6D9D3] p-8 text-center dark:border-zinc-800">
                    <p className="text-sm font-medium text-[#415A54] dark:text-zinc-300">
                      Chưa có hạng mục bàn giao công việc nào.
                    </p>
                    <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                      Khi đơn thôi việc được phê duyệt, hệ thống tự sinh 3 hạng mục bàn giao chuẩn hoặc nhân sự có thể tự thêm mới.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedHandovers.map((item) => {
                      const canAssignReceiver =
                        selectedResignation.status !== 'COMPLETED' &&
                        (canApproveResignation ||
                          actorEmployee?.id === item.employee_id);
                      const canConfirmAsReceiver =
                        selectedResignation.status !== 'COMPLETED' &&
                        Boolean(item.receiver_employee_id) &&
                        !item.receiver_confirmed &&
                        (canManageAll ||
                          role === 'DEPT_MANAGER' ||
                          actorEmployee?.id === item.receiver_employee_id ||
                          actorEmployee?.employee_code === item.receiver_employee_code);
                      const canApproveAsManager =
                        selectedResignation.status !== 'COMPLETED' &&
                        item.receiver_confirmed &&
                        !item.manager_approved &&
                        canApproveResignation;

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                  {HANDOVER_CATEGORY_LABEL[item.category] ??
                                    item.category}
                                </Badge>
                                <Badge
                                  variant={
                                    item.status === 'COMPLETED'
                                      ? 'success'
                                      : item.status === 'PENDING_MANAGER'
                                        ? 'info'
                                        : 'warning'
                                  }
                                >
                                  {item.status === 'COMPLETED'
                                    ? 'Hoàn tất 3 bên (COMPLETED)'
                                    : item.status === 'PENDING_MANAGER'
                                      ? 'Chờ Quản lý nghiệm thu'
                                      : 'Chờ người nhận xác nhận'}
                                </Badge>
                              </div>
                              <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                                {item.title}
                              </p>
                              {item.description && (
                                <p className="text-xs leading-5 text-[#415A54] dark:text-zinc-400">
                                  {item.description}
                                </p>
                              )}
                              {item.note && (
                                <p className="font-mono text-xs text-[#0F766E] dark:text-teal-400">
                                  Tài liệu / Link bàn giao: {item.note}
                                </p>
                              )}
                            </div>

                            <div className="w-full shrink-0 lg:w-72">
                              <label className="block text-[11px] font-medium text-[#5C7871] dark:text-zinc-400">
                                Người nhận bàn giao
                              </label>
                              <Select
                                value={item.receiver_employee_id ?? ''}
                                disabled={!canAssignReceiver || item.manager_approved}
                                onValueChange={(val) =>
                                  handleAssignReceiver(item.id, val)
                                }
                                className="mt-1 text-xs"
                                options={[
                                  {
                                    value: '',
                                    label: '-- Chỉ định người nhận bàn giao --',
                                  },
                                  ...receiverCandidateOptions,
                                ]}
                              />
                            </div>
                          </div>

                          {/* 3-Way Step Strip */}
                          <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-[#D5E3DF] pt-3.5 dark:border-zinc-800/80 md:grid-cols-3">
                            {/* Step 1: Sender */}
                            <div className="flex items-center justify-between rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/60 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                              <div>
                                <p className="font-semibold text-[#11221E] dark:text-zinc-200">
                                  1. Người bàn giao
                                </p>
                                <p className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                                  {item.sender_confirmed
                                    ? 'Đã gửi tài liệu bàn giao'
                                    : 'Chưa xác nhận gửi'}
                                </p>
                              </div>
                              {item.sender_confirmed ? (
                                <CheckCircle2
                                  className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                                  strokeWidth={1.5}
                                />
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    confirmHandoverBySender(item.id);
                                    syncAllRuntime();
                                  }}
                                >
                                  Xác nhận gửi
                                </Button>
                              )}
                            </div>

                            {/* Step 2: Receiver */}
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/60 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                              <div className="min-w-0">
                                <p className="font-semibold text-[#11221E] dark:text-zinc-200">
                                  2. Đồng nghiệp tiếp nhận
                                </p>
                                <p className="truncate text-[11px] text-[#5C7871] dark:text-zinc-400">
                                  {item.receiver_confirmed
                                    ? `${item.receiver_name} đã nhận`
                                    : item.receiver_name
                                      ? `Chờ ${item.receiver_name}`
                                      : 'Chưa gán người nhận'}
                                </p>
                              </div>
                              {item.receiver_confirmed ? (
                                <CheckCircle2
                                  className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                                  strokeWidth={1.5}
                                />
                              ) : (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={!canConfirmAsReceiver}
                                  onClick={() => void handleReceiverConfirm(item)}
                                >
                                  Xác nhận đã nhận bàn giao
                                </Button>
                              )}
                            </div>

                            {/* Step 3: Manager */}
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/60 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                              <div className="min-w-0">
                                <p className="font-semibold text-[#11221E] dark:text-zinc-200">
                                  3. Quản lý nghiệm thu
                                </p>
                                <p className="truncate text-[11px] text-[#5C7871] dark:text-zinc-400">
                                  {item.manager_approved
                                    ? `Đã duyệt (${item.manager_approved_by})`
                                    : 'Chờ duyệt chuyên môn'}
                                </p>
                              </div>
                              {item.manager_approved ? (
                                <CheckCircle2
                                  className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                                  strokeWidth={1.5}
                                />
                              ) : (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={!canApproveAsManager}
                                  onClick={() =>
                                    void handleManagerApproveHandover(item)
                                  }
                                >
                                  Duyệt hoàn tất bàn giao chuyên môn
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* TAB 3: ASSET RECONCILIATION & DEPARTMENT CLEARANCE CHECKLIST */}
              <TabsContent value="clearance" className="space-y-5">
                {!selectedClearance ? (
                  <div className="rounded-xl border border-dashed border-[#C6D9D3] p-8 text-center dark:border-zinc-800">
                    <p className="text-sm font-medium text-[#415A54] dark:text-zinc-300">
                      Phiếu Clearance sẽ được khởi tạo ngay sau khi Đơn thôi việc được phê duyệt ở Tab 1.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Asset Reconciliation Table */}
                    <div className="overflow-hidden rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800/80 dark:bg-zinc-900/40">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C6D9D3] bg-[#F2F7F5] px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900">
                        <div className="flex items-center gap-2">
                          <Laptop
                            className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                            strokeWidth={1.5}
                          />
                          <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                            Bảng đối soát thu hồi tài sản cấp phát
                          </h3>
                        </div>
                        <div className="font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                          Tổng tiền đền bù thiết bị:{' '}
                          <span className="font-semibold text-rose-600 dark:text-rose-400">
                            {formatVND(selectedClearance.total_penalty_vnd)}
                          </span>
                        </div>
                      </div>

                      {selectedClearance.assets.length === 0 ? (
                        <div className="flex items-center gap-2.5 px-4 py-5 text-xs text-emerald-800 dark:text-emerald-300">
                          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                          <span>
                            Nhân sự hiện không giữ thiết bị phần cứng nào của công ty — Hạng mục Hành chính (ADMIN) tự động hoàn tất 100%.
                          </span>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5]/60 font-semibold text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                                <th className="px-1.5 py-2">Thiết bị &amp; Serial</th>
                                <th className="whitespace-nowrap px-1.5 py-2 text-right">
                                  Giá trị TS
                                </th>
                                <th className="px-1.5 py-2">Ngày thu hồi</th>
                                <th className="px-1.5 py-2">Tình trạng trả</th>
                                <th className="px-1.5 py-2">Tiền đền bù</th>
                                <th className="px-1.5 py-2">Trạng thái</th>
                                <th className="px-1.5 py-2 text-right">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                              {selectedClearance.assets.map((ast) => {
                                const draft = assetDrafts[ast.asset_id] ?? {
                                  returnedDate:
                                    ast.returned_date ||
                                    new Date().toISOString().slice(0, 10),
                                  condition:
                                    (ast.return_condition as AssetConditionStatus) ||
                                    'GOOD',
                                  penaltyVnd: String(ast.penalty_amount_vnd ?? 0),
                                  note: ast.condition_note ?? '',
                                };
                                const isDone =
                                  ast.returned || ast.return_condition === 'LOST';

                                return (
                                  <tr key={ast.asset_id}>
                                    <td className="max-w-[180px] px-1.5 py-2">
                                      <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                                        {ast.asset_name}
                                      </div>
                                      <div className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                                        {ast.asset_code} · SN: {ast.serial_number}
                                      </div>
                                    </td>
                                    <td className="whitespace-nowrap px-1.5 py-2 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                                      {formatVND(ast.asset_value_vnd)}
                                    </td>
                                    <td className="px-1.5 py-2">
                                      <Input
                                        type="date"
                                        value={draft.returnedDate}
                                        disabled={
                                          !canApproveResignation ||
                                          selectedResignation.status === 'COMPLETED'
                                        }
                                        onChange={(e) =>
                                          handleUpdateAssetDraft(ast, {
                                            returnedDate: e.target.value,
                                          })
                                        }
                                        className="h-8 w-[116px] px-1.5 font-mono text-xs tabular-nums"
                                      />
                                    </td>
                                    <td className="px-1.5 py-2">
                                      <Select
                                        value={draft.condition}
                                        disabled={
                                          !canApproveResignation ||
                                          selectedResignation.status === 'COMPLETED'
                                        }
                                        onValueChange={(val) =>
                                          handleUpdateAssetDraft(ast, {
                                            condition: val as AssetConditionStatus,
                                          })
                                        }
                                        className="h-8 w-[130px] text-xs"
                                        options={ASSET_CONDITION_OPTIONS}
                                      />
                                    </td>
                                    <td className="px-1.5 py-2">
                                      <Input
                                        type="number"
                                        min={0}
                                        step={100000}
                                        value={draft.penaltyVnd}
                                        disabled={
                                          !canApproveResignation ||
                                          selectedResignation.status === 'COMPLETED'
                                        }
                                        onChange={(e) =>
                                          handleUpdateAssetDraft(ast, {
                                            penaltyVnd: e.target.value,
                                          })
                                        }
                                        className="h-8 w-[92px] px-1.5 font-mono text-xs tabular-nums"
                                      />
                                    </td>
                                    <td className="whitespace-nowrap px-1.5 py-2">
                                      {isDone ? (
                                        <Badge
                                          variant={
                                            ast.penalty_amount_vnd > 0
                                              ? 'warning'
                                              : 'success'
                                          }
                                        >
                                          {ast.return_condition === 'LOST'
                                            ? 'Đã báo mất'
                                            : 'Đã thu hồi'}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline">Chờ thu hồi</Badge>
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-1.5 py-2 text-right">
                                      {canApproveResignation &&
                                        selectedResignation.status !==
                                          'COMPLETED' && (
                                          <Button
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            variant={isDone ? 'outline' : 'primary'}
                                            onClick={() =>
                                              void handleReconcileAsset(ast)
                                            }
                                          >
                                            {isDone ? 'Cập nhật' : 'Thu hồi'}
                                          </Button>
                                        )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 4 Department Sign-Off Cards */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* 1. ADMIN */}
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <PackageCheck
                              className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                              strokeWidth={1.5}
                            />
                            <h4 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                              1. Hành chính (ADMIN) — Tài sản & Thẻ từ
                            </h4>
                          </div>
                          <Badge
                            variant={
                              selectedClearance.admin_assets_cleared
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {selectedClearance.admin_assets_cleared
                              ? 'Đã hoàn tất'
                              : 'Chờ đối soát'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-[#415A54] dark:text-zinc-400">
                          Thu hồi toàn bộ máy tính, màn hình, phụ kiện và thẻ ra vào tòa nhà.
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                            {selectedClearance.admin_signed_by
                              ? `Ký bởi: ${selectedClearance.admin_signed_by}`
                              : 'Chưa ký xác nhận'}
                          </span>
                          {canManageAll &&
                            selectedResignation.status !== 'COMPLETED' && (
                              <Button
                                size="sm"
                                variant={
                                  selectedClearance.admin_assets_cleared
                                    ? 'outline'
                                    : 'primary'
                                }
                                onClick={() =>
                                  void handleDeptSignOff(
                                    'ADMIN',
                                    !selectedClearance.admin_assets_cleared
                                  )
                                }
                              >
                                {selectedClearance.admin_assets_cleared
                                  ? 'Mở lại'
                                  : 'Xác nhận Hành chính'}
                              </Button>
                            )}
                        </div>
                      </div>

                      {/* 2. IT */}
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <KeyRound
                              className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                              strokeWidth={1.5}
                            />
                            <h4 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                              2. Bộ phận CNTT (IT) — Thu hồi quyền & Email
                            </h4>
                          </div>
                          <Badge
                            variant={
                              selectedClearance.it_access_revoked
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {selectedClearance.it_access_revoked
                              ? 'Đã thu hồi quyền'
                              : 'Chờ IT xác nhận'}
                          </Badge>
                        </div>
                        <Input
                          value={itNoteInput}
                          disabled={
                            !canManageAll ||
                            selectedResignation.status === 'COMPLETED'
                          }
                          onChange={(e) => setItNoteInput(e.target.value)}
                          placeholder="Ghi chú thu hồi Git, VPN, chuyển tiếp email công việc..."
                          className="mt-2.5 h-8 text-xs"
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                            {selectedClearance.it_signed_by
                              ? `Ký bởi: ${selectedClearance.it_signed_by}`
                              : 'Chưa ký xác nhận'}
                          </span>
                          {canManageAll &&
                            selectedResignation.status !== 'COMPLETED' && (
                              <Button
                                size="sm"
                                variant={
                                  selectedClearance.it_access_revoked
                                    ? 'outline'
                                    : 'primary'
                                }
                                onClick={() =>
                                  void handleDeptSignOff(
                                    'IT',
                                    !selectedClearance.it_access_revoked
                                  )
                                }
                              >
                                {selectedClearance.it_access_revoked
                                  ? 'Mở lại'
                                  : 'Ký thu hồi quyền IT'}
                              </Button>
                            )}
                        </div>
                      </div>

                      {/* 3. ACCOUNTING */}
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Calculator
                              className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                              strokeWidth={1.5}
                            />
                            <h4 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                              3. Kế toán — Chốt công nợ & Tạm ứng tồn
                            </h4>
                          </div>
                          <Badge
                            variant={
                              selectedClearance.accounting_debt_cleared
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {selectedClearance.accounting_debt_cleared
                              ? 'Đã chốt công nợ'
                              : 'Chờ Kế toán'}
                          </Badge>
                        </div>
                        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] text-[#5C7871] dark:text-zinc-400">
                              Tạm ứng tồn khấu trừ (VND)
                            </label>
                            <Input
                              type="number"
                              min={0}
                              step={100000}
                              value={advanceVndInput}
                              disabled={
                                !canManageAll ||
                                selectedResignation.status === 'COMPLETED'
                              }
                              onChange={(e) => setAdvanceVndInput(e.target.value)}
                              className="mt-1 h-8 font-mono text-xs tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-[#5C7871] dark:text-zinc-400">
                              Ghi chú đối soát Kế toán
                            </label>
                            <Input
                              value={accountingNoteInput}
                              disabled={
                                !canManageAll ||
                                selectedResignation.status === 'COMPLETED'
                              }
                              onChange={(e) =>
                                setAccountingNoteInput(e.target.value)
                              }
                              placeholder="Đối soát công tác phí, tạm ứng..."
                              className="mt-1 h-8 text-xs"
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                            {selectedClearance.accounting_signed_by
                              ? `Ký bởi: ${selectedClearance.accounting_signed_by}`
                              : 'Chưa ký xác nhận'}
                          </span>
                          {canManageAll &&
                            selectedResignation.status !== 'COMPLETED' && (
                              <Button
                                size="sm"
                                variant={
                                  selectedClearance.accounting_debt_cleared
                                    ? 'outline'
                                    : 'primary'
                                }
                                onClick={() =>
                                  void handleDeptSignOff(
                                    'ACCOUNTING',
                                    !selectedClearance.accounting_debt_cleared
                                  )
                                }
                              >
                                {selectedClearance.accounting_debt_cleared
                                  ? 'Mở lại'
                                  : 'Chốt công nợ Kế toán'}
                              </Button>
                            )}
                        </div>
                      </div>

                      {/* 4. HR */}
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileCheck2
                              className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                              strokeWidth={1.5}
                            />
                            <h4 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                              4. Nhân sự (HR) — Chốt sổ BHXH & Hồ sơ
                            </h4>
                          </div>
                          <Badge
                            variant={
                              selectedClearance.hr_bhxh_closed
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {selectedClearance.hr_bhxh_closed
                              ? 'Đã chốt sổ BHXH'
                              : 'Chờ HR xác nhận'}
                          </Badge>
                        </div>
                        <Input
                          value={hrNoteInput}
                          disabled={
                            !canManageAll ||
                            selectedResignation.status === 'COMPLETED'
                          }
                          onChange={(e) => setHrNoteInput(e.target.value)}
                          placeholder="Báo giảm BHXH điện tử, dự thảo Quyết định chấm dứt HĐLĐ..."
                          className="mt-2.5 h-8 text-xs"
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                            {selectedClearance.hr_signed_by
                              ? `Ký bởi: ${selectedClearance.hr_signed_by}`
                              : 'Chưa ký xác nhận'}
                          </span>
                          {canManageAll &&
                            selectedResignation.status !== 'COMPLETED' && (
                              <Button
                                size="sm"
                                variant={
                                  selectedClearance.hr_bhxh_closed
                                    ? 'outline'
                                    : 'primary'
                                }
                                onClick={() =>
                                  void handleDeptSignOff(
                                    'HR',
                                    !selectedClearance.hr_bhxh_closed
                                  )
                                }
                              >
                                {selectedClearance.hr_bhxh_closed
                                  ? 'Mở lại'
                                  : 'Ký chốt sổ BHXH'}
                              </Button>
                            )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* TAB 4: 100% HARD GATE & FINAL SETTLEMENT */}
              <TabsContent value="settlement" className="space-y-5">
                {!clearanceGate || !settlementPreview ? (
                  <div className="rounded-xl border border-dashed border-[#C6D9D3] p-8 text-center dark:border-zinc-800">
                    <p className="text-sm font-medium text-[#415A54] dark:text-zinc-300">
                      Đơn thôi việc cần được phê duyệt chuyển sang giai đoạn Báo trước (NOTICE_PERIOD) trước khi tính Quyết toán kỳ cuối.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Gate Check Status Box */}
                    <div
                      className={cn(
                        'rounded-xl border p-4',
                        clearanceGate.is_100_percent_cleared ||
                          selectedResignation.status === 'COMPLETED'
                          ? 'border-emerald-500/40 border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:border-emerald-500/30 dark:border-l-emerald-400 dark:bg-emerald-950/20'
                          : 'border-rose-500/40 border-l-4 border-l-rose-500 bg-rose-50/60 dark:border-rose-500/30 dark:border-l-rose-400 dark:bg-rose-950/20'
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {clearanceGate.is_100_percent_cleared ||
                          selectedResignation.status === 'COMPLETED' ? (
                            <ShieldCheck
                              className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                              strokeWidth={1.5}
                            />
                          ) : (
                            <Ban
                              className="h-5 w-5 text-rose-600 dark:text-rose-400"
                              strokeWidth={1.5}
                            />
                          )}
                          <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                            {selectedResignation.status === 'COMPLETED'
                              ? 'Đã hoàn tất Quyết toán kỳ cuối & Khóa tài khoản truy cập'
                              : clearanceGate.is_100_percent_cleared
                                ? 'Đạt 100% điều kiện Clearance & Bàn giao 3 bên — Sẵn sàng chốt Quyết toán!'
                                : `Khóa chặn Quyết toán — Mới đạt ${clearanceGate.completion_percent}% (Bắt buộc hoàn thành đủ 100%)`}
                          </h3>
                        </div>
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          {selectedResignation.status === 'COMPLETED'
                            ? '6/6 cổng đạt'
                            : `${6 - clearanceGate.blocking_reasons.length}/6 cổng đạt`}
                        </span>
                      </div>

                      {selectedResignation.status !== 'COMPLETED' &&
                        clearanceGate.blocking_reasons.length > 0 && (
                          <ul className="mt-2.5 space-y-1 text-xs text-rose-900 dark:text-rose-200">
                            {clearanceGate.blocking_reasons.map((reason, idx) => (
                              <li key={idx} className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600 dark:bg-rose-400" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>

                    {/* Final Settlement Breakdown & Re-hire Controls */}
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                      {/* Left: Financial Breakdown */}
                      <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-5 dark:border-zinc-800/80 dark:bg-zinc-900/50 lg:col-span-7">
                        <div className="flex items-center justify-between border-b border-[#D5E3DF] pb-3 dark:border-zinc-800">
                          <div className="flex items-center gap-2">
                            <Receipt
                              className="h-4 w-4 text-[#0F766E] dark:text-teal-400"
                              strokeWidth={1.5}
                            />
                            <h4 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                              Bảng tính Lương Quyết toán kỳ cuối ({settlementPreview.periodMonth})
                            </h4>
                          </div>
                          {settlementPreview.existingFinalPayslip && (
                            <Badge variant="success" className="font-mono">
                              {settlementPreview.existingFinalPayslip.payslip_code} · PAID
                            </Badge>
                          )}
                        </div>

                        <div className="mt-3 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between py-1">
                            <span className="text-[#415A54] dark:text-zinc-400">
                              1. Lương & phụ cấp theo ngày công thực tế (
                              <span className="font-mono font-semibold tabular-nums">
                                {settlementPreview.actualPaidDays}/{settlementPreview.standardDays}
                              </span>{' '}
                              công đến {formatDateVN(settlementPreview.approvedLastDay)})
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                              +{formatVND(settlementPreview.proratedWorkPayVnd)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between rounded-lg bg-[#E8F3EF]/70 px-3 py-2 dark:bg-teal-950/25">
                            <span className="font-medium text-[#0B4F4A] dark:text-teal-300">
                              2. Tiền thanh toán phép năm chưa nghỉ hết (
                              <span className="font-mono tabular-nums">
                                {settlementPreview.unusedLeaveDays} ngày ×{' '}
                                {formatVND(settlementPreview.dailyWage)}
                              </span>
                              )
                            </span>
                            <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                              +{formatVND(settlementPreview.unusedLeavePayoutVnd)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between border-t border-dashed border-[#C6D9D3] pt-2 font-semibold dark:border-zinc-800">
                            <span className="text-[#11221E] dark:text-zinc-200">
                              Tổng thu nhập Gross Quyết toán
                            </span>
                            <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                              {formatVND(settlementPreview.grossSalaryVnd)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between py-0.5 text-[#415A54] dark:text-zinc-400">
                            <span>3. Khấu trừ BHXH/BHYT/BHTN (10.5%) & Thuế TNCN</span>
                            <span className="font-mono tabular-nums">
                              -{formatVND(settlementPreview.totalInsuranceVnd + settlementPreview.pitTaxVnd)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between py-0.5 text-rose-700 dark:text-rose-400">
                            <span>4. Khấu trừ đền bù tài sản hỏng / mất</span>
                            <span className="font-mono font-semibold tabular-nums">
                              -{formatVND(settlementPreview.penaltyDeductionVnd)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between py-0.5 text-amber-800 dark:text-amber-400">
                            <span>5. Khấu trừ công nợ / tạm ứng tồn Kế toán</span>
                            <span className="font-mono font-semibold tabular-nums">
                              -{formatVND(settlementPreview.advanceDeductionVnd)}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center justify-between rounded-xl border border-[#0F766E]/35 bg-[#CBE8E2]/55 px-4 py-3 dark:border-teal-500/30 dark:bg-teal-950/35">
                            <div>
                              <p className="text-xs font-semibold text-[#0B4F4A] dark:text-teal-300">
                                Thực lĩnh Quyết toán kỳ cuối (NET PAYOUT)
                              </p>
                              <p className="text-[11px] text-[#415A54] dark:text-zinc-400">
                                Loại bảng lương: Quyết toán thôi việc cuối kỳ
                              </p>
                            </div>
                            <span className="font-mono text-xl font-bold tabular-nums text-[#0F766E] dark:text-teal-400">
                              {formatVND(settlementPreview.netSalaryVnd)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Re-hire Flag, Account Lock Status & Execute Button */}
                      <div className="flex flex-col justify-between rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-5 dark:border-zinc-800/80 dark:bg-zinc-900/50 lg:col-span-5">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                              Đánh giá khả năng tuyển dụng lại trong tương lai
                            </h4>
                            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                              Dữ liệu đánh giá được đồng bộ sang phân hệ Tuyển dụng ATS nếu ứng viên nộp hồ sơ trở lại trong tương lai.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              disabled={
                                !canManageAll ||
                                selectedResignation.status === 'COMPLETED'
                              }
                              onClick={() => setIsRehireable(true)}
                              className={cn(
                                'rounded-lg border p-3 text-left text-xs transition-colors',
                                isRehireable
                                  ? 'border-[#0F766E] bg-[#CBE8E2]/60 font-semibold text-[#0B4F4A] dark:border-teal-400 dark:bg-teal-950/30 dark:text-teal-300'
                                  : 'border-[#C6D9D3] bg-[#F2F7F5]/50 text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                <BadgeCheck className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                                <span>Có thể tuyển lại</span>
                              </div>
                              <p className="mt-1 font-normal text-[11px] opacity-85">
                                Bàn giao tốt, tuân thủ đúng nội quy
                              </p>
                            </button>

                            <button
                              type="button"
                              disabled={
                                !canManageAll ||
                                selectedResignation.status === 'COMPLETED'
                              }
                              onClick={() => setIsRehireable(false)}
                              className={cn(
                                'rounded-lg border p-3 text-left text-xs transition-colors',
                                !isRehireable
                                  ? 'border-rose-600 bg-rose-50 font-semibold text-rose-800 dark:border-rose-500 dark:bg-rose-950/35 dark:text-rose-300'
                                  : 'border-[#C6D9D3] bg-[#F2F7F5]/50 text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                <Ban className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                                <span>Không tuyển lại</span>
                              </div>
                              <p className="mt-1 font-normal text-[11px] opacity-85">
                                Cảnh báo đỏ trên ATS khi nộp lại CV
                              </p>
                            </button>
                          </div>

                          <div>
                            <label
                              htmlFor="rehire-note-input"
                              className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                            >
                              Ghi chú đánh giá nội bộ
                            </label>
                            <Input
                              id="rehire-note-input"
                              value={rehireNote}
                              disabled={
                                !canManageAll ||
                                selectedResignation.status === 'COMPLETED'
                              }
                              onChange={(e) => setRehireNote(e.target.value)}
                              placeholder="Nhận xét thái độ bàn giao & lưu ý cho HR..."
                              className="mt-1.5 text-xs"
                            />
                          </div>

                          <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
                            <div className="flex items-center justify-between">
                              <span className="text-[#415A54] dark:text-zinc-400">
                                Trạng thái tài khoản SSO:
                              </span>
                              <Badge
                                variant={
                                  settlementPreview.systemUser?.is_active === false ||
                                  selectedResignation.status === 'COMPLETED'
                                    ? 'destructive'
                                    : 'success'
                                }
                              >
                                {settlementPreview.systemUser?.is_active === false ||
                                selectedResignation.status === 'COMPLETED'
                                  ? 'Đã khóa'
                                  : 'Đang hoạt động'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 pt-2">
                          <Button
                            variant="primary"
                            className="w-full"
                            disabled={
                              !canManageAll ||
                              !clearanceGate.is_100_percent_cleared ||
                              selectedResignation.status === 'COMPLETED'
                            }
                            onClick={() => void handleExecuteFinalSettlement()}
                          >
                            <Lock className="h-4 w-4" strokeWidth={1.5} />
                            {selectedResignation.status === 'COMPLETED'
                              ? 'Đã chốt Quyết toán & Khóa tài khoản'
                              : 'Chốt bảng lương Quyết toán kỳ cuối & Khóa tài khoản'}
                          </Button>
                          {!clearanceGate.is_100_percent_cleared &&
                            selectedResignation.status !== 'COMPLETED' && (
                              <p className="mt-2 text-center text-[11px] text-rose-600 dark:text-rose-400">
                                Nút bị khóa cứng cho đến khi hoàn thành đủ 100% Bàn giao 3 bên & Clearance.
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* MODAL 1: CREATE RESIGNATION REQUEST */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tạo đơn xin nghỉ việc & Kiểm tra hạn báo trước</DialogTitle>
            <DialogDescription>
              Hệ thống tự động đối chiếu loại Hợp đồng lao động hiện hành với quy định báo trước tối thiểu (3 / 30 / 45 ngày).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleSubmitResignationForm(e)} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="resign-emp-select"
                className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Nhân sự nộp đơn thôi việc
              </label>
              <Select
                id="resign-emp-select"
                value={formEmployeeId}
                disabled={role === 'EMPLOYEE'}
                onValueChange={handleSelectEmployeeInForm}
                className="mt-1.5"
                options={eligibleEmployeesForResignation.map((e) => ({
                  value: e.id,
                  label: `${e.full_name} (${e.employee_code} · ${e.department_name})`,
                }))}
              />
            </div>

            {selectedFormEmployee && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/80 px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                  <span className="text-[#5C7871] dark:text-zinc-400">
                    Hợp đồng đang hiệu lực:{' '}
                  </span>
                  <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                    {CONTRACT_TYPE_META[selectedFormContractType]?.label ??
                      selectedFormContractType}
                  </span>
                </div>
                <Badge
                  variant={
                    CONTRACT_TYPE_META[selectedFormContractType]?.badgeVariant ??
                    'teal'
                  }
                  className="font-mono tabular-nums"
                >
                  Báo trước ≥{' '}
                  {CONTRACT_TYPE_META[selectedFormContractType]?.legalNoticeDays ?? 30}{' '}
                  ngày
                </Badge>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="resign-submitted-date"
                  className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Ngày nộp đơn
                </label>
                <Input
                  id="resign-submitted-date"
                  type="date"
                  required
                  value={formSubmittedDate}
                  onChange={(e) => setFormSubmittedDate(e.target.value)}
                  className="mt-1.5 font-mono tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="resign-desired-date"
                  className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Ngày làm việc cuối cùng mong muốn
                </label>
                <Input
                  id="resign-desired-date"
                  type="date"
                  required
                  value={formDesiredLastDay}
                  onChange={(e) => setFormDesiredLastDay(e.target.value)}
                  className="mt-1.5 font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Live Legal Notice Check Banner */}
            {liveNoticeCalculation && (
              <div
                className={cn(
                  'rounded-xl border p-3.5 text-xs',
                  liveNoticeCalculation.meets_legal_notice
                    ? 'border-emerald-500/35 border-l-4 border-l-emerald-500 bg-emerald-50/60 text-emerald-900 dark:border-emerald-500/25 dark:border-l-emerald-400 dark:bg-emerald-950/20 dark:text-emerald-200'
                    : 'border-amber-500/45 border-l-4 border-l-amber-500 bg-amber-50/75 text-amber-900 dark:border-amber-500/30 dark:border-l-amber-400 dark:bg-amber-950/25 dark:text-amber-200'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {liveNoticeCalculation.meets_legal_notice
                      ? `Đáp ứng đúng hạn báo trước tối thiểu (≥ ${liveNoticeCalculation.minimum_notice_days} ngày)`
                      : `Cảnh báo: Chưa đủ hạn báo trước tối thiểu (Thiếu ${liveNoticeCalculation.notice_shortfall_days} ngày)`}
                  </span>
                  <span className="font-mono tabular-nums">
                    Hợp pháp sớm nhất:{' '}
                    <b>{formatDateVN(liveNoticeCalculation.earliest_legal_last_day)}</b>
                  </span>
                </div>
                {!liveNoticeCalculation.meets_legal_notice && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] opacity-90">
                      Thử việc: 3 ngày · HĐ có thời hạn: 30 ngày · HĐ vô thời hạn: 45 ngày.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFormDesiredLastDay(
                          liveNoticeCalculation.earliest_legal_last_day
                        )
                      }
                      className="font-semibold text-[#0F766E] underline hover:no-underline dark:text-teal-400"
                    >
                      Chọn mốc hợp pháp ({formatDateVN(liveNoticeCalculation.earliest_legal_last_day)})
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="resign-reason-cat"
                className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Nhóm lý do nghỉ việc
              </label>
              <Select
                id="resign-reason-cat"
                value={formReasonCategory}
                onValueChange={(v) =>
                  setFormReasonCategory(v as ResignationReasonCategory)
                }
                className="mt-1.5"
                options={REASON_CATEGORY_OPTIONS}
              />
            </div>

            <div>
              <label
                htmlFor="resign-reason-detail"
                className="block text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Lý do chi tiết & Cam kết bàn giao công việc
              </label>
              <textarea
                id="resign-reason-detail"
                rows={3}
                required
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Nêu rõ lý do xin thôi việc và kế hoạch bàn giao tài liệu, dự án đang phụ trách..."
                className="mt-1.5 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmittingCreate}
              >
                Gửi đơn xin nghỉ việc
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: ADD 3-WAY HANDOVER ITEM */}
      <Dialog open={addHandoverModalOpen} onOpenChange={setAddHandoverModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm hạng mục bàn giao công việc 3 bên</DialogTitle>
            <DialogDescription>
              Kê khai đầu việc, tình trạng hiện tại và đường dẫn tài liệu / source code để đồng nghiệp xác nhận tiếp nhận.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleAddHandoverItem(e)} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Phân loại bàn giao
              </label>
              <Select
                value={hoCategory}
                onValueChange={(v) => setHoCategory(v as HandoverItemCategory)}
                className="mt-1.5"
                options={HANDOVER_CATEGORY_OPTIONS}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tên đầu việc / Dự án bàn giao
              </label>
              <Input
                required
                value={hoTitle}
                onChange={(e) => setHoTitle(e.target.value)}
                placeholder="Ví dụ: Bàn giao module Thanh toán & tài liệu API v2..."
                className="mt-1.5"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Tình trạng hiện tại & Nội dung chi tiết
              </label>
              <textarea
                rows={3}
                value={hoDescription}
                onChange={(e) => setHoDescription(e.target.value)}
                placeholder="Mô tả tiến độ hiện tại, các đầu mối liên hệ cần lưu ý..."
                className="mt-1.5 w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-sm text-[#11221E] focus:border-[#0F766E] focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Link tài liệu / Kho mã nguồn (Source code / Wiki)
              </label>
              <Input
                value={hoDocLinkNote}
                onChange={(e) => setHoDocLinkNote(e.target.value)}
                placeholder="https://git.lacviethrm.vn/... hoặc đường dẫn thư mục chung"
                className="mt-1.5 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Đồng nghiệp tiếp nhận (tùy chọn — Quản lý có thể phân công sau)
              </label>
              <Select
                value={hoReceiverId}
                onValueChange={setHoReceiverId}
                className="mt-1.5"
                options={[
                  { value: '', label: '-- Để Quản lý phân công sau --' },
                  ...receiverCandidateOptions,
                ]}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddHandoverModalOpen(false)}
              >
                Đóng
              </Button>
              <Button type="submit" variant="primary">
                Lưu hạng mục bàn giao
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
