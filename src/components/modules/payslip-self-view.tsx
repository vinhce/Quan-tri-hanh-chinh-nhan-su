'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  Fingerprint,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp, type RoleCode, type UserProfileOverride } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import {
  BiometricFlowError,
  type BiometricSupportInfo,
  enrollCurrentDeviceBiometric,
  fetchSameWifiStatus,
  getBiometricSupportInfo,
  punchWithBiometricWifi,
} from '@/lib/biometric-attendance';
import {
  getAllRuntimeEmployees,
  getBiometricCredentials,
  getCareerHistories,
  getContracts,
  getCurrentHHmmVN,
  getDailyAttendances,
  getLeaveBalances,
  getMonthlyAttendances,
  getPayrollRecords,
  getTodayDateVN,
  getWifiAttendancePolicy,
  handleRequestLifecycleChange,
  HRM_RUNTIME_EVENT,
  isAttendanceNightLockWindow,
  mergeWithRuntimeRequests,
  pushNotification,
} from '@/lib/runtime-store';
import { alertSwal, confirmSwal } from '@/lib/swal';
import { formatDateVN } from '@/lib/utils';
import { MOCK_LEAVE_OVERTIME_REQUESTS } from '@/mock/attendance';
import {
  calculateProgressivePitByPeriod,
  getPitTaxConfigForPeriod,
} from '@/lib/hrm/config';
import { MOCK_PAYROLL_FORMULA } from '@/mock/payroll';
import type {
  AnnualLeaveBalance,
  ApprovalStep,
  BiometricCredentialRecord,
  DailyAttendanceRecord,
  DailyAttendanceStatus,
  Employee,
  EmploymentStatus,
  LeaveOvertimeRequest,
  MidMonthSalarySplit,
  PayrollRecord,
  WifiAttendancePolicy,
  WifiVerificationResult,
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

function formatVnd(amount: number, masked: boolean): string {
  if (masked) return '•••\u00A0•••\u00A0•••\u00A0đ';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))}\u00A0đ`;
}

function formatTimeNow(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .replace(/^24:/, '00:');
}

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

const EMPLOYMENT_STATUS_BADGE: Record<
  EmploymentStatus,
  { label: string; variant: BadgeVariant }
> = {
  PENDING_ONBOARD: { label: 'Chờ nhận việc', variant: 'warning' },
  PROBATION: { label: 'Đang thử việc', variant: 'warning' },
  ACTIVE: { label: 'Chính thức', variant: 'success' },
  OFFICIAL: { label: 'Chính thức', variant: 'success' },
  ON_LEAVE: { label: 'Nghỉ chế độ', variant: 'secondary' },
  NOTICE_PERIOD: { label: 'Đang bàn giao nghỉ việc', variant: 'warning' },
  RESIGNED: { label: 'Đã nghỉ việc', variant: 'danger' },
};

const DAILY_STATUS_BADGE: Record<
  DailyAttendanceStatus,
  { label: string; variant: BadgeVariant }
> = {
  PRESENT: { label: 'Đúng giờ (1.0c)', variant: 'success' },
  LATE: { label: 'Đi muộn (1.0c)', variant: 'warning' },
  HALF_DAY: { label: 'Nửa ngày (0.5c)', variant: 'secondary' },
  WORKING: { label: 'Đang trong ca (chờ ra)', variant: 'teal' },
  MISSING_PUNCH: { label: 'Thiếu chấm công (0c)', variant: 'danger' },
  PAID_LEAVE: { label: 'Nghỉ phép (1.0c)', variant: 'teal' },
  UNPAID_LEAVE: { label: 'Không lương (0c)', variant: 'outline' },
  SICK_LEAVE: { label: 'Nghỉ ốm BHXH (1.0c)', variant: 'info' },
  REMOTE_WORK: { label: 'Làm từ xa / Công tác (1.0c)', variant: 'teal' },
  HOLIDAY: { label: 'Nghỉ lễ (1.0c)', variant: 'success' },
  WEEKEND: { label: 'Cuối tuần', variant: 'muted' },
  ABSENT: { label: 'Vắng mặt (0c)', variant: 'danger' },
};

const PAYMENT_STATUS_BADGE: Record<
  PayrollRecord['payment_status'],
  { label: string; variant: BadgeVariant }
> = {
  DRAFT_CALCULATED: { label: 'Nháp tính toán', variant: 'warning' },
  APPROVED: { label: 'Đã duyệt lương', variant: 'teal' },
  PAID: { label: 'Đã chi trả (PAID)', variant: 'success' },
};

interface PitBracketSlice {
  level: number;
  label: string;
  ratePercent: number;
  taxableSliceVnd: number;
  taxVnd: number;
}

function computePitBreakdown(
  taxableIncomeVnd: number,
  periodMonth?: string
): PitBracketSlice[] {
  if (taxableIncomeVnd <= 0) return [];
  const items: PitBracketSlice[] = [];
  let prevMax = 0;
  const brackets = getPitTaxConfigForPeriod(periodMonth).brackets;

  for (const bracket of brackets) {
    const upper = bracket.max_taxable_vnd ?? Infinity;
    const slice = Math.max(0, Math.min(taxableIncomeVnd, upper) - prevMax);
    if (slice > 0) {
      items.push({
        level: bracket.level,
        label: bracket.label,
        ratePercent: bracket.rate_percent,
        taxableSliceVnd: slice,
        taxVnd: Math.round((slice * bracket.rate_percent) / 100),
      });
    }
    if (bracket.max_taxable_vnd === null || taxableIncomeVnd <= bracket.max_taxable_vnd) {
      break;
    }
    prevMax = bracket.max_taxable_vnd;
  }

  return items;
}

function countWeekdaysInRange(startIso: string, endIso: string): number {
  const s = startIso.slice(0, 10).split('-').map(Number);
  const e = endIso.slice(0, 10).split('-').map(Number);
  if (s.length !== 3 || e.length !== 3) return 0;
  let cur = Date.UTC(s[0], s[1] - 1, s[2]);
  const end = Date.UTC(e[0], e[1] - 1, e[2]);
  let count = 0;
  while (cur <= end) {
    const dow = new Date(cur).getUTCDay();
    if (dow >= 1 && dow <= 5) count += 1;
    cur += 86400000;
  }
  return count;
}

function buildLiveFallbackPayslip(emp: Employee, periodMonth = '2026-11'): PayrollRecord {
  const att = getMonthlyAttendances(periodMonth).find(
    (m) => m.employee_code === emp.employee_code || m.employee_id === emp.id
  );
  const standardDays =
    att?.standard_work_days ?? MOCK_PAYROLL_FORMULA.standard_work_days_per_month;
  const paidLeaveDays = att?.paid_leave_days ?? 0;
  const unpaidLeaveDays = att?.unpaid_leave_days ?? 0;
  const actualWorkDays =
    att?.actual_work_days ?? Math.max(0, standardDays - paidLeaveDays - unpaidLeaveDays);
  const actualPaidDays = Math.min(
    standardDays,
    Math.max(0, actualWorkDays + paidLeaveDays)
  );

  const activeContract = getContracts().find(
    (c) =>
      (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
      c.status !== 'EXPIRED' &&
      !c.is_addendum
  );
  const isProbation =
    emp.employment_status === 'PROBATION' ||
    activeContract?.contract_type === 'PROBATION_2M' ||
    (emp.contract_type === 'PROBATION_2M' &&
      emp.employment_status !== 'OFFICIAL' &&
      emp.employment_status !== 'ACTIVE');

  let proratedBaseVnd = Math.round((emp.base_salary_vnd * actualPaidDays) / standardDays);
  let midMonthSplit: MidMonthSalarySplit | null = null;

  const splitHistory = getCareerHistories(emp.id).find(
    (h) =>
      h.effective_date.startsWith(periodMonth) &&
      h.old_salary_vnd !== h.new_salary_vnd
  );
  if (splitHistory) {
    const firstDay = `${periodMonth}-01`;
    const lastDay = `${periodMonth}-30`;
    const totalWeekdays = Math.max(1, countWeekdaysInRange(firstDay, lastDay));
    const effParts = splitHistory.effective_date.split('-').map(Number);
    const prevUtc = new Date(Date.UTC(effParts[0], effParts[1] - 1, effParts[2] - 1))
      .toISOString()
      .slice(0, 10);
    const weekdaysOld =
      splitHistory.effective_date > firstDay
        ? countWeekdaysInRange(firstDay, prevUtc)
        : 0;
    const weekdaysNew = Math.max(0, totalWeekdays - weekdaysOld);
    if (weekdaysOld > 0 && weekdaysNew > 0) {
      const daysAtOld =
        Math.round(actualPaidDays * (weekdaysOld / totalWeekdays) * 2) / 2;
      const daysAtNew = Math.max(0, Number((actualPaidDays - daysAtOld).toFixed(1)));
      const oldProrated = Math.round(
        (splitHistory.old_salary_vnd * daysAtOld) / standardDays
      );
      const newProrated = Math.round(
        (splitHistory.new_salary_vnd * daysAtNew) / standardDays
      );
      proratedBaseVnd = oldProrated + newProrated;
      midMonthSplit = {
        effective_date: splitHistory.effective_date,
        decision_no: splitHistory.decision_no,
        old_salary_vnd: splitHistory.old_salary_vnd,
        days_at_old_salary: daysAtOld,
        old_prorated_vnd: oldProrated,
        new_salary_vnd: splitHistory.new_salary_vnd,
        days_at_new_salary: daysAtNew,
        new_prorated_vnd: newProrated,
      };
    }
  }

  const hourlyWage = emp.base_salary_vnd / (standardDays * 8);
  const weekdayOt = att?.overtime_hours_weekday ?? 0;
  const weekendOt = att?.overtime_hours_weekend ?? 0;
  const holidayOt = att?.overtime_hours_holiday ?? 0;
  const overtimePayVnd = Math.round(
    weekdayOt * hourlyWage * 1.5 +
      weekendOt * hourlyWage * 2.0 +
      holidayOt * hourlyWage * 3.0
  );

  const allowanceRatio = actualPaidDays > 0 ? 1 : 0;
  const mealVnd = emp.allowance_meal_vnd * allowanceRatio;
  const transportVnd = emp.allowance_transport_vnd * allowanceRatio;
  const positionVnd = emp.allowance_position_vnd * allowanceRatio;
  const grossSalaryVnd =
    proratedBaseVnd + mealVnd + transportVnd + positionVnd + overtimePayVnd;

  const insuranceBaseVnd = isProbation
    ? 0
    : Math.min(emp.base_salary_vnd, MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd);
  const bhxhVnd = isProbation
    ? 0
    : Math.round(insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhxh_employee_rate);
  const bhytVnd = isProbation
    ? 0
    : Math.round(insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhyt_employee_rate);
  const bhtnVnd = isProbation
    ? 0
    : Math.round(insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhtn_employee_rate);
  const totalInsuranceVnd = bhxhVnd + bhytVnd + bhtnVnd;

  const pitConfig = getPitTaxConfigForPeriod(periodMonth);
  const personalDeduction = pitConfig.personal_deduction_vnd;
  const dependentDeduction =
    emp.dependents_count * pitConfig.dependent_deduction_vnd;
  const taxableIncomeVnd = Math.max(
    0,
    grossSalaryVnd - totalInsuranceVnd - personalDeduction - dependentDeduction
  );
  const pitTaxVnd = calculateProgressivePitByPeriod(taxableIncomeVnd, periodMonth);
  const netSalaryVnd = Math.max(0, grossSalaryVnd - totalInsuranceVnd - pitTaxVnd);
  const employerTotalCostVnd =
    grossSalaryVnd + (isProbation ? 0 : Math.round(insuranceBaseVnd * 0.235));

  return {
    id: `pay-preview-${emp.employee_code}`,
    payslip_code: `PS-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
    period_month: periodMonth,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    position_name: emp.position_name,
    bank_name: emp.bank_name || 'Vietcombank',
    bank_account_no: emp.bank_account_no || '-',
    standard_days: standardDays,
    actual_paid_days: actualPaidDays,
    dependents_count: emp.dependents_count,
    base_salary_vnd: emp.base_salary_vnd,
    prorated_base_salary_vnd: proratedBaseVnd,
    allowance_meal_vnd: mealVnd,
    allowance_transport_vnd: transportVnd,
    allowance_position_vnd: positionVnd,
    overtime_pay_vnd: overtimePayVnd,
    kpi_bonus_vnd: 0,
    gross_salary_vnd: grossSalaryVnd,
    insurance_base_vnd: insuranceBaseVnd,
    bhxh_employee_vnd: bhxhVnd,
    bhyt_employee_vnd: bhytVnd,
    bhtn_employee_vnd: bhtnVnd,
    total_insurance_employee_vnd: totalInsuranceVnd,
    personal_deduction_vnd: personalDeduction,
    dependent_deduction_vnd: dependentDeduction,
    taxable_income_vnd: taxableIncomeVnd,
    pit_tax_vnd: pitTaxVnd,
    net_salary_vnd: netSalaryVnd,
    employer_total_cost_vnd: employerTotalCostVnd,
    payment_status: 'DRAFT_CALCULATED',
    paid_at: null,
    contract_type: activeContract?.contract_type ?? emp.contract_type,
    paid_leave_days: paidLeaveDays,
    unpaid_leave_days: unpaidLeaveDays,
    overtime_hours: weekdayOt + weekendOt + holidayOt,
    advance_deduction_vnd: 0,
    penalty_deduction_vnd: 0,
    is_final_settlement: false,
    mid_month_split: midMonthSplit,
  };
}

