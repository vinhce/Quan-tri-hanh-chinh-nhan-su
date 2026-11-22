'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Fingerprint,
  Laptop,
  Lock,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Timer,
  Trash2,
  Upload,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  useApp,
  type RoleCode,
  type UserProfileOverride,
} from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import {
  BiometricFlowError,
  type BiometricSupportInfo,
  enrollCurrentDeviceBiometric,
  fetchSameWifiStatus,
  getBiometricSupportInfo,
  punchWithBiometricWifi,
  removeDeviceBiometricEverywhere,
} from '@/lib/biometric-attendance';
import { fetchAttendanceMock } from '@/lib/mock-fetcher';
import {
  HRM_RUNTIME_EVENT,
  STORAGE_MONTHLY_ATTENDANCE_KEY,
  checkInOutToday,
  evaluateDailyPunch,
  getAllRuntimeEmployees,
  getBiometricCredentials,
  getDailyAttendances,
  getMonthlyAttendances,
  getTodayDateVN,
  getWifiAttendancePolicy,
  importDailyAttendances,
  recomputeMonthlyAttendance,
} from '@/lib/runtime-store';
import { alertSwal, choiceSwal, confirmSwal } from '@/lib/swal';
import { formatDateVN, formatNumberVN } from '@/lib/utils';
import type {
  BiometricCredentialRecord,
  DailyAttendanceRecord,
  DailyAttendanceStatus,
  Employee,
  HostWifiHardwareInfo,
  MonthlyAttendanceSummary,
  WifiAttendancePolicy,
  WifiVerificationResult,
  WorkShift,
} from '@/mock/types';

type AttendanceTab = 'attendances' | 'monthly' | 'shifts';
type DailyStatusFilter =
  | 'ALL'
  | 'MISSING_PUNCH'
  | 'LATE'
  | 'PRESENT'
  | 'HALF_DAY'
  | 'LEAVE_WFH';

interface ParsedImportRow {
  employee_code: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  shift_code?: string;
  overtime_hours?: number;
  note?: string;
}

const DEFAULT_PERIOD_MONTH = '2026-11';

const ROLE_FALLBACK_CODE: Record<RoleCode, string> = {
  SUPER_ADMIN: 'NV-2024-001',
  DIRECTOR: 'NV-2024-000',
  HR_MANAGER: 'NV-2024-002',
  DEPT_MANAGER: 'NV-2024-003',
  EMPLOYEE: 'NV-2024-004',
  CANDIDATE: 'NV-2024-004',
};

const TECH_DIVISION_DEPARTMENTS = new Set([
  'Khối Công nghệ',
  'Phòng Kỹ thuật Phần mềm',
  'Phòng Dữ liệu & AI',
]);

const MONTHLY_STATUS_CONFIG: Record<
  MonthlyAttendanceSummary['attendance_status'],
  { label: string; variant: 'success' | 'warning' | 'teal' }
> = {
  VERIFIED: { label: 'Đã xác nhận', variant: 'success' },
  NEEDS_REVIEW: { label: 'Cần rà soát', variant: 'warning' },
  LOCKED: { label: 'Đã chốt công', variant: 'teal' },
};

const DAILY_STATUS_CONFIG: Record<
  DailyAttendanceStatus,
  {
    label: string;
    variant: 'success' | 'warning' | 'error' | 'teal' | 'info' | 'muted';
  }
> = {
  PRESENT: { label: 'Đúng giờ', variant: 'success' },
  LATE: { label: 'Đi muộn', variant: 'warning' },
  HALF_DAY: { label: 'Nửa ngày (0.5)', variant: 'info' },
  WORKING: { label: 'Đang trong ca · Chờ Check-out', variant: 'teal' },
  MISSING_PUNCH: { label: 'Quên chấm công', variant: 'error' },
  PAID_LEAVE: { label: 'Nghỉ phép năm', variant: 'teal' },
  UNPAID_LEAVE: { label: 'Nghỉ không lương', variant: 'muted' },
  SICK_LEAVE: { label: 'Nghỉ ốm / BHXH', variant: 'info' },
  REMOTE_WORK: { label: 'Làm từ xa / Công tác', variant: 'teal' },
  HOLIDAY: { label: 'Nghỉ lễ', variant: 'teal' },
  WEEKEND: { label: 'Cuối tuần', variant: 'muted' },
  ABSENT: { label: 'Vắng mặt (0.0)', variant: 'error' },
};

const SAMPLE_IMPORT_CSV = [
  'employee_code,date,check_in,check_out,shift_code,overtime_hours,note',
  'NV-2024-004,2026-11-21,08:24,17:38,HC-08:30,0,Quẹt thẻ vân tay đúng giờ tại cổng tầng 10',
  'NV-2025-008,2026-11-21,08:31,17:12,HC-08:00,0,Đi muộn 31 phút vượt ngưỡng ân hạn 10 phút',
  'NV-2024-005,2026-11-21,08:26,,HC-08:30,0,Quên chấm vân tay lúc ra về do họp dự án AI',
  'NV-2025-010,2026-11-21,,18:05,FLEX-09:00,0,Đi gặp khách hàng buổi sáng quên check-in đầu giờ',
  'NV-2026-011,2026-11-21,08:20,19:35,HC-08:30,2,Tăng ca xử lý pipeline đồng bộ dữ liệu cuối ngày',
].join('\n');

function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function getDefaultPunchDate(): string {
  const nowIso = getTodayDateVN();
  return nowIso.startsWith(DEFAULT_PERIOD_MONTH) ? nowIso : '2026-11-22';
}

function formatCurrentHHmmss(date: Date): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
  } catch {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
}

function resolveLoggedInEmployee(
  employees: Employee[],
  role: RoleCode,
  profile: UserProfileOverride | null,
  email: string | null
): Employee | null {
  if (employees.length === 0) return null;

  if (profile?.employee_code) {
    const byCode = employees.find(
      (e) => e.employee_code.toLowerCase() === profile.employee_code!.trim().toLowerCase()
    );
    if (byCode) return byCode;
  }

  const candidateEmail = (email || profile?.email || '').trim().toLowerCase();
  if (candidateEmail) {
    const exactEmail = employees.find((e) => e.email.toLowerCase() === candidateEmail);
    if (exactEmail) return exactEmail;

    const localPart = candidateEmail.split('@')[0];
    if (localPart) {
      const byLocal = employees.find(
        (e) => e.email.split('@')[0].toLowerCase() === localPart
      );
      if (byLocal) return byLocal;
    }
  }

  const fallbackCode = ROLE_FALLBACK_CODE[role];
  return (
    employees.find((e) => e.employee_code === fallbackCode) ?? employees[0] ?? null
  );
}

function persistMonthlyAttendanceSummaries(items: MonthlyAttendanceSummary[]): void {
  if (typeof window === 'undefined') return;
  try {
    const existingAll = getMonthlyAttendances();
    const map = new Map<string, MonthlyAttendanceSummary>();
    for (const m of existingAll) {
      map.set(`${m.employee_code}:${m.month_period}`, m);
    }
    for (const m of items) {
      map.set(`${m.employee_code}:${m.month_period}`, m);
    }
    const merged = Array.from(map.values());
    window.localStorage.setItem(
      STORAGE_MONTHLY_ATTENDANCE_KEY,
      JSON.stringify(merged)
    );
    window.dispatchEvent(new CustomEvent(HRM_RUNTIME_EVENT));
    if (typeof fetch === 'function') {
      fetch('/api/hrm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: STORAGE_MONTHLY_ATTENDANCE_KEY,
          items: merged,
        }),
      }).catch(() => {});
    }
  } catch {
    // Ignore storage quota errors
  }
}

function parseAttendanceImportText(rawText: string): ParsedImportRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: ParsedImportRow[] = [];
  for (const line of lines) {
    const delimiter = line.includes('\t') ? '\t' : ',';
    const cols = line.split(delimiter).map((c) => c.trim());
    if (cols.length < 2) continue;

    const firstLower = cols[0].toLowerCase();
    if (
      firstLower === 'employee_code' ||
      firstLower === 'ma_nv' ||
      firstLower === 'mã nv'
    ) {
      continue;
    }

    const employeeCode = cols[0];
    const dateVal = cols[1];
    if (!employeeCode || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      continue;
    }

    const rawIn = cols[2] || '';
    const rawOut = cols[3] || '';
    const cleanIn = /^\d{1,2}:\d{2}$/.test(rawIn)
      ? rawIn.padStart(5, '0')
      : null;
    const cleanOut = /^\d{1,2}:\d{2}$/.test(rawOut)
      ? rawOut.padStart(5, '0')
      : null;
    const shiftCode = cols[4] || undefined;
    const otParsed = cols[5] ? Number(cols[5]) : undefined;
    const note = cols.slice(6).join(', ').trim() || undefined;

    parsed.push({
      employee_code: employeeCode,
      date: dateVal,
      check_in: cleanIn,
      check_out: cleanOut,
      shift_code: shiftCode,
      overtime_hours:
        otParsed !== undefined && Number.isFinite(otParsed) && otParsed >= 0
          ? otParsed
          : undefined,
      note,
    });
  }
  return parsed;
}

