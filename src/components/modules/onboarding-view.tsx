'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  FileSignature,
  KeyRound,
  Laptop,
  MailCheck,
  Monitor,
  PackageCheck,
  PackagePlus,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Usb,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  assignAssetToEmployee,
  assignOnboardingMentor,
  completeOnboardingDeptTask,
  completeOnboardingRecord,
  convertProbationToOfficial,
  createCompanyAsset,
  createPreboardingInvite,
  getCompanyAssets,
  getContracts,
  getEmployeeAssets,
  getExpiringProbationContracts,
  getOnboardingRecords,
  getPerformanceReviews,
  getPreboardingInvites,
  getSystemUsers,
  getTodayDateVN,
  HRM_RUNTIME_EVENT,
  hrQuickUpdatePreboarding,
  isOfficialEmployeeStatus,
  mergeWithRuntimeEmployees,
  pushNotification,
  returnEmployeeAssetWithPenalty,
  saveOnboardingRecord,
  savePerformanceReview,
  toggleAllOnboardingChecklist,
  toggleOnboardingChecklistGroup,
  toggleOnboardingChecklistItem,
} from '@/lib/runtime-store';
import { alertSwal, confirmSwal, escapeSwalHtml } from '@/lib/swal';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import type {
  AssetCategory,
  AssetConditionStatus,
  AssetStatus,
  CompanyAsset,
  Department,
  Employee,
  EmployeeAssetAssignment,
  EmploymentContract,
  OnboardingRecord,
  OnboardingStatus,
  OnboardingTaskGroup,
  PerformanceReview,
  PreboardingInvite,
  PreboardingStatus,
  RoleCode,
  SystemUserAccount,
} from '@/mock/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type OnboardingSubTab = 'progress' | 'assets';

const DEFAULT_TECH_DEPT_IDS = new Set([
  'dept-tech',
  'dept-tech-swe',
  'dept-tech-data',
  'dept-data',
]);

const DEFAULT_TECH_DEPT_NAMES = new Set([
  'Khối Công nghệ',
  'Phòng Kỹ thuật Phần mềm',
  'Phòng Dữ liệu & AI',
]);

const TASK_GROUP_ORDER: OnboardingTaskGroup[] = ['IT', 'ADMIN', 'HR', 'MANAGER'];

const TASK_GROUP_LABELS: Record<OnboardingTaskGroup, string> = {
  IT: 'IT — Hạ tầng & Tài khoản SSO',
  ADMIN: 'ADMIN — Thiết bị & Thẻ từ',
  HR: 'HR — Hợp đồng Thử việc & Pháp lý',
  MANAGER: 'MANAGER — Mentor & Mục tiêu Thử việc',
};

const ONBOARDING_STATUS_META: Record<
  OnboardingStatus,
  { label: string; variant: BadgeVariant }
> = {
  IN_PROGRESS: { label: 'Đang hội nhập', variant: 'teal' },
  COMPLETED: { label: 'Hoàn tất hội nhập', variant: 'success' },
};

const PREBOARDING_BADGE_META: Record<
  PreboardingStatus,
  { label: string; shortLabel: string; variant: BadgeVariant }
> = {
  PENDING: {
    label: 'Pre-boarding: Chờ khai báo',
    shortLabel: 'Chờ khai báo',
    variant: 'warning',
  },
  SUBMITTED: {
    label: 'Pre-boarding: Đã nộp hồ sơ',
    shortLabel: 'Đã nộp hồ sơ',
    variant: 'teal',
  },
  VERIFIED: {
    label: 'Pre-boarding: Đã duyệt',
    shortLabel: 'Đã duyệt',
    variant: 'success',
  },
  EXPIRED: {
    label: 'Pre-boarding: Quá hạn',
    shortLabel: 'Quá hạn',
    variant: 'danger',
  },
};

const ASSET_CATEGORY_META: Record<
  AssetCategory,
  { label: string; shortLabel: string }
> = {
  LAPTOP: { label: 'Máy tính xách tay (Laptop)', shortLabel: 'Laptop' },
  MONITOR: { label: 'Màn hình rời (Monitor)', shortLabel: 'Màn hình' },
  ACCESS_CARD: { label: 'Thẻ từ & Kiểm soát', shortLabel: 'Thẻ từ' },
  PERIPHERAL: { label: 'Thiết bị ngoại vi', shortLabel: 'Ngoại vi' },
};

const ASSET_STATUS_META: Record<
  AssetStatus,
  { label: string; variant: BadgeVariant }
> = {
  ASSIGNED: { label: 'Đang cấp phát', variant: 'teal' },
  AVAILABLE: { label: 'Sẵn sàng trong kho', variant: 'success' },
  MAINTENANCE: { label: 'Đang bảo trì', variant: 'warning' },
};

function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function renderCategoryIcon(category: AssetCategory) {
  switch (category) {
    case 'LAPTOP':
      return (
        <Laptop
          className="h-4 w-4 shrink-0 text-[#415A54] dark:text-zinc-400"
          strokeWidth={1.5}
        />
      );
    case 'MONITOR':
      return (
        <Monitor
          className="h-4 w-4 shrink-0 text-[#415A54] dark:text-zinc-400"
          strokeWidth={1.5}
        />
      );
    case 'ACCESS_CARD':
      return (
        <KeyRound
          className="h-4 w-4 shrink-0 text-[#415A54] dark:text-zinc-400"
          strokeWidth={1.5}
        />
      );
    case 'PERIPHERAL':
      return (
        <Usb
          className="h-4 w-4 shrink-0 text-[#415A54] dark:text-zinc-400"
          strokeWidth={1.5}
        />
      );
  }
}

function getChecklistStats(record: OnboardingRecord): {
  done: number;
  total: number;
  percent: number;
} {
  const total = record.checklist.length;
  if (total === 0) {
    return {
      done: 0,
      total: 0,
      percent: record.status === 'COMPLETED' ? 100 : 0,
    };
  }
  const done = record.checklist.filter((item) => item.completed).length;
  const percent = Math.round((done / total) * 100);
  return { done, total, percent };
}

function canActorToggleGroup(
  role: RoleCode,
  group: OnboardingTaskGroup,
  status: OnboardingStatus
): boolean {
  if (role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'DIRECTOR') {
    return true;
  }
  if (status === 'COMPLETED') return false;
  if (role === 'DEPT_MANAGER' && group === 'MANAGER') return true;
  return false;
}

const ASSET_CODE_PREFIX: Record<AssetCategory, string> = {
  LAPTOP: 'TS-LT',
  MONITOR: 'TS-MN',
  ACCESS_CARD: 'TS-AC',
  PERIPHERAL: 'TS-PR',
};

