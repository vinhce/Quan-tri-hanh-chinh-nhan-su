'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Building2,
  Calendar,
  Clock,
  Landmark,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import { recordAuditLog } from '@/lib/audit-logger';
import {
  fetchAdminMock,
  fetchPayrollMock,
  type PitTaxBracketItem,
} from '@/lib/mock-fetcher';
import type { SystemConfiguration } from '@/mock/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
}

export function AdminSettingsView() {
  const { role, currentUserProfile, showToast } = useApp();
  const [config, setConfig] = useState<SystemConfiguration | null>(null);
  const [pitBrackets, setPitBrackets] = useState<PitTaxBracketItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoBurnoutAlert, setAutoBurnoutAlert] = useState<boolean>(true);

  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayStart, setNewHolidayStart] = useState('2026-12-25');
  const [newHolidayEnd, setNewHolidayEnd] = useState('2026-12-25');
  const [newHolidayDays, setNewHolidayDays] = useState('1');

  const loadData = useCallback(async (bypassCache = false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [adminData, payrollData] = await Promise.all([
        fetchAdminMock({ bypassCache }),
        fetchPayrollMock({ bypassCache }),
      ]);
      const savedMinDays =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('hrm_director_min_days')
          : null;
      const parsedMinDays = savedMinDays ? Number(savedMinDays) : NaN;
      setConfig({
        ...adminData.MOCK_SYSTEM_CONFIG,
        director_approval_min_days:
          Number.isFinite(parsedMinDays) && parsedMinDays > 0
            ? parsedMinDays
            : (adminData.MOCK_SYSTEM_CONFIG.director_approval_min_days ?? 3),
        public_holidays_2026: [...adminData.MOCK_SYSTEM_CONFIG.public_holidays_2026],
        ai_engine_config: { ...adminData.MOCK_SYSTEM_CONFIG.ai_engine_config },
      });
      setPitBrackets(payrollData.PIT_TAX_BRACKETS);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không thể tải cấu hình hệ thống.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveConfig = () => {
    const minDays = Math.max(1, Number(config?.director_approval_min_days) || 3);
    if (config && typeof window !== 'undefined') {
      window.localStorage.setItem('hrm_director_min_days', String(minDays));
    }
    recordAuditLog({
      actor_name: currentUserProfile?.fullName ?? 'Nguyễn Văn An',
      actor_code: currentUserProfile?.employee_code ?? 'NV-2024-001',
      actor_role: role,
      action: 'UPDATE_SETTINGS',
      target: 'Cấu hình hệ thống & Tham số vận hành',
      detail: `Lưu cấu hình hệ thống (ngưỡng Giám đốc duyệt: ${minDays} ngày, giờ chuẩn: ${config?.work_hours_start ?? '08:00'}-${config?.work_hours_end ?? '17:00'}).`,
      status: 'SUCCESS',
    });
    showToast(
      'Đã lưu cấu hình hệ thống',
      'Các tham số giờ làm việc, quy trình phê duyệt, BHXH/Thuế TNCN và AI HR Copilot đã được áp dụng.',
      'success'
    );
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    const trimmedName = newHolidayName.trim();
    if (!trimmedName) {
      showToast('Thiếu tên ngày lễ', 'Vui lòng nhập tên ngày nghỉ lễ trước khi thêm.', 'warning');
      return;
    }
    const paidDays = Math.max(1, Number(newHolidayDays) || 1);
    const code = `HOLIDAY-${Date.now().toString().slice(-4)}`;

    setConfig((prev) =>
      prev
        ? {
            ...prev,
            public_holidays_2026: [
              ...prev.public_holidays_2026,
              {
                holiday_code: code,
                holiday_name: trimmedName,
                start_date: newHolidayStart,
                end_date: newHolidayEnd || newHolidayStart,
                paid_days: paidDays,
              },
            ],
          }
        : prev
    );

    setNewHolidayName('');
    showToast(
      'Đã thêm ngày lễ mới',
      `${trimmedName} (${paidDays} ngày hưởng nguyên lương) đã được đưa vào lịch 2026.`,
      'success'
    );
  };

  const handleRemoveHoliday = (holidayCode: string) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            public_holidays_2026: prev.public_holidays_2026.filter(
              (h) => h.holiday_code !== holidayCode
            ),
          }
        : prev
    );
    showToast('Đã gỡ ngày lễ khỏi lịch', `Mã ngày lễ ${holidayCode} đã được xóa.`, 'default');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-9 w-44" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {loadError ?? 'Không có dữ liệu cấu hình.'}
          </p>
          <Button variant="outline" onClick={() => void loadData(true)}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const updateConfig = (updater: (prev: SystemConfiguration) => SystemConfiguration) => {
    setConfig((prev) => (prev ? updater(prev) : prev));
  };

  const tokenUsagePercent = Math.min(
    100,
    Math.round(
      (config.ai_engine_config.tokens_used_month / config.ai_engine_config.monthly_token_budget) *
        100
    )
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Cấu hình hệ thống & Tham số vận hành
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Thiết lập giờ làm việc chuẩn, ngày nghỉ lễ, tỷ lệ BHXH/TNCN và động cơ AI HR Copilot.
          </p>
        </div>
        <Button onClick={handleSaveConfig} className="shrink-0">
          <Save className="h-4 w-4" strokeWidth={1.5} />
          Lưu cấu hình hệ thống
        </Button>
      </div>

      {/* Block 1: Company & Working Hours */}
      <Card>
        <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
            Thông tin doanh nghiệp & Giờ làm việc chuẩn
          </CardTitle>
          <CardDescription>
            Áp dụng mặc định cho chấm công, phép năm và chu kỳ chốt công tính lương hàng tháng.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Tên pháp nhân doanh nghiệp
              </label>
              <Input
                value={config.company_legal_name}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, company_legal_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Mã số thuế doanh nghiệp
              </label>
              <Input
                value={config.company_tax_code}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, company_tax_code: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Clock className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                Giờ vào chuẩn
              </label>
              <Input
                type="time"
                value={config.work_hours_start}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, work_hours_start: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Giờ tan ca chuẩn
              </label>
              <Input
                type="time"
                value={config.work_hours_end}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, work_hours_end: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Ngưỡng đi muộn (phút)
              </label>
              <Input
                type="number"
                value={config.late_grace_threshold_minutes}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    late_grace_threshold_minutes: Number(e.target.value) || 0,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Phép năm cơ bản (ngày)
              </label>
              <Input
                type="number"
                value={config.annual_leave_base_days}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    annual_leave_base_days: Number(e.target.value) || 12,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Nghỉ trưa từ
              </label>
              <Input
                type="time"
                value={config.lunch_break_start}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, lunch_break_start: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Nghỉ trưa đến
              </label>
              <Input
                type="time"
                value={config.lunch_break_end}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, lunch_break_end: e.target.value }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Ngày chốt công hàng tháng
              </label>
              <Input
                type="number"
                min={1}
                max={31}
                value={config.payroll_cutoff_day}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    payroll_cutoff_day: Number(e.target.value) || 25,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Ngày chi trả lương
              </label>
              <Input
                type="number"
                min={1}
                max={31}
                value={config.payroll_payout_day}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    payroll_payout_day: Number(e.target.value) || 5,
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Số ngày nghỉ tối thiểu cần Giám đốc duyệt (ngày)
              </label>
              <Input
                type="number"
                min={1}
                max={30}
                value={config.director_approval_min_days}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    director_approval_min_days: Math.max(1, Number(e.target.value) || 3),
                  }))
                }
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Đơn nghỉ phép có số ngày vượt ngưỡng này (hoặc nghỉ không lương, công tác nước ngoài) sẽ tự động chuyển thêm tới Giám đốc (SUPER_ADMIN) phê duyệt.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Block 2: Public Holidays */}
      <Card>
        <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
            Lịch nghỉ lễ trong năm 2026
          </CardTitle>
          <CardDescription>
            Các ngày nghỉ lễ hưởng nguyên lương dùng để tự động trừ ngày công chuẩn khi tính lương.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <form
            onSubmit={handleAddHoliday}
            className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 md:grid-cols-12"
          >
            <div className="md:col-span-5">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tên ngày lễ
              </label>
              <Input
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                placeholder="Ví dụ: Nghỉ Giáng sinh doanh nghiệp"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Từ ngày
              </label>
              <Input
                type="date"
                value={newHolidayStart}
                onChange={(e) => setNewHolidayStart(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Đến ngày
              </label>
              <Input
                type="date"
                value={newHolidayEnd}
                onChange={(e) => setNewHolidayEnd(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Số ngày
              </label>
              <Input
                type="number"
                min={1}
                value={newHolidayDays}
                onChange={(e) => setNewHolidayDays(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="flex items-end md:col-span-2">
              <Button type="submit" variant="secondary" className="w-full">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Thêm ngày lễ
              </Button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-xl border border-zinc-200/80 dark:border-zinc-800/80">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <th className="whitespace-nowrap px-4 py-2.5">Mã lễ</th>
                  <th className="px-4 py-2.5">Tên kỳ nghỉ</th>
                  <th className="px-4 py-2.5">Từ ngày</th>
                  <th className="px-4 py-2.5">Đến ngày</th>
                  <th className="px-4 py-2.5 text-right">Ngày hưởng lương</th>
                  <th className="px-4 py-2.5 text-right">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                {config.public_holidays_2026.map((holiday) => (
                  <tr key={holiday.holiday_code} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {holiday.holiday_code}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {holiday.holiday_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                      {holiday.start_date}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                      {holiday.end_date}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {holiday.paid_days} ngày
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveHoliday(holiday.holiday_code)}
                        aria-label={`Xóa ${holiday.holiday_name}`}
                      >
                        <Trash2 className="h-4 w-4 text-zinc-500 hover:text-red-600" strokeWidth={1.5} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Block 3: Insurance & PIT Tax Brackets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
              Tỷ lệ BHXH / BHYT / BHTN & Giảm trừ
            </CardTitle>
            <CardDescription>
              Tỷ lệ trích đóng phía người lao động và mức giảm trừ gia cảnh hiện hành.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  BHXH (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={config.bhxh_employee_percent}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      bhxh_employee_percent: Number(e.target.value) || 0,
                    }))
                  }
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  BHYT (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={config.bhyt_employee_percent}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      bhyt_employee_percent: Number(e.target.value) || 0,
                    }))
                  }
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  BHTN (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={config.bhtn_employee_percent}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      bhtn_employee_percent: Number(e.target.value) || 0,
                    }))
                  }
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Giảm trừ bản thân (VND / tháng)
              </label>
              <Input
                type="number"
                step={500000}
                value={config.personal_deduction_vnd}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    personal_deduction_vnd: Number(e.target.value) || 0,
                  }))
                }
                className="font-mono tabular-nums"
              />
              <p className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                Hiển thị: {formatVnd(config.personal_deduction_vnd)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Giảm trừ mỗi người phụ thuộc (VND / tháng)
              </label>
              <Input
                type="number"
                step={200000}
                value={config.dependent_deduction_vnd}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    dependent_deduction_vnd: Number(e.target.value) || 0,
                  }))
                }
                className="font-mono tabular-nums"
              />
              <p className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                Hiển thị: {formatVnd(config.dependent_deduction_vnd)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
            <CardTitle>Biểu thuế TNCN lũy tiến từng phần (7 bậc)</CardTitle>
            <CardDescription>
              Tham chiếu tự động khi chạy bảng lương và xuất phiếu lương cá nhân.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                    <th className="px-4 py-2.5">Bậc</th>
                    <th className="px-4 py-2.5">Phần thu nhập tính thuế / tháng</th>
                    <th className="px-4 py-2.5 text-right">Thuế suất</th>
                    <th className="px-4 py-2.5 text-right">Số trừ nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                  {pitBrackets.map((bracket) => (
                    <tr key={bracket.level} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                        Bậc {bracket.level}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-zinc-800 dark:text-zinc-200">
                        {bracket.label}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                        {bracket.rate_percent}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                        {formatVnd(bracket.quick_subtract_vnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Block 4: AI HR Copilot Config */}
      <Card>
        <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-teal-700 dark:text-teal-400" strokeWidth={1.5} />
                Cấu hình AI HR Copilot & Bảo mật dữ liệu
              </CardTitle>
              <CardDescription className="mt-1">
                Quản lý mô hình AI, hạn mức token hàng tháng, che dữ liệu định danh (PII Masking) và quét cảnh báo Burnout.
              </CardDescription>
            </div>
            <Badge variant="teal">{config.ai_engine_config.provider}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Mô hình ngôn ngữ chính
              </label>
              <Select
                value={config.ai_engine_config.primary_model}
                onValueChange={(val) =>
                  updateConfig((prev) => ({
                    ...prev,
                    ai_engine_config: { ...prev.ai_engine_config, primary_model: val },
                  }))
                }
                options={[
                  { label: 'gemini-2.5-pro-hr-ats (Khuyến nghị)', value: 'gemini-2.5-pro-hr-ats' },
                  { label: 'gemini-2.5-flash-hr-ops (Tốc độ cao)', value: 'gemini-2.5-flash-hr-ops' },
                  { label: 'gemini-2.5-pro-policy-audit', value: 'gemini-2.5-pro-policy-audit' },
                ]}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Giới hạn token / tháng
              </label>
              <Input
                type="number"
                step={500000}
                value={config.ai_engine_config.monthly_token_budget}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    ai_engine_config: {
                      ...prev.ai_engine_config,
                      monthly_token_budget: Number(e.target.value) || 1000000,
                    },
                  }))
                }
                className="font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Lịch quét cảnh báo Burnout
              </label>
              <Input
                value={config.ai_engine_config.burnout_scan_schedule}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    ai_engine_config: {
                      ...prev.ai_engine_config,
                      burnout_scan_schedule: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>

          {/* Token usage bar */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Mức tiêu thụ Token tháng 11/2026
              </span>
              <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                {new Intl.NumberFormat('vi-VN').format(config.ai_engine_config.tokens_used_month)} /{' '}
                {new Intl.NumberFormat('vi-VN').format(config.ai_engine_config.monthly_token_budget)}{' '}
                tokens ({tokenUsagePercent}%)
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-teal-700 dark:bg-teal-400"
                style={{ width: `${tokenUsagePercent}%` }}
              />
            </div>
          </div>

          {/* Switches */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Che dữ liệu định danh cá nhân (PII Masking)
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Ẩn số CCCD, SĐT và số tài khoản trước khi gửi ngữ cảnh sang AI Copilot.
                </p>
              </div>
              <Switch
                checked={config.ai_engine_config.pii_masking_enabled}
                onCheckedChange={(checked) =>
                  updateConfig((prev) => ({
                    ...prev,
                    ai_engine_config: {
                      ...prev.ai_engine_config,
                      pii_masking_enabled: checked,
                    },
                  }))
                }
                aria-label="Bật tắt PII Masking"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Tự động quét cảnh báo Burnout & Turnover
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Phân tích giờ tăng ca, tần suất đi muộn và biến động KPI hàng tuần.
                </p>
              </div>
              <Switch
                checked={autoBurnoutAlert}
                onCheckedChange={setAutoBurnoutAlert}
                aria-label="Bật tắt cảnh báo Burnout tự động"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