function resolveLoggedInEmployee(
  allEmployees: Employee[],
  _role: RoleCode,
  currentUserEmail: string | null,
  currentUserProfile: UserProfileOverride | null
): Employee | null {
  if (allEmployees.length === 0) return null;

  const rawProfileCode = currentUserProfile?.employee_code?.trim();
  const profileCode = rawProfileCode?.toLowerCase();
  const hasExplicitEmployeeCode = Boolean(
    profileCode && !profileCode.startsWith('uv-')
  );

  if (hasExplicitEmployeeCode && profileCode) {
    const byCode = allEmployees.find(
      (e) =>
        e.employee_code.trim().toLowerCase() === profileCode ||
        e.id.trim().toLowerCase() === profileCode
    );
    return byCode ?? null;
  }

  const emailCandidate = (currentUserEmail || currentUserProfile?.email || '')
    .trim()
    .toLowerCase();
  if (emailCandidate) {
    const exactByEmail = allEmployees.find(
      (e) =>
        emailsMatchExactOrCorporateAlias(e.email, emailCandidate) ||
        Boolean(
          e.personal_email &&
            e.personal_email.trim().toLowerCase() === emailCandidate
        )
    );
    return exactByEmail ?? null;
  }

  return null;
}

type QuickRequestMode = 'ANNUAL_LEAVE' | 'OVERTIME' | 'LATE_EXPLANATION';

