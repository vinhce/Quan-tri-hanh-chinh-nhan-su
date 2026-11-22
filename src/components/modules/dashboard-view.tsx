'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  Send,
  ShieldAlert,
  TrendingUp,
  UserMinus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ROLE_DEFAULT_PROFILES, useApp } from '@/context/app-context';
import {
  fetchAtsMock,
  fetchAttendanceMock,
  fetchEmployeesMock,
  fetchPayrollMock,
  HeadcountTrendItem,
} from '@/lib/mock-fetcher';
import {
  HRM_RUNTIME_EVENT,
  getContracts,
  getExpiringProbationContracts,
  getLeaveBalances,
  getPayrollRecords,
  getResignations,
  mergeWithRuntimeCandidates,
  mergeWithRuntimeEmployees,
  mergeWithRuntimeRequests,
} from '@/lib/runtime-store';
import { cn, formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import type {
  AnnualLeaveBalance,
  BurnoutTurnoverAlert,
  Candidate,
  Employee,
  EmployeeKpiRecord,
  EmploymentContract,
  LeaveOvertimeRequest,
  PayrollRecord,
  ResignationRequest,
  RiskLevel,
} from '@/mock/types';
import { Badge, BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const RISK_BADGE_MAP: Record<RiskLevel, { label: string; variant: BadgeVariant }> = {
  CRITICAL: { label: 'Rất cao', variant: 'danger' },
  HIGH: { label: 'Cao', variant: 'warning' },
  MEDIUM: { label: 'Trung bình', variant: 'info' },
  LOW: { label: 'Thấp', variant: 'success' },
};

const ROLE_SUBTITLE: Record<string, string> = {
  SUPER_ADMIN: 'Toàn cảnh vận hành nhân sự, quỹ lương và chỉ số rủi ro toàn hệ thống',
  DIRECTOR: 'Tổng quan điều hành doanh nghiệp, quy mô nhân sự, quỹ lương và cảnh báo rủi ro',
  HR_MANAGER: 'Theo dõi biến động nhân sự, phê duyệt đơn từ, quỹ lương và cảnh báo AI',
  DEPT_MANAGER: 'Quản lý quân số, tiến độ tuyển dụng và sức khỏe đội ngũ Phòng Kỹ thuật Phần mềm',
  EMPLOYEE: 'Tổng quan ngày công, phép năm còn lại và kết quả KPI cá nhân kỳ hiện tại',
};

export function DashboardView() {
  const {
    role,
    theme,
    setActiveNav,
    showToast,
    currentUserEmail,
    currentUserProfile,
  } = useApp();
  const [isLoading, setIsLoading] = useState(true);
  const [baseEmployees, setBaseEmployees] = useState<Employee[]>([]);
  const [baseContracts, setBaseContracts] = useState<EmploymentContract[]>([]);
  const [baseRequests, setBaseRequests] = useState<LeaveOvertimeRequest[]>([]);
  const [basePayrolls, setBasePayrolls] = useState<PayrollRecord[]>([]);
  const [baseCandidates, setBaseCandidates] = useState<Candidate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contracts, setContracts] = useState<EmploymentContract[]>([]);
  const [burnoutAlerts, setBurnoutAlerts] = useState<BurnoutTurnoverAlert[]>([]);
  const [kpiRecords, setKpiRecords] = useState<EmployeeKpiRecord[]>([]);
  const [headcountTrend, setHeadcountTrend] = useState<HeadcountTrendItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveOvertimeRequest[]>([]);
  const [annualLeaveBalances, setAnnualLeaveBalances] = useState<AnnualLeaveBalance[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [resignations, setResignations] = useState<ResignationRequest[]>([]);
  const [expiringProbationCount, setExpiringProbationCount] = useState<number>(0);
  const [sentAlertIds, setSentAlertIds] = useState<Record<string, boolean>>({});
  const [selectedAlert, setSelectedAlert] = useState<BurnoutTurnoverAlert | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchEmployeesMock(),
      fetchAttendanceMock(),
      fetchPayrollMock(),
      fetchAtsMock(),
    ])
      .then(([empData, attData, payData, atsData]) => {
        if (!active) return;
        setBaseEmployees(empData.MOCK_EMPLOYEES);
        setBaseContracts(empData.MOCK_CONTRACTS);
        setBaseRequests(attData.MOCK_LEAVE_OVERTIME_REQUESTS);
        setBasePayrolls(payData.MOCK_PAYROLL_RECORDS);
        setBaseCandidates(atsData.MOCK_CANDIDATES);

        setEmployees(mergeWithRuntimeEmployees(empData.MOCK_EMPLOYEES));
        setContracts(getContracts(empData.MOCK_CONTRACTS));
        setBurnoutAlerts(empData.MOCK_BURNOUT_ALERTS);
        setKpiRecords(empData.MOCK_KPI_RECORDS);
        setHeadcountTrend(empData.MOCK_HEADCOUNT_TREND);
        setLeaveRequests(
          mergeWithRuntimeRequests(attData.MOCK_LEAVE_OVERTIME_REQUESTS)
        );
        const rtBalances = getLeaveBalances(2026);
        setAnnualLeaveBalances(
          rtBalances.length > 0 ? rtBalances : attData.MOCK_ANNUAL_LEAVE_BALANCES
        );
        const rtPayrolls = getPayrollRecords('2026-11');
        setPayrollRecords(
          rtPayrolls.length > 0 ? rtPayrolls : payData.MOCK_PAYROLL_RECORDS
        );
        setCandidates(mergeWithRuntimeCandidates(atsData.MOCK_CANDIDATES));
        setResignations(getResignations());
        setExpiringProbationCount(getExpiringProbationContracts(30).length);
      })
      .catch(() => {
        if (!active) return;
        showToast('Không thể tải dữ liệu Dashboard', 'Vui lòng thử làm mới lại trang.', 'error');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    if (baseEmployees.length === 0) return;
    const syncDashboardRuntime = () => {
      setEmployees(mergeWithRuntimeEmployees(baseEmployees));
      setContracts(getContracts(baseContracts));
      setLeaveRequests(mergeWithRuntimeRequests(baseRequests));
      const rtBalances = getLeaveBalances(2026);
      if (rtBalances.length > 0) setAnnualLeaveBalances(rtBalances);
      const rtPayrolls = getPayrollRecords('2026-11');
      setPayrollRecords(rtPayrolls.length > 0 ? rtPayrolls : basePayrolls);
      setCandidates(mergeWithRuntimeCandidates(baseCandidates));
      setResignations(getResignations());
      setExpiringProbationCount(getExpiringProbationContracts(30).length);
    };
    window.addEventListener(HRM_RUNTIME_EVENT, syncDashboardRuntime);
    window.addEventListener('storage', syncDashboardRuntime);
    return () => {
      window.removeEventListener(HRM_RUNTIME_EVENT, syncDashboardRuntime);
      window.removeEventListener('storage', syncDashboardRuntime);
    };
  }, [
    baseEmployees,
    baseContracts,
    baseRequests,
    basePayrolls,
    baseCandidates,
  ]);

  const totalEmployees = employees.length;
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.employment_status !== 'RESIGNED').length,
    [employees]
  );
  const probationEmployeesCount = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.employment_status === 'PROBATION' ||
          e.employment_status === 'PENDING_ONBOARD'
      ).length,
    [employees]
  );
  const noticePeriodEmployeesCount = useMemo(
    () => employees.filter((e) => e.employment_status === 'NOTICE_PERIOD').length,
    [employees]
  );
  const resignedEmployeesCount = useMemo(
    () => employees.filter((e) => e.employment_status === 'RESIGNED').length,
    [employees]
  );
  const activeOffboardingsCount = useMemo(
    () =>
      resignations.filter(
        (r) =>
          r.status !== 'COMPLETED' &&
          r.status !== 'REJECTED' &&
          r.status !== 'CANCELLED'
      ).length,
    [resignations]
  );
  const pendingRequests = useMemo(
    () =>
      leaveRequests.filter((r) => {
        const st = r.status ?? r.approval_status;
        return st === 'PENDING' || st === 'IN_PROGRESS';
      }),
    [leaveRequests]
  );
  const totalGrossPayroll = useMemo(
    () => payrollRecords.reduce((acc, rec) => acc + rec.gross_salary_vnd, 0),
    [payrollRecords]
  );
  const expiringContractsCount = useMemo(
    () =>
      contracts.filter(
        (c) =>
          c.status === 'EXPIRING_SOON' ||
          (c.days_until_expiry !== null && c.days_until_expiry <= 30)
      ).length,
    [contracts]
  );

  const deptEmployees = useMemo(
    () => employees.filter((e) => e.department_id === 'dept-tech-swe'),
    [employees]
  );
  const deptPendingRequests = useMemo(
    () =>
      leaveRequests.filter(
        (r) =>
          r.approval_status === 'PENDING' &&
          r.department_name === 'Phòng Kỹ thuật Phần mềm'
      ),
    [leaveRequests]
  );
  const deptAlerts = useMemo(
    () =>
      burnoutAlerts.filter(
        (a) => a.department_name === 'Phòng Kỹ thuật Phần mềm'
      ),
    [burnoutAlerts]
  );

  const visibleAlerts = useMemo(() => {
    if (role === 'DEPT_MANAGER') return deptAlerts;
    if (role === 'EMPLOYEE') return [];
    return burnoutAlerts;
  }, [role, deptAlerts, burnoutAlerts]);

  const currentEmployeeCode =
    currentUserProfile?.employee_code ||
    ROLE_DEFAULT_PROFILES[role]?.employee_code ||
    'NV-2024-004';
  const personalLeave =
    annualLeaveBalances.find((b) => b.employee_code === currentEmployeeCode) ??
    annualLeaveBalances[0];
  const personalKpi =
    kpiRecords.find((k) => k.employee_code === currentEmployeeCode) ??
    kpiRecords[0];

  const handleSendToHr = (alert: BurnoutTurnoverAlert) => {
    if (sentAlertIds[alert.id]) return;
    setSentAlertIds((prev) => ({ ...prev, [alert.id]: true }));
    showToast(
      'Đã gửi yêu cầu hỗ trợ tới bộ phận HR',
      `Nhân sự ${alert.full_name} (${alert.employee_code}) đã được đưa vào danh sách trao đổi 1-on-1.`,
      'success'
    );
  };

  const chartStrokeColor = theme === 'dark' ? '#27272a' : '#D5E3DF';
  const chartTickColor = theme === 'dark' ? '#a1a1aa' : '#415A54';
  const barPrimaryColor = theme === 'dark' ? '#2dd4bf' : '#0F766E';
  const barSecondaryColor = theme === 'dark' ? '#52525b' : '#B5CEC7';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((idx) => (
            <Skeleton key={idx} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Dashboard tổng quan
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            {ROLE_SUBTITLE[role] ?? ROLE_SUBTITLE.HR_MANAGER}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role !== 'EMPLOYEE' ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setActiveNav('leaves')}>
                <ClipboardCheck className="h-4 w-4" strokeWidth={1.5} />
                Duyệt đơn từ ({pendingRequests.length})
              </Button>
              <Button variant="primary" size="sm" onClick={() => setActiveNav('ats')}>
                <Briefcase className="h-4 w-4" strokeWidth={1.5} />
                Tuyển dụng ATS
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setActiveNav('leaves')}>
                <CalendarClock className="h-4 w-4" strokeWidth={1.5} />
                Tạo đơn nghỉ phép
              </Button>
              <Button variant="primary" size="sm" onClick={() => setActiveNav('payslip')}>
                <Wallet className="h-4 w-4" strokeWidth={1.5} />
                Xem phiếu lương
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {(role === 'HR_MANAGER' || role === 'SUPER_ADMIN' || role === 'DIRECTOR') && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card
            onClick={() => setActiveNav('employees')}
            className="cursor-pointer border-l-4 border-l-emerald-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-emerald-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Nhân sự đang làm việc
                </span>
                <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {activeEmployees}/{totalEmployees}
                </span>
                <span className="font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                  {probationEmployeesCount} thử việc
                </span>
              </div>
              <p className="mt-1 font-mono text-xs tabular-nums text-[#5C7871] dark:text-zinc-400">
                Báo trước nghỉ: {noticePeriodEmployeesCount} · Đã nghỉ: {resignedEmployeesCount}
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('leaves')}
            className="cursor-pointer border-l-4 border-l-amber-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-amber-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Đơn từ chờ phê duyệt
                </span>
                <ClipboardCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {pendingRequests.length}
                </span>
                <span className="text-xs text-[#5C7871] dark:text-zinc-400">
                  / {leaveRequests.length} tổng đơn
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Nghỉ phép năm, tăng ca OT và làm từ xa
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('payroll')}
            className="cursor-pointer border-l-4 border-l-blue-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-blue-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Quỹ lương Gross (11/2026)
                </span>
                <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                  {formatVND(totalGrossPayroll)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Trên {payrollRecords.length} bảng lương mẫu kỳ hiện tại
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('contracts')}
            className="cursor-pointer border-l-4 border-l-rose-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-rose-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Cảnh báo AI & Hợp đồng
                </span>
                <FileWarning className="h-4 w-4 text-rose-600 dark:text-rose-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {burnoutAlerts.length}
                </span>
                <span className="font-mono text-xs tabular-nums text-rose-700 dark:text-rose-400">
                  {expiringContractsCount} HĐ sắp hết hạn
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Cần rà soát gia hạn trong 30 ngày tới
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {role === 'DEPT_MANAGER' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card
            onClick={() => setActiveNav('employees')}
            className="cursor-pointer border-l-4 border-l-emerald-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-emerald-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Nhân sự phòng Kỹ thuật PM
                </span>
                <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {deptEmployees.length}
                </span>
                <span className="text-xs text-[#5C7871] dark:text-zinc-400">hồ sơ trọng tâm</span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Định biên toàn phòng: 28 kỹ sư
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('leaves')}
            className="cursor-pointer border-l-4 border-l-amber-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-amber-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Đơn chờ duyệt của team
                </span>
                <ClipboardCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {deptPendingRequests.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Yêu cầu nghỉ phép và OT cần xác nhận
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('ats')}
            className="cursor-pointer border-l-4 border-l-blue-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-blue-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Ứng viên đang theo dõi
                </span>
                <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                  {candidates.filter((c) => c.stage === 'INTERVIEW').length}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Hồ sơ đang ở vòng phỏng vấn chuyên môn
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('performance')}
            className="cursor-pointer border-l-4 border-l-rose-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-rose-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Cảnh báo quá tải trong team
                </span>
                <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {deptAlerts.length}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Phát hiện tăng ca vượt ngưỡng an toàn
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {role === 'EMPLOYEE' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card
            onClick={() => setActiveNav('payslip')}
            className="cursor-pointer border-l-4 border-l-emerald-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-emerald-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Ngày công tháng 11/2026
                </span>
                <CalendarClock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  21/22
                </span>
                <span className="text-xs text-[#5C7871] dark:text-zinc-400">công chuẩn</span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Ca làm việc: HC-08:30 (08:30 - 17:30)
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('payslip')}
            className="cursor-pointer border-l-4 border-l-blue-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-blue-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Phép năm còn lại
                </span>
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                  {personalLeave?.remaining_days ?? 8}
                </span>
                <span className="text-xs text-[#5C7871] dark:text-zinc-400">ngày phép</span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Đã dùng {personalLeave?.used_days ?? 4} / {personalLeave?.total_entitled_days ?? 12} ngày năm 2026
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('performance')}
            className="cursor-pointer border-l-4 border-l-violet-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-violet-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Điểm KPI kỳ 2026-Q3
                </span>
                <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-violet-700 dark:text-violet-400">
                  {personalKpi?.kpi_score ?? 91}
                </span>
                <Badge variant="teal">Xếp loại {personalKpi?.grade ?? 'A'}</Badge>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Hoàn thành OKR: {personalKpi?.okr_completion_percent ?? 94}%
              </p>
            </CardContent>
          </Card>

          <Card
            onClick={() => setActiveNav('leaves')}
            className="cursor-pointer border-l-4 border-l-amber-500 transition-colors hover:bg-[#E8F3EF] dark:border-l-amber-400 dark:hover:bg-zinc-900/50"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Đơn từ đã gửi
                </span>
                <ClipboardCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
              </div>
              <div className="mt-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {leaveRequests.slice(0, 2).length}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Theo dõi trạng thái duyệt theo thời gian thực
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart + Quick Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Biến động nhân sự 6 tháng gần nhất</CardTitle>
              <CardDescription>
                Quy mô nhân sự toàn công ty từ 06/2026 đến 11/2026 (đơn vị: người)
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#415A54] dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#0F766E] dark:bg-teal-400" />
                Tổng nhân sự
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#B5CEC7] dark:bg-zinc-600" />
                Tuyển mới
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={headcountTrend}
                  margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                  barGap={4}
                >
                  <CartesianGrid
                    stroke={chartStrokeColor}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: chartTickColor, fontSize: 11, fontFamily: 'monospace' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: chartTickColor, fontSize: 11, fontFamily: 'monospace' }}
                  />
                  <Tooltip
                    cursor={{ fill: theme === 'dark' ? 'rgba(39,39,42,0.5)' : 'rgba(232,243,239,0.75)' }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const row = payload[0].payload as HeadcountTrendItem;
                      return (
                        <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900">
                          <p className="font-mono font-semibold text-[#11221E] dark:text-zinc-100">
                            Tháng {label}
                          </p>
                          <div className="mt-1.5 space-y-1">
                            <p className="flex items-center justify-between gap-4 text-[#415A54] dark:text-zinc-400">
                              <span>Tổng nhân sự:</span>
                              <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                                {formatNumberVN(row.total_headcount)}
                              </span>
                            </p>
                            <p className="flex items-center justify-between gap-4 text-[#415A54] dark:text-zinc-400">
                              <span>Tuyển mới:</span>
                              <span className="font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                                +{row.new_hires}
                              </span>
                            </p>
                            <p className="flex items-center justify-between gap-4 text-[#415A54] dark:text-zinc-400">
                              <span>Nghỉ việc:</span>
                              <span className="font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                                -{row.resigned}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="total_headcount"
                    name="Tổng nhân sự"
                    fill={barPrimaryColor}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="new_hires"
                    name="Tuyển mới"
                    fill={barSecondaryColor}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Tác vụ ưu tiên</CardTitle>
              <BarChart3 className="h-4 w-4 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
            </div>
            <CardDescription>Các đầu việc cần xử lý trong tuần này</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              onClick={() => setActiveNav('leaves')}
              className="cursor-pointer rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:bg-transparent dark:hover:border-teal-400/50 dark:hover:bg-zinc-900/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                  Đơn nghỉ phép & OT chờ duyệt
                </span>
                <Badge variant="warning" className="font-mono tabular-nums">
                  {pendingRequests.length}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                Ưu tiên phản hồi các đơn đăng ký trong 24 giờ.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] dark:text-teal-400">
                Mở danh sách đơn từ
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            </div>

            {role !== 'EMPLOYEE' && (
              <>
                <div
                  onClick={() => setActiveNav('onboarding')}
                  className="cursor-pointer rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:bg-transparent dark:hover:border-teal-400/50 dark:hover:bg-zinc-900/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      Thử việc sắp đến hạn đánh giá (&lt;= 30 ngày)
                    </span>
                    <Badge variant="warning" className="font-mono tabular-nums">
                      {expiringProbationCount}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                    Đánh giá kết quả 60 ngày & chuyển ký HĐ chính thức 100% lương.
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] dark:text-teal-400">
                    Mở phân hệ Onboarding
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </span>
                </div>

                <div
                  onClick={() => setActiveNav('offboarding')}
                  className="cursor-pointer rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:bg-transparent dark:hover:border-teal-400/50 dark:hover:bg-zinc-900/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                      <UserMinus className="h-3.5 w-3.5 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                      Đơn thôi việc & Bàn giao Offboarding
                    </span>
                    <Badge variant="danger" className="font-mono tabular-nums">
                      {activeOffboardingsCount}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                    Đối soát hạn báo trước, bàn giao 3 bên, thu hồi tài sản & quyết toán.
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] dark:text-teal-400">
                    Mở Nghỉ việc & Tất toán
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </span>
                </div>
              </>
            )}

            <div
              onClick={() => setActiveNav('ats')}
              className="cursor-pointer rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 transition-colors hover:border-[#0F766E] hover:bg-[#E8F3EF] dark:border-zinc-800/80 dark:bg-transparent dark:hover:border-teal-400/50 dark:hover:bg-zinc-900/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#11221E] dark:text-zinc-100">
                  Ứng viên đang chờ phỏng vấn
                </span>
                <Badge variant="teal" className="font-mono tabular-nums">
                  {candidates.filter((c) => c.stage === 'INTERVIEW').length}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[#415A54] dark:text-zinc-400">
                Đã có báo cáo AI Match Score & bộ câu hỏi gợi ý.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] dark:text-teal-400">
                Xem bảng Kanban ATS
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Burnout / Turnover Alerts Table */}
      {visibleAlerts.length > 0 && (
        <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
                Cảnh báo AI Burnout / Turnover
              </CardTitle>
              <CardDescription>
                Phân tích tự động dựa trên giờ tăng ca, tần suất đi muộn, biến động KPI và chu kỳ thăng tiến
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit font-mono tabular-nums">
              {visibleAlerts.length} cảnh báo đang mở
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-y border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                    <th className="px-5 py-3">Mã NV</th>
                    <th className="px-4 py-3">Nhân sự</th>
                    <th className="px-4 py-3">Mức rủi ro</th>
                    <th className="px-4 py-3">Điểm rủi ro</th>
                    <th className="px-4 py-3">Phân tích chính từ AI</th>
                    <th className="px-5 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/80">
                  {visibleAlerts.map((alert) => {
                    const riskBadge = RISK_BADGE_MAP[alert.risk_level];
                    const isSent = Boolean(sentAlertIds[alert.id]);
                    const rowAccent =
                      alert.risk_level === 'CRITICAL'
                        ? 'border-l-4 border-l-rose-500 dark:border-l-rose-400'
                        : alert.risk_level === 'HIGH'
                        ? 'border-l-4 border-l-amber-500 dark:border-l-amber-400'
                        : alert.risk_level === 'MEDIUM'
                        ? 'border-l-4 border-l-blue-500 dark:border-l-blue-400'
                        : 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400';
                    return (
                      <tr
                        key={alert.id}
                        className={cn(
                          'transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40',
                          rowAccent
                        )}
                      >
                        <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-400">
                          {alert.employee_code}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                            {alert.full_name}
                          </div>
                          <div className="text-xs text-[#415A54] dark:text-zinc-400">
                            {alert.department_name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <Badge variant={riskBadge.variant}>{riskBadge.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums">
                          <div className="text-[#11221E] dark:text-zinc-100">
                            Burnout: <span className="font-semibold">{alert.burnout_risk_score}</span>/100
                          </div>
                          <div className="text-[#5C7871] dark:text-zinc-400">
                            Nghỉ việc: {alert.turnover_risk_score}/100
                          </div>
                        </td>
                        <td className="max-w-md px-4 py-3.5">
                          <p className="line-clamp-2 text-xs leading-5 text-[#11221E] dark:text-zinc-300">
                            {alert.key_factors[0]}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                            OT 30 ngày: {alert.overtime_hours_last_30d}h · Đi muộn: {alert.late_count_last_30d} lần
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedAlert(alert)}
                            >
                              Xem đề xuất
                            </Button>
                            <Button
                              variant={isSent ? 'secondary' : 'primary'}
                              size="sm"
                              disabled={isSent}
                              onClick={() => handleSendToHr(alert)}
                            >
                              <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                              {isSent ? 'Đã gửi HR' : 'Gửi HR hỗ trợ'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alert Recommendation Dialog */}
      <Dialog
        open={Boolean(selectedAlert)}
        onOpenChange={(open) => {
          if (!open) setSelectedAlert(null);
        }}
      >
        <DialogContent className="max-w-xl">
          {selectedAlert && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Chi tiết cảnh báo rủi ro — {selectedAlert.full_name}
                </DialogTitle>
                <DialogDescription>
                  <span className="font-mono">{selectedAlert.employee_code}</span> ·{' '}
                  {selectedAlert.position_name} ({selectedAlert.department_name})
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 dark:border-zinc-800/80 dark:bg-transparent">
                    <div className="text-xs text-[#5C7871] dark:text-zinc-400">Điểm Burnout</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {selectedAlert.burnout_risk_score}/100
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 dark:border-zinc-800/80 dark:bg-transparent">
                    <div className="text-xs text-[#5C7871] dark:text-zinc-400">Nguy cơ nghỉ việc</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {selectedAlert.turnover_risk_score}/100
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#C6D9D3] bg-[#F2F7F5]/70 p-3 dark:border-zinc-800/80 dark:bg-transparent">
                    <div className="text-xs text-[#5C7871] dark:text-zinc-400">Giờ OT (30 ngày)</div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                      {selectedAlert.overtime_hours_last_30d} giờ
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#415A54] dark:text-zinc-400">
                    Các dấu hiệu AI ghi nhận
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-sm text-[#11221E] dark:text-zinc-300">
                    {selectedAlert.key_factors.map((factor, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0F766E] dark:bg-teal-400" />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-[#0F766E]/25 bg-[#CBE8E2]/45 p-3.5 dark:border-teal-400/20 dark:bg-teal-950/30">
                  <div className="text-xs font-semibold text-[#0B4F4A] dark:text-teal-300">
                    Hành động khuyến nghị
                  </div>
                  <p className="mt-1 text-sm leading-5 text-[#11221E] dark:text-zinc-200">
                    {selectedAlert.recommended_action}
                  </p>
                  <p className="mt-2 font-mono text-[11px] tabular-nums text-[#5C7871] dark:text-zinc-400">
                    Phát hiện lúc: {formatDateVN(selectedAlert.detected_at)}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedAlert(null)}>
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  disabled={Boolean(sentAlertIds[selectedAlert.id])}
                  onClick={() => {
                    handleSendToHr(selectedAlert);
                    setSelectedAlert(null);
                  }}
                >
                  <Send className="h-4 w-4" strokeWidth={1.5} />
                  {sentAlertIds[selectedAlert.id] ? 'Đã gửi HR hỗ trợ' : 'Gửi HR hỗ trợ'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
