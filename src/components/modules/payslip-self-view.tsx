'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  FilePlus2,
  LogIn,
  LogOut,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { useApp, type RoleCode } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import {
  fetchAttendanceMock,
  fetchEmployeesMock,
  fetchPayrollMock,
} from '@/lib/mock-fetcher';
import {
  mergeWithRuntimeRequests,
  pushNotification,
  saveRuntimeRequest,
} from '@/lib/runtime-store';
import type {
  AnnualLeaveBalance,
  ApprovalStep,
  Employee,
  LeaveOvertimeRequest,
  PayrollRecord,
} from '@/mock/types';
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

function formatVnd(amount: number, masked: boolean): string {
  if (masked) return '•••\u00A0•••\u00A0•••\u00A0đ';
  return `${new Intl.NumberFormat('vi-VN').format(amount)}\u00A0đ`;
}

function formatTimeNow(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

const ROLE_DEFAULT_EMPLOYEE_CODE: Record<RoleCode, string> = {
  SUPER_ADMIN: 'NV-2024-001',
  DIRECTOR: 'NV-2024-000',
  HR_MANAGER: 'NV-2024-002',
  DEPT_MANAGER: 'NV-2024-003',
  EMPLOYEE: 'NV-2024-004',
};

export function PayslipSelfView() {
  const { role, currentUserProfile, showToast } = useApp();

  const baseRequestsRef = useRef<LeaveOvertimeRequest[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<AnnualLeaveBalance | null>(null);
  const [payslip, setPayslip] = useState<PayrollRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const targetEmployeeCode =
    currentUserProfile?.employee_code ?? ROLE_DEFAULT_EMPLOYEE_CODE[role];

  const loadData = useCallback(
    async (bypassCache = false) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [empData, attData, payData] = await Promise.all([
          fetchEmployeesMock({ bypassCache }),
          fetchAttendanceMock({ bypassCache }),
          fetchPayrollMock({ bypassCache }),
        ]);
        baseRequestsRef.current = attData.MOCK_LEAVE_OVERTIME_REQUESTS ?? [];
        const foundEmp =
          empData.MOCK_EMPLOYEES.find((e) => e.employee_code === targetEmployeeCode) ??
          empData.MOCK_EMPLOYEES.find((e) => e.role_code === role) ??
          empData.MOCK_EMPLOYEES[0];
        const foundBalance =
          attData.MOCK_ANNUAL_LEAVE_BALANCES.find(
            (b) => b.employee_code === foundEmp.employee_code
          ) ??
          attData.MOCK_ANNUAL_LEAVE_BALANCES[0];
        const foundPayslip =
          payData.MOCK_PAYROLL_RECORDS.find(
            (p) => p.employee_code === foundEmp.employee_code
          ) ??
          payData.MOCK_PERSONAL_PAYSLIP;
        setEmployee(foundEmp);
        setLeaveBalance(foundBalance);
        setPayslip(foundPayslip);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Không thể tải dữ liệu cá nhân.');
      } finally {
        setIsLoading(false);
      }
    },
    [role, targetEmployeeCode]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const [now, setNow] = useState<Date>(() => new Date());
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [maskSalary, setMaskSalary] = useState<boolean>(false);

  const [quickDialogOpen, setQuickDialogOpen] = useState<boolean>(false);
  const [reqType, setReqType] = useState<'ANNUAL_LEAVE' | 'OVERTIME'>('ANNUAL_LEAVE');
  const [reqDate, setReqDate] = useState<string>('2026-11-25');
  const [reqDuration, setReqDuration] = useState<string>('1');
  const [reqReason, setReqReason] = useState<string>('');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleCheckIn = () => {
    if (!employee) return;
    const timeStr = formatTimeNow(new Date());
    setCheckInTime(timeStr);
    showToast(
      'Cập nhật thành công!',
      `Đã ghi nhận check-in giờ vào ca ${employee.work_shift_code} lúc ${timeStr}.`,
      'success'
    );
  };

  const handleCheckOut = () => {
    if (!employee) return;
    const timeStr = formatTimeNow(new Date());
    setCheckOutTime(timeStr);
    showToast(
      'Cập nhật thành công!',
      `Đã ghi nhận check-out giờ ra ca ${employee.work_shift_code} lúc ${timeStr}.`,
      'success'
    );
  };

  const handleSubmitQuickRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    const trimmedReason = reqReason.trim();
    if (!trimmedReason) {
      showToast('Vui lòng nhập đầy đủ thông tin!', 'Vui lòng nhập lý do gửi đơn.', 'warning');
      return;
    }

    const numericDuration = Math.max(0.5, Number(reqDuration) || 1);
    const isAnnualLeave = reqType === 'ANNUAL_LEAVE';
    const label = isAnnualLeave ? 'Đơn xin nghỉ phép năm' : 'Đơn đăng ký tăng ca (OT)';
    const categoryLabel = isAnnualLeave
      ? 'Nghỉ phép năm có hưởng lương'
      : 'Đăng ký tăng ca (OT)';
    const unit = isAnnualLeave ? 'ngày' : 'giờ';
    const durationUnit: 'NGAY' | 'GIO' = isAnnualLeave ? 'NGAY' : 'GIO';

    const allRequests = mergeWithRuntimeRequests(baseRequestsRef.current);
    const maxCodeNum = allRequests.reduce((max, r) => {
      const m = /^REQ-202611-(\d+)$/.exec(r.request_code);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 87);
    const nextRequestCode = `REQ-202611-${String(maxCodeNum + 1).padStart(3, '0')}`;

    const isDeptMgr = role === 'DEPT_MANAGER';
    const needsDirector = isAnnualLeave && numericDuration >= 3;
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
        label: 'Cấp 3 · Giám đốc phê duyệt (>= 3 ngày)',
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
      requester_role: role,
      request_category: reqType,
      category_label: categoryLabel,
      start_datetime: `${reqDate}T08:30:00+07:00`,
      end_datetime: `${computedEndDate}T17:30:00+07:00`,
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
    };

    saveRuntimeRequest(newReq);
    recordAuditLog({
      actor_name: employee.full_name,
      actor_code: employee.employee_code,
      actor_role: role,
      action: 'CREATE_REQUEST',
      module: 'Đơn từ & Phê duyệt',
      target: `${newReq.request_code} (${employee.full_name})`,
      detail: `Tạo nhanh đơn từ cổng ESS: ${categoryLabel} (${numericDuration} ${unit})`,
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
      'Tạo thành công!',
      `Đã gửi ${label} (${newReq.request_code}) tới Quản lý để phê duyệt.`,
      'success'
    );
    setReqReason('');
    setQuickDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Skeleton className="h-56 w-full rounded-xl lg:col-span-6" />
          <Skeleton className="h-56 w-full rounded-xl lg:col-span-6" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError || !employee || !leaveBalance || !payslip) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {loadError ?? 'Không có dữ liệu hồ sơ cá nhân.'}
          </p>
          <Button variant="outline" onClick={() => void loadData(true)}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalAnnualLeave = leaveBalance.total_entitled_days + leaveBalance.carried_over_days;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Cổng tự phục vụ nhân viên (ESS)
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Chấm công trực tuyến, tra cứu quỹ phép năm, hồ sơ cá nhân và phiếu lương chi tiết.
          </p>
        </div>
        <Button onClick={() => setQuickDialogOpen(true)} className="shrink-0">
          <FilePlus2 className="h-4 w-4" strokeWidth={1.5} />
          Tạo nhanh đơn Phép / OT
        </Button>
      </div>

      {/* Top Row: Check-in/out & Annual Leave Balance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Check-in / Check-out */}
        <Card className="flex flex-col lg:col-span-6">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  Chấm công trực tuyến
                </CardTitle>
                <CardDescription className="mt-1">
                  Ca làm việc áp dụng: <span className="font-mono font-medium">HC-08:00</span> /{' '}
                  <span className="font-mono font-medium">{employee.work_shift_code}</span>
                </CardDescription>
              </div>
              <Badge variant={checkInTime ? 'success' : 'secondary'}>
                {checkOutTime
                  ? 'Đã tan ca'
                  : checkInTime
                    ? 'Đang trong ca'
                    : 'Chưa check-in'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="flex flex-col gap-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-start xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="whitespace-nowrap text-xs font-medium text-[#5C7871] dark:text-zinc-400">
                  Đồng hồ thời gian thực
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#11221E] dark:text-zinc-100 xl:text-2xl 2xl:text-3xl">
                  {formatTimeNow(now)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={handleCheckIn}
                  disabled={Boolean(checkInTime)}
                >
                  <LogIn className="h-4 w-4" strokeWidth={1.5} />
                  Check-in
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleCheckOut}
                  disabled={!checkInTime || Boolean(checkOutTime)}
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                  Check-out
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 dark:border-zinc-800/80 dark:bg-transparent">
                <p className="text-xs text-[#5C7871] dark:text-zinc-400">Giờ Check-in hôm nay</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {checkInTime ?? '--:--:--'}
                </p>
              </div>
              <div className="rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 dark:border-zinc-800/80 dark:bg-transparent">
                <p className="text-xs text-[#5C7871] dark:text-zinc-400">Giờ Check-out hôm nay</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                  {checkOutTime ?? '--:--:--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Annual Leave Balance */}
        <Card className="flex flex-col lg:col-span-6">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  Quỹ phép năm {leaveBalance.year}
                </CardTitle>
                <CardDescription className="mt-1">
                  Bao gồm {leaveBalance.total_entitled_days} ngày tiêu chuẩn và{' '}
                  {leaveBalance.carried_over_days} ngày phép tồn chuyển sang.
                </CardDescription>
              </div>
              <Badge variant="teal" className="font-mono tabular-nums">
                Còn {leaveBalance.remaining_days} ngày
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center pt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex h-full flex-col justify-between rounded-xl border border-blue-500/30 bg-blue-50/60 p-3 dark:border-blue-400/20 dark:bg-blue-950/20">
                <p className="text-xs font-medium leading-snug text-blue-700 dark:text-blue-300">
                  Tổng phép năm
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none tabular-nums text-blue-600 dark:text-blue-400">
                  {totalAnnualLeave}
                </p>
              </div>
              <div className="flex h-full flex-col justify-between rounded-xl border border-violet-500/30 bg-violet-50/60 p-3 dark:border-violet-400/20 dark:bg-violet-950/20">
                <p className="text-xs font-medium leading-snug text-violet-700 dark:text-violet-300">
                  Đã nghỉ
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none tabular-nums text-violet-600 dark:text-violet-400">
                  {leaveBalance.used_days}
                </p>
              </div>
              <div className="flex h-full flex-col justify-between rounded-xl border border-amber-500/30 bg-amber-50/60 p-3 dark:border-amber-400/20 dark:bg-amber-950/20">
                <p className="text-xs font-medium leading-snug text-amber-700 dark:text-amber-300">
                  Đang chờ duyệt
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none tabular-nums text-amber-600 dark:text-amber-400">
                  {leaveBalance.pending_days}
                </p>
              </div>
              <div className="flex h-full flex-col justify-between rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-3 dark:border-emerald-400/20 dark:bg-emerald-950/20">
                <p className="text-xs font-medium leading-snug text-emerald-700 dark:text-emerald-300">
                  Còn lại
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
                  {leaveBalance.remaining_days}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Personal Payslip & Personal Profile */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Personal Payslip */}
        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                  Phiếu lương cá nhân kỳ {payslip.period_month}
                </CardTitle>
                <CardDescription className="mt-1">
                  Mã phiếu: <span className="font-mono">{payslip.payslip_code}</span> · Công thực tế:{' '}
                  <span className="font-mono tabular-nums">
                    {payslip.actual_paid_days}/{payslip.standard_days} ngày
                  </span>
                </CardDescription>
              </div>
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
                </p>
              </div>
              <p className="shrink-0 whitespace-nowrap text-right font-mono text-xl font-semibold tabular-nums text-[#0F766E] dark:text-emerald-400 xl:text-2xl">
                {formatVnd(payslip.net_salary_vnd, maskSalary)}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4">
              {/* Income */}
              <div className="space-y-2.5 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-3 dark:border-zinc-800/80 dark:bg-transparent xl:p-4">
                <p className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                  Các khoản thu nhập
                </p>
                <div className="space-y-2 text-xs xl:text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Lương cơ bản</span>
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
                <p className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                  Các khoản khấu trừ
                </p>
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
                    <span className="min-w-0 text-[#415A54] dark:text-zinc-400">Thuế TNCN</span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                      -{formatVnd(payslip.pit_tax_vnd, maskSalary)}
                    </span>
                  </div>
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
          </CardContent>
        </Card>

        {/* Personal Profile */}
        <Card className="lg:col-span-5">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
              Hồ sơ nhân viên cá nhân
            </CardTitle>
            <CardDescription>
              Thông tin định danh, hợp đồng lao động và tài khoản nhận lương.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5 text-sm">
            <div className="flex items-center justify-between border-b border-[#D5E3DF] pb-3 dark:border-zinc-800/70">
              <div>
                <p className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
                  {employee.full_name}
                </p>
                <p className="text-xs text-[#415A54] dark:text-zinc-400">
                  {employee.position_name}
                </p>
              </div>
              <Badge variant="teal" className="font-mono whitespace-nowrap">
                {employee.employee_code}
              </Badge>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
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
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Mã số thuế TNCN
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-200">
                  {employee.tax_code}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Số sổ BHXH
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-200">
                  {employee.social_insurance_no}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 whitespace-nowrap text-xs text-[#5C7871] dark:text-zinc-400">
                  Ngày vào làm
                </span>
                <span className="min-w-0 truncate text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-200">
                  {employee.join_date}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Leave / OT Request Dialog */}
      <Dialog open={quickDialogOpen} onOpenChange={setQuickDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo nhanh đơn xin Nghỉ phép / Tăng ca</DialogTitle>
            <DialogDescription>
              Đơn sẽ được gửi trực tiếp tới {employee.manager_name ?? 'Quản lý trực tiếp'} để phê duyệt.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitQuickRequest} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Loại đơn
              </label>
              <Select
                value={reqType}
                onValueChange={(v) => setReqType(v as 'ANNUAL_LEAVE' | 'OVERTIME')}
                options={[
                  { label: 'Nghỉ phép năm (hưởng nguyên lương)', value: 'ANNUAL_LEAVE' },
                  { label: 'Đăng ký làm thêm giờ (OT)', value: 'OVERTIME' },
                ]}
              />
            </div>
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
                  {reqType === 'ANNUAL_LEAVE' ? 'Số ngày nghỉ' : 'Số giờ OT'}
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Lý do chi tiết
              </label>
              <Input
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Ví dụ: Giải quyết việc gia đình hoặc hỗ trợ triển khai bản vá..."
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