export function AttendanceView() {
  const {
    role,
    currentUserEmail,
    currentUserProfile,
    navigateWithIntent,
    uiState,
    setUiState,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<AttendanceTab>('attendances');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyAttendanceRecord[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyAttendanceSummary[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [dailyStatusFilter, setDailyStatusFilter] =
    useState<DailyStatusFilter>('ALL');

  // Direct Check-in / Check-out widget state
  const [clockText, setClockText] = useState<string>('08:30:00');
  const [punchDate, setPunchDate] = useState<string>(() => getDefaultPunchDate());
  const [customPunchTime, setCustomPunchTime] = useState<string>('');
  const [punchNote, setPunchNote] = useState<string>('');

  // Biometric WebAuthn & Same-WiFi state
  const [biometricCreds, setBiometricCreds] = useState<BiometricCredentialRecord[]>([]);
  const [wifiPolicy, setWifiPolicy] = useState<WifiAttendancePolicy>(() =>
    getWifiAttendancePolicy()
  );
  const [wifiStatus, setWifiStatus] = useState<WifiVerificationResult | null>(null);
  const [hostPublicIpv4, setHostPublicIpv4] = useState<string | null>(null);
  const [hostWifiDetails, setHostWifiDetails] =
    useState<HostWifiHardwareInfo | null>(null);
  const [biometricSupport, setBiometricSupport] = useState<BiometricSupportInfo | null>(
    null
  );
  const [isCheckingWifi, setIsCheckingWifi] = useState<boolean>(false);
  const [isPunchingBiometric, setIsPunchingBiometric] = useState<boolean>(false);
  const [isBiometricModalOpen, setIsBiometricModalOpen] = useState<boolean>(false);
  const [deviceLabelInput, setDeviceLabelInput] = useState<string>('');
  const deviceLabelPrefilledForRef = useRef<string | null>(null);
  const [isEnrollingDevice, setIsEnrollingDevice] = useState<boolean>(false);

  // Import CSV modal state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  // Edit Monthly Summary modal state (HR / Super Admin)
  const [editingRecord, setEditingRecord] =
    useState<MonthlyAttendanceSummary | null>(null);
  const [editShiftCode, setEditShiftCode] = useState('HC-08:00');
  const [editActualDays, setEditActualDays] = useState('22');
  const [editLateCount, setEditLateCount] = useState('0');
  const [editOtHours, setEditOtHours] = useState('0');
  const [editStatus, setEditStatus] =
    useState<MonthlyAttendanceSummary['attendance_status']>('VERIFIED');

  const canEditAttendance = role === 'SUPER_ADMIN' || role === 'HR_MANAGER';
  const canLockAttendance =
    role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'DIRECTOR';

  const syncFromRuntime = useCallback(() => {
    setEmployees(getAllRuntimeEmployees());
    setDailyRecords(getDailyAttendances());
    setMonthlyRecords(getMonthlyAttendances(DEFAULT_PERIOD_MONTH));
    setBiometricCreds(getBiometricCredentials());
    setWifiPolicy(getWifiAttendancePolicy());
  }, []);

  useEffect(() => {
    let active = true;
    fetchAttendanceMock()
      .then((data) => {
        if (!active) return;
        setWorkShifts(data.MOCK_WORK_SHIFTS);
        recomputeMonthlyAttendance(DEFAULT_PERIOD_MONTH);
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

  useEffect(() => {
    syncFromRuntime();
  }, [currentUserEmail, currentUserProfile?.employee_code, role, syncFromRuntime]);

  useEffect(() => {
    setClockText(formatCurrentHHmmss(new Date()));
    const timer = window.setInterval(() => {
      setClockText(formatCurrentHHmmss(new Date()));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

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

  const currentEmployeeCode =
    currentEmp?.employee_code ??
    currentUserProfile?.employee_code ??
    ROLE_FALLBACK_CODE[role];
  const currentEmployeeName =
    currentEmp?.full_name ?? currentUserProfile?.fullName ?? 'Phạm Minh Tuấn';

  const canSelectActingEmployee =
    role === 'SUPER_ADMIN' || role === 'HR_MANAGER';

  const activeEligibleEmployees = useMemo(() => {
    return employees.filter(
      (e) =>
        e.employment_status !== 'RESIGNED' &&
        e.employment_status !== 'PENDING_ONBOARD'
    );
  }, [employees]);

  const [actingEmployeeId, setActingEmployeeId] = useState<string>('');

  useEffect(() => {
    setActingEmployeeId(currentEmp?.id ?? '');
  }, [currentEmp?.id, role, currentUserEmail, currentUserProfile?.employee_code]);

  const activeEmployee = useMemo(() => {
    if (canSelectActingEmployee && actingEmployeeId) {
      const matched = activeEligibleEmployees.find(
        (e) =>
          e.id === actingEmployeeId || e.employee_code === actingEmployeeId
      );
      if (matched) return matched;
    }
    return currentEmp;
  }, [
    canSelectActingEmployee,
    actingEmployeeId,
    activeEligibleEmployees,
    currentEmp,
  ]);

  const activeEmployeeCode =
    activeEmployee?.employee_code ?? currentEmployeeCode;
  const activeEmployeeName =
    activeEmployee?.full_name ?? currentEmployeeName;

  const refreshWifiAndBiometric = useCallback(
    async (forceRefreshIp = false) => {
      setIsCheckingWifi(true);
      try {
        const [support, netInfo] = await Promise.all([
          getBiometricSupportInfo(),
          fetchSameWifiStatus({
            employeeId: activeEmployee?.id,
            forceRefreshIp,
          }),
        ]);
        setBiometricSupport(support);
        setWifiStatus(netInfo.wifi);
        setHostPublicIpv4(netInfo.hostPublicIpv4);
        setHostWifiDetails(netInfo.hostWifiDetails);
        const empScopeKey = activeEmployee?.id ?? '__default__';
        if (deviceLabelPrefilledForRef.current !== empScopeKey) {
          deviceLabelPrefilledForRef.current = empScopeKey;
          setDeviceLabelInput((prev) => prev || support.suggestedDeviceLabel);
        }
      } catch {
        const support = await getBiometricSupportInfo();
        setBiometricSupport(support);
      } finally {
        setIsCheckingWifi(false);
      }
    },
    [activeEmployee?.id]
  );

  useEffect(() => {
    void refreshWifiAndBiometric(false);
  }, [refreshWifiAndBiometric]);

  const myRegisteredCreds = useMemo(() => {
    return biometricCreds.filter(
      (c) =>
        c.employee_code === activeEmployeeCode ||
        (activeEmployee && c.employee_id === activeEmployee.id)
    );
  }, [biometricCreds, activeEmployeeCode, activeEmployee]);

  const myCurrentDeviceCreds = useMemo(() => {
    const host =
      biometricSupport?.hostname ||
      (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
    return myRegisteredCreds.filter((c) => c.rp_id === host);
  }, [myRegisteredCreds, biometricSupport?.hostname]);

  const currentEmpShift = useMemo(() => {
    const code = activeEmployee?.work_shift_code || 'HC-08:30';
    return (
      workShifts.find((s) => s.shift_code === code) ??
      workShifts[0] ?? {
        id: 'shift-default',
        shift_code: code,
        shift_name: 'Ca hành chính tiêu chuẩn',
        start_time: '08:30',
        end_time: '17:30',
        break_minutes: 60,
        standard_hours: 8,
        late_grace_minutes: 15,
        department_scope: 'Toàn công ty',
      }
    );
  }, [activeEmployee, workShifts]);

  const myTodayRecord = useMemo(() => {
    return (
      dailyRecords.find(
        (r) =>
          (r.employee_code === activeEmployeeCode ||
            (activeEmployee && r.employee_id === activeEmployee.id)) &&
          r.date === punchDate
      ) ?? null
    );
  }, [dailyRecords, activeEmployeeCode, activeEmployee, punchDate]);

  const isMonthLocked = useMemo(() => {
    return (
      monthlyRecords.length > 0 &&
      monthlyRecords.every((r) => r.attendance_status === 'LOCKED')
    );
  }, [monthlyRecords]);

  const isPunchDateLocked = useMemo(() => {
    if (!punchDate.startsWith(DEFAULT_PERIOD_MONTH)) return false;
    return isMonthLocked;
  }, [punchDate, isMonthLocked]);

  // Role scoping helper
  const isEmployeeInScope = useCallback(
    (empCode: string, deptName: string, empId?: string): boolean => {
      if (
        role === 'SUPER_ADMIN' ||
        role === 'DIRECTOR' ||
        role === 'HR_MANAGER'
      ) {
        return true;
      }
      if (role === 'EMPLOYEE') {
        return (
          empCode === currentEmployeeCode ||
          Boolean(currentEmp && empId && empId === currentEmp.id)
        );
      }
      if (role === 'DEPT_MANAGER') {
        if (empCode === currentEmployeeCode) return true;
        if (currentEmp) {
          const targetEmp = employees.find(
            (e) => e.employee_code === empCode || (empId && e.id === empId)
          );
          if (targetEmp?.manager_id === currentEmp.id) return true;
          if (
            TECH_DIVISION_DEPARTMENTS.has(currentEmp.department_name) &&
            TECH_DIVISION_DEPARTMENTS.has(deptName)
          ) {
            return true;
          }
          if (deptName === currentEmp.department_name) return true;
        }
        return TECH_DIVISION_DEPARTMENTS.has(deptName);
      }
      return false;
    },
    [role, currentEmployeeCode, currentEmp, employees]
  );

  const scopedDailyRecords = useMemo(() => {
    return dailyRecords.filter((rec) =>
      isEmployeeInScope(rec.employee_code, rec.department_name, rec.employee_id)
    );
  }, [dailyRecords, isEmployeeInScope]);

  const scopedMonthlyRecords = useMemo(() => {
    return monthlyRecords.filter((rec) =>
      isEmployeeInScope(rec.employee_code, rec.department_name, rec.employee_id)
    );
  }, [monthlyRecords, isEmployeeInScope]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of scopedMonthlyRecords) set.add(r.department_name);
    for (const d of scopedDailyRecords) set.add(d.department_name);
    return ['ALL', ...Array.from(set)];
  }, [scopedMonthlyRecords, scopedDailyRecords]);

  const shiftOptions = useMemo(() => {
    const codes = Array.from(new Set(workShifts.map((s) => s.shift_code)));
    return [
      { value: 'ALL', label: 'Tất cả ca làm' },
      ...codes.map((code) => ({ value: code, label: code })),
    ];
  }, [workShifts]);

  const filteredDailyRecords = useMemo(() => {
    const normalizedQuery = normalizeVietnamese(searchQuery.trim());
    return scopedDailyRecords.filter((rec) => {
      if (
        departmentFilter !== 'ALL' &&
        rec.department_name !== departmentFilter
      ) {
        return false;
      }
      if (shiftFilter !== 'ALL' && rec.shift_code !== shiftFilter) {
        return false;
      }
      if (dailyStatusFilter !== 'ALL') {
        if (dailyStatusFilter === 'LEAVE_WFH') {
          if (
            rec.status !== 'PAID_LEAVE' &&
            rec.status !== 'UNPAID_LEAVE' &&
            rec.status !== 'SICK_LEAVE' &&
            rec.status !== 'REMOTE_WORK'
          ) {
            return false;
          }
        } else if (rec.status !== dailyStatusFilter) {
          return false;
        }
      }
      if (normalizedQuery) {
        const haystack = normalizeVietnamese(
          `${rec.employee_code} ${rec.full_name} ${rec.department_name} ${rec.date} ${rec.note ?? ''}`
        );
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [
    scopedDailyRecords,
    departmentFilter,
    shiftFilter,
    dailyStatusFilter,
    searchQuery,
  ]);

  const filteredMonthlyRecords = useMemo(() => {
    const normalizedQuery = normalizeVietnamese(searchQuery.trim());
    return scopedMonthlyRecords.filter((item) => {
      if (
        departmentFilter !== 'ALL' &&
        item.department_name !== departmentFilter
      ) {
        return false;
      }
      if (shiftFilter !== 'ALL' && item.shift_code !== shiftFilter) {
        return false;
      }
      if (normalizedQuery) {
        const haystack = normalizeVietnamese(
          `${item.employee_code} ${item.full_name} ${item.department_name} ${item.position_name}`
        );
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [scopedMonthlyRecords, departmentFilter, shiftFilter, searchQuery]);

  const missingPunchCount = useMemo(
    () => scopedDailyRecords.filter((r) => r.status === 'MISSING_PUNCH').length,
    [scopedDailyRecords]
  );

  const summary = useMemo(() => {
    const totalEmployees = scopedMonthlyRecords.length || 1;
    const onTimeCount = scopedMonthlyRecords.filter(
      (r) => r.late_occurrences === 0 && r.early_leave_occurrences === 0
    ).length;
    const onTimeRate = Math.round((onTimeCount / totalEmployees) * 100);
    const totalOtHours = scopedMonthlyRecords.reduce(
      (acc, r) => acc + r.total_overtime_hours,
      0
    );
    const totalLateEarly = scopedMonthlyRecords.reduce(
      (acc, r) => acc + r.late_occurrences + r.early_leave_occurrences,
      0
    );
    return {
      standardDays: 22,
      onTimeRate,
      totalOtHours,
      totalLateEarly,
      missingPunchCount,
    };
  }, [scopedMonthlyRecords, missingPunchCount]);

  // Parsed import preview
  const parsedImportPreview = useMemo(() => {
    const rows = parseAttendanceImportText(importText);
    const enriched = rows.map((row) => {
      const matchedEmp = employees.find(
        (e) => e.employee_code.toLowerCase() === row.employee_code.toLowerCase()
      );
      const shift =
        row.shift_code || matchedEmp?.work_shift_code || 'HC-08:00';
      const evaluation = evaluateDailyPunch({
        shiftCode: shift,
        checkIn: row.check_in,
        checkOut: row.check_out,
      });
      return {
        ...row,
        matchedEmp,
        resolvedShift: shift,
        evaluation,
      };
    });

    const validRows = enriched.filter((r) => Boolean(r.matchedEmp));
    const missingCount = validRows.filter(
      (r) => r.evaluation.status === 'MISSING_PUNCH'
    ).length;
    const lateCount = validRows.filter(
      (r) => r.evaluation.late_minutes > 0
    ).length;

    return {
      allRows: enriched,
      validRows,
      missingCount,
      lateCount,
    };
  }, [importText, employees]);

  const handleEnrollCurrentDevice = async (
    customLabel?: string
  ): Promise<boolean> => {
    if (!activeEmployee) return false;
    setIsEnrollingDevice(true);
    try {
      const res = await enrollCurrentDeviceBiometric({
        employee: activeEmployee,
        deviceLabel: customLabel ?? (deviceLabelInput.trim() || undefined),
      });
      syncFromRuntime();
      setWifiStatus(res.wifi);
      showToast(
        'Đã đăng ký vân tay thành công',
        `Thiết bị "${res.credential.device_label}" (${activeEmployee.full_name}) đã sẵn sàng chấm công chung WiFi (${res.wifi.verifiedIp}).`,
        'success'
      );
      return true;
    } catch (err) {
      if (err instanceof BiometricFlowError && err.wifi) {
        setWifiStatus(err.wifi);
      }
      await alertSwal({
        title: 'Chưa thể đăng ký vân tay thiết bị',
        text:
          err instanceof Error
            ? err.message
            : 'Vui lòng kiểm tra cảm biến vân tay và kết nối chung WiFi.',
        icon: 'warning',
      });
      return false;
    } finally {
      setIsEnrollingDevice(false);
    }
  };

  const resolveCheckoutTiming = async (
    action: 'CHECK_IN' | 'CHECK_OUT',
    rawEffectiveTime: string
  ): Promise<{
    effectiveAction: 'CHECK_IN' | 'CHECK_OUT';
    effectiveTime: string;
    checkInTimeOverride?: string;
  } | null> => {
    if (action !== 'CHECK_OUT') {
      return { effectiveAction: action, effectiveTime: rawEffectiveTime };
    }

    if (!myTodayRecord?.check_in) {
      const wantCheckIn = await confirmSwal({
        title: 'Chưa có giờ Check-in cho ngày này',
        html: `Bạn chưa Check-in vào ca ngày <b>${formatDateVN(punchDate)}</b>. Bạn có muốn chuyển sang <b>Check-in vào ca</b> trước không?`,
        confirmText: 'Check-in vào ca ngay',
        cancelText: 'Hủy',
        variant: 'primary',
      });
      if (!wantCheckIn) return null;
      return { effectiveAction: 'CHECK_IN', effectiveTime: rawEffectiveTime };
    }

    const toMin = (hhmm: string): number | null => {
      if (!hhmm.includes(':')) return null;
      const [h, m] = hhmm.trim().split(':').map(Number);
      return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
    };

    const inMin = toMin(myTodayRecord.check_in);
    const outMin = toMin(rawEffectiveTime);
    const hasCustomTime = Boolean(customPunchTime.trim());

    if (inMin !== null && outMin !== null) {
      if (hasCustomTime && outMin < inMin) {
        await alertSwal({
          title: 'Giờ Check-out không hợp lệ',
          text: `Giờ ra (${rawEffectiveTime}) không được sớm hơn giờ vào (${myTodayRecord.check_in}). Vui lòng chọn giờ ra sau giờ vào.`,
          icon: 'warning',
        });
        return null;
      }

      if (!hasCustomTime) {
        let dur = outMin - inMin;
        if (inMin <= 720 && outMin >= 780) {
          dur = Math.max(0, dur - currentEmpShift.break_minutes);
        }
        if (dur < 210) {
          const choice = await choiceSwal({
            title: 'Chưa đủ thời lượng ca làm việc',
            html: `Giờ vào hiện tại là <b>${myTodayRecord.check_in}</b>, giờ thực tế hiện tại là <b>${rawEffectiveTime}</b> (mới làm <b>${Math.max(0, dur)} phút</b> &lt; 3.5 giờ nên nếu chốt giờ thực sẽ tính <b>0.0 công</b>).<br/><br/>Bạn muốn chốt theo <b>Đủ ca chuẩn (${currentEmpShift.start_time} → ${currentEmpShift.end_time} · 1.0 công)</b> để kiểm thử nghiệp vụ hay giữ nguyên giờ thực?`,
            confirmText: 'Chốt đủ ca chuẩn (1.0 công)',
            denyText: `Giữ giờ thực (${rawEffectiveTime})`,
            cancelText: 'Hủy',
            variant: 'primary',
          });
          if (choice === 'cancel') return null;
          if (choice === 'confirm') {
            return {
              effectiveAction: 'CHECK_OUT',
              effectiveTime: currentEmpShift.end_time,
              checkInTimeOverride: currentEmpShift.start_time,
            };
          }
        }
      }
    }

    return { effectiveAction: 'CHECK_OUT', effectiveTime: rawEffectiveTime };
  };

  const handleBiometricPunch = async (
    action: 'CHECK_IN' | 'CHECK_OUT',
    resolvedOverride?: {
      effectiveAction: 'CHECK_IN' | 'CHECK_OUT';
      effectiveTime: string;
      checkInTimeOverride?: string;
    }
  ) => {
    if (!activeEmployee) {
      await alertSwal({
        title: 'Không tìm thấy hồ sơ chấm công',
        text: 'Không xác định được mã nhân viên hiện tại trong danh sách nhân sự.',
        icon: 'error',
      });
      return;
    }

    if (isPunchDateLocked) {
      await alertSwal({
        title: 'Kỳ công đã khóa sổ',
        text: 'Bảng công tháng 11/2026 đã được chốt khóa, không thể ghi nhận thêm chấm công mới.',
        icon: 'warning',
      });
      return;
    }

    const rawEffectiveTime =
      customPunchTime.trim() || clockText.slice(0, 5) || '08:30';
    const timing =
      resolvedOverride ?? (await resolveCheckoutTiming(action, rawEffectiveTime));
    if (!timing) return;

    setIsPunchingBiometric(true);
    try {
      const res = await punchWithBiometricWifi({
        employee: activeEmployee,
        action: timing.effectiveAction,
        date: punchDate,
        timeHHmm: timing.effectiveTime,
        checkInTimeOverride: timing.checkInTimeOverride,
        note: punchNote.trim() || undefined,
      });
      syncFromRuntime();
      setWifiStatus(res.wifi);
      setPunchNote('');

      showToast(
        timing.effectiveAction === 'CHECK_IN'
          ? `Vân tay Check-in ca ${res.record.shift_code} lúc ${res.record.check_in}`
          : `Vân tay Check-out ca ${res.record.shift_code} lúc ${res.record.check_out}`,
        `${res.credential.device_label} · WiFi ${res.wifi.verifiedIp} · ${
          res.record.status === 'WORKING'
            ? 'Đã ghi nhận vào ca · Chờ Check-out cuối ngày.'
            : res.record.status === 'MISSING_PUNCH'
              ? 'Tạm ghi nhận 0.0 công (chờ đủ Check-out).'
              : `${res.record.workday_value.toFixed(1)} công${
                  res.record.late_minutes > 0 ? ` · Muộn ${res.record.late_minutes}p` : ''
                }`
        }`,
        res.record.status === 'WORKING' || res.record.status === 'MISSING_PUNCH'
          ? 'info'
          : 'success'
      );
    } catch (err) {
      if (err instanceof BiometricFlowError) {
        if (err.wifi) setWifiStatus(err.wifi);
        if (err.code === 'NO_CREDENTIAL_ON_DEVICE') {
          setIsPunchingBiometric(false);
          const wantEnroll = await confirmSwal({
            title: 'Chưa đăng ký vân tay cho thiết bị này',
            html: `Bạn đang dùng <b>${
              biometricSupport?.suggestedDeviceLabel || 'thiết bị hiện tại'
            }</b> trên tên miền <span style="font-family:monospace">${
              biometricSupport?.hostname || 'localhost'
            }</span>.<br/><br/>Bấm <b>Đăng ký ngay</b> để mở cảm biến vân tay (Windows Hello / Touch ID / Vân tay điện thoại) cho máy này và tiếp tục chấm công.`,
            confirmText: 'Đăng ký vân tay ngay',
            cancelText: 'Để sau',
            variant: 'primary',
          });
          if (!wantEnroll) return;
          const enrolled = await handleEnrollCurrentDevice();
          if (enrolled) {
            await handleBiometricPunch(timing.effectiveAction, timing);
          }
          return;
        }
        await alertSwal({
          title:
            err.code === 'WIFI_MISMATCH' || err.code === 'CELLULAR_BLOCKED'
              ? 'Bị chặn: Không chung mạng WiFi văn phòng'
              : 'Không thể chấm công bằng vân tay',
          text: err.message,
          icon: err.code === 'USER_CANCELLED' ? 'info' : 'warning',
        });
      } else {
        await alertSwal({
          title: 'Lỗi chấm công sinh trắc học',
          text: err instanceof Error ? err.message : 'Vui lòng thử lại.',
          icon: 'error',
        });
      }
    } finally {
      setIsPunchingBiometric(false);
    }
  };

  const handleDirectPunch = async (action: 'CHECK_IN' | 'CHECK_OUT') => {
    if (!activeEmployee) {
      await alertSwal({
        title: 'Không tìm thấy hồ sơ chấm công',
        text: 'Không xác định được mã nhân viên hiện tại trong danh sách nhân sự.',
        icon: 'error',
      });
      return;
    }

    if (isPunchDateLocked) {
      await alertSwal({
        title: 'Kỳ công đã khóa sổ',
        text: 'Bảng công tháng 11/2026 đã được chốt khóa, không thể ghi nhận thêm chấm công mới.',
        icon: 'warning',
      });
      return;
    }

    const rawEffectiveTime =
      customPunchTime.trim() || clockText.slice(0, 5) || '08:30';
    const timing = await resolveCheckoutTiming(action, rawEffectiveTime);
    if (!timing) return;

    try {
      const saved = checkInOutToday({
        employeeId: activeEmployee.id,
        date: punchDate,
        action: timing.effectiveAction,
        timeHHmm: timing.effectiveTime,
        checkInTimeOverride: timing.checkInTimeOverride,
        note: punchNote.trim() || undefined,
      });
      syncFromRuntime();
      setPunchNote('');

      showToast(
        timing.effectiveAction === 'CHECK_IN'
          ? `Đã Check-in ca ${saved.shift_code} lúc ${saved.check_in}`
          : `Đã Check-out ca ${saved.shift_code} lúc ${saved.check_out}`,
        saved.status === 'WORKING'
          ? 'Đã ghi nhận vào ca · Chờ Check-out cuối ngày.'
          : saved.status === 'MISSING_PUNCH'
            ? `Tạm ghi nhận 0.0 công (chờ đủ Check-in & Check-out để tính công).`
            : `Công ngày ${formatDateVN(saved.date)}: ${saved.workday_value.toFixed(1)} công${
                saved.late_minutes > 0 ? ` · Đi muộn ${saved.late_minutes} phút` : ''
              }`,
        saved.status === 'WORKING' || saved.status === 'MISSING_PUNCH'
          ? 'info'
          : 'success'
      );
    } catch (err) {
      await alertSwal({
        title: 'Lỗi ghi nhận chấm công',
        text: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        icon: 'error',
      });
    }
  };

  const handleNavigateExplanation = (rec: DailyAttendanceRecord) => {
    navigateWithIntent('leaves', {
      subTab: 'explanation',
      entityId: `${rec.employee_code}|${rec.date}`,
    });
  };

  const handleLoadSampleImport = () => {
    setImportText(SAMPLE_IMPORT_CSV);
    setImportError('');
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportText(reader.result);
        setImportError('');
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedImportPreview.validRows.length === 0) {
      setImportError(
        'Không tìm thấy dòng dữ liệu hợp lệ khớp mã nhân viên. Nhấn "Tải dữ liệu mẫu thử nghiệm" để xem định dạng chuẩn.'
      );
      return;
    }

    const result = importDailyAttendances(
      parsedImportPreview.validRows.map((r) => ({
        employee_code: r.employee_code,
        date: r.date,
        check_in: r.check_in,
        check_out: r.check_out,
        shift_code: r.shift_code,
        overtime_hours: r.overtime_hours,
        note: r.note,
      })),
      currentEmployeeName
    );

    syncFromRuntime();
    setIsImportOpen(false);
    setImportText('');
    setImportError('');
    setActiveTab('attendances');

    showToast(
      `Đã import ${result.importedCount} bản ghi chấm công`,
      result.missingPunchCount > 0
        ? `Phát hiện ${result.missingPunchCount} ca quên chấm công (MISSING_PUNCH · 0.0 công) cần giải trình.`
        : 'Toàn bộ ca chấm công đã được quy đổi công và đồng bộ bảng tháng.',
      result.missingPunchCount > 0 ? 'warning' : 'success'
    );

    await alertSwal({
      title: 'Đồng bộ dữ liệu chấm công hoàn tất',
      html: `Đã nạp thành công <b>${result.importedCount}</b> dòng nhật ký chấm công và tính lại bảng tổng hợp tháng.<br/>${
        result.missingPunchCount > 0
          ? `<span style="color:#B91C1C">Phát hiện <b>${result.missingPunchCount}</b> ca thiếu giờ vào/ra (<b>MISSING_PUNCH</b>) tạm tính <b>0.0 công</b> — nhân sự có thể gửi đơn Giải trình chấm công ngay trên dòng cảnh báo.</span>`
          : 'Không phát sinh ca thiếu đầu chấm công.'
      }`,
      icon: result.missingPunchCount > 0 ? 'warning' : 'success',
    });
  };

  const handleRecomputeMonth = () => {
    recomputeMonthlyAttendance(DEFAULT_PERIOD_MONTH);
    syncFromRuntime();
    showToast(
      'Đã tính lại bảng công tháng 11/2026',
      'Đồng bộ đầy đủ dữ liệu Check-in/Out, đơn Nghỉ phép, OT và Giải trình đã duyệt.',
      'success'
    );
  };

  const handleLockAttendance = async () => {
    const needsReviewRows = monthlyRecords.filter(
      (r) => r.attendance_status === 'NEEDS_REVIEW'
    ).length;

    const confirmed = await confirmSwal({
      title: 'Xác nhận chốt bảng công tháng 11/2026?',
      html: `Sau khi chốt sổ, toàn bộ <b>${monthlyRecords.length}</b> bản ghi công tháng 11/2026 sẽ chuyển sang trạng thái <b>LOCKED</b> để phục vụ tính lương C&amp;B.${
        needsReviewRows > 0 || missingPunchCount > 0
          ? `<br/><br/><span style="color:#B45309">Lưu ý: Hiện còn <b>${missingPunchCount}</b> ca quên chấm công (MISSING_PUNCH) và <b>${needsReviewRows}</b> nhân sự trạng thái Cần rà soát.</span>`
          : ''
      }`,
      confirmText: 'Chốt bảng công tháng',
      cancelText: 'Kiểm tra lại',
      variant: 'warning',
    });

    if (!confirmed) return;

    const lockedList: MonthlyAttendanceSummary[] = monthlyRecords.map(
      (item) => ({
        ...item,
        attendance_status: 'LOCKED',
      })
    );
    persistMonthlyAttendanceSummaries(lockedList);
    syncFromRuntime();

    showToast(
      'Đã chốt bảng công tháng 11/2026',
      'Toàn bộ dữ liệu công đã được khóa sổ và đồng bộ sang phân hệ Tính lương.',
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'LOCK_PAYROLL',
      module: 'Chấm công & Ca làm',
      target: 'Bảng công tháng 11/2026',
      detail: `Chốt khóa sổ bảng công toàn công ty (${lockedList.length} nhân sự).`,
    });
  };

  const openEditModal = (row: MonthlyAttendanceSummary) => {
    if (row.attendance_status === 'LOCKED' && role !== 'SUPER_ADMIN') {
      void alertSwal({
        title: 'Bản ghi đã chốt khóa sổ',
        text: 'Bảng công của nhân sự này đã ở trạng thái LOCKED, không thể chỉnh sửa trực tiếp.',
        icon: 'info',
      });
      return;
    }
    setEditingRecord(row);
    setEditShiftCode(row.shift_code);
    setEditActualDays(String(row.actual_work_days));
    setEditLateCount(String(row.late_occurrences));
    setEditOtHours(String(row.total_overtime_hours));
    setEditStatus(row.attendance_status);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const nextDays = Math.max(0, Number(editActualDays) || 0);
    const nextLate = Math.max(0, Math.round(Number(editLateCount) || 0));
    const nextOt = Math.max(0, Number(editOtHours) || 0);

    const updatedItem: MonthlyAttendanceSummary = {
      ...editingRecord,
      shift_code: editShiftCode,
      actual_work_days: nextDays,
      late_occurrences: nextLate,
      total_overtime_hours: nextOt,
      attendance_status: editStatus,
    };

    persistMonthlyAttendanceSummaries([updatedItem]);
    syncFromRuntime();

    showToast(
      `Đã cập nhật chấm công ${editingRecord.employee_code}`,
      `${editingRecord.full_name} — ${nextDays} công, ${nextOt}h OT`,
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'UPDATE_RECORD',
      module: 'Chấm công & Ca làm',
      target: `${editingRecord.employee_code} (${editingRecord.full_name})`,
      detail: `Hiệu chỉnh công tháng 11/2026: ${nextDays} công, ${nextLate} lượt đi muộn, ${nextOt}h OT, trạng thái ${editStatus}.`,
    });
    setEditingRecord(null);
  };

  const handleExportExcel = () => {
    showToast(
      'Xuất dữ liệu chấm công thành công',
      activeTab === 'attendances'
        ? `Đã xuất tệp Nhat_ky_cham_cong_11_2026.csv (${filteredDailyRecords.length} bản ghi).`
        : `Đã xuất tệp Bang_cong_thang_11_2026.xlsx (${filteredMonthlyRecords.length} nhân sự).`,
      'success'
    );
  };

  if (uiState === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
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
            Không thể tải dữ liệu chấm công tháng 11/2026
          </p>
          <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
            Vui lòng kiểm tra lại kết nối máy chủ chấm công và thử lại.
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Chấm công &amp; Quản lý Ca làm việc
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Check-in/Check-out trực tuyến, đồng bộ máy vân tay, phát hiện quên chấm công (MISSING_PUNCH) và chốt công tháng 11/2026.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleRecomputeMonth}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            Tính lại công
          </Button>
          {canEditAttendance && (
            <Button
              variant="secondary"
              onClick={() => {
                setImportError('');
                setIsImportOpen(true);
              }}
            >
              <Upload className="h-4 w-4" strokeWidth={1.5} />
              Import chấm công (CSV)
            </Button>
          )}
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Xuất báo cáo
          </Button>
          {canLockAttendance && (
            <Button
              variant="primary"
              onClick={handleLockAttendance}
              disabled={isMonthLocked}
            >
              <Lock className="h-4 w-4" strokeWidth={1.5} />
              {isMonthLocked ? 'Đã chốt bảng công tháng' : 'Chốt bảng công tháng'}
            </Button>
          )}
        </div>
      </div>

      {/* Live Check-in / Check-out Widget */}
      <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] border-l-4 border-l-[#0F766E] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800 dark:border-l-teal-400 dark:bg-[#121214]">
        <CardContent className="p-5">
          {canSelectActingEmployee && (
            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-[#C6D9D3]/80 bg-[#F2F7F5]/75 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/60">
              <label
                htmlFor="att-acting-emp-select"
                className="flex items-center gap-1.5 text-xs font-medium text-[#415A54] dark:text-zinc-300"
              >
                <Users className="h-3.5 w-3.5 shrink-0 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                <span>Chấm công &amp; Vân tay cho nhân sự:</span>
              </label>
              <div className="w-full sm:w-80">
                <Select
                  id="att-acting-emp-select"
                  aria-label="Chọn nhân sự chấm công"
                  value={activeEmployee?.id ?? ''}
                  onValueChange={(val) => setActingEmployeeId(val)}
                  className="h-8 text-xs"
                  options={activeEligibleEmployees.map((emp) => ({
                    value: emp.id,
                    label: `${emp.employee_code} · ${emp.full_name} (${emp.department_name})`,
                  }))}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            {/* Left: Employee & Shift Info + Live Clock */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="teal" className="font-mono tabular-nums">
                  {activeEmployeeCode}
                </Badge>
                <span className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  {activeEmployeeName}
                </span>
                <span className="text-xs text-[#415A54] dark:text-zinc-400">
                  · {activeEmployee?.department_name ?? 'Khối Công nghệ'}
                </span>
                <Badge variant="outline" className="font-mono tabular-nums">
                  {currentEmpShift.shift_code} ({currentEmpShift.start_time} -{' '}
                  {currentEmpShift.end_time} · Ân hạn{' '}
                  {currentEmpShift.late_grace_minutes}p)
                </Badge>
              </div>

              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-[#0F766E] dark:text-teal-400">
                  {clockText}
                </span>
                <span className="text-xs text-[#5C7871] dark:text-zinc-400">
                  Chấm công Vân tay Laptop / Điện thoại chung WiFi · Tự động quy đổi{' '}
                  <span className="font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-200">
                    1.0 / 0.5 / 0.0
                  </span>{' '}
                  công
                </span>
              </div>

              {/* Live WiFi & Biometric Status Strip */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {wifiStatus ? (
                  <Badge
                    variant={wifiStatus.allowed ? 'success' : 'error'}
                    className="gap-1.5"
                  >
                    {wifiStatus.allowed ? (
                      <Wifi className="h-3.5 w-3.5" strokeWidth={1.5} />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                    )}
                    <span>
                      {wifiStatus.allowed
                        ? `Chung WiFi (${hostWifiDetails?.ssid || wifiPolicy.wifi_ssid_label})${hostWifiDetails?.signalPercent != null ? ` · Sóng ${hostWifiDetails.signalPercent}%` : ''} · ${wifiStatus.verifiedIp}`
                        : `Khác WiFi / Đã khóa chấm công (${wifiStatus.verifiedIp})`}
                    </span>
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1.5">
                    <Wifi className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Đang kiểm tra mạng WiFi...</span>
                  </Badge>
                )}

                <Badge
                  variant={myCurrentDeviceCreds.length > 0 ? 'teal' : 'warning'}
                  className="gap-1.5"
                >
                  <Fingerprint className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>
                    {myCurrentDeviceCreds.length > 0
                      ? `Đã liên kết ${myCurrentDeviceCreds[0].device_label} (${myRegisteredCreds.length} máy)`
                      : 'Chưa đăng ký vân tay máy này'}
                  </span>
                </Badge>

                <button
                  type="button"
                  disabled={isCheckingWifi}
                  onClick={() => void refreshWifiAndBiometric(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-[#C6D9D3] bg-[#FCFEFD] px-2 py-0.5 text-[11px] font-medium text-[#415A54] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isCheckingWifi ? 'animate-spin' : ''}`}
                    strokeWidth={1.5}
                  />
                  Kiểm tra WiFi
                </button>

                <button
                  type="button"
                  onClick={() => setIsBiometricModalOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-[#0F766E]/35 bg-[#E8F3EF] px-2 py-0.5 text-[11px] font-medium text-[#0B4F4A] transition-colors hover:bg-[#CBE8E2] dark:border-teal-500/35 dark:bg-teal-950/50 dark:text-teal-300 dark:hover:bg-teal-900/60"
                >
                  <ShieldCheck className="h-3 w-3" strokeWidth={1.5} />
                  Thiết bị vân tay ({myRegisteredCreds.length})
                </button>
              </div>

              {biometricSupport?.insecureWarning && (
                <div className="rounded-lg border border-amber-500/35 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
                  {biometricSupport.insecureWarning}
                </div>
              )}

              {wifiStatus && !wifiStatus.allowed && (
                <div className="rounded-lg border border-rose-500/35 bg-rose-50/70 px-3 py-2 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200">
                  {wifiStatus.reason}
                </div>
              )}

              {/* Recorded Metrics for Selected Date */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs">
                <span className="text-[#415A54] dark:text-zinc-400">
                  Giờ vào:{' '}
                  <strong className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                    {myTodayRecord?.check_in ?? '--:--'}
                  </strong>
                </span>
                <span className="text-[#415A54] dark:text-zinc-400">
                  Giờ ra:{' '}
                  <strong className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                    {myTodayRecord?.check_out ?? '--:--'}
                  </strong>
                </span>
                <span className="text-[#415A54] dark:text-zinc-400">
                  Đi muộn / Về sớm:{' '}
                  <strong
                    className={`font-mono tabular-nums ${
                      (myTodayRecord?.late_minutes ?? 0) > 0 ||
                      (myTodayRecord?.early_leave_minutes ?? 0) > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-[#11221E] dark:text-zinc-100'
                    }`}
                  >
                    {myTodayRecord?.late_minutes ?? 0}p /{' '}
                    {myTodayRecord?.early_leave_minutes ?? 0}p
                  </strong>
                </span>
                <span className="text-[#415A54] dark:text-zinc-400">
                  Công ghi nhận:{' '}
                  <strong className="font-mono tabular-nums text-[#0F766E] dark:text-teal-400">
                    {myTodayRecord
                      ? `${myTodayRecord.workday_value.toFixed(1)} công`
                      : 'Chưa chấm'}
                  </strong>
                </span>
                {myTodayRecord && (
                  <Badge variant={DAILY_STATUS_CONFIG[myTodayRecord.status].variant}>
                    {DAILY_STATUS_CONFIG[myTodayRecord.status].label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Right: Controls & Check-in / Check-out Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="space-y-1">
                <label
                  htmlFor="punch-date-input"
                  className="block text-[11px] font-medium text-[#415A54] dark:text-zinc-400"
                >
                  Ngày chấm công
                </label>
                <Input
                  id="punch-date-input"
                  type="date"
                  value={punchDate}
                  onChange={(e) => setPunchDate(e.target.value)}
                  className="h-9 w-full font-mono text-xs tabular-nums sm:w-36"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="punch-time-input"
                  className="block text-[11px] font-medium text-[#415A54] dark:text-zinc-400"
                >
                  Giờ ghi nhận (trống = giờ thực)
                </label>
                <Input
                  id="punch-time-input"
                  type="time"
                  value={customPunchTime}
                  onChange={(e) => setCustomPunchTime(e.target.value)}
                  className="h-9 w-full font-mono text-xs tabular-nums sm:w-36"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const isWaitingCheckout = Boolean(
                    myTodayRecord?.check_in && !myTodayRecord?.check_out
                  );
                  const isCompletedShift = Boolean(
                    myTodayRecord?.check_in && myTodayRecord?.check_out
                  );
                  const isPunchBlocked =
                    isPunchDateLocked || Boolean(wifiStatus && !wifiStatus.allowed);

                  if (wifiPolicy.require_biometric_for_punch) {
                    return (
                      <>
                        <Button
                          variant={
                            isWaitingCheckout || isCompletedShift
                              ? 'outline'
                              : 'primary'
                          }
                          disabled={isPunchBlocked || isPunchingBiometric}
                          onClick={() => void handleBiometricPunch('CHECK_IN')}
                        >
                          <Fingerprint className="h-4 w-4" strokeWidth={1.5} />
                          {isPunchingBiometric
                            ? 'Đang quét vân tay...'
                            : myTodayRecord?.check_in
                              ? `Đã vào ca (${myTodayRecord.check_in})`
                              : 'Vân tay Check-in'}
                        </Button>
                        <Button
                          variant={isWaitingCheckout ? 'primary' : 'outline'}
                          disabled={isPunchBlocked || isPunchingBiometric}
                          onClick={() => void handleBiometricPunch('CHECK_OUT')}
                        >
                          <Fingerprint className="h-4 w-4" strokeWidth={1.5} />
                          {isWaitingCheckout
                            ? 'Vân tay Check-out ngay'
                            : myTodayRecord?.check_out
                              ? `Cập nhật giờ ra (${myTodayRecord.check_out})`
                              : 'Vân tay Check-out'}
                        </Button>
                      </>
                    );
                  }

                  return (
                    <>
                      <Button
                        variant={
                          isWaitingCheckout || isCompletedShift
                            ? 'outline'
                            : 'primary'
                        }
                        disabled={isPunchBlocked}
                        onClick={() => void handleDirectPunch('CHECK_IN')}
                      >
                        <LogIn className="h-4 w-4" strokeWidth={1.5} />
                        {myTodayRecord?.check_in
                          ? `Đã vào ca (${myTodayRecord.check_in})`
                          : 'Check-in'}
                      </Button>
                      <Button
                        variant={isWaitingCheckout ? 'primary' : 'outline'}
                        disabled={isPunchBlocked}
                        onClick={() => void handleDirectPunch('CHECK_OUT')}
                      >
                        <LogOut className="h-4 w-4" strokeWidth={1.5} />
                        {isWaitingCheckout
                          ? 'Check-out ngay'
                          : myTodayRecord?.check_out
                            ? `Cập nhật giờ ra (${myTodayRecord.check_out})`
                            : 'Check-out'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPunchBlocked || isPunchingBiometric}
                        title={
                          myTodayRecord?.check_in
                            ? 'Quét vân tay Check-out'
                            : 'Quét vân tay Check-in'
                        }
                        className="h-9 px-2.5 text-xs text-[#415A54] hover:bg-[#E8F3EF] hover:text-[#0F766E] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-teal-300"
                        onClick={() =>
                          void handleBiometricPunch(
                            myTodayRecord?.check_in ? 'CHECK_OUT' : 'CHECK_IN'
                          )
                        }
                      >
                        <Fingerprint className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {isPunchingBiometric
                          ? 'Đang quét...'
                          : 'Chấm bằng vân tay'}
                      </Button>
                    </>
                  );
                })()}
                {myTodayRecord?.status === 'MISSING_PUNCH' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-500/40 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-950/30"
                    onClick={() => handleNavigateExplanation(myTodayRecord)}
                  >
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
                    Gửi giải trình công
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400 dark:bg-[#121214]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Công chuẩn tháng 11/2026
              </span>
              <CalendarCheck
                className="h-4 w-4 text-blue-600 dark:text-blue-400"
                strokeWidth={1.5}
              />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {summary.standardDays} công
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Tỷ lệ đúng giờ toàn khối:{' '}
              <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-200">
                {summary.onTimeRate}%
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500 dark:border-l-rose-400 dark:bg-[#121214]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Quên chấm công (MISSING_PUNCH)
              </span>
              <AlertTriangle
                className="h-4 w-4 text-rose-600 dark:text-rose-400"
                strokeWidth={1.5}
              />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {formatNumberVN(summary.missingPunchCount)} ca
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Tạm tính 0.0 công cho đến khi duyệt giải trình
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400 dark:bg-[#121214]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tổng giờ Tăng ca (OT)
              </span>
              <Timer
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                strokeWidth={1.5}
              />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatNumberVN(summary.totalOtHours)} giờ
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Đồng bộ từ đơn OT đã phê duyệt (1.5x / 2.0x / 3.0x)
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400 dark:bg-[#121214]">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Đi muộn / Về sớm
              </span>
              <Clock
                className="h-4 w-4 text-amber-600 dark:text-amber-400"
                strokeWidth={1.5}
              />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {formatNumberVN(summary.totalLateEarly)} lượt
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Tính sau ngưỡng ân hạn chuẩn của từng ca
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabbed Surface */}
      <Card className="overflow-hidden rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800 dark:bg-[#121214]">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            {/* Tabs */}
            <div
              className="flex flex-wrap items-center gap-1 rounded-xl border border-[#C6D9D3] bg-[#E4EEEB] p-1 dark:border-zinc-800 dark:bg-zinc-900/70"
              role="tablist"
              aria-label="Chế độ xem chấm công"
            >
              {(
                [
                  {
                    id: 'attendances',
                    label: 'Nhật ký chấm công chi tiết',
                    count: scopedDailyRecords.length,
                    alertCount: missingPunchCount,
                  },
                  {
                    id: 'monthly',
                    label: 'Tổng hợp công tháng',
                    count: scopedMonthlyRecords.length,
                    alertCount: 0,
                  },
                  {
                    id: 'shifts',
                    label: 'Ca làm việc chuẩn',
                    count: workShifts.length,
                    alertCount: 0,
                  },
                ] as const
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={
                      isActive
                        ? 'inline-flex items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-1.5 text-xs font-semibold text-[#11221E] shadow-[0_1px_2px_rgba(17,34,30,0.06)] dark:border-teal-400 dark:bg-teal-400 dark:text-zinc-950'
                        : 'inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-[#415A54] transition-colors hover:bg-[#D8E6E2] hover:text-[#11221E] dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }
                  >
                    <span>{tab.label}</span>
                    <span className="font-mono tabular-nums opacity-80">
                      ({tab.count})
                    </span>
                    {tab.alertCount > 0 && (
                      <span
                        className={
                          isActive
                            ? 'rounded bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white'
                            : 'rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-rose-700 dark:bg-rose-500/25 dark:text-rose-300'
                        }
                      >
                        {tab.alertCount} lỗi
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filter Bar (shown on Daily & Monthly tabs) */}
            {activeTab !== 'shifts' && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                <div className="relative min-w-0 flex-1 sm:w-52">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm mã NV, họ tên, ngày..."
                    aria-label="Tìm kiếm chấm công"
                    className="pl-9"
                  />
                </div>
                {role !== 'EMPLOYEE' && (
                  <div className="w-full shrink-0 sm:w-48">
                    <Select
                      value={departmentFilter}
                      onValueChange={setDepartmentFilter}
                      aria-label="Lọc theo phòng ban"
                      options={departments.map((dept) => ({
                        value: dept,
                        label: dept === 'ALL' ? 'Tất cả phòng ban' : dept,
                      }))}
                    />
                  </div>
                )}
                <div className="w-full shrink-0 sm:w-36">
                  <Select
                    value={shiftFilter}
                    onValueChange={setShiftFilter}
                    aria-label="Lọc theo ca làm"
                    options={shiftOptions}
                  />
                </div>
                {activeTab === 'attendances' && (
                  <div className="w-full shrink-0 sm:w-48">
                    <Select
                      value={dailyStatusFilter}
                      onValueChange={(v) =>
                        setDailyStatusFilter(v as DailyStatusFilter)
                      }
                      aria-label="Lọc trạng thái ngày công"
                      options={[
                        { value: 'ALL', label: 'Mọi trạng thái ngày' },
                        {
                          value: 'MISSING_PUNCH',
                          label: 'Quên chấm công (MISSING_PUNCH)',
                        },
                        { value: 'LATE', label: 'Đi muộn' },
                        { value: 'PRESENT', label: 'Đúng giờ (1.0 công)' },
                        { value: 'HALF_DAY', label: 'Nửa ngày (0.5 công)' },
                        { value: 'LEAVE_WFH', label: 'Nghỉ phép / WFH' },
                      ]}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* TAB 1: NHẬT KÝ CHẤM CÔNG CHI TIẾT */}
          {activeTab === 'attendances' && (
            <>
              {uiState === 'empty' || filteredDailyRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <Clock
                    className="h-8 w-8 text-[#5C7871] dark:text-zinc-400"
                    strokeWidth={1.5}
                  />
                  <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                    Không có bản ghi nhật ký chấm công nào khớp bộ lọc
                  </p>
                  <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                    Sử dụng khung Check-in/Check-out phía trên hoặc Import dữ liệu máy chấm công.
                  </p>
                  {(searchQuery ||
                    departmentFilter !== 'ALL' ||
                    shiftFilter !== 'ALL' ||
                    dailyStatusFilter !== 'ALL') && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setSearchQuery('');
                        setDepartmentFilter('ALL');
                        setShiftFilter('ALL');
                        setDailyStatusFilter('ALL');
                      }}
                    >
                      Đặt lại bộ lọc
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto bg-[#FCFEFD] dark:bg-transparent">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2F7F5] dark:bg-zinc-900/60">
                      <tr className="border-b border-[#C6D9D3] text-xs font-semibold text-[#415A54] dark:border-zinc-800 dark:text-zinc-400">
                        <th className="whitespace-nowrap px-3.5 py-2.5">Ngày công</th>
                        <th className="px-3.5 py-2.5">Nhân viên</th>
                        <th className="whitespace-nowrap px-3.5 py-2.5">Ca làm</th>
                        <th className="whitespace-nowrap px-3.5 py-2.5">Giờ vào</th>
                        <th className="whitespace-nowrap px-3.5 py-2.5">Giờ ra</th>
                        <th className="whitespace-nowrap px-3.5 py-2.5 text-right">
                          Đi muộn
                        </th>
                        <th className="whitespace-nowrap px-3.5 py-2.5 text-right">
                          Về sớm
                        </th>
                        <th className="whitespace-nowrap px-3.5 py-2.5 text-right">
                          Công quy đổi
                        </th>
                        <th className="px-3.5 py-2.5">Trạng thái &amp; Giải trình</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                      {filteredDailyRecords.map((rec) => {
                        const isMissing = rec.status === 'MISSING_PUNCH';
                        const statusCfg = DAILY_STATUS_CONFIG[rec.status];
                        return (
                          <tr
                            key={rec.id}
                            className={
                              isMissing
                                ? 'border-l-4 border-l-rose-500 bg-rose-50/75 transition-colors hover:bg-rose-100/60 dark:border-l-rose-400 dark:bg-rose-950/20 dark:hover:bg-rose-950/35'
                                : 'odd:bg-[#FCFEFD] even:bg-[#F5FAF8] transition-colors hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40'
                            }
                          >
                            <td className="whitespace-nowrap px-3.5 py-3">
                              <div className="font-mono text-xs font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                                {formatDateVN(rec.date)}
                              </div>
                              <div className="font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-500">
                                {rec.source === 'WEB_CLOCK'
                                  ? 'Web Clock'
                                  : rec.source === 'BIOMETRIC_IMPORT'
                                    ? 'Máy vân tay'
                                    : rec.source === 'REQUEST_SYNC'
                                      ? 'Đồng bộ đơn từ'
                                      : 'Hệ thống'}
                              </div>
                            </td>

                            <td className="px-3.5 py-3">
                              <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                                {rec.full_name}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#415A54] dark:text-zinc-400">
                                <span className="font-mono tabular-nums">
                                  {rec.employee_code}
                                </span>
                                <span>· {rec.department_name}</span>
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-3.5 py-3">
                              <Badge
                                variant="outline"
                                className="font-mono tabular-nums"
                              >
                                {rec.shift_code}
                              </Badge>
                            </td>

                            <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs tabular-nums">
                              {rec.check_in ? (
                                <span className="font-medium text-[#11221E] dark:text-zinc-100">
                                  {rec.check_in}
                                </span>
                              ) : isMissing ? (
                                <span className="font-semibold text-rose-700 dark:text-rose-400">
                                  Thiếu vào
                                </span>
                              ) : (
                                <span className="text-[#5C7871] dark:text-zinc-500">
                                  --:--
                                </span>
                              )}
                            </td>

                            <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs tabular-nums">
                              {rec.check_out ? (
                                <span className="font-medium text-[#11221E] dark:text-zinc-100">
                                  {rec.check_out}
                                </span>
                              ) : rec.status === 'WORKING' ? (
                                <span className="font-medium text-[#0F766E] dark:text-teal-400">
                                  Chờ Check-out
                                </span>
                              ) : isMissing ? (
                                <span className="font-semibold text-rose-700 dark:text-rose-400">
                                  Thiếu ra
                                </span>
                              ) : (
                                <span className="text-[#5C7871] dark:text-zinc-500">
                                  --:--
                                </span>
                              )}
                            </td>

                            <td className="whitespace-nowrap px-3.5 py-3 text-right font-mono text-xs tabular-nums">
                              {rec.late_minutes > 0 ? (
                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                  {rec.late_minutes} phút
                                </span>
                              ) : (
                                <span className="text-[#5C7871] dark:text-zinc-500">
                                  0
                                </span>
                              )}
                            </td>

                            <td className="whitespace-nowrap px-3.5 py-3 text-right font-mono text-xs tabular-nums">
                              {rec.early_leave_minutes > 0 ? (
                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                  {rec.early_leave_minutes} phút
                                </span>
                              ) : (
                                <span className="text-[#5C7871] dark:text-zinc-500">
                                  0
                                </span>
                              )}
                            </td>

                            <td className="whitespace-nowrap px-3.5 py-3 text-right font-mono tabular-nums">
                              {rec.status === 'WORKING' ? (
                                <span className="font-medium text-[#5C7871] dark:text-zinc-400">
                                  Đang tính...
                                </span>
                              ) : (
                                <span
                                  className={
                                    rec.workday_value === 0
                                      ? 'font-semibold text-rose-700 dark:text-rose-400'
                                      : rec.workday_value === 0.5
                                        ? 'font-semibold text-amber-700 dark:text-amber-400'
                                        : 'font-semibold text-[#0F766E] dark:text-teal-400'
                                  }
                                >
                                  {rec.workday_value.toFixed(1)} công
                                </span>
                              )}
                              {rec.overtime_hours > 0 && (
                                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                  +{rec.overtime_hours}h OT
                                  {rec.ot_multiplier
                                    ? ` (${rec.ot_multiplier.toFixed(1)}x)`
                                    : ''}
                                </div>
                              )}
                            </td>

                            <td className="px-3.5 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={statusCfg.variant}>
                                  {isMissing && (
                                    <AlertTriangle
                                      className="h-3.5 w-3.5"
                                      strokeWidth={1.5}
                                    />
                                  )}
                                  {isMissing
                                    ? 'MISSING_PUNCH · Quên chấm công'
                                    : statusCfg.label}
                                </Badge>

                                {rec.explanation_request_id && (
                                  <Badge variant="teal">
                                    <CheckCircle2
                                      className="h-3 w-3"
                                      strokeWidth={1.5}
                                    />
                                    Đã giải trình
                                  </Badge>
                                )}

                                {rec.source === 'BIOMETRIC_FINGERPRINT' && (
                                  <Badge variant="info" className="gap-1">
                                    <Fingerprint className="h-3 w-3" strokeWidth={1.5} />
                                    <span>
                                      Vân tay · {rec.verified_network_ip || 'WiFi nội bộ'}
                                    </span>
                                  </Badge>
                                )}

                                {isMissing && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 border-rose-600/35 bg-[#FCFEFD] px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-400/35 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                    onClick={() => handleNavigateExplanation(rec)}
                                  >
                                    <ArrowUpRight
                                      className="h-3.5 w-3.5"
                                      strokeWidth={1.5}
                                    />
                                    Gửi giải trình công
                                  </Button>
                                )}
                              </div>
                              {rec.note && (
                                <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                                  {rec.note}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* TAB 2: TỔNG HỢP CÔNG THÁNG */}
          {activeTab === 'monthly' && (
            <>
              {uiState === 'empty' || filteredMonthlyRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <Users
                    className="h-8 w-8 text-[#5C7871] dark:text-zinc-400"
                    strokeWidth={1.5}
                  />
                  <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                    Không tìm thấy dữ liệu tổng hợp công tháng 11/2026
                  </p>
                  <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                    Thử thay đổi từ khóa tìm kiếm, phòng ban hoặc ca làm việc.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-[#FCFEFD] dark:bg-transparent">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#F2F7F5] dark:bg-zinc-900/60">
                      <tr className="border-b border-[#C6D9D3] text-xs font-semibold text-[#415A54] dark:border-zinc-800 dark:text-zinc-400">
                        <th className="whitespace-nowrap px-3.5 py-2.5">Mã NV</th>
                        <th className="px-3.5 py-2.5">Họ tên</th>
                        <th className="px-3.5 py-2.5">Phòng ban</th>
                        <th className="whitespace-nowrap px-3.5 py-2.5">Ca làm</th>
                        <th className="whitespace-nowrap px-3.5 py-2.5 text-right">
                          Công thực tế / Chuẩn
                        </th>
                        <th className="whitespace-nowrap px-3.5 py-2.5 text-right">
                          Đi muộn / Về sớm
                        </th>
                        <th className="whitespace-nowrap px-3.5 py-2.5 text-right">
                          Giờ OT (1.5x / 2x / 3x)
                        </th>
                        <th className="whitespace-nowrap px-3.5 py-2.5">
                          Trạng thái
                        </th>
                        {canEditAttendance && (
                          <th className="whitespace-nowrap px-3.5 py-2.5 text-right">
                            Hiệu chỉnh
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                      {filteredMonthlyRecords.map((row) => {
                        const statusCfg =
                          MONTHLY_STATUS_CONFIG[row.attendance_status];
                        return (
                          <tr
                            key={row.id}
                            onClick={() => {
                              if (canEditAttendance) openEditModal(row);
                            }}
                            className={`odd:bg-[#FCFEFD] even:bg-[#F5FAF8] transition-colors hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40 ${
                              canEditAttendance ? 'cursor-pointer' : ''
                            }`}
                          >
                            <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                              {row.employee_code}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                                {row.full_name}
                              </div>
                              <div className="text-xs text-[#415A54] dark:text-zinc-400">
                                {row.position_name}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 font-medium text-[#11221E] dark:text-zinc-300">
                              {row.department_name}
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2.5">
                              <Badge
                                variant="outline"
                                className="font-mono tabular-nums"
                              >
                                {row.shift_code}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                              <span className="font-semibold">
                                {row.actual_work_days}
                              </span>
                              <span className="text-[#5C7871] dark:text-zinc-400">
                                {' '}
                                / {row.standard_work_days}
                              </span>
                              {row.paid_leave_days > 0 && (
                                <span className="ml-1.5 text-xs text-[#0F766E] dark:text-teal-400">
                                  (+{row.paid_leave_days} phép)
                                </span>
                              )}
                              {row.unpaid_leave_days > 0 && (
                                <span className="ml-1 text-xs text-[#5C7871] dark:text-zinc-400">
                                  ({row.unpaid_leave_days} KL)
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono text-xs tabular-nums">
                              {row.late_occurrences +
                                row.early_leave_occurrences >
                              0 ? (
                                <span className="font-medium text-amber-700 dark:text-amber-400">
                                  {row.late_occurrences} muộn ·{' '}
                                  {row.early_leave_occurrences} sớm
                                </span>
                              ) : (
                                <span className="text-[#5C7871] dark:text-zinc-400">
                                  0
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                              <div className="font-semibold">
                                {row.total_overtime_hours} giờ
                              </div>
                              {row.total_overtime_hours > 0 && (
                                <div className="text-[11px] text-[#5C7871] dark:text-zinc-400">
                                  {row.overtime_hours_weekday}h ·{' '}
                                  {row.overtime_hours_weekend}h ·{' '}
                                  {row.overtime_hours_holiday}h
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2.5">
                              <Badge variant={statusCfg.variant}>
                                {statusCfg.label}
                              </Badge>
                            </td>
                            {canEditAttendance && (
                              <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={
                                    row.attendance_status === 'LOCKED' &&
                                    role !== 'SUPER_ADMIN'
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(row);
                                  }}
                                  aria-label={`Hiệu chỉnh công ${row.full_name}`}
                                >
                                  <Pencil
                                    className="h-4 w-4"
                                    strokeWidth={1.5}
                                  />
                                  Hiệu chỉnh
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* TAB 3: CA LÀM VIỆC CHUẨN */}
          {activeTab === 'shifts' && (
            <div className="overflow-x-auto bg-[#FCFEFD] dark:bg-transparent">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#F2F7F5] dark:bg-zinc-900/60">
                  <tr className="border-b border-[#C6D9D3] text-xs font-semibold text-[#415A54] dark:border-zinc-800 dark:text-zinc-400">
                    <th className="whitespace-nowrap px-4 py-3">Mã ca</th>
                    <th className="px-4 py-3">Tên ca làm việc</th>
                    <th className="whitespace-nowrap px-4 py-3">Khung giờ</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">
                      Nghỉ trưa
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">
                      Giờ chuẩn
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">
                      Ân hạn muộn
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">
                      Nhân sự áp dụng
                    </th>
                    <th className="px-4 py-3">Phạm vi phòng ban</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                  {workShifts.map((shift) => {
                    const assignedCount = employees.filter(
                      (e) =>
                        e.employment_status !== 'RESIGNED' &&
                        e.work_shift_code === shift.shift_code
                    ).length;
                    return (
                      <tr
                        key={shift.id}
                        className="odd:bg-[#FCFEFD] even:bg-[#F5FAF8] transition-colors hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge
                            variant="teal"
                            className="font-mono tabular-nums"
                          >
                            {shift.shift_code}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#11221E] dark:text-zinc-100">
                          {shift.shift_name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                          {shift.start_time} - {shift.end_time}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                          {shift.break_minutes} phút
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                          {shift.standard_hours} giờ
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                          {shift.late_grace_minutes} phút
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {assignedCount} NV
                        </td>
                        <td className="px-4 py-3 text-xs text-[#415A54] dark:text-zinc-400">
                          {shift.department_scope}
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

      {/* MODAL 1: IMPORT DỮ LIỆU CHẤM CÔNG CSV / DÁN BẢNG NHANH */}
      <Dialog
        open={isImportOpen}
        onOpenChange={(open) => {
          setIsImportOpen(open);
          if (!open) setImportError('');
        }}
      >
        <DialogContent className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
            <DialogTitle>
              Import dữ liệu chấm công (CSV / Dán bảng nhanh)
            </DialogTitle>
            <DialogDescription>
              Đồng bộ log máy chấm công vân tay theo cấu trúc{' '}
              <span className="font-mono tabular-nums">
                employee_code,date,check_in,check_out,shift_code,overtime_hours,note
              </span>
              . Hệ thống tự động gắn cờ{' '}
              <span className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                MISSING_PUNCH
              </span>{' '}
              nếu thiếu giờ vào hoặc ra.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleConfirmImport}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="text-xs text-[#415A54] dark:text-zinc-300">
                  Chọn tệp CSV từ máy chấm công hoặc tải nhanh bộ dữ liệu mẫu để kiểm thử:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 text-xs font-medium text-[#11221E] transition-colors hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <Upload className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Chọn tệp .CSV</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleImportFileChange}
                      className="sr-only"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleLoadSampleImport}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Tải dữ liệu mẫu thử nghiệm
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="attendance-import-textarea"
                  className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                >
                  Nội dung bảng chấm công (CSV hoặc Tab từ Excel)
                </label>
                <textarea
                  id="attendance-import-textarea"
                  rows={6}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    if (importError) setImportError('');
                  }}
                  placeholder="NV-2024-004,2026-11-21,08:25,17:38,HC-08:30,0,Ghi chú..."
                  className="w-full rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 font-mono text-xs leading-5 text-[#11221E] placeholder:text-[#5C7871] focus-visible:border-[#0F766E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/[0.18] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-teal-400"
                />
              </div>

              {parsedImportPreview.allRows.length > 0 && (
                <div className="space-y-2 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                      Xem trước kết quả đối soát ca làm:
                    </span>
                    <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                      <Badge variant="teal">
                        {parsedImportPreview.validRows.length} hợp lệ
                      </Badge>
                      {parsedImportPreview.lateCount > 0 && (
                        <Badge variant="warning">
                          {parsedImportPreview.lateCount} đi muộn
                        </Badge>
                      )}
                      {parsedImportPreview.missingCount > 0 && (
                        <Badge variant="error">
                          {parsedImportPreview.missingCount} MISSING_PUNCH
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="max-h-44 overflow-y-auto rounded-lg border border-[#D5E3DF] dark:border-zinc-800">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-[#F2F7F5] text-[#415A54] dark:bg-zinc-900 dark:text-zinc-400">
                        <tr>
                          <th className="px-2.5 py-1.5">Mã NV</th>
                          <th className="px-2.5 py-1.5">Nhân sự</th>
                          <th className="px-2.5 py-1.5">Ngày</th>
                          <th className="px-2.5 py-1.5">Vào - Ra</th>
                          <th className="px-2.5 py-1.5 text-right">Công</th>
                          <th className="px-2.5 py-1.5">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800">
                        {parsedImportPreview.allRows.map((item, idx) => (
                          <tr key={`${item.employee_code}-${item.date}-${idx}`}>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums">
                              {item.employee_code}
                            </td>
                            <td className="px-2.5 py-1.5">
                              {item.matchedEmp ? (
                                item.matchedEmp.full_name
                              ) : (
                                <span className="text-rose-600 dark:text-rose-400">
                                  Không khớp mã NV
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums">
                              {item.date}
                            </td>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums">
                              {item.check_in ?? '--:--'} -{' '}
                              {item.check_out ?? '--:--'}
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-mono font-semibold tabular-nums">
                              {item.evaluation.workday_value.toFixed(1)}
                            </td>
                            <td className="px-2.5 py-1.5">
                              <Badge
                                variant={
                                  DAILY_STATUS_CONFIG[item.evaluation.status]
                                    .variant
                                }
                              >
                                {
                                  DAILY_STATUS_CONFIG[item.evaluation.status]
                                    .label
                                }
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importError && (
                <p
                  className="text-xs font-medium text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {importError}
                </p>
              )}
            </div>

            <DialogFooter className="mt-0 shrink-0 border-t border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsImportOpen(false)}
              >
                Hủy bỏ
              </Button>
              <Button type="submit" variant="primary">
                <Upload className="h-4 w-4" strokeWidth={1.5} />
                Thực hiện Import ({parsedImportPreview.validRows.length} dòng)
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: HIỆU CHỈNH TỔNG HỢP CÔNG THÁNG (KHÔNG XÓA CỨNG) */}
      <Dialog
        open={editingRecord !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRecord(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {editingRecord && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Hiệu chỉnh tổng hợp công — {editingRecord.full_name}
                </DialogTitle>
                <DialogDescription>
                  <span className="font-mono tabular-nums">
                    {editingRecord.employee_code}
                  </span>{' '}
                  · {editingRecord.department_name} · Kỳ{' '}
                  <span className="font-mono tabular-nums">
                    {editingRecord.month_period}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="edit-shift"
                      className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Ca làm việc
                    </label>
                    <Select
                      id="edit-shift"
                      value={editShiftCode}
                      onValueChange={setEditShiftCode}
                      options={shiftOptions.filter((opt) => opt.value !== 'ALL')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="edit-status"
                      className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Trạng thái rà soát công
                    </label>
                    <Select
                      id="edit-status"
                      value={editStatus}
                      onValueChange={(v) =>
                        setEditStatus(
                          v as MonthlyAttendanceSummary['attendance_status']
                        )
                      }
                      options={[
                        { value: 'VERIFIED', label: 'Đã xác nhận' },
                        { value: 'NEEDS_REVIEW', label: 'Cần rà soát' },
                        { value: 'LOCKED', label: 'Đã chốt công' },
                      ]}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="edit-days"
                      className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Công thực tế
                    </label>
                    <Input
                      id="edit-days"
                      type="number"
                      min={0}
                      max={31}
                      step={0.5}
                      value={editActualDays}
                      onChange={(e) => setEditActualDays(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="edit-late"
                      className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Đi muộn (lượt)
                    </label>
                    <Input
                      id="edit-late"
                      type="number"
                      min={0}
                      value={editLateCount}
                      onChange={(e) => setEditLateCount(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="edit-ot"
                      className="text-xs font-medium text-[#415A54] dark:text-zinc-300"
                    >
                      Tổng giờ OT
                    </label>
                    <Input
                      id="edit-ot"
                      type="number"
                      min={0}
                      step={0.5}
                      value={editOtHours}
                      onChange={(e) => setEditOtHours(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingRecord(null)}
                  >
                    Hủy bỏ
                  </Button>
                  <Button type="submit" variant="primary">
                    Lưu thay đổi
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Biometric Device Enrollment & Same-WiFi Guide Modal */}
      <Dialog
        open={isBiometricModalOpen}
        onOpenChange={(open) => {
          if (!open) setIsBiometricModalOpen(false);
        }}
      >
        <DialogContent className="flex max-h-[88dvh] max-w-2xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
              Thiết bị Vân tay &amp; Kiểm chứng Chung WiFi
            </DialogTitle>
            <DialogDescription>
              Đăng ký cảm biến vân tay trực tiếp của Laptop (Windows Hello / Touch ID) hoặc Điện thoại để chấm công an toàn khi kết nối chung mạng WiFi văn phòng.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
            {/* Network Verification Card */}
            <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                  {wifiStatus?.allowed ? (
                    <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                  ) : (
                    <WifiOff className="h-4 w-4 text-rose-600 dark:text-rose-400" strokeWidth={1.5} />
                  )}
                  <span>Trạng thái Mạng WiFi hiện tại</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isCheckingWifi}
                  onClick={() => void refreshWifiAndBiometric(true)}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isCheckingWifi ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  Kiểm tra lại
                </Button>
              </div>
              <p className="mt-2 text-xs text-[#415A54] dark:text-zinc-300">
                {wifiStatus?.reason || 'Đang thu thập thông số WiFi...'}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[11px] font-mono tabular-nums">
                <div className="min-w-0 rounded-lg border border-[#C6D9D3]/80 bg-[#FCFEFD] px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="font-sans text-[10px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                    SSID &amp; BSSID
                  </div>
                  <div className="mt-0.5 truncate font-semibold text-[#11221E] dark:text-zinc-100">
                    {hostWifiDetails?.ssid || wifiPolicy.wifi_ssid_label}
                  </div>
                  <div className="truncate text-[#5C7871] dark:text-zinc-400">
                    {hostWifiDetails?.bssid || '--'}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-[#C6D9D3]/80 bg-[#FCFEFD] px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="font-sans text-[10px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                    Sóng &amp; Băng tần
                  </div>
                  <div className="mt-0.5 truncate font-semibold text-[#11221E] dark:text-zinc-100">
                    {hostWifiDetails?.signalPercent != null
                      ? `${hostWifiDetails.signalPercent}%`
                      : '--'}{' '}
                    · {hostWifiDetails?.band || '--'}
                  </div>
                  <div className="truncate text-[#5C7871] dark:text-zinc-400">
                    {hostWifiDetails?.radioType || '--'} · Kênh{' '}
                    {hostWifiDetails?.channel ?? '--'}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-[#C6D9D3]/80 bg-[#FCFEFD] px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="font-sans text-[10px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                    Bảo mật &amp; Tốc độ
                  </div>
                  <div className="mt-0.5 truncate font-semibold text-[#11221E] dark:text-zinc-100">
                    {hostWifiDetails?.authentication || '--'}
                    {hostWifiDetails?.cipher ? ` (${hostWifiDetails.cipher})` : ''}
                  </div>
                  <div className="truncate text-[#5C7871] dark:text-zinc-400">
                    ↓{hostWifiDetails?.rxRateMbps ?? '--'}/↑
                    {hostWifiDetails?.txRateMbps ?? '--'} Mbps
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-[#C6D9D3]/80 bg-[#FCFEFD] px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="font-sans text-[10px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                    IPv4 Máy chủ &amp; Subnet
                  </div>
                  <div className="mt-0.5 truncate font-semibold text-[#0F766E] dark:text-teal-400">
                    {hostWifiDetails?.ipv4Address || '--'}
                  </div>
                  <div className="truncate text-[#5C7871] dark:text-zinc-400">
                    {hostWifiDetails?.cidr || '--'}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-[#C6D9D3]/80 bg-[#FCFEFD] px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="font-sans text-[10px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                    Gateway &amp; DNS
                  </div>
                  <div className="mt-0.5 truncate font-semibold text-[#11221E] dark:text-zinc-100">
                    GW: {hostWifiDetails?.defaultGateway || '--'}
                  </div>
                  <div className="truncate text-[#5C7871] dark:text-zinc-400">
                    DNS:{' '}
                    {hostWifiDetails?.dnsServers?.length
                      ? hostWifiDetails.dnsServers.join(', ')
                      : '--'}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border border-[#C6D9D3]/80 bg-[#FCFEFD] px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="font-sans text-[10px] font-medium uppercase tracking-wide text-[#5C7871] dark:text-zinc-400">
                    WAN Public &amp; Thiết bị
                  </div>
                  <div className="mt-0.5 truncate font-semibold text-emerald-700 dark:text-emerald-400">
                    WAN: {hostPublicIpv4 || '--'}
                  </div>
                  <div className="truncate text-[#5C7871] dark:text-zinc-400">
                    {biometricSupport?.hostname || 'localhost'} · Bạn:{' '}
                    {wifiStatus?.verifiedIp || '--'}
                  </div>
                </div>
              </div>
            </div>

            {/* Enroll Current Device */}
            <div className="space-y-3 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800 dark:bg-[#121214]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                    Đăng ký vân tay cho thiết bị đang mở
                  </h3>
                  <Badge variant="teal" className="font-mono text-[11px] tabular-nums">
                    {activeEmployeeCode} · {activeEmployeeName}
                  </Badge>
                </div>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {biometricSupport?.deviceKind === 'MOBILE' ? 'Điện thoại' : 'Laptop / PC'}
                </Badge>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={deviceLabelInput}
                  onChange={(e) => setDeviceLabelInput(e.target.value)}
                  placeholder="VD: Vân tay Laptop Dell / iPhone của tôi"
                  aria-label="Tên thiết bị vân tay"
                />
                <Button
                  variant="primary"
                  className="shrink-0"
                  disabled={isEnrollingDevice || Boolean(wifiStatus && !wifiStatus.allowed)}
                  onClick={() => void handleEnrollCurrentDevice()}
                >
                  <Fingerprint className="h-4 w-4" strokeWidth={1.5} />
                  {isEnrollingDevice ? 'Đang quét...' : 'Quét & Lưu vân tay máy này'}
                </Button>
              </div>
              <p className="text-xs text-[#5C7871] dark:text-zinc-400">
                Hệ thống sử dụng chuẩn phần cứng <b>WebAuthn Platform Authenticator</b>: dữ liệu sinh trắc học không bao giờ rời khỏi chip TPM/Secure Enclave của máy bạn; hệ thống chỉ lưu khóa công khai để xác minh chữ ký.
              </p>
            </div>

            {/* Registered Devices List */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                Danh sách thiết bị đã liên kết ({myRegisteredCreds.length})
              </h3>
              {myRegisteredCreds.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#C6D9D3] p-5 text-center text-xs text-[#5C7871] dark:border-zinc-800 dark:text-zinc-400">
                  Chưa có thiết bị nào đăng ký vân tay cho {activeEmployeeName} ({activeEmployeeCode}).
                </div>
              ) : (
                <div className="divide-y divide-[#D5E3DF] rounded-xl border border-[#C6D9D3] dark:divide-zinc-800 dark:border-zinc-800">
                  {myRegisteredCreds.map((cred) => (
                    <div
                      key={cred.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        {cred.device_kind === 'MOBILE' ? (
                          <Smartphone className="mt-0.5 h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                        ) : (
                          <Laptop className="mt-0.5 h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[#11221E] dark:text-zinc-100">
                            <span>{cred.device_label}</span>
                            {cred.rp_id === biometricSupport?.hostname && (
                              <Badge variant="teal">Máy hiện tại</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-[#5C7871] dark:text-zinc-400">
                            Domain: {cred.rp_id} · IP đăng ký: {cred.registered_ip || '--'} · Quét: {cred.sign_count} lần
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        onClick={async () => {
                          const ok = await confirmSwal({
                            title: 'Gỡ bỏ khóa vân tay thiết bị này?',
                            text: `Thiết bị "${cred.device_label}" sẽ không thể chấm công cho tới khi đăng ký lại.`,
                            confirmText: 'Gỡ bỏ',
                            cancelText: 'Giữ lại',
                            variant: 'danger',
                          });
                          if (!ok) return;
                          await removeDeviceBiometricEverywhere(cred.id, activeEmployeeName);
                          syncFromRuntime();
                          showToast('Đã gỡ thiết bị vân tay', cred.device_label, 'info');
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Gỡ
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dual Device Setup Guide */}
            <div className="rounded-xl border border-[#C6D9D3] bg-[#F5FAF8] p-4 text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300">
              <p className="font-semibold text-[#11221E] dark:text-zinc-100">
                Hướng dẫn chấm công trên cả Laptop và Điện thoại chung WiFi:
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                <li>
                  <b>Trên Laptop:</b> Truy cập <span className="font-mono">http://localhost:3000</span> rồi bấm <b>Vân tay Check-in</b> để dùng cảm biến Windows Hello / Touch ID.
                </li>
                <li>
                  <b>Trên Điện thoại:</b> Kết nối <b>cùng bộ phát WiFi</b> với Laptop (tắt 4G/5G), mở đường link <b>HTTPS DevTunnel</b> (vd <span className="font-mono">https://...-3000.jpe1.devtunnels.ms</span>) rồi đăng ký vân tay / Face ID trên điện thoại. Hệ thống tự đối chiếu trùng Public WiFi IPv4 giữa điện thoại và Laptop trước khi cho quét vân tay.
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-[#C6D9D3] px-6 py-3 dark:border-zinc-800">
            <Button variant="outline" onClick={() => setIsBiometricModalOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AttendanceView;