function suggestNextAssetCode(
  existingAssets: CompanyAsset[],
  category: AssetCategory = 'LAPTOP'
): string {
  let maxSeq = 55;
  for (const item of existingAssets) {
    const match = item.asset_code.match(/(\d+)$/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  return `${ASSET_CODE_PREFIX[category]}-2026-${String(maxSeq + 1).padStart(3, '0')}`;
}

export function OnboardingView() {
  const {
    role,
    currentUserProfile,
    uiState,
    setUiState,
    showToast,
    navIntent,
    clearNavIntent,
  } = useApp();

  const defaultProfile = ROLE_DEFAULT_PROFILES[role];
  const actorCode =
    currentUserProfile?.employee_code || defaultProfile.employee_code;
  const actorName = currentUserProfile?.fullName || defaultProfile.fullName;
  const actorDeptIdOverride = (
    currentUserProfile as { department_id?: string } | null
  )?.department_id;
  const actorDeptNameOverride = currentUserProfile?.department;

  const canManageAll = role === 'SUPER_ADMIN' || role === 'HR_MANAGER';
  const isDeptManager = role === 'DEPT_MANAGER';
  const isEmployee = role === 'EMPLOYEE';

  const [activeTab, setActiveTab] = useState<OnboardingSubTab>('progress');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasLoadError, setHasLoadError] = useState<boolean>(false);

  const baseEmployeesRef = useRef<Employee[]>([]);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [records, setRecords] = useState<OnboardingRecord[]>([]);
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [employeeAssets, setEmployeeAssets] = useState<EmployeeAssetAssignment[]>([]);
  const [preboardingInvites, setPreboardingInvites] = useState<PreboardingInvite[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUserAccount[]>([]);
  const [contracts, setContracts] = useState<EmploymentContract[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [expiringProbations, setExpiringProbations] = useState<
    ReturnType<typeof getExpiringProbationContracts>
  >([]);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Tab 1 filters & selection
  const [progressStatusFilter, setProgressStatusFilter] = useState<
    'ALL' | OnboardingStatus
  >('ALL');
  const [progressSearch, setProgressSearch] = useState<string>('');
  const [checklistEmployeeFilter, setChecklistEmployeeFilter] =
    useState<string>('ALL');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Department Task Interactive Controls (for Selected Record)
  const [itEmailInput, setItEmailInput] = useState<string>('');
  const [adminAssetIdInput, setAdminAssetIdInput] = useState<string>('');
  const [adminConditionInput, setAdminConditionInput] = useState<string>(
    'Mới 100%, bàn giao đầy đủ phụ kiện tiêu chuẩn'
  );
  const [adminAssignedDateInput, setAdminAssignedDateInput] =
    useState<string>('2026-11-21');
  const [managerMentorIdInput, setManagerMentorIdInput] = useState<string>('');
  const [managerGoalsInput, setManagerGoalsInput] = useState<string>('');
  const [hrSalaryPercentInput, setHrSalaryPercentInput] = useState<string>('85');
  const [hrOfficialSalaryInput, setHrOfficialSalaryInput] =
    useState<string>('24000000');

  // HR Review & Approve Pre-boarding Modal state
  const [quickUpdateInvite, setQuickUpdateInvite] =
    useState<PreboardingInvite | null>(null);

  // Create New Pre-boarding Invite Modal state
  const [isNewInviteOpen, setIsNewInviteOpen] = useState<boolean>(false);
  const [invFullName, setInvFullName] = useState<string>('');
  const [invPersonalEmail, setInvPersonalEmail] = useState<string>('');
  const [invPhone, setInvPhone] = useState<string>('');
  const [invDeptId, setInvDeptId] = useState<string>('dept-tech-swe');
  const [invPositionName, setInvPositionName] = useState<string>(
    'Kỹ sư Phần mềm Fullstack'
  );
  const [invStartDate, setInvStartDate] = useState<string>('2026-11-02');
  const [invOfficialSalary, setInvOfficialSalary] = useState<string>('25000000');
  const [invProbPct, setInvProbPct] = useState<string>('85');

  // Probation -> Official Conversion Modal state
  const [convertTargetEmp, setConvertTargetEmp] = useState<Employee | null>(null);
  const [convertOfficialDate, setConvertOfficialDate] =
    useState<string>('2026-12-01');
  const [convertSalaryVnd, setConvertSalaryVnd] = useState<string>('24000000');
  const [convertContractType, setConvertContractType] = useState<
    'FIXED_TERM_12M' | 'FIXED_TERM_24M' | 'INDEFINITE_TERM'
  >('FIXED_TERM_12M');
  const [convertKpiScore, setConvertKpiScore] = useState<string>('90');
  const [convertReviewNote, setConvertReviewNote] = useState<string>(
    'Hoàn thành tốt các mục tiêu thử việc 60 ngày, đủ điều kiện ký HĐLĐ chính thức hưởng 100% lương.'
  );

  // Tab 2 filters
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<
    'ALL' | AssetCategory
  >('ALL');
  const [assetStatusFilter, setAssetStatusFilter] = useState<
    'ALL' | AssetStatus
  >('ALL');

  // Create Asset Dialog state
  const [isCreateAssetOpen, setIsCreateAssetOpen] = useState<boolean>(false);
  const [newAssetCode, setNewAssetCode] = useState<string>('');
  const [newAssetName, setNewAssetName] = useState<string>('');
  const [newAssetCategory, setNewAssetCategory] =
    useState<AssetCategory>('LAPTOP');
  const [newAssetSerial, setNewAssetSerial] = useState<string>('');
  const [newAssetStatus, setNewAssetStatus] = useState<
    'AVAILABLE' | 'MAINTENANCE'
  >('AVAILABLE');
  const [newAssetNote, setNewAssetNote] = useState<string>(
    'Mới 100%, nguyên niêm phong hãng'
  );
  const [createAssetError, setCreateAssetError] = useState<string | null>(null);

  // Assign Asset Dialog state
  const [assignTargetAsset, setAssignTargetAsset] =
    useState<CompanyAsset | null>(null);
  const [assignEmployeeCode, setAssignEmployeeCode] = useState<string>('');
  const [assignDate, setAssignDate] = useState<string>('2026-11-21');
  const [assignConditionNote, setAssignConditionNote] = useState<string>(
    'Mới 100%, bàn giao nguyên vẹn kèm sạc chuẩn'
  );

  // Revoke Asset Dialog state
  const [revokeTargetAsset, setRevokeTargetAsset] =
    useState<CompanyAsset | null>(null);
  const [revokeCondition, setRevokeCondition] =
    useState<AssetConditionStatus>('GOOD');
  const [revokePenaltyVnd, setRevokePenaltyVnd] = useState<string>('0');
  const [revokeNote, setRevokeNote] = useState<string>('');

  const syncFromRuntimeStore = useCallback(() => {
    setRecords(getOnboardingRecords());
    setAssets(getCompanyAssets());
    setEmployeeAssets(getEmployeeAssets());
    setPreboardingInvites(getPreboardingInvites());
    setSystemUsers(getSystemUsers());
    setContracts(getContracts());
    setReviews(getPerformanceReviews());
    setExpiringProbations(getExpiringProbationContracts(30));
    if (baseEmployeesRef.current.length > 0) {
      setEmployees(mergeWithRuntimeEmployees(baseEmployeesRef.current));
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const empMock = await fetchEmployeesMock();
      baseEmployeesRef.current = empMock.MOCK_EMPLOYEES;
      setDepartments(empMock.MOCK_DEPARTMENTS);
      setEmployees(mergeWithRuntimeEmployees(empMock.MOCK_EMPLOYEES));
      setRecords(getOnboardingRecords());
      setAssets(getCompanyAssets());
      setEmployeeAssets(getEmployeeAssets());
      setPreboardingInvites(getPreboardingInvites());
      setSystemUsers(getSystemUsers());
      setContracts(getContracts(empMock.MOCK_CONTRACTS));
      setReviews(getPerformanceReviews());
      setExpiringProbations(getExpiringProbationContracts(30));
    } catch {
      setHasLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    window.addEventListener(HRM_RUNTIME_EVENT, syncFromRuntimeStore);
    window.addEventListener('storage', syncFromRuntimeStore);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncFromRuntimeStore);
      window.removeEventListener('storage', syncFromRuntimeStore);
    };
  }, [syncFromRuntimeStore]);

  // Helper to check Department Manager scope
  const isInManagerScope = useCallback(
    (deptId?: string, deptName?: string): boolean => {
      if (actorDeptIdOverride && !DEFAULT_TECH_DEPT_IDS.has(actorDeptIdOverride)) {
        if (deptId === actorDeptIdOverride) return true;
        const childIds = departments
          .filter((d) => d.parent_id === actorDeptIdOverride)
          .map((d) => d.id);
        return Boolean(deptId && childIds.includes(deptId));
      }
      if (
        !actorDeptIdOverride &&
        actorDeptNameOverride &&
        !DEFAULT_TECH_DEPT_NAMES.has(actorDeptNameOverride)
      ) {
        return deptName === actorDeptNameOverride;
      }
      return Boolean(
        (deptId && DEFAULT_TECH_DEPT_IDS.has(deptId)) ||
          (deptName && DEFAULT_TECH_DEPT_NAMES.has(deptName))
      );
    },
    [actorDeptIdOverride, actorDeptNameOverride, departments]
  );

  // Scoped onboarding records by role
  const scopedRecords = useMemo(() => {
    if (isEmployee) {
      return records.filter((r) => r.employee_code === actorCode);
    }
    if (isDeptManager) {
      return records.filter((r) =>
        isInManagerScope(r.department_id, r.department_name)
      );
    }
    return records;
  }, [records, isEmployee, isDeptManager, actorCode, isInManagerScope]);

  // Scoped expiring probation alerts
  const scopedExpiringProbations = useMemo(() => {
    if (isEmployee) return [];
    if (isDeptManager) {
      return expiringProbations.filter((item) =>
        isInManagerScope(
          item.employee?.department_id,
          item.contract.department_name
        )
      );
    }
    return expiringProbations;
  }, [expiringProbations, isEmployee, isDeptManager, isInManagerScope]);

  // Scoped preboarding invites
  const scopedInvites = useMemo(() => {
    if (isEmployee) return [];
    if (isDeptManager) {
      return preboardingInvites.filter((inv) =>
        isInManagerScope(inv.department_id, inv.department_name)
      );
    }
    return preboardingInvites;
  }, [preboardingInvites, isEmployee, isDeptManager, isInManagerScope]);

  // Pending preboarding invites awaiting HR review/candidate submission (SUBMITTED first, then PENDING)
  const pendingPreboardingInvites = useMemo(() => {
    const statusPriority: Record<PreboardingStatus, number> = {
      SUBMITTED: 0,
      PENDING: 1,
      VERIFIED: 2,
      EXPIRED: 3,
    };
    return scopedInvites
      .filter((inv) => inv.status !== 'VERIFIED' && inv.status !== 'EXPIRED')
      .sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
  }, [scopedInvites]);

  // Scoped assets by role
  const scopedAssets = useMemo(() => {
    if (isEmployee) {
      return assets.filter((a) => a.assigned_to_code === actorCode);
    }
    if (isDeptManager) {
      const empByCode = new Map(employees.map((e) => [e.employee_code, e]));
      return assets.filter((a) => {
        if (a.status !== 'ASSIGNED') return true;
        const holder = a.assigned_to_code
          ? empByCode.get(a.assigned_to_code)
          : undefined;
        return isInManagerScope(
          a.assigned_department_id ?? holder?.department_id,
          holder?.department_name
        );
      });
    }
    return assets;
  }, [assets, employees, isEmployee, isDeptManager, actorCode, isInManagerScope]);

  const availableAssets = useMemo(
    () => assets.filter((a) => a.status === 'AVAILABLE'),
    [assets]
  );

  // Deep-link handling via navIntent
  useEffect(() => {
    if (isLoading || !navIntent || navIntent.navId !== 'onboarding') return;

    const eid = navIntent.entityId?.trim();
    const matchedAsset = eid
      ? scopedAssets.find(
          (a) =>
            a.asset_code.toLowerCase() === eid.toLowerCase() ||
            a.id.toLowerCase() === eid.toLowerCase()
        )
      : undefined;
    const matchedRecord = eid
      ? scopedRecords.find(
          (r) =>
            r.id.toLowerCase() === eid.toLowerCase() ||
            r.employee_code.toLowerCase() === eid.toLowerCase() ||
            r.employee_id.toLowerCase() === eid.toLowerCase() ||
            (r.candidate_code &&
              r.candidate_code.toLowerCase() === eid.toLowerCase())
        )
      : undefined;

    const shouldOpenAssets =
      navIntent.subTab === 'assets' ||
      Boolean(
        !matchedRecord &&
          (matchedAsset || (eid && eid.toUpperCase().startsWith('TS-')))
      );

    if (shouldOpenAssets) {
      setActiveTab('assets');
      setAssetCategoryFilter('ALL');
      setAssetStatusFilter('ALL');
      if (eid) {
        setAssetSearch(matchedAsset ? matchedAsset.asset_code : eid);
      }
    } else {
      setActiveTab('progress');
      setProgressStatusFilter('ALL');
      setProgressSearch('');
      if (matchedRecord) {
        setSelectedRecordId(matchedRecord.id);
        setChecklistEmployeeFilter(matchedRecord.id);
      }
    }

    clearNavIntent();
  }, [navIntent, isLoading, scopedAssets, scopedRecords, clearNavIntent]);

  // Filtered onboarding records for Tab 1
  const filteredRecords = useMemo(() => {
    const q = normalizeVietnamese(progressSearch.trim());
    return scopedRecords.filter((rec) => {
      if (progressStatusFilter !== 'ALL' && rec.status !== progressStatusFilter) {
        return false;
      }
      if (q) {
        const haystack = normalizeVietnamese(
          `${rec.id} ${rec.employee_code} ${rec.full_name} ${rec.department_name} ${rec.position_name}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [scopedRecords, progressStatusFilter, progressSearch]);

  // Ensure selectedRecordId points to a valid visible record
  useEffect(() => {
    if (isLoading || navIntent?.navId === 'onboarding') return;
    if (filteredRecords.length === 0) {
      setSelectedRecordId(null);
      return;
    }
    const stillVisible = filteredRecords.some((r) => r.id === selectedRecordId);
    if (!stillVisible) {
      const preferred =
        filteredRecords.find((r) => r.status === 'IN_PROGRESS') ??
        filteredRecords[0];
      setSelectedRecordId(preferred.id);
    }
  }, [isLoading, navIntent, filteredRecords, selectedRecordId]);

  const selectedRecord = useMemo(
    () =>
      filteredRecords.find((r) => r.id === selectedRecordId) ??
      scopedRecords.find((r) => r.id === selectedRecordId) ??
      null,
    [filteredRecords, scopedRecords, selectedRecordId]
  );

  const selectedRecordEmployee = useMemo(() => {
    if (!selectedRecord) return null;
    return (
      employees.find(
        (e) =>
          e.id === selectedRecord.employee_id ||
          e.employee_code === selectedRecord.employee_code
      ) ?? null
    );
  }, [selectedRecord, employees]);

  const selectedRecordInvite = useMemo(() => {
    if (!selectedRecord) return null;
    return (
      preboardingInvites.find(
        (inv) =>
          (selectedRecord.preboarding_token &&
            inv.token === selectedRecord.preboarding_token) ||
          inv.employee_id === selectedRecord.employee_id ||
          inv.employee_code === selectedRecord.employee_code
      ) ?? null
    );
  }, [selectedRecord, preboardingInvites]);

  const selectedRecordSystemUser = useMemo(() => {
    if (!selectedRecord) return null;
    return (
      systemUsers.find(
        (u) =>
          u.employee_code === selectedRecord.employee_code ||
          u.email.toLowerCase() === selectedRecord.email.toLowerCase()
      ) ?? null
    );
  }, [selectedRecord, systemUsers]);

  const selectedRecordProbationContract = useMemo(() => {
    if (!selectedRecord) return null;
    return (
      contracts.find(
        (c) =>
          (c.employee_id === selectedRecord.employee_id ||
            c.employee_code === selectedRecord.employee_code) &&
          c.contract_type === 'PROBATION_2M'
      ) ?? null
    );
  }, [selectedRecord, contracts]);

  const selectedRecordProbationReview = useMemo(() => {
    if (!selectedRecord) return null;
    return (
      reviews.find(
        (r) =>
          (r.employee_id === selectedRecord.employee_id ||
            r.employee_code === selectedRecord.employee_code) &&
          r.cycle === 'PROBATION'
      ) ?? null
    );
  }, [selectedRecord, reviews]);

  const initializedRecordIdRef = useRef<string | null>(null);

  // Populate interactive department inputs only when selectedRecord changes
  useEffect(() => {
    if (!selectedRecord) {
      initializedRecordIdRef.current = null;
      return;
    }
    if (initializedRecordIdRef.current === selectedRecord.id) return;
    initializedRecordIdRef.current = selectedRecord.id;

    setItEmailInput(selectedRecord.email);
    setAdminAssignedDateInput(selectedRecord.start_date || '2026-11-21');
    setAdminAssetIdInput(availableAssets[0]?.id ?? '');
    setAdminConditionInput('Mới 100%, bàn giao đầy đủ phụ kiện tiêu chuẩn');

    const potentialMentors = employees.filter(
      (e) =>
        isOfficialEmployeeStatus(e.employment_status) &&
        e.employee_code !== selectedRecord.employee_code
    );
    const sameDeptMentor = potentialMentors.find(
      (e) => e.department_id === selectedRecord.department_id
    );
    setManagerMentorIdInput(
      selectedRecord.mentor_id ||
        selectedRecordEmployee?.mentor_id ||
        sameDeptMentor?.id ||
        potentialMentors[0]?.id ||
        ''
    );
    setManagerGoalsInput(
      selectedRecord.probation_goals ||
        'Làm chủ quy trình kỹ thuật nội bộ, hoàn thành 100% đầu việc sprint thử việc 60 ngày.'
    );

    const pct =
      selectedRecord.probation_salary_percent ??
      selectedRecordEmployee?.probation_salary_percent ??
      85;
    setHrSalaryPercentInput(String(pct));

    const offSal =
      selectedRecord.official_salary_vnd ??
      selectedRecordEmployee?.official_salary_vnd ??
      (selectedRecordEmployee
        ? Math.round(selectedRecordEmployee.base_salary_vnd / (pct / 100))
        : 24000000);
    setHrOfficialSalaryInput(String(offSal));
  }, [
    selectedRecord,
    selectedRecordEmployee,
    availableAssets,
    employees,
  ]);

  // Keep adminAssetIdInput pointing to an available asset if the chosen one is assigned/removed
  useEffect(() => {
    if (!selectedRecord) return;
    if (
      adminAssetIdInput &&
      availableAssets.some((a) => a.id === adminAssetIdInput)
    ) {
      return;
    }
    const fallbackAssetId = availableAssets[0]?.id ?? '';
    if (fallbackAssetId !== adminAssetIdInput) {
      setAdminAssetIdInput(fallbackAssetId);
    }
  }, [selectedRecord, availableAssets, adminAssetIdInput]);

  // KPI metrics
  const kpiStats = useMemo(() => {
    const inProgressCount = scopedRecords.filter(
      (r) => r.status === 'IN_PROGRESS'
    ).length;
    const completedCount = scopedRecords.filter(
      (r) => r.status === 'COMPLETED'
    ).length;

    let sumPercent = 0;
    let doneItemsTotal = 0;
    let allItemsTotal = 0;
    for (const rec of scopedRecords) {
      const st = getChecklistStats(rec);
      sumPercent += st.percent;
      doneItemsTotal += st.done;
      allItemsTotal += st.total;
    }
    const avgChecklistPercent =
      scopedRecords.length > 0 ? Math.round(sumPercent / scopedRecords.length) : 0;

    const assignedDevicesCount = scopedAssets.filter(
      (a) => a.status === 'ASSIGNED'
    ).length;
    const availableDevicesCount = scopedAssets.filter(
      (a) => a.status === 'AVAILABLE'
    ).length;

    return {
      inProgressCount,
      completedCount,
      avgChecklistPercent,
      doneItemsTotal,
      allItemsTotal,
      assignedDevicesCount,
      availableDevicesCount,
    };
  }, [scopedRecords, scopedAssets]);

  // Filtered assets for Tab 2
  const filteredAssets = useMemo(() => {
    const q = normalizeVietnamese(assetSearch.trim());
    return scopedAssets.filter((asset) => {
      if (
        assetCategoryFilter !== 'ALL' &&
        asset.category !== assetCategoryFilter
      ) {
        return false;
      }
      if (assetStatusFilter !== 'ALL' && asset.status !== assetStatusFilter) {
        return false;
      }
      if (q) {
        const haystack = normalizeVietnamese(
          `${asset.asset_code} ${asset.name} ${asset.serial_number} ${asset.assigned_to_name ?? ''} ${asset.assigned_to_code ?? ''}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [scopedAssets, assetSearch, assetCategoryFilter, assetStatusFilter]);

  const assignableEmployees = useMemo(
    () => employees.filter((emp) => emp.employment_status !== 'RESIGNED'),
    [employees]
  );

  const mentorOptions = useMemo(() => {
    if (!selectedRecord) return [];
    return employees
      .filter(
        (emp) =>
          isOfficialEmployeeStatus(emp.employment_status) &&
          emp.employee_code !== selectedRecord.employee_code
      )
      .map((emp) => ({
        label: `${emp.full_name} (${emp.employee_code} · ${emp.position_name})`,
        value: emp.id,
      }));
  }, [employees, selectedRecord]);

  const handleCopyPreboardingUrl = async (token: string) => {
    const rel = `/preboarding?token=${encodeURIComponent(token)}`;
    const full =
      typeof window !== 'undefined' ? `${window.location.origin}${rel}` : rel;
    try {
      await navigator.clipboard.writeText(full);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 2200);
      showToast('Đã sao chép link Pre-boarding', full, 'success');
    } catch {
      showToast('Đường dẫn Pre-boarding', rel, 'info');
    }
  };

  const openQuickUpdateModal = (invite: PreboardingInvite) => {
    setQuickUpdateInvite(invite);
  };

  const handleSaveQuickUpdatePreboarding = async (
    verifyNow: boolean,
    e?: React.FormEvent
  ) => {
    e?.preventDefault();
    if (!quickUpdateInvite) return;
    const sub = quickUpdateInvite.submitted_data;
    if (!sub || quickUpdateInvite.status === 'PENDING') {
      await alertSwal({
        title: 'Ứng viên chưa hoàn tất khai báo Pre-boarding',
        text: 'HR chỉ kiểm tra và phê duyệt sau khi ứng viên tự khai báo thông tin trên cổng Pre-boarding.',
        icon: 'warning',
      });
      return;
    }

    try {
      const { invite: updated } = hrQuickUpdatePreboarding(
        quickUpdateInvite.token,
        {
          ...sub,
          verify: verifyNow,
          actorName,
        }
      );

      syncFromRuntimeStore();
      setQuickUpdateInvite(null);

      showToast(
        'Đã duyệt hồ sơ Pre-boarding',
        `${updated.full_name} (${updated.employee_code}) · ${PREBOARDING_BADGE_META[updated.status].shortLabel}`,
        'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Không thể duyệt hồ sơ Pre-boarding',
        text: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        icon: 'error',
      });
    }
  };

  const handleCreateNewPreboardingInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invFullName.trim() || !invPersonalEmail.trim()) return;
    const dept =
      departments.find((d) => d.id === invDeptId) ?? departments[0];
    if (!dept) return;

    const result = createPreboardingInvite({
      fullName: invFullName.trim(),
      personalEmail: invPersonalEmail.trim(),
      phone: invPhone.trim() || '0909112233',
      departmentId: dept.id,
      departmentName: dept.department_name,
      positionName: invPositionName.trim() || 'Chuyên viên',
      managerId: dept.manager_id,
      managerName: dept.manager_name,
      expectedStartDate: invStartDate || '2026-11-02',
      officialSalaryVnd: Number(invOfficialSalary) || 25000000,
      probationSalaryPercent: Number(invProbPct) || 85,
      actorName,
    });

    syncFromRuntimeStore();
    setSelectedRecordId(result.onboarding.id);
    setIsNewInviteOpen(false);
    setInvFullName('');
    setInvPersonalEmail('');
    setInvPhone('');

    await alertSwal({
      title: 'Đã mở Cổng Pre-boarding & Lộ trình Hội nhập',
      html: `Hồ sơ <strong>${escapeSwalHtml(result.employee.full_name)}</strong> (<span class="font-mono">${escapeSwalHtml(result.employee.employee_code)}</span>) đã được tạo.<br/><br/>Link Pre-boarding: <span class="font-mono">${escapeSwalHtml(result.invite.preboarding_url)}</span>`,
      icon: 'success',
    });
  };

  const handleSelectRecord = (rec: OnboardingRecord) => {
    setSelectedRecordId(rec.id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.setTimeout(() => {
        detailPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 60);
    }
  };

  // Department Task Runners via completeOnboardingDeptTask
  const handleRunItProvisioning = async (record: OnboardingRecord) => {
    const corpEmail = itEmailInput.trim() || record.email;
    const ok = await confirmSwal({
      title: 'Cấp Email công ty & Kích hoạt Tài khoản SSO?',
      html: `Hệ thống sẽ cấp địa chỉ <span class="font-mono">${escapeSwalHtml(corpEmail)}</span>, chuyển trạng thái tài khoản sang <strong>Đang hoạt động</strong> và đánh dấu hoàn tất nhóm công việc <strong>IT</strong> cho <strong>${escapeSwalHtml(record.full_name)}</strong>.`,
      confirmText: 'Kích hoạt ngay',
      cancelText: 'Hủy',
    });
    if (!ok) return;

    const res = completeOnboardingDeptTask({
      onboardingId: record.id,
      group: 'IT',
      companyEmail: corpEmail,
      actorName,
    });
    syncFromRuntimeStore();
    if (res) {
      showToast(
        'Đã cấp Email & Mở khóa đăng nhập SSO',
        res.sideEffects[0] || `${record.full_name} — ${corpEmail}`,
        'success'
      );
    }
  };

  const handleRunAdminAssetTask = async (record: OnboardingRecord) => {
    if (!adminAssetIdInput) {
      await alertSwal({
        title: 'Chưa chọn tài sản cấp phát',
        text: 'Vui lòng chọn một thiết bị Sẵn sàng trong kho hoặc nhập kho thiết bị mới trước khi bàn giao.',
        icon: 'warning',
      });
      return;
    }

    const assetObj = assets.find((a) => a.id === adminAssetIdInput);
    const ok = await confirmSwal({
      title: 'Xác nhận bàn giao Tài sản & Thẻ từ?',
      html: `Gán thiết bị <strong>${escapeSwalHtml(assetObj?.name ?? adminAssetIdInput)}</strong> (<span class="font-mono">${escapeSwalHtml(assetObj?.asset_code ?? '')}</span>) cho <strong>${escapeSwalHtml(record.full_name)}</strong> ngày <span class="font-mono">${escapeSwalHtml(formatDateVN(adminAssignedDateInput))}</span>, lưu biên bản bàn giao tài sản và hoàn tất nhóm <strong>ADMIN</strong>.`,
      confirmText: 'Xác nhận bàn giao',
      cancelText: 'Hủy',
    });
    if (!ok) return;

    // Assign with explicit assignedDate & assignCondition so employee_assets stores exact date/condition
    const assigned = assignAssetToEmployee({
      assetId: adminAssetIdInput,
      employeeId: record.employee_id,
      employeeCode: record.employee_code,
      employeeName: record.full_name,
      departmentId: record.department_id,
      assignedDate: adminAssignedDateInput || record.start_date,
      assignCondition: adminConditionInput.trim(),
      actorName,
    });

    completeOnboardingDeptTask({
      onboardingId: record.id,
      group: 'ADMIN',
      assignCondition: adminConditionInput.trim(),
      actorName,
    });

    if (assigned) {
      const latestList = getOnboardingRecords();
      const targetRec = latestList.find((r) => r.id === record.id);
      if (
        targetRec &&
        !targetRec.assigned_asset_ids.includes(assigned.asset.id)
      ) {
        saveOnboardingRecord({
          ...targetRec,
          assigned_asset_ids: [...targetRec.assigned_asset_ids, assigned.asset.id],
        });
      }
    }

    syncFromRuntimeStore();
    showToast(
      'Đã bàn giao thiết bị & Hoàn tất nhóm Hành chính',
      `${assigned?.asset.asset_code ?? ''} đã lưu vào lịch sử tài sản nhân viên.`,
      'success'
    );
  };

  const handleSaveMentorOnly = (record: OnboardingRecord) => {
    const mentorEmp = employees.find((e) => e.id === managerMentorIdInput);
    if (!mentorEmp) return;

    assignOnboardingMentor({
      onboardingId: record.id,
      mentorId: mentorEmp.id,
      mentorName: mentorEmp.full_name,
      probationGoals: managerGoalsInput.trim(),
      actorName,
    });
    syncFromRuntimeStore();
    showToast(
      'Đã phân công Mentor hướng dẫn',
      `${mentorEmp.full_name} đồng hành cùng ${record.full_name} trong 60 ngày thử việc.`,
      'success'
    );
  };

  const handleCompleteManagerTask = async (record: OnboardingRecord) => {
    const mentorEmp = employees.find((e) => e.id === managerMentorIdInput);
    const mentorName = mentorEmp?.full_name || 'Buddy chuyên môn';

    const res = completeOnboardingDeptTask({
      onboardingId: record.id,
      group: 'MANAGER',
      mentorId: mentorEmp?.id,
      mentorName,
      probationGoals: managerGoalsInput.trim(),
      actorName,
    });
    syncFromRuntimeStore();
    if (res) {
      showToast(
        'Đã hoàn tất hội nhập chuyên môn (MANAGER)',
        `Mentor: ${mentorName} · Đã chốt mục tiêu KPI thử việc 60 ngày.`,
        'success'
      );
    }
  };

  const handleRunHrProbationContract = async (record: OnboardingRecord) => {
    const pct = Math.min(
      100,
      Math.max(50, Number.parseInt(hrSalaryPercentInput, 10) || 85)
    );
    const officialSal = Number(hrOfficialSalaryInput) || 24000000;
    const probSal = Math.round((officialSal * pct) / 100);

    const ok = await confirmSwal({
      title: 'Phát hành Hợp đồng Thử việc 02 tháng?',
      html: `Khởi tạo Hợp đồng thử việc cho <strong>${escapeSwalHtml(record.full_name)}</strong> (<span class="font-mono">${escapeSwalHtml(record.employee_code)}</span>):<br/>• Mức lương chính thức (100%): <span class="font-mono">${escapeSwalHtml(formatVND(officialSal))}</span><br/>• Tỷ lệ hưởng thử việc: <strong>${escapeSwalHtml(pct)}%</strong> (<span class="font-mono">${escapeSwalHtml(formatVND(probSal))}</span>/tháng, miễn BHXH)<br/>• Cập nhật trạng thái sang <strong>Đang thử việc</strong>.`,
      confirmText: 'Phát hành HĐ Thử việc',
      cancelText: 'Hủy',
    });
    if (!ok) return;

    const res = completeOnboardingDeptTask({
      onboardingId: record.id,
      group: 'HR',
      salaryPercent: pct,
      officialSalaryVnd: officialSal,
      actorName,
    });
    syncFromRuntimeStore();
    if (res) {
      showToast(
        'Đã sinh Hợp đồng Thử việc & Hoàn tất nhóm HR',
        res.sideEffects[0] ||
          `${record.full_name} — Hưởng ${pct}% lương (${formatVND(probSal)})`,
        'success'
      );
    }
  };

  const handleToggleChecklist = (
    record: OnboardingRecord,
    itemId: string,
    group: OnboardingTaskGroup,
    title: string,
    currentlyCompleted: boolean
  ) => {
    if (!canActorToggleGroup(role, group, record.status)) return;

    if (!currentlyCompleted) {
      completeOnboardingDeptTask({
        onboardingId: record.id,
        group,
        itemId,
        companyEmail: group === 'IT' ? itEmailInput || record.email : undefined,
        salaryPercent:
          group === 'HR' ? Number(hrSalaryPercentInput) || 85 : undefined,
        officialSalaryVnd:
          group === 'HR' ? Number(hrOfficialSalaryInput) || undefined : undefined,
        actorName,
      });
    } else {
      toggleOnboardingChecklistItem(record.id, itemId, actorName);
    }

    syncFromRuntimeStore();
    showToast(
      !currentlyCompleted
        ? 'Đã hoàn thành hạng mục hội nhập'
        : 'Đã mở lại hạng mục hội nhập',
      `${record.full_name} — ${title}`,
      'success'
    );
  };

  const handleToggleGroup = (
    record: OnboardingRecord,
    group: OnboardingTaskGroup,
    targetCompleted: boolean
  ) => {
    if (!canActorToggleGroup(role, group, record.status)) return;

    if (targetCompleted) {
      const mentorEmp = employees.find((e) => e.id === managerMentorIdInput);
      completeOnboardingDeptTask({
        onboardingId: record.id,
        group,
        companyEmail: group === 'IT' ? itEmailInput || record.email : undefined,
        mentorId: group === 'MANAGER' ? mentorEmp?.id : undefined,
        mentorName: group === 'MANAGER' ? mentorEmp?.full_name : undefined,
        probationGoals:
          group === 'MANAGER' ? managerGoalsInput.trim() : undefined,
        salaryPercent:
          group === 'HR' ? Number(hrSalaryPercentInput) || 85 : undefined,
        officialSalaryVnd:
          group === 'HR' ? Number(hrOfficialSalaryInput) || undefined : undefined,
        actorName,
      });
    } else {
      toggleOnboardingChecklistGroup(record.id, group, false, actorName);
    }

    syncFromRuntimeStore();
    showToast(
      targetCompleted
        ? 'Đã hoàn tất nhóm công việc'
        : 'Đã mở lại nhóm công việc',
      `${record.full_name} — ${TASK_GROUP_LABELS[group]}`,
      'success'
    );
  };

  const handleToggleAll = (
    record: OnboardingRecord,
    targetCompleted: boolean
  ) => {
    if (!canManageAll) return;
    toggleAllOnboardingChecklist(record.id, targetCompleted, actorName);
    if (targetCompleted) {
      completeOnboardingDeptTask({
        onboardingId: record.id,
        group: 'IT',
        companyEmail: itEmailInput || record.email,
        actorName,
      });
      completeOnboardingDeptTask({
        onboardingId: record.id,
        group: 'HR',
        salaryPercent: Number(hrSalaryPercentInput) || 85,
        officialSalaryVnd: Number(hrOfficialSalaryInput) || undefined,
        actorName,
      });
    }
    syncFromRuntimeStore();
    showToast(
      targetCompleted
        ? 'Đã hoàn tất 100% checklist'
        : 'Đã mở lại toàn bộ checklist',
      `${record.full_name} — ${record.employee_code}`,
      'success'
    );
  };

  const handleCompleteOnboarding = (record: OnboardingRecord) => {
    if (!canManageAll) return;
    const stats = getChecklistStats(record);
    if (stats.percent < 100 || record.status !== 'IN_PROGRESS') return;

    const completed = completeOnboardingRecord(record.id);
    if (!completed) return;
    syncFromRuntimeStore();

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'ONBOARDING_TASK',
      module: 'Onboarding & Tài sản',
      target: `${record.id} (${record.employee_code} - ${record.full_name})`,
      detail: `Hoàn tất 100% quy trình hội nhập cho ${record.full_name} (${record.department_name}).`,
      status: 'SUCCESS',
    });

    showToast(
      'Đã chốt hoàn tất lộ trình Onboarding',
      `${record.full_name} (${record.employee_code}) đã hoàn thành 100% checklist hội nhập.`,
      'success'
    );
  };

  // Manager Quick Probation Review PASS
  const handleQuickPassProbationReview = async (emp: Employee) => {
    const ok = await confirmSwal({
      title: 'Ghi nhận kết quả Đánh giá Thử việc ĐẠT (PASS)?',
      html: `Xác nhận nhân sự <strong>${escapeSwalHtml(emp.full_name)}</strong> (<span class="font-mono">${escapeSwalHtml(emp.employee_code)}</span>) đạt yêu cầu chuyên môn sau 60 ngày thử việc để Phòng Nhân sự chuyển ký Hợp đồng chính thức 100% lương.`,
      confirmText: 'Xác nhận ĐẠT (PASS)',
      cancelText: 'Hủy',
    });
    if (!ok) return;

    savePerformanceReview({
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_id: emp.department_id,
      department_name: emp.department_name,
      position_name: emp.position_name,
      cycle: 'PROBATION',
      period_label: `Thử việc 60 ngày (${emp.join_date.slice(0, 7)})`,
      kpi_score: 90,
      okr_completion_percent: 92,
      grade: 'A',
      result: 'PASS',
      reviewer_id: emp.manager_id ?? 'emp-003',
      reviewer_name: actorName,
      review_note:
        'Hoàn thành tốt các mục tiêu thử việc, đề xuất chuyển chính thức hưởng 100% lương.',
      status: 'APPROVED',
    });

    syncFromRuntimeStore();
    showToast(
      'Đã phê duyệt Đánh giá Thử việc (PASS)',
      `${emp.full_name} (${emp.employee_code}) đủ điều kiện chuyển chính thức.`,
      'success'
    );
  };

  // Open Probation -> Official Conversion Dialog
  const openConvertToOfficialModal = (emp: Employee) => {
    const pct = emp.probation_salary_percent || 85;
    const computed100 =
      emp.official_salary_vnd ??
      Math.round(emp.base_salary_vnd / (pct / 100) / 100000) * 100000;
    const existingPass = reviews.find(
      (r) =>
        (r.employee_id === emp.id || r.employee_code === emp.employee_code) &&
        r.cycle === 'PROBATION' &&
        r.result === 'PASS'
    );
    setConvertTargetEmp(emp);
    setConvertOfficialDate(emp.contract_end_date || '2026-12-01');
    setConvertSalaryVnd(String(computed100));
    setConvertContractType('FIXED_TERM_12M');
    setConvertKpiScore(String(existingPass?.kpi_score ?? 90));
    setConvertReviewNote(
      existingPass?.review_note ??
        'Hoàn thành xuất sắc 60 ngày thử việc, chuyển ký HĐLĐ chính thức hưởng 100% lương.'
    );
  };

  const handleConfirmConvertToOfficial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertTargetEmp) return;

    const salaryNum = Number(convertSalaryVnd) || convertTargetEmp.base_salary_vnd;
    const scoreNum = Math.min(100, Math.max(50, Number(convertKpiScore) || 90));

    const ok = await confirmSwal({
      title: 'Chuyển chính thức (OFFICIAL) & Khởi tạo Quỹ phép năm?',
      html: `Xác nhận chuyển trạng thái nhân sự <strong>${escapeSwalHtml(convertTargetEmp.full_name)}</strong> (<span class="font-mono">${escapeSwalHtml(convertTargetEmp.employee_code)}</span>) sang <strong>OFFICIAL</strong> từ ngày <span class="font-mono">${escapeSwalHtml(formatDateVN(convertOfficialDate))}</span>:<br/>• Sinh HĐLĐ chính thức hưởng <strong>100% lương</strong>: <span class="font-mono">${escapeSwalHtml(formatVND(salaryNum))}</span><br/>• Khởi tạo Quỹ phép năm (<span class="font-mono">leave_balances</span>): <strong>12 ngày</strong><br/>• Ghi nhận Quyết định vào Lịch sử công tác bất biến (<span class="font-mono">career_histories</span>).`,
      confirmText: 'Xác nhận Chuyển chính thức',
      cancelText: 'Kiểm tra lại',
    });
    if (!ok) return;

    try {
      const result = convertProbationToOfficial({
        employeeId: convertTargetEmp.id,
        officialDate: convertOfficialDate,
        officialSalaryVnd: salaryNum,
        contractType: convertContractType,
        reviewerName: actorName,
        kpiScore: scoreNum,
        reviewNote: convertReviewNote.trim(),
      });

      syncFromRuntimeStore();
      setConvertTargetEmp(null);

      await alertSwal({
        title: 'Đã chuyển chính thức thành công (OFFICIAL)',
        html: `Nhân sự <strong>${escapeSwalHtml(result.employee.full_name)}</strong> (<span class="font-mono">${escapeSwalHtml(result.employee.employee_code)}</span>) đã ký HĐLĐ <span class="font-mono">${escapeSwalHtml(result.officialContract.contract_number)}</span> hưởng 100% lương (<span class="font-mono">${escapeSwalHtml(formatVND(result.employee.base_salary_vnd))}</span>), cấp <strong>${escapeSwalHtml(result.leaveBalance.remaining_days)} ngày phép năm</strong> và lưu quyết định <span class="font-mono">${escapeSwalHtml(result.careerEntry.decision_no)}</span>.`,
        icon: 'success',
      });
    } catch (err) {
      await alertSwal({
        title: 'Không thể chuyển chính thức',
        text: err instanceof Error ? err.message : 'Vui lòng kiểm tra lại.',
        icon: 'error',
      });
    }
  };

  // Tab 2 Asset Inventory Handlers (synced with employee_assets)
  const openCreateAssetDialog = () => {
    setNewAssetCode(suggestNextAssetCode(assets));
    setNewAssetName('');
    setNewAssetCategory('LAPTOP');
    setNewAssetSerial('');
    setNewAssetStatus('AVAILABLE');
    setNewAssetNote('Mới 100%, nguyên niêm phong hãng');
    setCreateAssetError(null);
    setIsCreateAssetOpen(true);
  };

  const handleCreateAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAll) return;

    const trimmedCode = newAssetCode.trim().toUpperCase();
    const trimmedName = newAssetName.trim();
    const trimmedSerial = newAssetSerial.trim();

    if (!trimmedCode || !trimmedName || !trimmedSerial) {
      setCreateAssetError(
        'Vui lòng nhập đầy đủ mã tài sản, tên thiết bị và số serial'
      );
      return;
    }
    if (assets.some((a) => a.asset_code.toUpperCase() === trimmedCode)) {
      setCreateAssetError(`Mã tài sản ${trimmedCode} đã tồn tại trong kho`);
      return;
    }

    const created = createCompanyAsset({
      asset_code: trimmedCode,
      name: trimmedName,
      category: newAssetCategory,
      serial_number: trimmedSerial,
      status: newAssetStatus,
      condition_note: newAssetNote.trim() || 'Tình trạng hoạt động tốt',
    });

    syncFromRuntimeStore();
    setIsCreateAssetOpen(false);
    setCreateAssetError(null);

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'ONBOARDING_TASK',
      module: 'Onboarding & Tài sản',
      target: `${created.asset_code} - ${created.name}`,
      detail: `Nhập kho tài sản mới (${ASSET_CATEGORY_META[created.category].shortLabel}, S/N: ${created.serial_number}).`,
      status: 'SUCCESS',
    });

    showToast(
      'Đã nhập kho tài sản mới',
      `${created.asset_code} — ${created.name} đã sẵn sàng quản lý.`,
      'success'
    );
  };

  const openAssignDialog = (asset: CompanyAsset) => {
    setAssignTargetAsset(asset);
    const defaultEmp =
      assignableEmployees.find(
        (e) =>
          e.employment_status === 'PENDING_ONBOARD' ||
          e.employment_status === 'PROBATION'
      ) ?? assignableEmployees[0];
    setAssignEmployeeCode(defaultEmp?.employee_code ?? '');
    setAssignDate('2026-11-21');
    setAssignConditionNote(
      asset.condition_note || 'Mới 100%, bàn giao đầy đủ phụ kiện chuẩn'
    );
  };

  const handleConfirmAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAll || !assignTargetAsset || !assignEmployeeCode) return;

    const emp = assignableEmployees.find(
      (item) => item.employee_code === assignEmployeeCode
    );
    if (!emp) return;

    const res = assignAssetToEmployee({
      assetId: assignTargetAsset.id,
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      employeeName: emp.full_name,
      departmentId: emp.department_id,
      assignedDate: assignDate || '2026-11-21',
      assignCondition: assignConditionNote.trim(),
      actorName,
    });

    if (!res) return;

    const latestOnboarding = getOnboardingRecords();
    const matchingRecord = latestOnboarding.find(
      (r) => r.employee_code === emp.employee_code
    );
    if (
      matchingRecord &&
      !matchingRecord.assigned_asset_ids.includes(assignTargetAsset.id)
    ) {
      saveOnboardingRecord({
        ...matchingRecord,
        assigned_asset_ids: [
          ...matchingRecord.assigned_asset_ids,
          assignTargetAsset.id,
        ],
      });
    }

    syncFromRuntimeStore();
    setAssignTargetAsset(null);

    pushNotification({
      title: `Đã cấp phát tài sản ${res.asset.asset_code}`,
      message: `Phòng Hành chính đã bàn giao ${res.asset.name} (S/N: ${res.asset.serial_number}) cho mã nhân viên ${emp.employee_code}.`,
      category: 'ASSET',
      target_employee_codes: [emp.employee_code],
      nav_id: 'onboarding',
      sub_tab: 'assets',
      entity_id: res.asset.asset_code,
    });

    showToast(
      `Đã cấp phát ${res.asset.asset_code}`,
      `Bàn giao cho ${emp.full_name} (${emp.employee_code}) · Đã lưu biên bản bàn giao.`,
      'success'
    );
  };

  const openRevokeDialog = (asset: CompanyAsset) => {
    setRevokeTargetAsset(asset);
    setRevokeCondition('GOOD');
    setRevokePenaltyVnd('0');
    setRevokeNote('Đã kiểm tra ngoại quan và thu hồi đầy đủ phụ kiện đi kèm');
  };

  const handleConfirmRevoke = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAll || !revokeTargetAsset) return;

    const prevHolderCode = revokeTargetAsset.assigned_to_code;
    const prevHolderName = revokeTargetAsset.assigned_to_name ?? 'nhân sự';
    const penaltyNum = Math.max(0, Number(revokePenaltyVnd) || 0);

    const res = returnEmployeeAssetWithPenalty({
      assetId: revokeTargetAsset.id,
      returnCondition: revokeCondition,
      penaltyAmountVnd: penaltyNum,
      returnNote: revokeNote.trim(),
      actorName,
    });
    if (!res) return;

    if (prevHolderCode) {
      const latestOnboarding = getOnboardingRecords();
      const matchingRecord = latestOnboarding.find(
        (r) => r.employee_code === prevHolderCode
      );
      if (
        matchingRecord &&
        matchingRecord.assigned_asset_ids.includes(revokeTargetAsset.id)
      ) {
        saveOnboardingRecord({
          ...matchingRecord,
          assigned_asset_ids: matchingRecord.assigned_asset_ids.filter(
            (id) => id !== revokeTargetAsset.id
          ),
        });
      }
    }

    syncFromRuntimeStore();
    setRevokeTargetAsset(null);

    showToast(
      `Đã thu hồi ${res.asset.asset_code}`,
      `Thu hồi từ ${prevHolderName} (${revokeCondition}${penaltyNum > 0 ? ` · Đền bù: ${formatVND(penaltyNum)}` : ''}).`,
      'default'
    );
  };

  const roleScopeSubtitle = useMemo(() => {
    switch (role) {
      case 'SUPER_ADMIN':
      case 'HR_MANAGER':
        return 'Điều phối cổng Pre-boarding, lộ trình hội nhập 4 bộ phận, cấp phát tài sản và chuyển chính thức sau thử việc';
      case 'DIRECTOR':
        return 'Tổng quan tiến độ hội nhập nhân sự mới, cảnh báo hết hạn thử việc và phân bổ trang thiết bị toàn công ty';
      case 'DEPT_MANAGER':
        return 'Phân công Mentor, giao mục tiêu 60 ngày và đánh giá kết quả thử việc cho đội ngũ thuộc phạm vi quản lý';
      case 'EMPLOYEE':
        return `Tra cứu tiến độ hội nhập cá nhân và danh mục tài sản công ty đang bàn giao cho ${actorCode}`;
    }
  }, [role, actorCode]);

  // 1. Loading state
  if (uiState === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <Skeleton key={idx} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-9 w-80 max-w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Skeleton className="h-96 w-full rounded-xl lg:col-span-5" />
          <Skeleton className="h-96 w-full rounded-xl lg:col-span-7" />
        </div>
      </div>
    );
  }

  // 2. Error state
  if (uiState === 'error' || hasLoadError) {
    return (
      <Card>
        <CardContent
          className="flex flex-col items-center justify-center py-12 text-center"
          role="alert"
        >
          <AlertCircle
            className="h-8 w-8 text-red-600 dark:text-red-400"
            strokeWidth={1.5}
          />
          <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
            Không thể tải dữ liệu Onboarding &amp; Tài sản
          </p>
          <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
            Kết nối dữ liệu hồ sơ hội nhập hoặc kho thiết bị đang gián đoạn, vui lòng thử lại
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setUiState('ready');
              void loadInitialData();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 3. Explicit Empty state
  if (uiState === 'empty') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Onboarding &amp; Tài sản cấp phát
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            {roleScopeSubtitle}
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <ClipboardCheck
              className="h-8 w-8 text-[#5C7871] dark:text-zinc-500"
              strokeWidth={1.5}
            />
            <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
              Chưa có hồ sơ hội nhập
            </p>
            <p className="mt-1 max-w-md text-xs text-[#415A54] dark:text-zinc-400">
              Mở Pre-boarding mới hoặc tiếp nhận ứng viên trúng tuyển để bắt đầu.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setUiState('ready')}
              >
                Hiển thị dữ liệu hiện có
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasActiveAssetFilters =
    Boolean(assetSearch.trim()) ||
    assetCategoryFilter !== 'ALL' ||
    assetStatusFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
          Onboarding &amp; Tài sản
        </h1>
        {canManageAll && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsNewInviteOpen(true)}
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.5} />
              Mở Pre-boarding
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={openCreateAssetDialog}
            >
              <PackagePlus className="h-4 w-4" strokeWidth={1.5} />
              Thêm tài sản
            </Button>
          </div>
        )}
      </div>

      {/* Main 2-Tab View */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as OnboardingSubTab)}
      >
        <TabsList className="w-full justify-start overflow-x-auto border border-[#C6D9D3] bg-[#E4EEEB] dark:border-zinc-800/80 dark:bg-zinc-900 sm:w-auto">
          <TabsTrigger
            value="progress"
            className={cn(
              'gap-1.5',
              activeTab === 'progress'
                ? 'border border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
            Tiến độ Onboarding &amp; Pre-boarding
            <span className="ml-0.5 font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
              ({scopedRecords.length})
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="assets"
            className={cn(
              'gap-1.5',
              activeTab === 'assets'
                ? 'border border-[#C6D9D3] bg-[#FCFEFD] font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-transparent dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-[#415A54] hover:text-[#11221E] dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <Laptop className="h-4 w-4" strokeWidth={1.5} />
            {isEmployee ? 'Tài sản đang giữ' : 'Kho & Tài sản cấp phát'}
            <span className="ml-0.5 font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
              ({scopedAssets.length})
            </span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TIẾN ĐỘ ONBOARDING & PRE-BOARDING */}
        <TabsContent value="progress" className="space-y-4">
          {/* Active Pre-boarding Invites Strip */}
          {!isEmployee && pendingPreboardingInvites.length > 0 && (
            <Card className="overflow-hidden bg-white dark:bg-[#121214]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-zinc-800/80">
                <h2 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  Pre-boarding chờ duyệt
                </h2>
                <span className="font-mono text-xs font-medium tabular-nums text-slate-400 dark:text-zinc-400">
                  {pendingPreboardingInvites.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                {pendingPreboardingInvites.map((inv) => {
                  const stMeta = PREBOARDING_BADGE_META[inv.status];
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[#11221E] dark:text-zinc-100">
                          {inv.full_name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-zinc-400">
                          {inv.employee_code} · {inv.position_title || inv.position_name}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Badge variant={stMeta.variant}>
                          {stMeta.shortLabel}
                        </Badge>
                        {canManageAll && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => openQuickUpdateModal(inv)}
                          >
                            Duyệt hồ sơ
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 px-0"
                          aria-label={`Sao chép link Pre-boarding của ${inv.full_name}`}
                          title="Sao chép link Pre-boarding"
                          onClick={() => void handleCopyPreboardingUrl(inv.token)}
                        >
                          {copiedToken === inv.token ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                          ) : (
                            <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={1.5} />
                          )}
                        </Button>
                        <Link
                          href={inv.preboarding_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Mở cổng Pre-boarding của ${inv.full_name}`}
                          title="Mở cổng Pre-boarding"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#C6D9D3] bg-white text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {isEmployee && scopedRecords.length === 0 ? (
            <Card className="bg-white dark:bg-[#121214]">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                      Hồ sơ nhân sự chính thức ({actorCode})
                    </span>
                    <Badge variant="success">Đã hoàn tất hội nhập</Badge>
                  </div>
                  <p className="text-xs leading-5 text-[#415A54] dark:text-zinc-400">
                    Tài khoản {actorName} hiện không có mục checklist hội nhập nào đang chờ xử lý.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setActiveTab('assets')}
                >
                  <PackageCheck className="h-4 w-4" strokeWidth={1.5} />
                  Xem tài sản đang giữ ({scopedAssets.length})
                </Button>
              </CardContent>
            </Card>
          ) : (
            (() => {
              const todayIso = getTodayDateVN();
              const q = normalizeVietnamese(progressSearch.trim());
              const targetRecords =
                checklistEmployeeFilter === 'ALL'
                  ? scopedRecords
                  : scopedRecords.filter(
                      (rec) => rec.id === checklistEmployeeFilter
                    );

              const flatChecklistItems = targetRecords
                .flatMap((rec) =>
                  rec.checklist
                    .filter((item) => {
                      if (!q) return true;
                      const haystack = normalizeVietnamese(
                        `${item.title} ${rec.full_name} ${rec.employee_code} ${rec.department_name} ${rec.position_name}`
                      );
                      return haystack.includes(q);
                    })
                    .map((item) => ({ rec, item }))
                )
                .sort((a, b) => {
                  if (a.item.completed !== b.item.completed) {
                    return a.item.completed ? 1 : -1;
                  }
                  return 0;
                });

              const focusedRecord =
                checklistEmployeeFilter !== 'ALL'
                  ? scopedRecords.find((r) => r.id === checklistEmployeeFilter) ??
                    null
                  : targetRecords.length === 1
                    ? targetRecords[0]
                    : null;
              const focusedEmployee = focusedRecord
                ? employees.find(
                    (e) =>
                      e.id === focusedRecord.employee_id ||
                      e.employee_code === focusedRecord.employee_code
                  ) ?? null
                : null;
              const focusedStats = focusedRecord
                ? getChecklistStats(focusedRecord)
                : null;
              const canCompleteFocused = Boolean(
                canManageAll &&
                  focusedRecord &&
                  focusedRecord.status === 'IN_PROGRESS'
              );
              const canConvertFocused = Boolean(
                canManageAll &&
                  focusedEmployee &&
                  !isOfficialEmployeeStatus(focusedEmployee.employment_status) &&
                  focusedEmployee.employment_status !== 'RESIGNED'
              );
              const showFocusedFooter = Boolean(
                focusedRecord &&
                  focusedStats &&
                  (canCompleteFocused || canConvertFocused)
              );

              return (
                <Card className="overflow-hidden bg-white dark:bg-[#121214]">
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-zinc-800/80 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
                      Checklist Onboarding
                    </h2>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {!isEmployee && scopedRecords.length > 0 && (
                        <div className="w-full sm:w-56">
                          <Select
                            aria-label="Lọc theo nhân viên"
                            value={checklistEmployeeFilter}
                            onValueChange={(val) => {
                              setChecklistEmployeeFilter(val);
                              setSelectedRecordId(val === 'ALL' ? null : val);
                            }}
                            options={[
                              { label: 'Tất cả nhân viên', value: 'ALL' },
                              ...scopedRecords.map((rec) => ({
                                label: `${rec.full_name} (${rec.employee_code})`,
                                value: rec.id,
                              })),
                            ]}
                          />
                        </div>
                      )}
                      <div className="relative w-full sm:w-52">
                        <Search
                          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-zinc-500"
                          strokeWidth={1.5}
                        />
                        <Input
                          value={progressSearch}
                          onChange={(e) => setProgressSearch(e.target.value)}
                          placeholder="Tìm đầu việc, nhân viên..."
                          aria-label="Tìm đầu việc Onboarding"
                          className="h-9 pl-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {flatChecklistItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                      <ClipboardCheck
                        className="h-7 w-7 text-slate-400 dark:text-zinc-500"
                        strokeWidth={1.5}
                      />
                      <p className="mt-2.5 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                        Không có đầu việc Onboarding phù hợp
                      </p>
                      {(progressSearch || checklistEmployeeFilter !== 'ALL') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => {
                            setProgressSearch('');
                            setChecklistEmployeeFilter('ALL');
                          }}
                        >
                          Xóa bộ lọc
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                      {flatChecklistItems.map(({ rec, item }) => {
                        const isOverdue =
                          !item.completed && rec.start_date < todayIso;
                        const canToggle = canActorToggleGroup(
                          role,
                          item.group,
                          rec.status
                        );

                        return (
                          <label
                            key={`${rec.id}-${item.id}`}
                            className={cn(
                              'flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-slate-50/70 dark:hover:bg-zinc-900/40',
                              canToggle ? 'cursor-pointer' : 'cursor-default'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={item.completed}
                              disabled={!canToggle}
                              onChange={() =>
                                handleToggleChecklist(
                                  rec,
                                  item.id,
                                  item.group,
                                  item.title,
                                  item.completed
                                )
                              }
                              aria-label={`${item.title} — ${rec.full_name}`}
                              className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#0F766E] accent-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  'truncate text-sm font-medium',
                                  item.completed
                                    ? 'text-slate-400 line-through dark:text-zinc-500'
                                    : 'text-[#11221E] dark:text-zinc-100'
                                )}
                              >
                                {item.title}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-zinc-400">
                                {rec.full_name} · Hạn: {rec.start_date}
                              </div>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium',
                                item.completed
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-400'
                                  : isOverdue
                                    ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-400'
                                    : 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400'
                              )}
                            >
                              {item.completed
                                ? 'Hoàn tất'
                                : isOverdue
                                  ? 'Quá hạn'
                                  : 'Đang làm'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {showFocusedFooter && focusedRecord && focusedStats && (
                    <div className="flex flex-col gap-2.5 border-t border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-xs text-[#415A54] dark:text-zinc-400">
                        <strong className="font-medium text-[#11221E] dark:text-zinc-100">
                          {focusedRecord.full_name}
                        </strong>{' '}
                        ({focusedRecord.employee_code}) · Hoàn thành{' '}
                        <span className="font-mono font-medium tabular-nums">
                          {focusedStats.done}/{focusedStats.total}
                        </span>{' '}
                        mục ({focusedStats.percent}%)
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {canCompleteFocused && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={focusedStats.percent < 100}
                            title={
                              focusedStats.percent < 100
                                ? 'Hoàn tất 100% đầu việc để chốt Onboarding'
                                : 'Chốt hoàn tất Onboarding'
                            }
                            onClick={() =>
                              handleCompleteOnboarding(focusedRecord)
                            }
                          >
                            <CheckCircle2
                              className="h-3.5 w-3.5"
                              strokeWidth={1.5}
                            />
                            Chốt hoàn tất
                          </Button>
                        )}
                        {canConvertFocused && focusedEmployee && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openConvertToOfficialModal(focusedEmployee)
                            }
                          >
                            <Award className="h-3.5 w-3.5" strokeWidth={1.5} />
                            Chuyển chính thức
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })()
          )}
        </TabsContent>

        {/* TAB 2: KHO & TÀI SẢN CẤP PHÁT */}
        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative sm:col-span-2">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Tìm mã TS, tên thiết bị, serial hoặc người giữ..."
                    aria-label="Tìm kiếm tài sản"
                    className="pl-9"
                  />
                </div>

                <Select
                  aria-label="Lọc loại tài sản"
                  value={assetCategoryFilter}
                  onValueChange={(v) =>
                    setAssetCategoryFilter(v as 'ALL' | AssetCategory)
                  }
                  options={[
                    { label: 'Tất cả loại thiết bị', value: 'ALL' },
                    { label: 'Máy tính xách tay (Laptop)', value: 'LAPTOP' },
                    { label: 'Màn hình rời (Monitor)', value: 'MONITOR' },
                    { label: 'Thẻ từ & Kiểm soát', value: 'ACCESS_CARD' },
                    { label: 'Thiết bị ngoại vi', value: 'PERIPHERAL' },
                  ]}
                />

                <Select
                  aria-label="Lọc trạng thái tài sản"
                  value={assetStatusFilter}
                  onValueChange={(v) =>
                    setAssetStatusFilter(v as 'ALL' | AssetStatus)
                  }
                  options={[
                    { label: 'Tất cả trạng thái', value: 'ALL' },
                    { label: 'Đang cấp phát', value: 'ASSIGNED' },
                    { label: 'Sẵn sàng trong kho', value: 'AVAILABLE' },
                    { label: 'Đang bảo trì', value: 'MAINTENANCE' },
                  ]}
                />
              </div>

              {hasActiveAssetFilters && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#D5E3DF] pt-2.5 text-xs dark:border-zinc-800/80">
                  <div className="flex flex-wrap items-center gap-1.5 text-[#415A54] dark:text-zinc-400">
                    <span>Đang lọc:</span>
                    {assetSearch.trim() && (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        Từ khóa: {assetSearch.trim()}
                      </Badge>
                    )}
                    {assetCategoryFilter !== 'ALL' && (
                      <Badge variant="secondary">
                        {ASSET_CATEGORY_META[assetCategoryFilter].shortLabel}
                      </Badge>
                    )}
                    {assetStatusFilter !== 'ALL' && (
                      <Badge variant="secondary">
                        {ASSET_STATUS_META[assetStatusFilter].label}
                      </Badge>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAssetSearch('');
                      setAssetCategoryFilter('ALL');
                      setAssetStatusFilter('ALL');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] transition-colors hover:underline dark:text-teal-400"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Xóa bộ lọc
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214] dark:shadow-none">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="whitespace-nowrap px-4 py-3">Mã tài sản</th>
                      <th className="px-4 py-3">Thiết bị</th>
                      <th className="whitespace-nowrap px-4 py-3">Phân loại</th>
                      <th className="whitespace-nowrap px-4 py-3">Số Serial</th>
                      <th className="whitespace-nowrap px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Người giữ</th>
                      <th className="px-4 py-3">Ghi chú tình trạng</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/80">
                    {filteredAssets.length === 0 ? (
                      <tr className="bg-[#FCFEFD] dark:bg-transparent">
                        <td
                          colSpan={8}
                          className="px-5 py-12 text-center text-sm text-[#415A54] dark:text-zinc-400"
                        >
                          <div>
                            {isEmployee
                              ? `Hiện chưa có tài sản nào được bàn giao cho mã ${actorCode}`
                              : 'Không tìm thấy tài sản nào khớp bộ lọc hiện tại'}
                          </div>
                          {hasActiveAssetFilters && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => {
                                setAssetSearch('');
                                setAssetCategoryFilter('ALL');
                                setAssetStatusFilter('ALL');
                              }}
                            >
                              Xóa bộ lọc
                            </Button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredAssets.map((asset) => {
                        const catMeta = ASSET_CATEGORY_META[asset.category];
                        const statusMeta = ASSET_STATUS_META[asset.status];
                        return (
                          <tr
                            key={asset.id}
                            className="transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium tabular-nums text-[#0F766E] dark:text-teal-400">
                              {asset.asset_code}
                            </td>
                            <td className="px-4 py-3 font-semibold text-[#11221E] dark:text-zinc-100">
                              <div className="flex items-center gap-2">
                                {renderCategoryIcon(asset.category)}
                                <span>{asset.name}</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-[#415A54] dark:text-zinc-400">
                              {catMeta.shortLabel}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                              {asset.serial_number}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <Badge variant={statusMeta.variant}>
                                {statusMeta.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {asset.status === 'ASSIGNED' &&
                              asset.assigned_to_code ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                                    {asset.assigned_to_name}
                                  </span>
                                  <span className="font-mono text-[11px] tabular-nums text-[#415A54] dark:text-zinc-400">
                                    ({asset.assigned_to_code}
                                    {asset.assigned_at
                                      ? ` · ${formatDateVN(asset.assigned_at)}`
                                      : ''}
                                    )
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[#5C7871] dark:text-zinc-500">
                                  —
                                </span>
                              )}
                            </td>
                            <td
                              className="max-w-xs truncate px-4 py-3 text-xs text-[#415A54] dark:text-zinc-400"
                              title={asset.condition_note}
                            >
                              {asset.condition_note}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              {!canManageAll ? (
                                <span className="text-xs text-[#5C7871] dark:text-zinc-500">
                                  Chỉ xem
                                </span>
                              ) : asset.status === 'AVAILABLE' ? (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => openAssignDialog(asset)}
                                >
                                  Cấp phát
                                </Button>
                              ) : asset.status === 'ASSIGNED' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openRevokeDialog(asset)}
                                >
                                  Thu hồi
                                </Button>
                              ) : (
                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                  Đang bảo trì
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG 1: HR REVIEW & VERIFY PRE-BOARDING (READ-ONLY) */}
      <Dialog
        open={Boolean(quickUpdateInvite)}
        onOpenChange={(open) => {
          if (!open) setQuickUpdateInvite(null);
        }}
      >
        <DialogContent className="flex max-h-[88dvh] max-w-2xl flex-col overflow-hidden p-0">
          {quickUpdateInvite &&
            (() => {
              const sub = quickUpdateInvite.submitted_data;
              const isNotSubmitted =
                !sub || quickUpdateInvite.status === 'PENDING';
              const inviteBadge = PREBOARDING_BADGE_META[quickUpdateInvite.status];

              return (
                <>
                  <div className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800/80">
                    <DialogHeader>
                      <div className="flex flex-wrap items-center gap-2 pr-6">
                        <DialogTitle>
                          HR Rà soát &amp; Duyệt Hồ sơ Pre-boarding
                        </DialogTitle>
                        <Badge variant={inviteBadge.variant}>
                          {inviteBadge.shortLabel}
                        </Badge>
                      </div>
                      <DialogDescription>
                        {quickUpdateInvite.full_name} (
                        {quickUpdateInvite.employee_code}) ·{' '}
                        {quickUpdateInvite.position_title ||
                          quickUpdateInvite.position_name}
                      </DialogDescription>
                    </DialogHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    {isNotSubmitted ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-8 text-center dark:border-amber-800/50 dark:bg-amber-950/20">
                        <AlertCircle
                          className="h-8 w-8 text-amber-600 dark:text-amber-400"
                          strokeWidth={1.5}
                        />
                        <p className="mt-3 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                          Ứng viên chưa hoàn tất khai báo Pre-boarding
                        </p>
                        <p className="mt-1 max-w-md text-xs leading-5 text-[#415A54] dark:text-zinc-400">
                          HR chỉ kiểm tra và phê duyệt sau khi ứng viên tự khai báo thông tin trên cổng Pre-boarding.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() =>
                            void handleCopyPreboardingUrl(
                              quickUpdateInvite.token
                            )
                          }
                        >
                          {copiedToken === quickUpdateInvite.token ? (
                            <Check
                              className="h-4 w-4 text-emerald-600"
                              strokeWidth={1.75}
                            />
                          ) : (
                            <ClipboardCopy
                              className="h-4 w-4"
                              strokeWidth={1.5}
                            />
                          )}
                          Copy link cổng Pre-boarding
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3.5 text-xs">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Số CCCD
                            </div>
                            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                              {sub.national_id || '—'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Ngày cấp CCCD
                            </div>
                            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                              {sub.national_id_issue_date
                                ? formatDateVN(sub.national_id_issue_date)
                                : '—'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Nơi cấp CCCD
                            </div>
                            <div className="mt-1 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                              {sub.national_id_issue_place || '—'}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Mã số thuế TNCN
                            </div>
                            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                              {sub.tax_code || '—'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Mã số BHXH
                            </div>
                            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                              {sub.social_insurance_no || '—'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Người phụ thuộc
                            </div>
                            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                              {sub.dependents_count ?? 0}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Ngân hàng nhận lương
                            </div>
                            <div className="mt-1 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                              {sub.bank_name || '—'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Số tài khoản ngân hàng
                            </div>
                            <div className="mt-1 font-mono text-sm font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                              {sub.bank_account_no || '—'}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                          <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                            Địa chỉ cư trú
                          </div>
                          <div className="mt-1 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                            {sub.address || '—'}
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                          <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                            Liên hệ khẩn cấp
                          </div>
                          <div className="mt-1 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                            {sub.emergency_contact_name || '—'} ·{' '}
                            <span className="font-mono tabular-nums">
                              {sub.emergency_contact_phone || '—'}
                            </span>{' '}
                            · {sub.emergency_contact_relation || '—'}
                          </div>
                        </div>

                        {(sub.id_card_file_name || sub.degree_file_name) && (
                          <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <div className="text-[11px] font-medium text-slate-400 dark:text-zinc-400">
                              Tệp đính kèm ứng viên đã tải lên
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              {sub.id_card_file_name && (
                                <span className="inline-flex items-center rounded-md border border-[#C6D9D3] bg-white px-2.5 py-1 font-mono text-[11px] text-[#11221E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                                  CCCD: {sub.id_card_file_name}
                                </span>
                              )}
                              {sub.degree_file_name && (
                                <span className="inline-flex items-center rounded-md border border-[#C6D9D3] bg-white px-2.5 py-1 font-mono text-[11px] text-[#11221E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                                  Bằng cấp: {sub.degree_file_name}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 border-t border-[#C6D9D3] bg-[#FCFEFD] px-6 py-3.5 dark:border-zinc-800/80 dark:bg-[#121214]">
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setQuickUpdateInvite(null)}
                      >
                        Đóng
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={isNotSubmitted}
                        onClick={() =>
                          void handleSaveQuickUpdatePreboarding(true)
                        }
                      >
                        Duyệt hồ sơ
                      </Button>
                    </DialogFooter>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: CONVERT PROBATION TO OFFICIAL */}
      <Dialog
        open={Boolean(convertTargetEmp)}
        onOpenChange={(open) => {
          if (!open) setConvertTargetEmp(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {convertTargetEmp && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Chuyển chính thức (OFFICIAL) &amp; Ký HĐLĐ 100% lương
                </DialogTitle>
                <DialogDescription>
                  {convertTargetEmp.full_name} ({convertTargetEmp.employee_code}) ·{' '}
                  {convertTargetEmp.position_name}
                </DialogDescription>
              </DialogHeader>

              <form
                onSubmit={(e) => void handleConfirmConvertToOfficial(e)}
                className="mt-4 space-y-3.5 text-xs"
              >
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                    Tự động thực thi 4 tác vụ đồng bộ khi xác nhận:
                  </div>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[#415A54] dark:text-zinc-400">
                    <li>
                      Cập nhật trạng thái sang <span className="font-mono">OFFICIAL</span> &amp; ghi nhận <span className="font-mono">official_date</span>
                    </li>
                    <li>
                      Phát hành Hợp đồng chính thức hưởng <strong>100% lương</strong> (tách lương tự động nếu giữa kỳ)
                    </li>
                    <li>
                      Khởi tạo Quỹ phép năm (<span className="font-mono">leave_balances</span>): <strong>12 ngày phép/năm</strong>
                    </li>
                    <li>
                      Ghi nhận Quyết định vào <span className="font-mono">career_histories</span> bất biến
                    </li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Ngày chính thức (official_date) *
                    </label>
                    <Input
                      type="date"
                      value={convertOfficialDate}
                      onChange={(e) => setConvertOfficialDate(e.target.value)}
                      className="font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Loại Hợp đồng chính thức *
                    </label>
                    <Select
                      value={convertContractType}
                      onValueChange={(v) =>
                        setConvertContractType(
                          v as
                            | 'FIXED_TERM_12M'
                            | 'FIXED_TERM_24M'
                            | 'INDEFINITE_TERM'
                        )
                      }
                      options={[
                        { label: 'Xác định thời hạn 12 tháng', value: 'FIXED_TERM_12M' },
                        { label: 'Xác định thời hạn 24 tháng', value: 'FIXED_TERM_24M' },
                        { label: 'Không xác định thời hạn', value: 'INDEFINITE_TERM' },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Mức lương chính thức 100% (VND) *
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={
                        convertSalaryVnd
                          ? formatNumberVN(Number(convertSalaryVnd))
                          : ''
                      }
                      onChange={(e) =>
                        setConvertSalaryVnd(e.target.value.replace(/\D/g, ''))
                      }
                      className="font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                      Điểm đánh giá thử việc (KPI / 100)
                    </label>
                    <Input
                      type="number"
                      min={50}
                      max={100}
                      value={convertKpiScore}
                      onChange={(e) => setConvertKpiScore(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                    Nhận xét nghiệm thu thử việc
                  </label>
                  <Input
                    value={convertReviewNote}
                    onChange={(e) => setConvertReviewNote(e.target.value)}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConvertTargetEmp(null)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    <Award className="h-4 w-4" strokeWidth={1.5} />
                    Ký HĐ Chính thức &amp; Cấp 12 ngày phép
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: CREATE NEW PRE-BOARDING INVITE */}
      <Dialog open={isNewInviteOpen} onOpenChange={setIsNewInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mở Cổng Pre-boarding cho Ứng viên mới</DialogTitle>
            <DialogDescription>
              Tự động khởi tạo nhân sự PENDING_ONBOARD, khóa tạm tài khoản SSO và tạo checklist 4 bộ phận
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => void handleCreateNewPreboardingInvite(e)}
            className="mt-4 space-y-3.5 text-xs"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Họ và tên ứng viên *
                </label>
                <Input
                  value={invFullName}
                  onChange={(e) => setInvFullName(e.target.value)}
                  placeholder="Ví dụ: Đỗ Hoàng Phúc"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Email cá nhân nhận link *
                </label>
                <Input
                  type="email"
                  value={invPersonalEmail}
                  onChange={(e) => setInvPersonalEmail(e.target.value)}
                  placeholder="phuc.do@gmail.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Số điện thoại
                </label>
                <Input
                  value={invPhone}
                  onChange={(e) => setInvPhone(e.target.value)}
                  className="font-mono tabular-nums"
                  placeholder="0909112233"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Ngày dự kiến nhận việc
                </label>
                <Input
                  type="date"
                  value={invStartDate}
                  onChange={(e) => setInvStartDate(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Phòng ban tiếp nhận
                </label>
                <Select
                  value={invDeptId}
                  onValueChange={setInvDeptId}
                  options={departments.map((d) => ({
                    label: d.department_name,
                    value: d.id,
                  }))}
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Chức danh
                </label>
                <Input
                  value={invPositionName}
                  onChange={(e) => setInvPositionName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Lương chính thức 100% (VND)
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={
                    invOfficialSalary
                      ? formatNumberVN(Number(invOfficialSalary))
                      : ''
                  }
                  onChange={(e) =>
                    setInvOfficialSalary(e.target.value.replace(/\D/g, ''))
                  }
                  className="font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-[#415A54] dark:text-zinc-300">
                  Tỷ lệ hưởng thử việc (%)
                </label>
                <Select
                  value={invProbPct}
                  onValueChange={setInvProbPct}
                  options={[
                    { label: '85% lương chính thức', value: '85' },
                    { label: '90% lương chính thức', value: '90' },
                    { label: '100% lương chính thức', value: '100' },
                  ]}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewInviteOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Sinh link Pre-boarding &amp; Tạo Onboarding
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: CREATE ASSET */}
      <Dialog open={isCreateAssetOpen} onOpenChange={setIsCreateAssetOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm tài sản mới vào kho</DialogTitle>
            <DialogDescription>
              Ghi nhận thiết bị CNTT hoặc thẻ từ mới để sẵn sàng bàn giao cho nhân sự
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAsset} className="mt-4 space-y-3.5">
            {createAssetError && (
              <div
                role="alert"
                className="rounded-lg border border-red-600/30 bg-red-50/80 px-3 py-2 text-xs text-red-800 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-300"
              >
                {createAssetError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="new-asset-code"
                  className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Mã tài sản *
                </label>
                <Input
                  id="new-asset-code"
                  value={newAssetCode}
                  onChange={(e) => setNewAssetCode(e.target.value)}
                  className="font-mono tabular-nums"
                  placeholder="TS-LT-2026-056"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="new-asset-category"
                  className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Loại tài sản *
                </label>
                <Select
                  id="new-asset-category"
                  value={newAssetCategory}
                  onValueChange={(v) => {
                    const nextCat = v as AssetCategory;
                    setNewAssetCategory(nextCat);
                    setNewAssetCode(suggestNextAssetCode(assets, nextCat));
                  }}
                  options={[
                    { label: 'Máy tính xách tay (Laptop)', value: 'LAPTOP' },
                    { label: 'Màn hình rời (Monitor)', value: 'MONITOR' },
                    { label: 'Thẻ từ & Kiểm soát', value: 'ACCESS_CARD' },
                    { label: 'Thiết bị ngoại vi', value: 'PERIPHERAL' },
                  ]}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="new-asset-name"
                className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Tên thiết bị / quy cách *
              </label>
              <Input
                id="new-asset-name"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                placeholder="Ví dụ: ThinkPad X1 Carbon Gen 11 (16GB/512GB)"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="new-asset-serial"
                  className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Số Serial / Mã định danh *
                </label>
                <Input
                  id="new-asset-serial"
                  value={newAssetSerial}
                  onChange={(e) => setNewAssetSerial(e.target.value)}
                  placeholder="PF4L9X21"
                  className="font-mono tabular-nums"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="new-asset-status"
                  className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Trạng thái nhập kho
                </label>
                <Select
                  id="new-asset-status"
                  value={newAssetStatus}
                  onValueChange={(v) =>
                    setNewAssetStatus(v as 'AVAILABLE' | 'MAINTENANCE')
                  }
                  options={[
                    { label: 'Sẵn sàng trong kho', value: 'AVAILABLE' },
                    { label: 'Đang bảo trì / kiểm định', value: 'MAINTENANCE' },
                  ]}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="new-asset-note"
                className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                Ghi chú tình trạng thiết bị
              </label>
              <Input
                id="new-asset-note"
                value={newAssetNote}
                onChange={(e) => setNewAssetNote(e.target.value)}
                placeholder="Mới 100%, kèm bộ sạc chuẩn hãng"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateAssetOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" variant="primary">
                Lưu vào kho
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 5: ASSIGN ASSET */}
      <Dialog
        open={Boolean(assignTargetAsset)}
        onOpenChange={(open) => {
          if (!open) setAssignTargetAsset(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {assignTargetAsset && (
            <>
              <DialogHeader>
                <DialogTitle>Cấp phát tài sản cho nhân sự</DialogTitle>
                <DialogDescription>
                  Lưu biên bản cấp phát vào employee_assets kèm ngày bàn giao và tình trạng thực tế
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleConfirmAssign} className="mt-4 space-y-4">
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3.5 text-xs dark:border-zinc-800/80 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                      {assignTargetAsset.asset_code}
                    </span>
                    <Badge variant="secondary">
                      {ASSET_CATEGORY_META[assignTargetAsset.category].shortLabel}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                    {assignTargetAsset.name}
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                    S/N: {assignTargetAsset.serial_number} ·{' '}
                    {assignTargetAsset.condition_note}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="assign-emp-select"
                    className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Nhân viên tiếp nhận *
                  </label>
                  <Select
                    id="assign-emp-select"
                    value={assignEmployeeCode}
                    onValueChange={setAssignEmployeeCode}
                    options={assignableEmployees.map((emp) => ({
                      label: `${emp.employee_code} — ${emp.full_name} (${emp.department_name})`,
                      value: emp.employee_code,
                    }))}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="assign-date-input"
                      className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Ngày bàn giao *
                    </label>
                    <Input
                      id="assign-date-input"
                      type="date"
                      value={assignDate}
                      onChange={(e) => setAssignDate(e.target.value)}
                      className="font-mono tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                      Tình trạng bàn giao *
                    </label>
                    <Input
                      value={assignConditionNote}
                      onChange={(e) => setAssignConditionNote(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAssignTargetAsset(null)}
                  >
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!assignEmployeeCode}
                  >
                    Xác nhận cấp phát
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG 6: REVOKE ASSET WITH CONDITION & PENALTY */}
      <Dialog
        open={Boolean(revokeTargetAsset)}
        onOpenChange={(open) => {
          if (!open) setRevokeTargetAsset(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {revokeTargetAsset && (
            <>
              <DialogHeader>
                <DialogTitle>Xác nhận thu hồi &amp; Đối soát thiết bị</DialogTitle>
                <DialogDescription>
                  Cập nhật tình trạng thực tế khi thu hồi và ghi nhận mức khấu trừ đền bù (nếu hư hỏng / mất)
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleConfirmRevoke} className="mt-4 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-50/60 p-3.5 text-xs dark:border-amber-400/25 dark:bg-amber-950/25">
                  <div className="font-mono font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                    {revokeTargetAsset.asset_code} — {revokeTargetAsset.name}
                  </div>
                  <div className="mt-1 text-[#11221E] dark:text-zinc-300">
                    Người đang giữ:{' '}
                    <span className="font-semibold">
                      {revokeTargetAsset.assigned_to_name ?? 'Không xác định'}
                    </span>{' '}
                    {revokeTargetAsset.assigned_to_code && (
                      <span className="font-mono tabular-nums">
                        ({revokeTargetAsset.assigned_to_code})
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                    S/N: {revokeTargetAsset.serial_number}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                      Tình trạng thu hồi
                    </label>
                    <Select
                      value={revokeCondition}
                      onValueChange={(v) =>
                        setRevokeCondition(v as AssetConditionStatus)
                      }
                      options={[
                        { label: 'Nguyên vẹn, hoạt động tốt (GOOD)', value: 'GOOD' },
                        { label: 'Hư hỏng, cần sửa chữa (DAMAGED)', value: 'DAMAGED' },
                        { label: 'Báo mất thiết bị (LOST)', value: 'LOST' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300">
                      Tiền đền bù (VND, nếu hỏng/mất)
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={
                        revokePenaltyVnd && Number(revokePenaltyVnd) > 0
                          ? formatNumberVN(Number(revokePenaltyVnd))
                          : '0'
                      }
                      onChange={(e) =>
                        setRevokePenaltyVnd(
                          e.target.value.replace(/\D/g, '') || '0'
                        )
                      }
                      className="font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="revoke-condition-note"
                    className="mb-1 block text-xs font-medium text-[#415A54] dark:text-zinc-300"
                  >
                    Ghi chú biên bản thu hồi *
                  </label>
                  <Input
                    id="revoke-condition-note"
                    value={revokeNote}
                    onChange={(e) => setRevokeNote(e.target.value)}
                    placeholder="Ví dụ: Ngoại quan 98%, hoạt động tốt, đủ sạc đi kèm"
                    required
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRevokeTargetAsset(null)}
                  >
                    Giữ nguyên
                  </Button>
                  <Button type="submit" variant="primary">
                    Xác nhận thu hồi
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