export function PayslipSelfView() {
  const {
    role,
    currentUserEmail,
    currentUserProfile,
    navIntent,
    clearNavIntent,
    uiState,
    showToast,
  } = useApp();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<AnnualLeaveBalance | null>(null);
  const [empPayrolls, setEmpPayrolls] = useState<PayrollRecord[]>([]);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string>('');
  const [empAttendances, setEmpAttendances] = useState<DailyAttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [now, setNow] = useState<Date>(() => new Date());
  const [maskSalary, setMaskSalary] = useState<boolean>(false);

  const [biometricCreds, setBiometricCreds] = useState<BiometricCredentialRecord[]>([]);
  const [wifiPolicy, setWifiPolicy] = useState<WifiAttendancePolicy>(() =>
    getWifiAttendancePolicy()
  );
  const [wifiStatus, setWifiStatus] = useState<WifiVerificationResult | null>(null);
  const [biometricSupport, setBiometricSupport] = useState<BiometricSupportInfo | null>(
    null
  );
  const [isCheckingWifi, setIsCheckingWifi] = useState<boolean>(false);
  const [isPunchingBiometric, setIsPunchingBiometric] = useState<boolean>(false);

  const [quickDialogOpen, setQuickDialogOpen] = useState<boolean>(false);
  const [reqType, setReqType] = useState<QuickRequestMode>('ANNUAL_LEAVE');
  const [reqDate, setReqDate] = useState<string>('2026-11-25');
  const [reqDuration, setReqDuration] = useState<string>('1');
  const [expCheckIn, setExpCheckIn] = useState<string>('08:30');
  const [expCheckOut, setExpCheckOut] = useState<string>('17:30');
  const [reqReason, setReqReason] = useState<string>('');

  const syncFromRuntimeStore = useCallback(() => {
    const allEmps = getAllRuntimeEmployees();
    const resolvedEmp = resolveLoggedInEmployee(
      allEmps,
      role,
      currentUserEmail,
      currentUserProfile
    );
    setEmployee(resolvedEmp);

    if (!resolvedEmp) {
      setLeaveBalance(null);
      setEmpPayrolls([]);
      setSelectedPayslipId('');
      setEmpAttendances([]);
      setBiometricCreds([]);
      setIsLoading(false);
      return;
    }

    // 1. Live Leave Balance (2026)
    const balances = getLeaveBalances(2026);
    const matchedBal = balances.find(
      (b) =>
        b.employee_id === resolvedEmp.id ||
        b.employee_code === resolvedEmp.employee_code
    );
    const isProbation =
      resolvedEmp.employment_status === 'PROBATION' ||
      resolvedEmp.employment_status === 'PENDING_ONBOARD';
    setLeaveBalance(
      matchedBal ?? {
        id: `alb-fallback-${resolvedEmp.employee_code}`,
        employee_id: resolvedEmp.id,
        employee_code: resolvedEmp.employee_code,
        full_name: resolvedEmp.full_name,
        department_name: resolvedEmp.department_name,
        year: 2026,
        total_entitled_days: isProbation ? 0 : 12,
        carried_over_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: isProbation ? 0 : 12,
      }
    );

    // 2. Live Daily Attendances (shared with attendance-view.tsx)
    const dailyList = getDailyAttendances(undefined, resolvedEmp.employee_code);
    setEmpAttendances(dailyList);
    setBiometricCreds(getBiometricCredentials(resolvedEmp.id));
    setWifiPolicy(getWifiAttendancePolicy());

    // 3. Live Payroll Records (strictly own employee_id or employee_code)
    const allPayrolls = getPayrollRecords().filter(
      (p) =>
        (Boolean(resolvedEmp.id) && p.employee_id === resolvedEmp.id) ||
        (Boolean(resolvedEmp.employee_code) &&
          p.employee_code === resolvedEmp.employee_code)
    );
    const sortedPayrolls = [...allPayrolls].sort((a, b) => {
      if (Boolean(a.is_final_settlement) !== Boolean(b.is_final_settlement)) {
        return a.is_final_settlement ? -1 : 1;
      }
      return b.period_month.localeCompare(a.period_month);
    });

    const effectivePayrolls =
      sortedPayrolls.length > 0
        ? sortedPayrolls
        : resolvedEmp.base_salary_vnd > 0
          ? [buildLiveFallbackPayslip(resolvedEmp, '2026-11')]
          : [];

    setEmpPayrolls(effectivePayrolls);
    setSelectedPayslipId((prevId) => {
      if (effectivePayrolls.length === 0) return '';
      if (prevId && effectivePayrolls.some((p) => p.id === prevId)) {
        return prevId;
      }
      return effectivePayrolls[0].id;
    });
    setIsLoading(false);
  }, [role, currentUserEmail, currentUserProfile]);

  useEffect(() => {
    syncFromRuntimeStore();

    const handleUpdate = () => {
      syncFromRuntimeStore();
    };
    window.addEventListener(HRM_RUNTIME_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [syncFromRuntimeStore]);

  useEffect(() => {
    if (!navIntent || navIntent.navId !== 'payslip') return;
    if (navIntent.entityId && empPayrolls.length > 0) {
      const target = empPayrolls.find(
        (p) => p.id === navIntent.entityId || p.payslip_code === navIntent.entityId
      );
      if (target) {
        setSelectedPayslipId(target.id);
      }
    }
    clearNavIntent();
  }, [navIntent, empPayrolls, clearNavIntent]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayIso = useMemo(() => getTodayDateVN(now), [now]);
  const isNightAttendanceLocked = isAttendanceNightLockWindow(
    getCurrentHHmmVN(now)
  );

  const todayAttendance = useMemo(() => {
    return empAttendances.find((d) => d.date === todayIso) ?? null;
  }, [empAttendances, todayIso]);

  const missingPunchRecords = useMemo(
    () => empAttendances.filter((d) => d.status === 'MISSING_PUNCH'),
    [empAttendances]
  );

  const refreshWifiAndDevice = useCallback(
    async (forceRefreshIp = false) => {
      setIsCheckingWifi(true);
      try {
        const [support, netInfo] = await Promise.all([
          getBiometricSupportInfo(),
          fetchSameWifiStatus({
            employeeId: employee?.id,
            forceRefreshIp,
          }),
        ]);
        setBiometricSupport(support);
        setWifiStatus(netInfo.wifi);
      } catch {
        const support = await getBiometricSupportInfo();
        setBiometricSupport(support);
      } finally {
        setIsCheckingWifi(false);
      }
    },
    [employee?.id]
  );

  useEffect(() => {
    void refreshWifiAndDevice(false);
  }, [refreshWifiAndDevice]);

  const currentDeviceCred = useMemo(() => {
    const host =
      biometricSupport?.hostname ||
      (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
    return (
      biometricCreds.find((c) => c.rp_id === host) ?? null
    );
  }, [biometricCreds, biometricSupport?.hostname]);

  const payslip = useMemo(() => {
    if (empPayrolls.length === 0) return null;
    return empPayrolls.find((p) => p.id === selectedPayslipId) ?? empPayrolls[0];
  }, [empPayrolls, selectedPayslipId]);

  const pitBreakdown = useMemo(() => {
    if (!payslip) return [];
    return computePitBreakdown(payslip.taxable_income_vnd, payslip.period_month);
  }, [payslip]);

  const handleEnrollEssBiometric = async (): Promise<boolean> => {
    if (!employee) return false;
    try {
      const res = await enrollCurrentDeviceBiometric({ employee });
      syncFromRuntimeStore();
      setWifiStatus(res.wifi);
      showToast(
        'Đã liên kết vân tay thiết bị',
        `${res.credential.device_label} đã sẵn sàng chấm công chung WiFi (${res.wifi.verifiedIp}).`,
        'success'
      );
      return true;
    } catch (err) {
      if (err instanceof BiometricFlowError && err.wifi) {
        setWifiStatus(err.wifi);
      }
      await alertSwal({
        title: 'Không thể đăng ký vân tay',
        text:
          err instanceof Error
            ? err.message
            : 'Vui lòng kiểm tra cảm biến sinh trắc học và mạng WiFi nội bộ.',
        icon: 'warning',
      });
      return false;
    }
  };

  const resolveEssCheckoutTiming = async (
    action: 'CHECK_IN' | 'CHECK_OUT'
  ): Promise<{
    effectiveAction: 'CHECK_IN' | 'CHECK_OUT';
    timeHHmm?: string;
    checkInTimeOverride?: string;
    cancelled: boolean;
    checkInOverride?: string;
    checkOutOverride?: string;
  } | null> => {
    if (action !== 'CHECK_OUT') {
      return {
        effectiveAction: action,
        timeHHmm: undefined,
        cancelled: false,
        checkInOverride: undefined,
        checkOutOverride: undefined,
      };
    }

    if (!todayAttendance?.check_in) {
      return {
        effectiveAction: 'CHECK_IN',
        timeHHmm: undefined,
        cancelled: false,
        checkInOverride: undefined,
        checkOutOverride: undefined,
      };
    }

    return {
      effectiveAction: 'CHECK_OUT',
      timeHHmm: undefined,
      checkInTimeOverride: undefined,
      cancelled: false,
      checkInOverride: undefined,
      checkOutOverride: undefined,
    };
  };

  const handleBiometricEssPunch = async (
    action: 'CHECK_IN' | 'CHECK_OUT',
    resolvedOverride?: {
      effectiveAction: 'CHECK_IN' | 'CHECK_OUT';
      timeHHmm?: string;
      checkInTimeOverride?: string;
    }
  ) => {
    if (!employee) return;
    if (isNightAttendanceLocked) {
      await alertSwal({
        title: 'Khung giờ khóa chấm công (22:00 – 06:00)',
        text: 'Hệ thống tạm khóa chấm công từ 22:00 đến 06:00 sáng hôm sau. Vui lòng thực hiện lại sau 06:00 hoặc gửi giải trình công nếu cần.',
        icon: 'warning',
      });
      return;
    }
    const timing =
      resolvedOverride ?? (await resolveEssCheckoutTiming(action));
    if (!timing) return;

    setIsPunchingBiometric(true);
    try {
      const res = await punchWithBiometricWifi({
        employee,
        action: timing.effectiveAction,
        date:
          timing.effectiveAction === 'CHECK_OUT'
            ? todayAttendance?.date || todayIso
            : todayIso,
        timeHHmm: undefined,
        checkInTimeOverride: timing.checkInTimeOverride,
      });
      setNow(new Date());
      syncFromRuntimeStore();
      setWifiStatus(res.wifi);
      showToast(
        timing.effectiveAction === 'CHECK_IN'
          ? `Vân tay Check-in thành công lúc ${res.record.check_in}`
          : `Vân tay Check-out hoàn tất lúc ${res.record.check_out}`,
        res.record.status === 'WORKING'
          ? `${res.credential.device_label} · WiFi ${res.wifi.verifiedIp} · Đã vào ca, chờ Check-out cuối ngày.`
          : `${res.credential.device_label} · WiFi ${res.wifi.verifiedIp} · ${res.record.workday_value} công.`,
        res.record.status === 'WORKING' ? 'info' : 'success'
      );
    } catch (err) {
      if (err instanceof BiometricFlowError) {
        if (err.wifi) setWifiStatus(err.wifi);
        if (err.code === 'NO_CREDENTIAL_ON_DEVICE') {
          setIsPunchingBiometric(false);
          const wantEnroll = await confirmSwal({
            title: 'Chưa đăng ký vân tay trên thiết bị này',
            html: `Thiết bị <b>${
              biometricSupport?.suggestedDeviceLabel || 'hiện tại'
            }</b> chưa lưu khóa vân tay cho <b>${
              employee.full_name
            }</b>.<br/><br/>Bấm <b>Đăng ký ngay</b> để xác thực bằng cảm biến vân tay / Face ID và chấm công luôn.`,
            confirmText: 'Đăng ký vân tay ngay',
            cancelText: 'Đóng',
            variant: 'primary',
          });
          if (!wantEnroll) return;
          const ok = await handleEnrollEssBiometric();
          if (ok) {
            await handleBiometricEssPunch(timing.effectiveAction, timing);
          }
          return;
        }
        await alertSwal({
          title:
            err.code === 'WIFI_MISMATCH' || err.code === 'CELLULAR_BLOCKED'
              ? 'Bị chặn: Không chung mạng WiFi văn phòng'
              : 'Chưa thể chấm công vân tay',
          text: err.message,
          icon: err.code === 'USER_CANCELLED' ? 'info' : 'warning',
        });
      } else {
        await alertSwal({
          title: 'Lỗi chấm công sinh trắc học',
          text: err instanceof Error ? err.message : 'Đã xảy ra lỗi.',
          icon: 'error',
        });
      }
    } finally {
      setIsPunchingBiometric(false);
    }
  };

  const openQuickExplanationForRecord = (attRec: DailyAttendanceRecord) => {
    setReqType('LATE_EXPLANATION');
    setReqDate(attRec.date);
    setExpCheckIn(attRec.check_in || '08:30');
    setExpCheckOut(attRec.check_out || '17:30');
    setReqReason(
      attRec.note || 'Bổ sung xác nhận giờ vào/ra thực tế do quên chấm vân tay.'
    );
    setQuickDialogOpen(true);
  };

  const handleSubmitQuickRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    const trimmedReason = reqReason.trim();
    if (!trimmedReason) {
      await alertSwal({
        title: 'Thiếu lý do chi tiết',
        text: 'Vui lòng nhập lý do gửi đơn trước khi chuyển phê duyệt.',
        icon: 'warning',
      });
      return;
    }

    const isAnnualLeave = reqType === 'ANNUAL_LEAVE';
    const isExplanation = reqType === 'LATE_EXPLANATION';
    const numericDuration = isExplanation
      ? 1
      : Math.max(0.5, Number(reqDuration) || 1);

    const categoryLabel = isAnnualLeave
      ? 'Nghỉ phép năm có hưởng lương'
      : isExplanation
        ? 'Giải trình bổ sung chấm công'
        : 'Đăng ký tăng ca (OT)';
    const unit = isAnnualLeave ? 'ngày' : isExplanation ? 'ca' : 'giờ';
    const durationUnit: 'NGAY' | 'GIO' =
      isAnnualLeave || isExplanation ? 'NGAY' : 'GIO';

    const allRequests = mergeWithRuntimeRequests(MOCK_LEAVE_OVERTIME_REQUESTS);
    const maxCodeNum = allRequests.reduce((max, r) => {
      const m = /^REQ-202611-(\d+)$/.exec(r.request_code);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 87);
    const nextRequestCode = `REQ-202611-${String(maxCodeNum + 1).padStart(3, '0')}`;

    const isDeptMgr = employee.role_code === 'DEPT_MANAGER' || role === 'DEPT_MANAGER';
    const needsDirector = isAnnualLeave && numericDuration > 3;
    const steps: ApprovalStep[] = [
      {
        step_order: 1,
        role: 'DEPT_MANAGER',
        label: 'Cấp 1 · Trưởng bộ phận duyệt',
        status: isDeptMgr ? 'SKIPPED' : 'PENDING',
        actor_name: employee.manager_name ?? 'Lê Hoàng Nam',
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
        label: 'Cấp 3 · Giám đốc phê duyệt (> 3 ngày)',
        status: 'PENDING',
        actor_name: 'Trần Quốc Việt',
      });
    }

    let computedEndDate = reqDate;
    if (isAnnualLeave && numericDuration > 1) {
      const parsedStart = new Date(`${reqDate}T00:00:00`);
      if (!Number.isNaN(parsedStart.getTime())) {
        parsedStart.setDate(parsedStart.getDate() + Math.ceil(numericDuration) - 1);
        const yyyy = parsedStart.getFullYear();
        const mm = String(parsedStart.getMonth() + 1).padStart(2, '0');
        const dd = String(parsedStart.getDate()).padStart(2, '0');
        computedEndDate = `${yyyy}-${mm}-${dd}`;
      }
    }

    const firstStepRole: 'DEPT_MANAGER' | 'HR_MANAGER' = isDeptMgr
      ? 'HR_MANAGER'
      : 'DEPT_MANAGER';

    const newReq: LeaveOvertimeRequest = {
      id: `req-ess-${Date.now()}`,
      request_code: nextRequestCode,
      employee_id: employee.id,
      employee_code: employee.employee_code,
      full_name: employee.full_name,
      department_name: employee.department_name,
      position_name: employee.position_name,
      requester_role: employee.role_code,
      request_category: reqType,
      category_label: categoryLabel,
      start_datetime: `${reqDate}T${isExplanation ? expCheckIn : '08:30'}:00+07:00`,
      end_datetime: `${computedEndDate}T${isExplanation ? expCheckOut : '17:30'}:00+07:00`,
      duration_days_or_hours: numericDuration,
      duration_unit: durationUnit,
      reason: trimmedReason,
      handover_to_name: null,
      approver_id: isDeptMgr ? 'emp-002' : (employee.manager_id ?? 'emp-003'),
      approver_name: isDeptMgr
        ? 'Trần Thị Bích Ngọc'
        : (employee.manager_name ?? 'Lê Hoàng Nam'),
      approval_status: 'PENDING',
      status: 'PENDING',
      current_step_role: firstStepRole,
      approval_steps: steps,
      leave_deducted: false,
      created_at: new Date().toISOString(),
      responded_at: null,
      source: 'MANUAL_FORM',
      target_date: reqDate,
      actual_check_in: isExplanation ? expCheckIn : undefined,
      actual_check_out: isExplanation ? expCheckOut : undefined,
      ot_hours: reqType === 'OVERTIME' ? numericDuration : undefined,
      ot_multiplier: reqType === 'OVERTIME' ? 1.5 : undefined,
      ot_day_type: reqType === 'OVERTIME' ? 'WEEKDAY' : undefined,
    };

    try {
      handleRequestLifecycleChange(newReq);
      syncFromRuntimeStore();
    } catch (err) {
      await alertSwal({
        title: 'Không thể gửi đơn',
        text:
          err instanceof Error
            ? err.message
            : 'Số ngày xin nghỉ vượt quá quỹ phép năm khả dụng.',
        icon: 'warning',
      });
      return;
    }

    recordAuditLog({
      actor_name: employee.full_name,
      actor_code: employee.employee_code,
      actor_role: role,
      action: 'CREATE_REQUEST',
      target: `${newReq.request_code} (${employee.full_name})`,
      detail: `Tạo nhanh đơn từ cổng ESS: ${categoryLabel} ngày ${reqDate} (${numericDuration} ${unit}).`,
    });

    pushNotification({
      title: `Đơn mới ${newReq.request_code} từ cổng ESS`,
      message: `${employee.full_name} gửi ${categoryLabel.toLowerCase()} ngày ${reqDate} (${numericDuration} ${unit}).`,
      category: 'LEAVE_REQUEST',
      target_roles: ['DEPT_MANAGER', 'HR_MANAGER'],
      target_department_id: employee.department_id,
      nav_id: 'leaves',
      entity_id: newReq.request_code,
    });

    showToast(
      `Đã gửi ${categoryLabel} (${newReq.request_code})`,
      `Đơn ngày ${reqDate} đã chuyển tới cấp phê duyệt và đồng bộ quỹ phép trực tuyến.`,
      'success'
    );
    setReqReason('');
    setQuickDialogOpen(false);
  };

  if (isLoading || uiState === 'loading') {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Skeleton className="h-64 w-full rounded-xl lg:col-span-6" />
          <Skeleton className="h-64 w-full rounded-xl lg:col-span-6" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!employee || !leaveBalance || !payslip) {
    return (
      <Card className="border-[#C6D9D3] bg-[#FCFEFD] dark:border-zinc-800 dark:bg-[#121214]">
        <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] text-[#0F766E] dark:border-zinc-800 dark:bg-zinc-900 dark:text-teal-400">
            <User className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
            Chưa có dữ liệu hồ sơ &amp; phiếu lương cá nhân
          </p>
          <p className="max-w-md text-xs leading-relaxed text-[#5C7871] dark:text-zinc-400">
            Tài khoản hiện tại chưa được liên kết với mã nhân sự hoặc chưa phát sinh kỳ lương chính thức trên hệ thống. Vui lòng liên hệ Phòng Nhân sự để cập nhật hồ sơ.
          </p>
          <Button variant="outline" size="sm" onClick={syncFromRuntimeStore}>
            Tải lại dữ liệu
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalDays = leaveBalance.total_entitled_days + leaveBalance.carried_over_days;
  const isResigned = employee.employment_status === 'RESIGNED';
  const isPreviewPayslip = payslip.id.startsWith('pay-preview-');
  const isProbationPayslip =
    payslip.contract_type === 'PROBATION_2M' ||
    (payslip.total_insurance_employee_vnd === 0 && !payslip.is_final_settlement);
  const empStatusCfg =
    EMPLOYMENT_STATUS_BADGE[employee.employment_status] ?? EMPLOYMENT_STATUS_BADGE.ACTIVE;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Cổng tự phục vụ nhân viên (ESS)
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Đồng bộ trực tiếp chấm công ngày, quỹ phép năm, hồ sơ định danh và phiếu lương cá nhân của{' '}
            <strong className="font-semibold text-[#11221E] dark:text-zinc-200">
              {employee.full_name}
            </strong>{' '}
            (<span className="font-mono tabular-nums">{employee.employee_code}</span>).
          </p>
        </div>
        {!isResigned && (
          <Button
            onClick={() => {
              setReqType('ANNUAL_LEAVE');
              setQuickDialogOpen(true);
            }}
            className="shrink-0"
          >
            <FilePlus2 className="h-4 w-4" strokeWidth={1.5} />
            Tạo nhanh đơn Phép / OT / Giải trình
          </Button>
        )}
      </div>

      {/* Missing Punch Alert Banner if employee has MISSING_PUNCH records */}
      {missingPunchRecords.length > 0 && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-red-500/35 border-l-4 border-l-red-600 bg-red-50/60 px-4 py-3 text-sm dark:border-red-400/25 dark:border-l-red-500 dark:bg-red-950/20 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5 text-red-950 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" strokeWidth={1.5} />
            <div>
              <p className="font-semibold">
                Phát hiện{' '}
                <span className="font-mono tabular-nums">{missingPunchRecords.length}</span> ngày
                quên chấm công (tạm tính 0 công)
              </p>
              <p className="mt-0.5 text-xs text-red-900/80 dark:text-red-300/80">
                Ngày gần nhất:{' '}
                <span className="font-mono tabular-nums">
                  {formatDateVN(missingPunchRecords[0].date)}
                </span>{' '}
                (Vào: {missingPunchRecords[0].check_in ?? '--:--'} · Ra:{' '}
                {missingPunchRecords[0].check_out ?? '--:--'}). Gửi giải trình để phục hồi ngày công trước khi chốt lương.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => openQuickExplanationForRecord(missingPunchRecords[0])}
          >
            Gửi giải trình ngay
          </Button>
        </div>
      )}

      {/* Top Row: Live Web Clock Check-in/out & Real-time Leave Balance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Check-in / Check-out */}
        <Card className="flex flex-col dark:bg-[#121214] lg:col-span-6">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  Chấm công Vân tay &amp; Chung WiFi
                </CardTitle>
                <CardDescription className="mt-1">
                  Ca áp dụng:{' '}
                  <span className="font-mono font-medium tabular-nums">
                    {employee.work_shift_code || 'HC-08:30'}
                  </span>{' '}
                  · Hôm nay{' '}
                  <span className="font-mono tabular-nums">{formatDateVN(todayIso)}</span>
                </CardDescription>
              </div>
              <Badge
                variant={
                  todayAttendance?.check_out
                    ? 'success'
                    : todayAttendance?.check_in
                      ? 'teal'
                      : 'secondary'
                }
              >
                {todayAttendance?.check_out
                  ? `Đã hoàn tất (${todayAttendance.workday_value}c)`
                  : todayAttendance?.check_in
                    ? 'Đang trong ca'
                    : 'Chưa check-in'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-5">
            {/* WiFi & Device Biometric Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {wifiStatus ? (
                <Badge variant={wifiStatus.allowed ? 'success' : 'danger'} className="gap-1">
                  {wifiStatus.allowed ? (
                    <Wifi className="h-3 w-3" strokeWidth={1.5} />
                  ) : (
                    <WifiOff className="h-3 w-3" strokeWidth={1.5} />
                  )}
                  <span>
                    {wifiStatus.allowed
                      ? `Chung WiFi · ${wifiStatus.verifiedIp}`
                      : `Khác WiFi · ${wifiStatus.verifiedIp}`}
                  </span>
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Wifi className="h-3 w-3" strokeWidth={1.5} />
                  <span>Đang kiểm tra WiFi...</span>
                </Badge>
              )}

              <Badge variant={currentDeviceCred ? 'teal' : 'warning'} className="gap-1">
                <Fingerprint className="h-3 w-3" strokeWidth={1.5} />
                <span>
                  {currentDeviceCred
                    ? currentDeviceCred.device_label
                    : 'Chưa đăng ký vân tay máy này'}
                </span>
              </Badge>

              <button
                type="button"
                disabled={isCheckingWifi}
                onClick={() => void refreshWifiAndDevice(true)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[#C6D9D3] bg-[#FCFEFD] px-2.5 text-[11px] font-medium text-[#415A54] hover:bg-[#E8F3EF] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isCheckingWifi ? 'animate-spin' : ''}`}
                  strokeWidth={1.5}
                />
                Kiểm tra WiFi
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

            {isNightAttendanceLocked && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
                Hệ thống khóa chấm công trong khung giờ đêm (22:00 – 06:00 sáng hôm sau).
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/50">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                    Đồng hồ thời gian thực
                  </p>
                  <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#11221E] dark:text-zinc-100">
                    {formatTimeNow(now)}
                  </p>
                </div>
                <span className="font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                  Vào: {todayAttendance?.check_in ?? '--:--'} · Ra:{' '}
                  {todayAttendance?.check_out ?? '--:--'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[#C6D9D3]/70 pt-3 dark:border-zinc-800">
                {!currentDeviceCred && !isResigned && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[40px] shrink-0 sm:min-h-[36px]"
                    disabled={Boolean(wifiStatus && !wifiStatus.allowed)}
                    onClick={() => void handleEnrollEssBiometric()}
                  >
                    <Fingerprint className="h-4 w-4" strokeWidth={1.5} />
                    Đăng ký vân tay máy này
                  </Button>
                )}
                {(() => {
                  const nextBiometricAction: 'CHECK_IN' | 'CHECK_OUT' =
                    todayAttendance?.check_in ? 'CHECK_OUT' : 'CHECK_IN';
                  return (
                    <Button
                      size="sm"
                      variant="primary"
                      className="min-h-[40px] shrink-0 sm:min-h-[36px]"
                      onClick={() => void handleBiometricEssPunch(nextBiometricAction)}
                      disabled={
                        isResigned ||
                        isPunchingBiometric ||
                        isNightAttendanceLocked ||
                        Boolean(wifiStatus && !wifiStatus.allowed)
                      }
                    >
                      <Fingerprint className="h-4 w-4" strokeWidth={1.5} />
                      {isPunchingBiometric
                        ? 'Đang quét...'
                        : 'Chấm công bằng vân tay'}
                    </Button>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-sm">
              <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 dark:border-zinc-800/80 dark:bg-transparent">
                <p className="text-xs text-[#5C7871] dark:text-zinc-400">Giờ vào ca</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {todayAttendance?.check_in ?? '--:--'}
                </p>
              </div>
              <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 dark:border-zinc-800/80 dark:bg-transparent">
                <p className="text-xs text-[#5C7871] dark:text-zinc-400">Giờ tan ca</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {todayAttendance?.check_out ?? '--:--'}
                </p>
              </div>
              <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 dark:border-zinc-800/80 dark:bg-transparent">
                <p className="text-xs text-[#5C7871] dark:text-zinc-400">Công hôm nay</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                  {todayAttendance ? `${todayAttendance.workday_value} công` : '--'}
                </p>
              </div>
            </div>

            {/* Recent Daily Attendance Records shared with AttendanceView */}
            {empAttendances.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                  Nhật ký chấm công đồng bộ gần nhất
                </p>
                <div className="divide-y divide-[#D5E3DF] rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] text-xs dark:divide-zinc-800/70 dark:border-zinc-800/80 dark:bg-transparent">
                  {empAttendances.slice(0, 4).map((rec) => {
                    const st = DAILY_STATUS_BADGE[rec.status];
                    return (
                      <div
                        key={rec.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-200">
                            {formatDateVN(rec.date)}
                          </span>
                          <span className="font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                            {rec.check_in ?? '--:--'} → {rec.check_out ?? '--:--'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {rec.status === 'MISSING_PUNCH' && !isResigned && (
                            <button
                              type="button"
                              onClick={() => openQuickExplanationForRecord(rec)}
                              className="font-medium text-[#0F766E] underline-offset-2 hover:underline dark:text-teal-400"
                            >
                              Giải trình
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Annual Leave Balance */}
        <Card className="flex flex-col dark:bg-[#121214] lg:col-span-6">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  Quỹ phép năm {leaveBalance.year}
                </CardTitle>
                <CardDescription className="mt-1">
                  {totalDays > 0 ? (
                    <>
                      Bao gồm{' '}
                      <span className="font-mono tabular-nums">
                        {leaveBalance.total_entitled_days}
                      </span>{' '}
                      ngày tiêu chuẩn và{' '}
                      <span className="font-mono tabular-nums">
                        {leaveBalance.carried_over_days}
                      </span>{' '}
                      ngày phép tồn chuyển sang.
                    </>
                  ) : (
                    'Nhân sự đang thử việc — Quỹ 12 ngày phép năm kích hoạt ngay khi ký HĐ chính thức.'
                  )}
                </CardDescription>
              </div>
              <Badge variant="teal" className="font-mono tabular-nums">
                Còn {leaveBalance.remaining_days} ngày
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col justify-between gap-4 pt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex h-full flex-col justify-between rounded-xl border border-blue-500/30 bg-blue-50/60 p-3.5 dark:border-blue-400/20 dark:bg-blue-950/20">
                <p className="text-xs font-medium leading-snug text-blue-700 dark:text-blue-300">
                  Tổng phép năm
                </p>
                <p className="mt-2.5 font-mono text-2xl font-semibold leading-none tabular-nums text-blue-600 dark:text-blue-400">
                  {totalDays}
                </p>
              </div>

              <div className="flex h-full flex-col justify-between rounded-xl border border-violet-500/30 bg-violet-50/60 p-3.5 dark:border-violet-400/20 dark:bg-violet-950/20">
                <p className="text-xs font-medium leading-snug text-violet-700 dark:text-violet-300">
                  Đã nghỉ
                </p>
                <p className="mt-2.5 font-mono text-2xl font-semibold leading-none tabular-nums text-violet-600 dark:text-violet-400">
                  {leaveBalance.used_days}
                </p>
              </div>

              <div className="flex h-full flex-col justify-between rounded-xl border border-amber-500/30 bg-amber-50/60 p-3.5 dark:border-amber-400/20 dark:bg-amber-950/20">
                <p className="text-xs font-medium leading-snug text-amber-700 dark:text-amber-300">
                  Đang chờ duyệt
                </p>
                <p className="mt-2.5 font-mono text-2xl font-semibold leading-none tabular-nums text-amber-600 dark:text-amber-400">
                  {leaveBalance.pending_days}
                </p>
              </div>

              <div className="flex h-full flex-col justify-between rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-3.5 dark:border-emerald-400/20 dark:bg-emerald-950/20">
                <p className="text-xs font-medium leading-snug text-emerald-700 dark:text-emerald-300">
                  Còn lại khả dụng
                </p>
                <p className="mt-2.5 font-mono text-2xl font-semibold leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
                  {leaveBalance.remaining_days}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] px-3.5 py-2.5 text-xs text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
              Quỹ phép được đồng bộ tức thời: khi gửi đơn nghỉ phép năm sẽ tạm giữ ở mục{' '}
              <strong>Đang chờ duyệt</strong>, tự động trừ vào <strong>Đã nghỉ</strong> khi HR phê duyệt hoàn tất, và quy đổi thành tiền mặt nếu còn tồn khi quyết toán nghỉ việc.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Personal Payslip & Personal Profile */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Personal Payslip */}
        <Card className="dark:bg-[#121214] lg:col-span-7">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                    Phiếu lương cá nhân kỳ {payslip.period_month}
                  </CardTitle>
                  <Badge variant={PAYMENT_STATUS_BADGE[payslip.payment_status].variant}>
                    {isPreviewPayslip
                      ? 'Dự tính trực tiếp'
                      : PAYMENT_STATUS_BADGE[payslip.payment_status].label}
                  </Badge>
                  {payslip.is_final_settlement && (
                    <Badge variant="warning">
                      <FileCheck2 className="h-3 w-3" strokeWidth={1.5} />
                      Quyết toán nghỉ việc
                    </Badge>
                  )}
                  {payslip.mid_month_split && (
                    <Badge variant="teal">
                      <ArrowRightLeft className="h-3 w-3" strokeWidth={1.5} />
                      Tách lương giữa tháng
                    </Badge>
                  )}
                  {isProbationPayslip && (
                    <Badge variant="outline">HĐ Thử việc · 0% BHXH</Badge>
                  )}
                </div>

                <CardDescription className="mt-1">
                  Mã phiếu: <span className="font-mono tabular-nums">{payslip.payslip_code}</span> ·
                  Công hưởng lương:{' '}
                  <span className="font-mono tabular-nums">
                    {payslip.actual_paid_days}/{payslip.standard_days} ngày
                  </span>
                  {(payslip.overtime_hours ?? 0) > 0 ? (
                    <>
                      {' '}
                      · OT:{' '}
                      <span className="font-mono tabular-nums">{payslip.overtime_hours}h</span>
                    </>
                  ) : null}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {empPayrolls.length > 1 && (
                  <div className="w-48">
                    <Select
                      value={payslip.id}
                      onValueChange={(v) => setSelectedPayslipId(v)}
                      aria-label="Chọn phiếu lương cá nhân"
                      options={empPayrolls.map((p) => ({
                        value: p.id,
                        label: `${p.is_final_settlement ? 'Quyết toán' : 'Kỳ'} ${p.period_month} (${p.payslip_code})`,
                      }))}
                    />
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMaskSalary((prev) => !prev)}
                >
                  {maskSalary ? (
                    <>
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                      Hiện số tiền
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                      Che số tiền
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            {/* Net Salary Highlight */}
            <div className="flex flex-col justify-between gap-2 rounded-xl border border-[#6EE7B7] bg-[#D1FAE5]/60 p-4 dark:border-emerald-400/20 dark:bg-emerald-950/20 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#065F46] dark:text-emerald-300">
                  Thực lĩnh chuyển khoản (Net Salary)
                </p>
                <p className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                  {payslip.bank_name} · STK{' '}
                  <span className="font-mono tabular-nums">{payslip.bank_account_no}</span>
                  {payslip.paid_at ? (
                    <>
                      {' '}
                      · Thanh toán ngày{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateVN(payslip.paid_at)}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <p className="shrink-0 whitespace-nowrap text-right font-mono text-xl font-semibold tabular-nums text-[#0F766E] dark:text-emerald-400 xl:text-2xl">
                {formatVnd(payslip.net_salary_vnd, maskSalary)}
              </p>
            </div>

            {/* Mid-month Salary Split Details (if promoted / adjusted mid-month) */}
            {payslip.mid_month_split && (
              <div className="rounded-xl border border-[#C6D9D3] border-l-4 border-l-[#0F766E] bg-[#F2F7F5] p-3.5 text-xs dark:border-zinc-800 dark:border-l-teal-400 dark:bg-teal-950/20">
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[#0B4F4A] dark:text-teal-300">
                  <span className="flex items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                    Tách lương giữa tháng (Hiệu lực từ{' '}
                    <span className="font-mono tabular-nums">
                      {formatDateVN(payslip.mid_month_split.effective_date)}
                    </span>
                    )
                  </span>
                  {payslip.mid_month_split.decision_no && (
                    <Badge variant="outline" className="font-mono tabular-nums">
                      {payslip.mid_month_split.decision_no}
                    </Badge>
                  )}
                </div>

                <div className="mt-2.5 space-y-1.5 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-2.5 dark:border-zinc-800 dark:bg-[#121214]">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#415A54] dark:text-zinc-300">
                      Trước{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateVN(payslip.mid_month_split.effective_date)}
                      </span>
                      :{' '}
                      <strong className="font-mono tabular-nums">
                        {payslip.mid_month_split.days_at_old_salary} công
                      </strong>{' '}
                      × {formatVnd(payslip.mid_month_split.old_salary_vnd, maskSalary)}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.mid_month_split.old_prorated_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#415A54] dark:text-zinc-300">
                      Từ{' '}
                      <span className="font-mono tabular-nums">
                        {formatDateVN(payslip.mid_month_split.effective_date)}
                      </span>
                      :{' '}
                      <strong className="font-mono tabular-nums">
                        {payslip.mid_month_split.days_at_new_salary} công
                      </strong>{' '}
                      × {formatVnd(payslip.mid_month_split.new_salary_vnd, maskSalary)}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                      {formatVnd(payslip.mid_month_split.new_prorated_vnd, maskSalary)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Final Settlement Details (if offboarding final settlement) */}
            {payslip.is_final_settlement && (
              <div className="rounded-xl border border-amber-500/35 border-l-4 border-l-amber-500 bg-amber-50/60 p-3.5 text-xs dark:border-amber-400/25 dark:border-l-amber-400 dark:bg-amber-950/20">
                <div className="flex items-center justify-between gap-2 font-semibold text-amber-950 dark:text-amber-200">
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={1.5} />
                    Chi tiết Quyết toán nghỉ việc kỳ cuối
                  </span>
                  <Badge variant="warning">Quyết toán nghỉ việc</Badge>
                </div>

                <div className="mt-2.5 space-y-1.5 rounded-lg border border-amber-500/25 bg-[#FCFEFD] p-2.5 dark:border-zinc-800 dark:bg-[#121214]">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#415A54] dark:text-zinc-300">
                      + Thanh toán phép năm tồn (
                      <strong className="font-mono tabular-nums">
                        {payslip.unused_leave_days ?? 0} ngày
                      </strong>
                      )
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      +{formatVnd(payslip.unused_leave_payout_vnd ?? 0, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#415A54] dark:text-zinc-300">
                      − Đền bù tài sản / Phạt thanh lý
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                      -{formatVnd(payslip.penalty_deduction_vnd ?? 0, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#415A54] dark:text-zinc-300">
                      − Khấu trừ tạm ứng công nợ
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                      -{formatVnd(payslip.advance_deduction_vnd ?? 0, maskSalary)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Income & Deductions Grid */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4">
              {/* Income */}
              <div className="space-y-2.5 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3 dark:border-zinc-800/80 dark:bg-transparent xl:p-4">
                <p className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                  Các khoản thu nhập
                </p>
                <div className="space-y-2 text-xs xl:text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">
                      Lương cơ bản ({payslip.actual_paid_days}/{payslip.standard_days}c)
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.prorated_base_salary_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Phụ cấp ăn trưa</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.allowance_meal_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Phụ cấp đi lại</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.allowance_transport_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Phụ cấp chức vụ</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.allowance_position_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Lương tăng ca (OT)</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.overtime_pay_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Thưởng KPI</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.kpi_bonus_vnd, maskSalary)}
                    </span>
                  </div>
                  {(payslip.unused_leave_payout_vnd ?? 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 font-medium text-emerald-800 dark:text-emerald-300">
                        + Phép tồn ({payslip.unused_leave_days ?? 0} ngày)
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-right font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                        +{formatVnd(payslip.unused_leave_payout_vnd ?? 0, maskSalary)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 border-t border-[#C6D9D3] pt-2 font-semibold dark:border-zinc-800/80">
                    <span className="min-w-0 text-[#11221E] dark:text-zinc-100">Tổng thu nhập (Gross)</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      {formatVnd(payslip.gross_salary_vnd, maskSalary)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-2.5 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3 dark:border-zinc-800/80 dark:bg-transparent xl:p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                    Các khoản khấu trừ
                  </p>
                  {isProbationPayslip && (
                    <span className="text-[11px] font-medium text-[#0F766E] dark:text-teal-400">
                      Miễn 0% BHXH
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-xs xl:text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">BHXH (8.0%)</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      -{formatVnd(payslip.bhxh_employee_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">BHYT (1.5%)</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      -{formatVnd(payslip.bhyt_employee_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">BHTN (1.0%)</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      -{formatVnd(payslip.bhtn_employee_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">
                      Thuế TNCN ({getPitTaxConfigForPeriod(payslip.period_month).bracket_count} bậc)
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      -{formatVnd(payslip.pit_tax_vnd, maskSalary)}
                    </span>
                  </div>
                  {(payslip.advance_deduction_vnd ?? 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Khấu trừ tạm ứng</span>
                      <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                        -{formatVnd(payslip.advance_deduction_vnd ?? 0, maskSalary)}
                      </span>
                    </div>
                  )}
                  {(payslip.penalty_deduction_vnd ?? 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Phạt / Đền bù TS</span>
                      <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                        -{formatVnd(payslip.penalty_deduction_vnd ?? 0, maskSalary)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 border-t border-[#C6D9D3] pt-2 text-xs text-[#5C7871] dark:border-zinc-800/80 dark:text-zinc-400">
                    <span className="min-w-0">Giảm trừ bản thân + {payslip.dependents_count} NPT</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums">
                      {formatVnd(
                        payslip.personal_deduction_vnd + payslip.dependent_deduction_vnd,
                        maskSalary
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Progressive PIT Breakdown */}
            <div className="space-y-2.5 rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-3.5 dark:border-zinc-800/80 dark:bg-transparent">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  Diễn giải Thuế TNCN lũy tiến {getPitTaxConfigForPeriod(payslip.period_month).bracket_count} bậc
                </p>
                <span className="text-xs text-[#415A54] dark:text-zinc-400">
                  Thu nhập tính thuế:{' '}
                  <strong className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                    {formatVnd(payslip.taxable_income_vnd, maskSalary)}
                  </strong>
                </span>
              </div>

              {pitBreakdown.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[#C6D9D3] dark:border-zinc-800/80">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-[#F2F7F5] dark:bg-zinc-900">
                      <tr className="border-b border-[#C6D9D3] font-semibold text-[#415A54] dark:border-zinc-800 dark:text-zinc-400">
                        <th className="px-3 py-1.5">Bậc thuế</th>
                        <th className="px-3 py-1.5 text-right">Phần chịu thuế</th>
                        <th className="px-3 py-1.5 text-right">Thuế suất</th>
                        <th className="px-3 py-1.5 text-right">Tiền thuế</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/60">
                      {pitBreakdown.map((item) => (
                        <tr
                          key={item.level}
                          className="odd:bg-[#FCFEFD] even:bg-[#F5FAF8] dark:odd:bg-transparent dark:even:bg-transparent"
                        >
                          <td className="px-3 py-1.5 text-[#415A54] dark:text-zinc-300">
                            Bậc {item.level}: {item.label}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-200">
                            {formatVnd(item.taxableSliceVnd, maskSalary)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                            {item.ratePercent}%
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                            {formatVnd(item.taxVnd, maskSalary)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-[#D5E3DF] bg-[#F2F7F5] px-3 py-2 text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                  Thu nhập sau bảo hiểm và giảm trừ gia cảnh bằng 0 đ — Không phát sinh thuế TNCN.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Personal Profile */}
        <Card className="dark:bg-[#121214] lg:col-span-5">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
              Hồ sơ nhân viên cá nhân
            </CardTitle>
            <CardDescription>
              Thông tin định danh pháp lý, trạng thái hợp đồng và tài khoản nhận lương hiện hành.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-5 text-sm">
            <div className="flex items-start justify-between gap-2 border-b border-[#D5E3DF] pb-3 dark:border-zinc-800/70">
              <div>
                <p className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
                  {employee.full_name}
                </p>
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  {employee.position_name}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="teal" className="font-mono tabular-nums">
                  {employee.employee_code}
                </Badge>
                <Badge variant={empStatusCfg.variant}>{empStatusCfg.label}</Badge>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  Phòng ban
                </span>
                <span
                  className="min-w-0 truncate text-right font-semibold text-[#11221E] dark:text-zinc-100"
                  title={employee.department_name}
                >
                  {employee.department_name}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  Email công ty
                </span>
                <span
                  className="min-w-0 truncate text-right text-[#415A54] dark:text-zinc-200"
                  title={employee.email}
                >
                  {employee.email}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  Số điện thoại
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-200">
                  {employee.phone}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Quản lý trực tiếp
                </span>
                <span className="min-w-0 truncate text-right font-medium text-[#11221E] dark:text-zinc-200">
                  {employee.manager_name ?? 'Ban Điều hành'}
                </span>
              </div>

              {employee.mentor_name && (
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                    Mentor hướng dẫn
                  </span>
                  <span className="min-w-0 truncate text-right font-medium text-[#0F766E] dark:text-teal-400">
                    {employee.mentor_name}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  CCCD / Định danh
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-200">
                  {employee.national_id || '-'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Mã số thuế TNCN
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-200">
                  {employee.tax_code || '-'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Số sổ BHXH
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-200">
                  {employee.social_insurance_no || '-'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Người phụ thuộc giảm trừ
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-200">
                  {employee.dependents_count} người
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Ngày vào làm
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-200">
                  {formatDateVN(employee.join_date)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Leave / OT / Explanation Request Dialog */}
      <Dialog open={quickDialogOpen} onOpenChange={setQuickDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo nhanh đơn Nghỉ phép / Tăng ca / Giải trình công</DialogTitle>
            <DialogDescription>
              Đơn sẽ được chuyển tới {employee.manager_name ?? 'Cấp phê duyệt'} và đồng bộ trực tiếp vào bảng công &amp; quỹ phép năm.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleSubmitQuickRequest(e)} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Loại đơn yêu cầu
              </label>
              <Select
                value={reqType}
                onValueChange={(v) => setReqType(v as QuickRequestMode)}
                options={[
                  { label: 'Nghỉ phép năm (hưởng nguyên lương)', value: 'ANNUAL_LEAVE' },
                  { label: 'Đăng ký làm thêm giờ (OT)', value: 'OVERTIME' },
                  { label: 'Giải trình bổ sung quên chấm công', value: 'LATE_EXPLANATION' },
                ]}
              />
            </div>

            {reqType === 'LATE_EXPLANATION' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    Ngày cần giải trình
                  </label>
                  <Input
                    type="date"
                    value={reqDate}
                    onChange={(e) => setReqDate(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    Giờ vào thực tế
                  </label>
                  <Input
                    type="time"
                    value={expCheckIn}
                    onChange={(e) => setExpCheckIn(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    Giờ ra thực tế
                  </label>
                  <Input
                    type="time"
                    value={expCheckOut}
                    onChange={(e) => setExpCheckOut(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    Ngày áp dụng
                  </label>
                  <Input
                    type="date"
                    value={reqDate}
                    onChange={(e) => setReqDate(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                    {reqType === 'ANNUAL_LEAVE'
                      ? `Số ngày nghỉ (Còn ${leaveBalance.remaining_days} ngày)`
                      : 'Số giờ OT'}
                  </label>
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={reqDuration}
                    onChange={(e) => setReqDuration(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Lý do chi tiết
              </label>
              <Input
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Ví dụ: Giải quyết việc gia đình hoặc xác nhận giờ ra về sau ca trực..."
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setQuickDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit">Gửi đơn phê duyệt</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PayslipSelfView;
