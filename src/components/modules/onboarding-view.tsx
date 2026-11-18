'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  Laptop,
  Monitor,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Search,
  Usb,
  X,
} from 'lucide-react';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchEmployeesMock } from '@/lib/mock-fetcher';
import {
  assignCompanyAsset,
  completeOnboardingRecord,
  createCompanyAsset,
  getCompanyAssets,
  getOnboardingRecords,
  HRM_RUNTIME_EVENT,
  mergeWithRuntimeEmployees,
  pushNotification,
  revokeCompanyAsset,
  saveOnboardingRecord,
  toggleOnboardingChecklistItem,
} from '@/lib/runtime-store';
import { cn, formatDateVN } from '@/lib/utils';
import type {
  AssetCategory,
  AssetStatus,
  CompanyAsset,
  Department,
  Employee,
  OnboardingRecord,
  OnboardingStatus,
  OnboardingTaskGroup,
  RoleCode,
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
  IT: 'IT — Hạ tầng & Tài khoản',
  ADMIN: 'ADMIN — Thiết bị & Thẻ từ',
  HR: 'HR — Hợp đồng & Pháp lý',
  MANAGER: 'MANAGER — Hội nhập chuyên môn',
};

const ONBOARDING_STATUS_META: Record<
  OnboardingStatus,
  { label: string; variant: BadgeVariant }
> = {
  IN_PROGRESS: { label: 'Đang hội nhập', variant: 'teal' },
  COMPLETED: { label: 'Hoàn tất hội nhập', variant: 'success' },
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
      return <Laptop className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />;
    case 'MONITOR':
      return <Monitor className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />;
    case 'ACCESS_CARD':
      return <KeyRound className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />;
    case 'PERIPHERAL':
      return <Usb className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.5} />;
  }
}

