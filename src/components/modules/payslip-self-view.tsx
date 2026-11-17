'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
import {
  fetchAttendanceMock,
  fetchEmployeesMock,
  fetchPayrollMock,
} from '@/lib/mock-fetcher';
import type {
  AnnualLeaveBalance,
  Employee,
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
  if (masked) return '••• ••• ••• đ';
  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
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
      'Check-in thành công',
      `Đã ghi nhận giờ vào ca ${employee.work_shift_code} lúc ${timeStr}.`,
      'success'
    );
  };

  const handleCheckOut = () => {
    if (!employee) return;
    const timeStr = formatTimeNow(new Date());
    setCheckOutTime(timeStr);
    showToast(
      'Check-out thành công',
      `Đã ghi nhận giờ ra ca ${employee.work_shift_code} lúc ${timeStr}.`,
      'success'
    );
  };

  const handleSubmitQuickRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqReason.trim()) {
      showToast('Thiếu lý do', 'Vui lòng nhập lý do gửi đơn.', 'warning');
      return;
    }
    const label = reqType === 'ANNUAL_LEAVE' ? 'Đơn xin nghỉ phép năm' : 'Đơn đăng ký tăng ca (OT)';
    const unit = reqType === 'ANNUAL_LEAVE' ? 'ngày' : 'giờ';
    showToast(
      `Đã gửi ${label}`,
      `Ngày ${reqDate} (${reqDuration} ${unit}) đã chuyển tới Quản lý trực tiếp để phê duyệt.`,
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
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Cổng tự phục vụ nhân viên (ESS)
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
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
        <Card className="lg:col-span-6">
          <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
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
            <div className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Đồng hồ thời gian thực
                </p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100">
                  {formatTimeNow(now)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleCheckIn} disabled={Boolean(checkInTime)}>
                  <LogIn className="h-4 w-4" strokeWidth={1.5} />
                  Check-in
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCheckOut}
                  disabled={!checkInTime || Boolean(checkOutTime)}
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.5} />
                  Check-out
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Giờ Check-in hôm nay</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {checkInTime ?? '--:--:--'}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-800/80">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Giờ Check-out hôm nay</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {checkOutTime ?? '--:--:--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Annual Leave Balance */}
        <Card className="lg:col-span-6">
          <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
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
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-blue-500/30 bg-blue-50/60 p-3.5 dark:border-blue-400/20 dark:bg-blue-950/20">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Tổng phép năm</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                  {totalAnnualLeave}
                </p>
              </div>
              <div className="rounded-xl border border-violet-500/30 bg-violet-50/60 p-3.5 dark:border-violet-400/20 dark:bg-violet-950/20">
                <p className="text-xs font-medium text-violet-700 dark:text-violet-300">Đã nghỉ</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                  {leaveBalance.used_days}
                </p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-50/60 p-3.5 dark:border-amber-400/20 dark:bg-amber-950/20">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Đang chờ duyệt</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {leaveBalance.pending_days}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-3.5 dark:border-emerald-400/20 dark:bg-emerald-950/20">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Còn lại</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
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
          <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
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
            <div className="flex flex-col justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-4 dark:border-emerald-400/20 dark:bg-emerald-950/20 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  Thực lĩnh chuyển khoản (Net Salary)
                </p>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {payslip.bank_name} · STK{' '}
                  <span className="font-mono tabular-nums">{payslip.bank_account_no}</span>
                </p>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatVnd(payslip.net_salary_vnd, maskSalary)}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Income */}
              <div className="space-y-2.5 rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Các khoản thu nhập
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Lương cơ bản</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatVnd(payslip.prorated_base_salary_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Phụ cấp ăn trưa</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatVnd(payslip.allowance_meal_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Phụ cấp đi lại</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatVnd(payslip.allowance_transport_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Phụ cấp chức vụ</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatVnd(payslip.allowance_position_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Lương tăng ca (OT)</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatVnd(payslip.overtime_pay_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Thưởng KPI</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatVnd(payslip.kpi_bonus_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-zinc-200/80 pt-2 font-medium dark:border-zinc-800/80">
                    <span className="text-zinc-900 dark:text-zinc-100">Tổng thu nhập (Gross)</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatVnd(payslip.gross_salary_vnd, maskSalary)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-2.5 rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Các khoản khấu trừ
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">BHXH (8.0%)</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      -{formatVnd(payslip.bhxh_employee_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">BHYT (1.5%)</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      -{formatVnd(payslip.bhyt_employee_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">BHTN (1.0%)</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      -{formatVnd(payslip.bhtn_employee_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-600 dark:text-zinc-400">Thuế TNCN</span>
                    <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                      -{formatVnd(payslip.pit_tax_vnd, maskSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-zinc-200/80 pt-2 text-xs text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
                    <span>Giảm trừ bản thân + {payslip.dependents_count} NPT</span>
                    <span className="font-mono tabular-nums">
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
          <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
              Hồ sơ nhân viên cá nhân
            </CardTitle>
            <CardDescription>
              Thông tin định danh, hợp đồng lao động và tài khoản nhận lương.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5 text-sm">
            <div className="flex items-center justify-between border-b border-zinc-200/70 pb-3 dark:border-zinc-800/70">
              <div>
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {employee.full_name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {employee.position_name}
                </p>
              </div>
              <Badge variant="teal" className="font-mono whitespace-nowrap">
                {employee.employee_code}
              </Badge>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Phòng ban</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {employee.department_name}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Email công ty
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{employee.email}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Số điện thoại
                </span>
                <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                  {employee.phone}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Quản lý trực tiếp</span>
                <span className="text-zinc-800 dark:text-zinc-200">
                  {employee.manager_name ?? 'Ban Điều hành'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Mã số thuế TNCN</span>
                <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                  {employee.tax_code}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Số sổ BHXH</span>
                <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                  {employee.social_insurance_no}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Ngày vào làm</span>
                <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
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
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
