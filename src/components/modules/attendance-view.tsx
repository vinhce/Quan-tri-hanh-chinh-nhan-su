'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  Clock,
  Download,
  Lock,
  Pencil,
  Search,
  Timer,
  Trash2,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchAttendanceMock } from '@/lib/mock-fetcher';
import { formatNumberVN } from '@/lib/utils';
import type { MonthlyAttendanceSummary, WorkShift } from '@/mock/types';

function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const ATTENDANCE_STATUS_CONFIG: Record<
  MonthlyAttendanceSummary['attendance_status'],
  { label: string; variant: 'success' | 'warning' | 'teal' }
> = {
  VERIFIED: { label: 'Đã xác nhận', variant: 'success' },
  NEEDS_REVIEW: { label: 'Cần rà soát', variant: 'warning' },
  LOCKED: { label: 'Đã chốt công', variant: 'teal' },
};

const TECH_DIVISION_DEPARTMENTS = new Set([
  'Khối Công nghệ',
  'Phòng Kỹ thuật Phần mềm',
  'Phòng Dữ liệu & AI',
]);

export function AttendanceView() {
  const { role, currentUserProfile, uiState, setUiState, showToast } = useApp();
  const currentEmployeeCode = 'NV-2024-004';
  const currentEmployeeName = currentUserProfile?.fullName ?? 'Phạm Minh Tuấn';
  const [records, setRecords] = useState<MonthlyAttendanceSummary[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [isMonthLocked, setIsMonthLocked] = useState(false);
  const canEditAttendance = role === 'SUPER_ADMIN' || role === 'HR_MANAGER';

  const [editingRecord, setEditingRecord] = useState<MonthlyAttendanceSummary | null>(null);
  const [editShiftCode, setEditShiftCode] = useState('HC-08:00');
  const [editActualDays, setEditActualDays] = useState('22');
  const [editLateCount, setEditLateCount] = useState('0');
  const [editOtHours, setEditOtHours] = useState('0');
  const [editStatus, setEditStatus] =
    useState<MonthlyAttendanceSummary['attendance_status']>('VERIFIED');
  const [deleteTarget, setDeleteTarget] = useState<MonthlyAttendanceSummary | null>(null);

  const openEditModal = (row: MonthlyAttendanceSummary) => {
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

    setRecords((prev) =>
      prev.map((item) =>
        item.id === editingRecord.id
          ? {
              ...item,
              shift_code: editShiftCode,
              actual_work_days: nextDays,
              late_occurrences: nextLate,
              total_overtime_hours: nextOt,
              attendance_status: editStatus,
            }
          : item
      )
    );
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
      detail: `Cập nhật công tháng 11/2026: ${nextDays} công, ${nextLate} đi muộn, ${nextOt}h OT, trạng thái ${editStatus}`,
    });
    setEditingRecord(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    setRecords((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    showToast(
      `Đã xóa bản ghi công ${deleteTarget.employee_code}`,
      deleteTarget.full_name,
      'warning'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'DELETE_RECORD',
      module: 'Chấm công & Ca làm',
      target: `${deleteTarget.employee_code} (${deleteTarget.full_name})`,
      detail: `Xóa bản ghi chấm công tháng 11/2026 của ${deleteTarget.full_name}`,
      status: 'WARNING',
    });
    setDeleteTarget(null);
    setEditingRecord(null);
  };

  useEffect(() => {
    let active = true;
    fetchAttendanceMock()
      .then((data) => {
        if (!active) return;
        setRecords(data.MOCK_MONTHLY_ATTENDANCE);
        setWorkShifts(data.MOCK_WORK_SHIFTS);
        setIsLoading(false);
      })
      .catch(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const scopedRecords = useMemo(() => {
    if (role === 'DEPT_MANAGER') {
      return records.filter((r) => TECH_DIVISION_DEPARTMENTS.has(r.department_name));
    }
    if (role === 'EMPLOYEE') {
      return records.filter(
        (r) => r.employee_code === currentEmployeeCode || r.full_name === currentEmployeeName
      );
    }
    return records;
  }, [records, role, currentEmployeeCode, currentEmployeeName]);

  const departments = useMemo(() => {
    const unique = Array.from(new Set(scopedRecords.map((r) => r.department_name)));
    return ['ALL', ...unique];
  }, [scopedRecords]);

  const shiftOptions = useMemo(() => {
    const codes = Array.from(new Set(workShifts.map((s) => s.shift_code)));
    return [
      { value: 'ALL', label: 'Tất cả ca làm' },
      ...codes.map((code) => ({ value: code, label: code })),
    ];
  }, [workShifts]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = normalizeVietnamese(searchQuery.trim());
    return scopedRecords.filter((item) => {
      if (departmentFilter !== 'ALL' && item.department_name !== departmentFilter) {
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
  }, [scopedRecords, departmentFilter, shiftFilter, searchQuery]);

  const summary = useMemo(() => {
    const totalEmployees = scopedRecords.length || 1;
    const onTimeCount = scopedRecords.filter(
      (r) => r.late_occurrences === 0 && r.early_leave_occurrences === 0
    ).length;
    const onTimeRate = Math.round((onTimeCount / totalEmployees) * 100);
    const totalOtHours = scopedRecords.reduce((acc, r) => acc + r.total_overtime_hours, 0);
    const totalLateEarly = scopedRecords.reduce(
      (acc, r) => acc + r.late_occurrences + r.early_leave_occurrences,
      0
    );
    return {
      standardDays: 22,
      onTimeRate,
      totalOtHours,
      totalLateEarly,
    };
  }, [scopedRecords]);

  const handleLockAttendance = () => {
    setRecords((prev) =>
      prev.map((item) => ({
        ...item,
        attendance_status: 'LOCKED',
      }))
    );
    setIsMonthLocked(true);
    showToast(
      'Đã chốt bảng công tháng 11/2026',
      'Toàn bộ dữ liệu công đã được khóa và đồng bộ sang phân hệ Tính lương.',
      'success'
    );
    recordAuditLog({
      actor_name: currentEmployeeName,
      actor_code: currentEmployeeCode,
      actor_role: role,
      action: 'UPDATE_RECORD',
      module: 'Chấm công & Ca làm',
      target: 'Bảng công tháng 11/2026',
      detail: `Chốt bảng công toàn công ty (${records.length} nhân sự)`,
    });
  };

  const handleExportExcel = () => {
    showToast(
      'Xuất Excel bảng công thành công',
      `Đã tạo tệp Bang_cong_thang_11_2026.xlsx (${filteredRecords.length} nhân sự).`,
      'success'
    );
  };

  if (uiState === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
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
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" strokeWidth={1.5} />
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Chấm công &amp; Ca làm việc
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            Tổng hợp bảng công kỳ tháng 11/2026, theo dõi đi muộn, tăng ca OT và cấu hình ca chuẩn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="h-4 w-4" strokeWidth={1.5} />
            Xuất Excel công
          </Button>
          {role !== 'DEPT_MANAGER' && role !== 'EMPLOYEE' && (
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Công chuẩn tháng 11/2026
              </span>
              <CalendarCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {summary.standardDays} công
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Áp dụng khối Hành chính &amp; Kỹ thuật
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tỷ lệ đúng giờ
              </span>
              <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {summary.onTimeRate}%
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Không phát sinh đi muộn / về sớm
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500 dark:border-l-violet-400">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tổng giờ OT
              </span>
              <Timer className="h-4 w-4 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
              {formatNumberVN(summary.totalOtHours)} giờ
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Bao gồm ngày thường &amp; cuối tuần
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Đi muộn / Về sớm
              </span>
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {formatNumberVN(summary.totalLateEarly)} lượt
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Tính sau ngưỡng ân hạn từng ca
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <div className="flex flex-col gap-3.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="shrink-0">
              <CardTitle>Bảng chấm công tháng 11/2026</CardTitle>
              <CardDescription>
                Hiển thị {filteredRecords.length} / {scopedRecords.length} nhân sự theo bộ lọc hiện tại.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
              <div className="relative min-w-0 flex-1 sm:w-52 xl:w-56 2xl:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã NV, họ tên..."
                  aria-label="Tìm kiếm nhân viên"
                  className="pl-9"
                />
              </div>
              <div className="w-full shrink-0 sm:w-52">
                <Select
                  value={departmentFilter}
                  onValueChange={setDepartmentFilter}
                  aria-label="Lọc theo phòng ban"
                  className="whitespace-nowrap"
                  options={departments.map((dept) => ({
                    value: dept,
                    label: dept === 'ALL' ? 'Tất cả phòng ban' : dept,
                  }))}
                />
              </div>
              <div className="w-full shrink-0 sm:w-40">
                <Select
                  value={shiftFilter}
                  onValueChange={setShiftFilter}
                  aria-label="Lọc theo ca làm"
                  className="whitespace-nowrap"
                  options={shiftOptions}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {uiState === 'empty' || filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <Users className="h-8 w-8 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                Không tìm thấy dữ liệu chấm công phù hợp
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Thử thay đổi từ khóa tìm kiếm, phòng ban hoặc ca làm việc.
              </p>
              {(searchQuery || departmentFilter !== 'ALL' || shiftFilter !== 'ALL') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setDepartmentFilter('ALL');
                    setShiftFilter('ALL');
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
                  <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-400">
                    <th className="whitespace-nowrap px-3 py-2.5">Mã NV</th>
                    <th className="px-3 py-2.5">Họ tên</th>
                    <th className="px-3 py-2.5">Phòng ban</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Ca làm</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Công thực tế / Chuẩn</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Đi muộn</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Giờ OT</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Trạng thái</th>
                    {canEditAttendance && (
                      <th className="whitespace-nowrap px-3 py-2.5 text-right">Thao tác</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                  {filteredRecords.map((row) => {
                    const statusCfg = ATTENDANCE_STATUS_CONFIG[row.attendance_status];
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
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-normal tabular-nums text-[#415A54] dark:text-zinc-300">
                          {row.employee_code}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                            {row.full_name}
                          </div>
                          <div className="text-xs text-[#415A54] dark:text-zinc-400">
                            {row.position_name}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-[#11221E] dark:text-zinc-300">
                          {row.department_name}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <Badge variant="outline" className="font-mono tabular-nums">
                            {row.shift_code}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                          <span className="font-semibold">{row.actual_work_days}</span>
                          <span className="text-[#5C7871] dark:text-zinc-400"> / {row.standard_work_days}</span>
                          {row.paid_leave_days > 0 && (
                            <span className="ml-1.5 text-xs text-[#415A54] dark:text-zinc-400">
                              (+{row.paid_leave_days} phép)
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                          {row.late_occurrences > 0 ? (
                            <span className="font-medium text-amber-700 dark:text-amber-400">
                              {row.late_occurrences} lượt
                            </span>
                          ) : (
                            <span className="text-[#5C7871] dark:text-zinc-400">0</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                          {row.total_overtime_hours} giờ
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        </td>
                        {canEditAttendance && (
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(row);
                                }}
                                aria-label={`Sửa công ${row.full_name}`}
                              >
                                <Pencil className="h-4 w-4" strokeWidth={1.5} />
                                Sửa
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(row);
                                }}
                                aria-label={`Xóa công ${row.full_name}`}
                                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <CardTitle>Danh mục Ca làm việc chuẩn</CardTitle>
          <CardDescription>
            Khung giờ quy định, thời gian nghỉ trưa và ngưỡng ân hạn đi muộn áp dụng toàn công ty.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto bg-[#FCFEFD] dark:bg-transparent">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#F2F7F5] dark:bg-zinc-900/60">
                <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <th className="whitespace-nowrap px-4 py-3">Mã ca</th>
                  <th className="px-4 py-3">Tên ca làm việc</th>
                  <th className="whitespace-nowrap px-4 py-3">Khung giờ</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Nghỉ trưa</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Giờ chuẩn</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Ân hạn muộn</th>
                  <th className="px-4 py-3">Phạm vi áp dụng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                {workShifts.map((shift) => (
                  <tr
                    key={shift.id}
                    className="odd:bg-[#FCFEFD] even:bg-[#F5FAF8] transition-colors hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge variant="teal" className="font-mono tabular-nums">
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
                    <td className="px-4 py-3 text-xs text-[#415A54] dark:text-zinc-400">
                      {shift.department_scope}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
                <DialogTitle>Chỉnh sửa chấm công — {editingRecord.full_name}</DialogTitle>
                <DialogDescription>
                  <span className="font-mono tabular-nums">{editingRecord.employee_code}</span> ·{' '}
                  {editingRecord.department_name}
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
                      Trạng thái chốt công
                    </label>
                    <Select
                      id="edit-status"
                      value={editStatus}
                      onValueChange={(v) =>
                        setEditStatus(v as MonthlyAttendanceSummary['attendance_status'])
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
                      Giờ OT
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
                <DialogFooter className="sm:justify-between">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteTarget(editingRecord)}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    Xóa bản ghi
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingRecord(null)}
                    >
                      Hủy
                    </Button>
                    <Button type="submit" variant="primary">
                      Lưu thay đổi
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </>
          )}
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
            <DialogTitle>Xác nhận xóa bản ghi chấm công</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa dữ liệu công tháng 11/2026 của{' '}
              <span className="font-semibold text-[#11221E] dark:text-zinc-100">
                {deleteTarget?.full_name}
              </span>{' '}
              (<span className="font-mono tabular-nums">{deleteTarget?.employee_code}</span>)?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AttendanceView;