function getChecklistStats(record: OnboardingRecord): {
  done: number;
  total: number;
  percent: number;
} {
  const total = record.checklist.length;
  if (total === 0) {
    return { done: 0, total: 0, percent: record.status === 'COMPLETED' ? 100 : 0 };
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
  if (status === 'COMPLETED') return false;
  if (role === 'SUPER_ADMIN' || role === 'HR_MANAGER') return true;
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
  const actorCode = currentUserProfile?.employee_code || defaultProfile.employee_code;
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

  // Tab 1 filters & selection
  const [progressStatusFilter, setProgressStatusFilter] = useState<'ALL' | OnboardingStatus>('ALL');
  const [progressSearch, setProgressSearch] = useState<string>('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Tab 2 filters
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<'ALL' | AssetCategory>('ALL');
  const [assetStatusFilter, setAssetStatusFilter] = useState<'ALL' | AssetStatus>('ALL');

  // Create Asset Dialog state
  const [isCreateAssetOpen, setIsCreateAssetOpen] = useState<boolean>(false);
  const [newAssetCode, setNewAssetCode] = useState<string>('');
  const [newAssetName, setNewAssetName] = useState<string>('');
  const [newAssetCategory, setNewAssetCategory] = useState<AssetCategory>('LAPTOP');
  const [newAssetSerial, setNewAssetSerial] = useState<string>('');
  const [newAssetStatus, setNewAssetStatus] = useState<'AVAILABLE' | 'MAINTENANCE'>('AVAILABLE');
  const [newAssetNote, setNewAssetNote] = useState<string>('Mới 100%, nguyên niêm phong hãng');
  const [createAssetError, setCreateAssetError] = useState<string | null>(null);

  // Assign Asset Dialog state
  const [assignTargetAsset, setAssignTargetAsset] = useState<CompanyAsset | null>(null);
  const [assignEmployeeCode, setAssignEmployeeCode] = useState<string>('');
  const [assignDate, setAssignDate] = useState<string>('2026-11-18');

  // Revoke Asset Dialog state
  const [revokeTargetAsset, setRevokeTargetAsset] = useState<CompanyAsset | null>(null);
  const [revokeNote, setRevokeNote] = useState<string>('');

  const syncFromRuntimeStore = useCallback(() => {
    setRecords(getOnboardingRecords());
    setAssets(getCompanyAssets());
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
      return records.filter((r) => isInManagerScope(r.department_id, r.department_name));
    }
    return records;
  }, [records, isEmployee, isDeptManager, actorCode, isInManagerScope]);

  // Scoped assets by role
  const scopedAssets = useMemo(() => {
    if (isEmployee) {
      return assets.filter((a) => a.assigned_to_code === actorCode);
    }
    if (isDeptManager) {
      const empByCode = new Map(employees.map((e) => [e.employee_code, e]));
      return assets.filter((a) => {
        if (a.status !== 'ASSIGNED') return true;
        const holder = a.assigned_to_code ? empByCode.get(a.assigned_to_code) : undefined;
        return isInManagerScope(
          a.assigned_department_id ?? holder?.department_id,
          holder?.department_name
        );
      });
    }
    return assets;
  }, [assets, employees, isEmployee, isDeptManager, actorCode, isInManagerScope]);

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
            (r.candidate_code && r.candidate_code.toLowerCase() === eid.toLowerCase())
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
        filteredRecords.find((r) => r.status === 'IN_PROGRESS') ?? filteredRecords[0];
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

  // KPI metrics
  const kpiStats = useMemo(() => {
    const inProgressCount = scopedRecords.filter((r) => r.status === 'IN_PROGRESS').length;
    const completedCount = scopedRecords.filter((r) => r.status === 'COMPLETED').length;

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

    const assignedDevicesCount = scopedAssets.filter((a) => a.status === 'ASSIGNED').length;
    const availableDevicesCount = scopedAssets.filter((a) => a.status === 'AVAILABLE').length;

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
      if (assetCategoryFilter !== 'ALL' && asset.category !== assetCategoryFilter) {
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

  const handleSelectRecord = (rec: OnboardingRecord) => {
    setSelectedRecordId(rec.id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      window.setTimeout(() => {
        detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
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

    const updated = toggleOnboardingChecklistItem(record.id, itemId, actorName);
    syncFromRuntimeStore();

    const toggledItem = updated?.checklist.find((c) => c.id === itemId);
    const nextDone = toggledItem ? toggledItem.completed : !currentlyCompleted;

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Onboarding & Tài sản',
      target: `${record.id} (${record.employee_code} - ${record.full_name})`,
      detail: `${nextDone ? 'Hoàn thành' : 'Mở lại'} hạng mục [${group}] "${title}" trong checklist hội nhập.`,
      status: 'SUCCESS',
    });

    showToast(
      nextDone ? 'Đã cập nhật hạng mục hội nhập' : 'Đã mở lại hạng mục hội nhập',
      `${record.full_name} — ${title}`,
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
      action: 'UPDATE_CONTRACT',
      module: 'Onboarding & Tài sản',
      target: `${record.id} (${record.employee_code} - ${record.full_name})`,
      detail: `Hoàn tất 100% quy trình hội nhập cho ${record.full_name} (${record.department_name}), chuyển trạng thái sang nhân viên chính thức.`,
      status: 'SUCCESS',
    });

    pushNotification({
      title: `Chúc mừng hoàn tất hội nhập (${record.employee_code})`,
      message: `${record.full_name} đã hoàn thành đủ 100% hạng mục hội nhập tại ${record.department_name} và chuyển sang làm việc chính thức.`,
      category: 'ONBOARDING',
      target_employee_codes: [record.employee_code],
      nav_id: 'onboarding',
      sub_tab: 'progress',
      entity_id: record.id,
    });

    pushNotification({
      title: `Nhân sự ${record.employee_code} đã hoàn tất hội nhập`,
      message: `Phòng Nhân sự đã xác nhận hoàn tất hội nhập cho ${record.full_name} (${record.position_name} · ${record.department_name}).`,
      category: 'ONBOARDING',
      target_roles: ['DEPT_MANAGER'],
      target_department_id: record.department_id,
      nav_id: 'onboarding',
      sub_tab: 'progress',
      entity_id: record.id,
    });

    showToast(
      'Đã hoàn tất quy trình hội nhập',
      `${record.full_name} (${record.employee_code}) đã chuyển sang làm việc chính thức.`,
      'success'
    );
  };

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
      setCreateAssetError('Vui lòng nhập đầy đủ mã tài sản, tên thiết bị và số serial');
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
      action: 'UPDATE_CONTRACT',
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
      assignableEmployees.find((e) => e.employment_status === 'PROBATION') ??
      assignableEmployees[0];
    setAssignEmployeeCode(defaultEmp?.employee_code ?? '');
    setAssignDate('2026-11-18');
  };

  const handleConfirmAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAll || !assignTargetAsset || !assignEmployeeCode) return;

    const emp = assignableEmployees.find((item) => item.employee_code === assignEmployeeCode);
    if (!emp) return;

    const updatedAsset = assignCompanyAsset(
      assignTargetAsset.id,
      {
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        department_id: emp.department_id,
      },
      assignDate || '2026-11-18'
    );

    if (!updatedAsset) return;

    // Sync assigned_asset_ids on matching OnboardingRecord if present
    const latestOnboarding = getOnboardingRecords();
    const matchingRecord = latestOnboarding.find((r) => r.employee_code === emp.employee_code);
    if (matchingRecord && !matchingRecord.assigned_asset_ids.includes(assignTargetAsset.id)) {
      saveOnboardingRecord({
        ...matchingRecord,
        assigned_asset_ids: [...matchingRecord.assigned_asset_ids, assignTargetAsset.id],
      });
    }

    syncFromRuntimeStore();
    setAssignTargetAsset(null);

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Onboarding & Tài sản',
      target: `${updatedAsset.asset_code} -> ${emp.employee_code}`,
      detail: `Cấp phát ${updatedAsset.name} (S/N: ${updatedAsset.serial_number}) cho ${emp.full_name} (${emp.department_name}).`,
      status: 'SUCCESS',
    });

    pushNotification({
      title: `Đã cấp phát tài sản ${updatedAsset.asset_code}`,
      message: `Phòng Nhân sự đã bàn giao ${updatedAsset.name} (S/N: ${updatedAsset.serial_number}) cho mã nhân viên ${emp.employee_code}.`,
      category: 'ASSET',
      target_employee_codes: [emp.employee_code],
      nav_id: 'onboarding',
      sub_tab: 'assets',
      entity_id: updatedAsset.asset_code,
    });

    showToast(
      `Đã cấp phát ${updatedAsset.asset_code}`,
      `Bàn giao cho ${emp.full_name} (${emp.employee_code}).`,
      'success'
    );
  };

  const openRevokeDialog = (asset: CompanyAsset) => {
    setRevokeTargetAsset(asset);
    setRevokeNote('Đã kiểm tra ngoại quan và thu hồi đầy đủ phụ kiện đi kèm');
  };

  const handleConfirmRevoke = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAll || !revokeTargetAsset) return;

    const prevHolderCode = revokeTargetAsset.assigned_to_code;
    const prevHolderName = revokeTargetAsset.assigned_to_name ?? 'nhân sự';
    const finalNote =
      revokeNote.trim() || 'Đã thu hồi về kho IT, tình trạng hoạt động ổn định';

    const updatedAsset = revokeCompanyAsset(revokeTargetAsset.id, finalNote);
    if (!updatedAsset) return;

    if (prevHolderCode) {
      const latestOnboarding = getOnboardingRecords();
      const matchingRecord = latestOnboarding.find((r) => r.employee_code === prevHolderCode);
      if (matchingRecord && matchingRecord.assigned_asset_ids.includes(revokeTargetAsset.id)) {
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

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'UPDATE_CONTRACT',
      module: 'Onboarding & Tài sản',
      target: `${updatedAsset.asset_code} <- ${prevHolderCode ?? 'KHO'}`,
      detail: `Thu hồi ${updatedAsset.name} từ ${prevHolderName} (${prevHolderCode ?? 'N/A'}). Ghi chú: ${finalNote}.`,
      status: 'WARNING',
    });

    if (prevHolderCode) {
      pushNotification({
        title: `Đã thu hồi thiết bị ${updatedAsset.asset_code}`,
        message: `Phòng Nhân sự xác nhận đã thu hồi ${updatedAsset.name} từ mã nhân viên ${prevHolderCode}. Tình trạng: ${finalNote}.`,
        category: 'ASSET',
        target_employee_codes: [prevHolderCode],
        nav_id: 'onboarding',
        sub_tab: 'assets',
        entity_id: updatedAsset.asset_code,
      });
    }

    showToast(
      `Đã thu hồi ${updatedAsset.asset_code}`,
      `Thiết bị từ ${prevHolderName} đã chuyển về trạng thái sẵn sàng trong kho.`,
      'default'
    );
  };

  const roleScopeSubtitle = useMemo(() => {
    switch (role) {
      case 'SUPER_ADMIN':
      case 'HR_MANAGER':
        return 'Điều phối lộ trình hội nhập 4 nhóm công việc và quản trị kho tài sản cấp phát toàn công ty';
      case 'DIRECTOR':
        return 'Tổng quan tiến độ hội nhập nhân sự mới và tỷ lệ phân bổ trang thiết bị toàn doanh nghiệp (chế độ xem)';
      case 'DEPT_MANAGER':
        return 'Theo dõi hội nhập chuyên môn và trang thiết bị bàn giao cho đội ngũ thuộc phạm vi quản lý';
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
        <CardContent className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Không thể tải dữ liệu Onboarding &amp; Tài sản
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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

  // 3. Explicit Empty state (via global uiState switcher)
  if (uiState === 'empty') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Onboarding &amp; Tài sản cấp phát
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{roleScopeSubtitle}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <ClipboardCheck className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Chưa ghi nhận hồ sơ hội nhập hoặc thiết bị trong danh sách
            </p>
            <p className="mt-1 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
              Hồ sơ hội nhập sẽ tự động khởi tạo khi chuyển ứng viên đạt yêu cầu từ bảng tuyển dụng ATS sang nhận việc
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setUiState('ready')}>
                 Hiển thị dữ liệu hiện có
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Selected record equipment list
  const selectedRecordAssets = selectedRecord
    ? assets.filter(
        (a) =>
          selectedRecord.assigned_asset_ids.includes(a.id) ||
          a.assigned_to_code === selectedRecord.employee_code
      )
    : [];

  const hasActiveAssetFilters =
    Boolean(assetSearch.trim()) ||
    assetCategoryFilter !== 'ALL' ||
    assetStatusFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Onboarding &amp; Tài sản cấp phát
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{roleScopeSubtitle}</p>
        </div>
        {canManageAll && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={openCreateAssetDialog}>
              <PackagePlus className="h-4 w-4" strokeWidth={1.5} />
              Thêm tài sản mới
            </Button>
          </div>
        )}
      </div>

      {/* 4 KPI Cards (Unslop: clean numbers, semantic left border, zero filler icons) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-l-4 border-l-teal-600 dark:border-l-teal-400">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Đang hội nhập
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {kpiStats.inProgressCount}
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {isEmployee ? 'Hồ sơ cá nhân đang mở' : 'Nhân sự thử việc đang theo dõi'}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Hoàn tất hội nhập
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {kpiStats.completedCount}
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Đã chuyển sang làm việc chính thức
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Tỷ lệ checklist trung bình
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {scopedRecords.length > 0 ? `${kpiStats.avgChecklistPercent}%` : '—'}
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {scopedRecords.length > 0
                ? `${kpiStats.doneItemsTotal}/${kpiStats.allItemsTotal} mục hoàn thành`
                : 'Không có checklist đang mở'}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Thiết bị đã bàn giao
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {kpiStats.assignedDevicesCount}
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {isEmployee
                ? `Đứng tên mã ${actorCode}`
                : `${kpiStats.availableDevicesCount} sẵn sàng trong kho`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main 2-Tab View */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as OnboardingSubTab)}
      >
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="progress" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
            Tiến độ Onboarding
            <span className="ml-0.5 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              ({scopedRecords.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1.5">
            <Laptop className="h-4 w-4" strokeWidth={1.5} />
            {isEmployee ? 'Tài sản đang giữ' : 'Kho & Tài sản cấp phát'}
            <span className="ml-0.5 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              ({scopedAssets.length})
            </span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TIẾN ĐỘ ONBOARDING */}
        <TabsContent value="progress" className="space-y-4">
          {isEmployee && scopedRecords.length === 0 ? (
            <Card className="border-l-4 border-l-teal-600 dark:border-l-teal-400">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Hồ sơ nhân sự chính thức ({actorCode})
                    </span>
                    <Badge variant="success">Đã hoàn tất hội nhập</Badge>
                  </div>
                  <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                    Tài khoản {actorName} không có quy trình hội nhập nhân viên mới đang chờ xử lý. Bạn có thể kiểm tra danh sách máy tính, màn hình và thẻ từ đang được bàn giao tại tab Tài sản đang giữ.
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
            <>
              {/* Filter Bar for Tab 1 */}
              {!isEmployee && (
                <Card>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1 sm:max-w-sm">
                      <Search
                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                        strokeWidth={1.5}
                      />
                      <Input
                        value={progressSearch}
                        onChange={(e) => setProgressSearch(e.target.value)}
                        placeholder="Tìm theo mã hồ sơ, mã NV, họ tên hoặc phòng ban..."
                        aria-label="Tìm hồ sơ hội nhập"
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={progressStatusFilter === 'ALL' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setProgressStatusFilter('ALL')}
                      >
                        Tất cả ({scopedRecords.length})
                      </Button>
                      <Button
                        variant={progressStatusFilter === 'IN_PROGRESS' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setProgressStatusFilter('IN_PROGRESS')}
                      >
                        Đang hội nhập ({kpiStats.inProgressCount})
                      </Button>
                      <Button
                        variant={progressStatusFilter === 'COMPLETED' ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setProgressStatusFilter('COMPLETED')}
                      >
                        Hoàn tất ({kpiStats.completedCount})
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {filteredRecords.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <ClipboardCheck
                      className="h-7 w-7 text-zinc-400 dark:text-zinc-500"
                      strokeWidth={1.5}
                    />
                    <p className="mt-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      Không có hồ sơ hội nhập khớp điều kiện lọc
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Thử xóa từ khóa tìm kiếm hoặc chuyển bộ lọc trạng thái về Tất cả
                    </p>
                    {(progressSearch || progressStatusFilter !== 'ALL') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          setProgressSearch('');
                          setProgressStatusFilter('ALL');
                        }}
                      >
                        Xóa bộ lọc
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* Left: Onboarding Records List */}
                  <div className="space-y-3 lg:col-span-5">
                    {filteredRecords.map((rec) => {
                      const stats = getChecklistStats(rec);
                      const statusMeta = ONBOARDING_STATUS_META[rec.status];
                      const isSelected = selectedRecord?.id === rec.id;
                      const attachedCount = assets.filter(
                        (a) =>
                          rec.assigned_asset_ids.includes(a.id) ||
                          a.assigned_to_code === rec.employee_code
                      ).length;

                      return (
                        <div
                          key={rec.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectRecord(rec)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectRecord(rec);
                            }
                          }}
                          className={cn(
                            'cursor-pointer rounded-xl border border-l-4 bg-white p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/30 dark:bg-zinc-900',
                            rec.status === 'COMPLETED'
                              ? 'border-l-emerald-500 dark:border-l-emerald-400'
                              : 'border-l-teal-600 dark:border-l-teal-400',
                            isSelected
                              ? 'border-zinc-400 bg-zinc-50/70 ring-1 ring-teal-700/25 dark:border-zinc-600 dark:bg-zinc-800/50 dark:ring-teal-400/25'
                              : 'border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800/80 dark:hover:border-zinc-700'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                              {rec.id} · {rec.employee_code}
                            </span>
                            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                          </div>

                          <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {rec.full_name}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                            {rec.position_name} · {rec.department_name}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="font-mono tabular-nums">
                              Nhận việc: {formatDateVN(rec.start_date)}
                            </span>
                            <span className="font-mono tabular-nums">
                              Thiết bị: {attachedCount}
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-600 dark:text-zinc-400">
                                Hoàn thành checklist
                              </span>
                              <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                                {stats.done}/{stats.total} ({stats.percent}%)
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  rec.status === 'COMPLETED' || stats.percent === 100
                                    ? 'bg-emerald-600 dark:bg-emerald-400'
                                    : 'bg-teal-700 dark:bg-teal-400'
                                )}
                                style={{ width: `${stats.percent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: Selected Record Detail & 4-Group Checklist */}
                  <div ref={detailPanelRef} className="lg:col-span-7">
                    {selectedRecord && (() => {
                      const stats = getChecklistStats(selectedRecord);
                      const statusMeta = ONBOARDING_STATUS_META[selectedRecord.status];
                      const isReadyToComplete =
                        stats.percent === 100 && selectedRecord.status === 'IN_PROGRESS';

                      return (
                        <Card>
                          <CardContent className="space-y-5 p-5">
                            {/* Detail Header */}
                            <div className="flex flex-col gap-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                    {selectedRecord.full_name}
                                  </h2>
                                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                                </div>
                                <div className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                  {selectedRecord.id} · Mã NV: {selectedRecord.employee_code} ·{' '}
                                  {selectedRecord.email}
                                </div>
                                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                                  {selectedRecord.position_name} · {selectedRecord.department_name} · Quản lý:{' '}
                                  <span className="font-medium">{selectedRecord.manager_name}</span>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                                <div className="font-mono text-lg font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                                  {stats.percent}% ({stats.done}/{stats.total})
                                </div>
                                {isReadyToComplete && canManageAll && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleCompleteOnboarding(selectedRecord)}
                                  >
                                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                                    Hoàn tất hội nhập
                                  </Button>
                                )}
                                {isReadyToComplete && !canManageAll && (
                                  <span className="text-xs text-amber-700 dark:text-amber-400">
                                    Đủ 100% · Chờ Nhân sự xác nhận hoàn tất
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Role permission guidance banner */}
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3.5 py-2.5 text-xs text-zinc-600 dark:border-zinc-800/80 dark:bg-zinc-950/60 dark:text-zinc-400">
                              <span>
                                {selectedRecord.status === 'COMPLETED'
                                  ? 'Hồ sơ đã chốt hoàn tất hội nhập, danh mục công việc ở chế độ lưu trữ'
                                  : canManageAll
                                  ? 'Quyền Nhân sự / Quản trị: được tích chọn mọi nhóm công việc và xác nhận hoàn tất'
                                  : isDeptManager
                                  ? 'Quyền Trưởng bộ phận: được tích xác nhận các mục thuộc nhóm MANAGER — Hội nhập chuyên môn'
                                  : 'Chế độ tra cứu: chỉ xem tiến độ thực hiện của các bộ phận phụ trách'}
                              </span>
                              <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                                Ngày nhận việc: {formatDateVN(selectedRecord.start_date)}
                              </span>
                            </div>

                            {/* 4 Task Groups */}
                            <div className="space-y-4">
                              {TASK_GROUP_ORDER.map((groupKey) => {
                                const groupItems = selectedRecord.checklist.filter(
                                  (item) => item.group === groupKey
                                );
                                if (groupItems.length === 0) return null;
                                const groupDone = groupItems.filter((i) => i.completed).length;
                                const canToggleGroup = canActorToggleGroup(
                                  role,
                                  groupKey,
                                  selectedRecord.status
                                );

                                return (
                                  <div
                                    key={groupKey}
                                    className="rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-900/60"
                                  >
                                    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/70 px-4 py-2.5 dark:border-zinc-800/80 dark:bg-zinc-800/40">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                          {TASK_GROUP_LABELS[groupKey]}
                                        </span>
                                        {isDeptManager && groupKey === 'MANAGER' && selectedRecord.status === 'IN_PROGRESS' && (
                                          <Badge variant="teal">Phụ trách đánh giá</Badge>
                                        )}
                                      </div>
                                      <span className="font-mono text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-400">
                                        {groupDone}/{groupItems.length}
                                      </span>
                                    </div>

                                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                                      {groupItems.map((item) => (
                                        <button
                                          key={item.id}
                                          type="button"
                                          role="checkbox"
                                          aria-checked={item.completed}
                                          disabled={!canToggleGroup}
                                          onClick={() =>
                                            handleToggleChecklist(
                                              selectedRecord,
                                              item.id,
                                              item.group,
                                              item.title,
                                              item.completed
                                            )
                                          }
                                          className={cn(
                                            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700/30',
                                            canToggleGroup
                                              ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                              : 'cursor-default opacity-80'
                                          )}
                                        >
                                          <span
                                            className={cn(
                                              'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                                              item.completed
                                                ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-zinc-950'
                                                : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900'
                                            )}
                                          >
                                            {item.completed && (
                                              <Check className="h-3 w-3" strokeWidth={2} />
                                            )}
                                          </span>

                                          <div className="min-w-0 flex-1">
                                            <div
                                              className={cn(
                                                'text-sm',
                                                item.completed
                                                  ? 'text-zinc-500 line-through dark:text-zinc-400'
                                                  : 'font-medium text-zinc-900 dark:text-zinc-100'
                                              )}
                                            >
                                              {item.title}
                                            </div>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                              <span>Đầu mối: {item.assignee_role_label}</span>
                                              {item.completed && item.completed_by && (
                                                <span className="font-mono text-[11px] tabular-nums text-teal-700 dark:text-teal-400">
                                                  Xác nhận: {item.completed_by}
                                                  {item.completed_at
                                                    ? ` · ${formatDateVN(item.completed_at)}`
                                                    : ''}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Attached Assets Summary inside Detail */}
                            <div className="rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                  Thiết bị đính kèm ({selectedRecordAssets.length})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('assets');
                                    setAssetSearch(selectedRecord.employee_code);
                                    setAssetCategoryFilter('ALL');
                                    setAssetStatusFilter('ALL');
                                  }}
                                  className="text-xs font-medium text-teal-700 transition-colors hover:underline dark:text-teal-400"
                                >
                                  Mở trong kho tài sản
                                </button>
                              </div>

                              {selectedRecordAssets.length === 0 ? (
                                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                  Chưa có thiết bị nào được gán cho mã {selectedRecord.employee_code}
                                </p>
                              ) : (
                                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {selectedRecordAssets.map((asset) => (
                                    <div
                                      key={asset.id}
                                      className="flex items-center gap-2.5 rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3 py-2 text-xs dark:border-zinc-800/80 dark:bg-zinc-800/40"
                                    >
                                      {renderCategoryIcon(asset.category)}
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                                          {asset.name}
                                        </div>
                                        <div className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                                          {asset.asset_code} · S/N: {asset.serial_number}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* TAB 2: KHO & TÀI SẢN CẤP PHÁT */}
        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative sm:col-span-2">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
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
                  onValueChange={(v) => setAssetCategoryFilter(v as 'ALL' | AssetCategory)}
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
                  onValueChange={(v) => setAssetStatusFilter(v as 'ALL' | AssetStatus)}
                  options={[
                    { label: 'Tất cả trạng thái', value: 'ALL' },
                    { label: 'Đang cấp phát', value: 'ASSIGNED' },
                    { label: 'Sẵn sàng trong kho', value: 'AVAILABLE' },
                    { label: 'Đang bảo trì', value: 'MAINTENANCE' },
                  ]}
                />
              </div>

              {hasActiveAssetFilters && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 text-xs dark:border-zinc-800/80">
                  <div className="flex flex-wrap items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
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
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 transition-colors hover:underline dark:text-teal-400"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Xóa bộ lọc
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <th className="whitespace-nowrap px-4 py-3">Mã tài sản</th>
                      <th className="px-4 py-3">Thiết bị</th>
                      <th className="whitespace-nowrap px-4 py-3">Phân loại</th>
                      <th className="whitespace-nowrap px-4 py-3">Số Serial</th>
                      <th className="whitespace-nowrap px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Người giữ</th>
                      <th className="px-4 py-3">Ghi chú tình trạng</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
                    {filteredAssets.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-5 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
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
                            className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40"
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium tabular-nums text-teal-700 dark:text-teal-400">
                              {asset.asset_code}
                            </td>
                            <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                              <div className="flex items-center gap-2">
                                {renderCategoryIcon(asset.category)}
                                <span>{asset.name}</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                              {catMeta.shortLabel}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                              {asset.serial_number}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {asset.status === 'ASSIGNED' && asset.assigned_to_code ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                    {asset.assigned_to_name}
                                  </span>
                                  <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                                    ({asset.assigned_to_code}
                                    {asset.assigned_at
                                      ? ` · ${formatDateVN(asset.assigned_at)}`
                                      : ''}
                                    )
                                  </span>
                                </div>
                              ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">—</span>
                              )}
                            </td>
                            <td className="max-w-xs truncate px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400" title={asset.condition_note}>
                              {asset.condition_note}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              {!canManageAll ? (
                                <span className="text-xs text-zinc-400 dark:text-zinc-500">
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

      {/* DIALOG 1: CREATE ASSET */}
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
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Mã tài sản *
                </label>
                <Input
                  id="new-asset-code"
                  value={newAssetCode}
                  onChange={(e) => setNewAssetCode(e.target.value)}
                  className="font-mono tabular-nums"
                  placeholder="TS-2026-015"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="new-asset-category"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
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
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
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
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
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
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Trạng thái nhập kho
                </label>
                <Select
                  id="new-asset-status"
                  value={newAssetStatus}
                  onValueChange={(v) => setNewAssetStatus(v as 'AVAILABLE' | 'MAINTENANCE')}
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
                className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
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

      {/* DIALOG 2: ASSIGN ASSET */}
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
                  Hệ thống sẽ tự động ghi nhật ký kiểm toán và gửi thông báo tới nhân viên nhận bàn giao
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleConfirmAssign} className="mt-4 space-y-4">
                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 text-xs dark:border-zinc-800/80 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                      {assignTargetAsset.asset_code}
                    </span>
                    <Badge variant="secondary">
                      {ASSET_CATEGORY_META[assignTargetAsset.category].shortLabel}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {assignTargetAsset.name}
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    S/N: {assignTargetAsset.serial_number} · {assignTargetAsset.condition_note}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="assign-emp-select"
                    className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
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

                <div>
                  <label
                    htmlFor="assign-date-input"
                    className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
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

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAssignTargetAsset(null)}
                  >
                    Hủy
                  </Button>
                  <Button type="submit" variant="primary" disabled={!assignEmployeeCode}>
                    Xác nhận cấp phát
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: REVOKE ASSET */}
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
                <DialogTitle>Xác nhận thu hồi thiết bị</DialogTitle>
                <DialogDescription>
                  Thiết bị sẽ chuyển về trạng thái Sẵn sàng trong kho và gửi thông báo xác nhận cho người bàn giao
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleConfirmRevoke} className="mt-4 space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-50/60 p-3.5 text-xs dark:border-amber-400/25 dark:bg-amber-950/25">
                  <div className="font-mono font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                    {revokeTargetAsset.asset_code} — {revokeTargetAsset.name}
                  </div>
                  <div className="mt-1 text-zinc-700 dark:text-zinc-300">
                    Người đang giữ:{' '}
                    <span className="font-medium">
                      {revokeTargetAsset.assigned_to_name ?? 'Không xác định'}
                    </span>{' '}
                    {revokeTargetAsset.assigned_to_code && (
                      <span className="font-mono tabular-nums">
                        ({revokeTargetAsset.assigned_to_code})
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    S/N: {revokeTargetAsset.serial_number}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="revoke-condition-note"
                    className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Ghi chú tình trạng thiết bị khi thu hồi *
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
