'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useApp } from '@/context/app-context';
import { fetchEmployeesMock } from '@/lib/mock-fetcher';
import type {
  BurnoutTurnoverAlert,
  Employee,
  EmployeeKpiRecord,
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

const GRADE_BADGE: Record<
  EmployeeKpiRecord['grade'],
  'teal' | 'success' | 'default' | 'secondary' | 'warning'
> = {
  'A+': 'teal',
  A: 'success',
  'B+': 'default',
  B: 'secondary',
  C: 'warning',
};

const RISK_BADGE: Record<
  BurnoutTurnoverAlert['risk_level'],
  { label: string; variant: 'destructive' | 'warning' | 'secondary' | 'success' }
> = {
  CRITICAL: { label: 'Nguy cấp', variant: 'destructive' },
  HIGH: { label: 'Rủi ro cao', variant: 'warning' },
  MEDIUM: { label: 'Theo dõi', variant: 'secondary' },
  LOW: { label: 'Ổn định', variant: 'success' },
};

const EMPLOYEE_QUARTERLY_OKRS = [
  {
    period: '2026-Q3',
    kpi_score: 91,
    okr_completion_percent: 94,
    grade: 'A' as const,
    reviewer: 'Lê Hoàng Nam',
    note: 'Đảm bảo uptime dịch vụ thanh toán đạt 99.96%, hỗ trợ tốt các thành viên mới.',
    objectives: [
      { title: 'Duy trì uptime cổng thanh toán >= 99.95%', progress: 100 },
      { title: 'Hoàn thành tái cấu trúc API chấm công v2', progress: 92 },
      { title: 'Mentoring 2 kỹ sư Junior đạt chuẩn code review', progress: 90 },
    ],
  },
  {
    period: '2026-Q2',
    kpi_score: 89,
    okr_completion_percent: 91,
    grade: 'B+' as const,
    reviewer: 'Lê Hoàng Nam',
    note: 'Triển khai thành công phân hệ đồng bộ bảng công đúng tiến độ.',
    objectives: [
      { title: 'Giảm thời gian phản hồi API dưới 180ms', progress: 95 },
      { title: 'Tăng tỷ lệ test coverage module lương lên 85%', progress: 87 },
    ],
  },
];

export function PerformanceView() {
  const { role, showToast } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [kpiRecords, setKpiRecords] = useState<EmployeeKpiRecord[]>([]);
  const [burnoutAlerts, setBurnoutAlerts] = useState<BurnoutTurnoverAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingKpi, setEditingKpi] = useState<EmployeeKpiRecord | null>(null);
  const [scoreInput, setScoreInput] = useState<string>('90');
  const [okrInput, setOkrInput] = useState<string>('90');
  const [gradeInput, setGradeInput] = useState<EmployeeKpiRecord['grade']>('A');
  const [noteInput, setNoteInput] = useState<string>('');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('2026-Q3');

  const loadData = useCallback(async (bypassCache = false) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchEmployeesMock({ bypassCache });
      setEmployees(data.MOCK_EMPLOYEES);
      setKpiRecords([...data.MOCK_KPI_RECORDS]);
      setBurnoutAlerts(data.MOCK_BURNOUT_ALERTS);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không thể tải dữ liệu KPI.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // DEPT_MANAGER sees subordinates with role_code === 'EMPLOYEE' in Khối Công nghệ
  const teamEmployees = useMemo(() => {
    if (role === 'DEPT_MANAGER') {
      return employees.filter(
        (emp) =>
          emp.role_code === 'EMPLOYEE' &&
          (emp.department_id.startsWith('dept-tech') || emp.manager_id === 'emp-003')
      );
    }
    return employees;
  }, [role, employees]);

  const visibleKpiRecords = useMemo(() => {
    if (role === 'DEPT_MANAGER') {
      const teamIds = new Set(teamEmployees.map((e) => e.id));
      return kpiRecords.filter((rec) => teamIds.has(rec.employee_id));
    }
    if (role === 'EMPLOYEE') {
      return kpiRecords.filter((rec) => rec.employee_id === 'emp-004');
    }
    return kpiRecords;
  }, [role, teamEmployees, kpiRecords]);

  const visibleAlerts = useMemo(() => {
    if (role === 'DEPT_MANAGER') {
      const teamIds = new Set(teamEmployees.map((e) => e.id));
      return burnoutAlerts.filter((a) => teamIds.has(a.employee_id));
    }
    return burnoutAlerts;
  }, [role, teamEmployees, burnoutAlerts]);

  const openEditDialog = (record: EmployeeKpiRecord) => {
    setEditingKpi(record);
    setScoreInput(String(record.kpi_score));
    setOkrInput(String(record.okr_completion_percent));
    setGradeInput(record.grade);
    setNoteInput(record.review_note);
  };

  const handleSaveKpi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKpi) return;
    const nextScore = Math.min(100, Math.max(0, Number(scoreInput) || 0));
    const nextOkr = Math.min(100, Math.max(0, Number(okrInput) || 0));

    setKpiRecords((prev) =>
      prev.map((item) =>
        item.id === editingKpi.id
          ? {
              ...item,
              kpi_score: nextScore,
              okr_completion_percent: nextOkr,
              grade: gradeInput,
              review_note: noteInput.trim() || item.review_note,
            }
          : item
      )
    );

    showToast(
      'Đã cập nhật đánh giá KPI',
      `Đã lưu điểm KPI ${nextScore}/100 (Xếp loại ${gradeInput}) cho ${editingKpi.full_name}.`,
      'success'
    );
    setEditingKpi(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-80" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{loadError}</p>
          <Button variant="outline" onClick={() => void loadData(true)}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  // EMPLOYEE VIEW
  if (role === 'EMPLOYEE') {
    const activeQuarter =
      EMPLOYEE_QUARTERLY_OKRS.find((q) => q.period === selectedQuarter) ??
      EMPLOYEE_QUARTERLY_OKRS[0];

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
              KPI & Mục tiêu OKR cá nhân
            </h1>
            <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
              Phạm Minh Tuấn (NV-2024-004) · Phòng Kỹ thuật Phần mềm
            </p>
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={selectedQuarter}
              onValueChange={setSelectedQuarter}
              options={EMPLOYEE_QUARTERLY_OKRS.map((q) => ({
                label: `Kỳ ${q.period}`,
                value: q.period,
              }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Điểm KPI kỳ {activeQuarter.period}
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                  {activeQuarter.kpi_score} / 100
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400">
                <Target className="h-4 w-4" strokeWidth={1.5} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Tiến độ hoàn thành OKR
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {activeQuarter.okr_completion_percent}%
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-violet-500 dark:border-l-violet-400">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                  Xếp loại đánh giá
                </p>
                <div className="mt-1.5">
                  <Badge variant={GRADE_BADGE[activeQuarter.grade]} className="text-sm">
                    Hạng {activeQuarter.grade}
                  </Badge>
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-950/30 dark:text-violet-400">
                <Award className="h-4 w-4" strokeWidth={1.5} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <CardTitle>Chi tiết mục tiêu OKR & Nhận xét quản lý</CardTitle>
            <CardDescription>
              Người đánh giá: {activeQuarter.reviewer} · Nhận xét: {activeQuarter.note}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {activeQuarter.objectives.map((obj) => (
              <div
                key={obj.title}
                className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5]/70 p-4 dark:border-zinc-800/80 dark:bg-transparent"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-[#11221E] dark:text-zinc-100">
                    {obj.title}
                  </p>
                  <span className="font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {obj.progress}%
                  </span>
                </div>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#E4EEEB] dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-[#0F766E] dark:bg-teal-400"
                    style={{ width: `${obj.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // DEPT_MANAGER, HR_MANAGER, SUPER_ADMIN VIEW
  const avgKpi = Math.round(
    visibleKpiRecords.reduce((sum, r) => sum + r.kpi_score, 0) /
      Math.max(1, visibleKpiRecords.length)
  );

  return (
    <div className="space-y-6 pt-1">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            {role === 'DEPT_MANAGER'
              ? 'Đánh giá KPI & Nhân sự Khối Công nghệ'
              : 'Tổng hợp KPI & Cảnh báo AI Burnout toàn công ty'}
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            {role === 'DEPT_MANAGER'
              ? 'Theo dõi hiệu suất thành viên trong team và can thiệp sớm rủi ro kiệt sức. Dữ liệu lương được ẩn theo phân quyền.'
              : 'Giám sát điểm KPI/OKR toàn doanh nghiệp và danh sách nhân sự có nguy cơ nghỉ việc.'}
          </p>
        </div>
        <Badge variant="teal" className="w-fit">
          {role === 'DEPT_MANAGER' ? 'Phạm vi: Khối Công nghệ' : 'Phạm vi: Toàn công ty'}
        </Badge>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                {role === 'DEPT_MANAGER' ? 'Nhân sự trong team' : 'Tổng hồ sơ KPI kỳ 2026-Q3'}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                {role === 'DEPT_MANAGER' ? teamEmployees.length : visibleKpiRecords.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-950/30 dark:text-blue-400">
              <Users className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Điểm KPI trung bình
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {avgKpi} / 100
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-950/30 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Cảnh báo Burnout / Turnover
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {visibleAlerts.length}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-950/30 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Members Table (DEPT_MANAGER ONLY — STRICTLY NO SALARY COLUMN) */}
      {role === 'DEPT_MANAGER' && (
        <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
          <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
              Danh sách nhân sự trực thuộc Khối Công nghệ
            </CardTitle>
            <CardDescription>
              Thông tin nhân sự, ca làm việc, tiến độ KPI và mức độ rủi ro nghỉ việc (không hiển thị thông tin lương).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                    <th className="whitespace-nowrap px-4 py-3">Mã NV</th>
                    <th className="px-4 py-3">Họ và tên</th>
                    <th className="px-4 py-3">Phòng ban</th>
                    <th className="px-4 py-3">Chức danh</th>
                    <th className="whitespace-nowrap px-4 py-3">Ca làm việc</th>
                    <th className="px-4 py-3 text-right">Hoàn thành KPI</th>
                    <th className="px-4 py-3">Rủi ro Burnout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                  {teamEmployees.map((emp) => {
                    const riskMeta = RISK_BADGE[emp.burnout_risk_level];
                    return (
                      <tr
                        key={emp.id}
                        className="transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-normal tabular-nums text-[#415A54] dark:text-zinc-300">
                          {emp.employee_code}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-[#11221E] dark:text-zinc-100">
                            {emp.full_name}
                          </p>
                          <p className="text-xs text-[#415A54] dark:text-zinc-400">{emp.email}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-[#11221E] dark:text-zinc-300">
                          {emp.department_name}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-[#415A54] dark:text-zinc-400">
                          {emp.position_name}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                          {emp.work_shift_code}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {emp.kpi_completion_rate}%
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant={riskMeta.variant}>
                            {riskMeta.label} ({emp.burnout_risk_score})
                          </Badge>
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

      {/* KPI Evaluation Table */}
      <Card className="overflow-hidden rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-zinc-900 dark:shadow-none">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
            Bảng đánh giá KPI & OKR kỳ 2026-Q3
          </CardTitle>
          <CardDescription>
            Chấm điểm, điều chỉnh xếp loại và ghi nhận phản hồi trực tiếp cho từng nhân sự.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:text-zinc-400">
                  <th className="whitespace-nowrap px-4 py-3">Mã NV</th>
                  <th className="px-4 py-3">Nhân sự</th>
                  <th className="px-4 py-3">Phòng ban</th>
                  <th className="px-4 py-3 text-right">Điểm KPI</th>
                  <th className="px-4 py-3 text-right">OKR (%)</th>
                  <th className="px-4 py-3">Xếp loại</th>
                  <th className="px-4 py-3">Nhận xét</th>
                  <th className="px-4 py-3 text-right">Chấm điểm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                {visibleKpiRecords.map((rec) => (
                  <tr
                    key={rec.id}
                    className="transition-colors odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-normal tabular-nums text-[#415A54] dark:text-zinc-300">
                      {rec.employee_code}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[#11221E] dark:text-zinc-100">
                        {rec.full_name}
                      </p>
                      <p className="text-xs text-[#415A54] dark:text-zinc-400">
                        {rec.position_name}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-[#11221E] dark:text-zinc-400">
                      {rec.department_name}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-[#0F766E] dark:text-zinc-100">
                      {rec.kpi_score}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-[#415A54] dark:text-zinc-300">
                      {rec.okr_completion_percent}%
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={GRADE_BADGE[rec.grade]}>{rec.grade}</Badge>
                    </td>
                    <td className="max-w-xs px-4 py-3.5 text-xs text-[#415A54] dark:text-zinc-400">
                      <p className="line-clamp-2">{rec.review_note}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(rec)}>
                        <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Cập nhật
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Burnout & Turnover Alerts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#11221E] dark:text-zinc-100">
            Cảnh báo AI nguy cơ nghỉ việc & Burnout
          </h2>
          <span className="text-xs text-[#5C7871] dark:text-zinc-400">
            Phân tích từ dữ liệu tăng ca, đi muộn và biến động KPI
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleAlerts.map((alert) => {
            const riskMeta = RISK_BADGE[alert.risk_level];
            return (
              <Card key={alert.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {alert.full_name}{' '}
                        <span className="font-mono text-xs font-normal text-[#415A54] dark:text-zinc-400">
                          ({alert.employee_code})
                        </span>
                      </CardTitle>
                      <CardDescription className="mt-0.5">
                        {alert.position_name} · {alert.department_name}
                      </CardDescription>
                    </div>
                    <Badge variant={riskMeta.variant}>{riskMeta.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#C6D9D3] bg-[#F2F7F5] p-3 text-xs dark:border-zinc-800/80 dark:bg-zinc-900/50">
                    <div>
                      <p className="text-[#5C7871] dark:text-zinc-400">Burnout</p>
                      <p className="mt-0.5 font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {alert.burnout_risk_score}/100
                      </p>
                    </div>
                    <div>
                      <p className="text-[#5C7871] dark:text-zinc-400">Turnover</p>
                      <p className="mt-0.5 font-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                        {alert.turnover_risk_score}/100
                      </p>
                    </div>
                    <div>
                      <p className="text-[#5C7871] dark:text-zinc-400">OT 30 ngày</p>
                      <p className="mt-0.5 font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                        {alert.overtime_hours_last_30d} giờ
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-1 text-xs text-[#415A54] dark:text-zinc-400">
                    {alert.key_factors.map((factor) => (
                      <li key={factor} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Edit KPI Dialog */}
      <Dialog open={Boolean(editingKpi)} onOpenChange={(open) => !open && setEditingKpi(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cập nhật đánh giá KPI</DialogTitle>
            <DialogDescription>
              {editingKpi?.full_name} ({editingKpi?.employee_code}) · Kỳ {editingKpi?.period}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveKpi} className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Điểm KPI (0-100)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  OKR (%)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={okrInput}
                  onChange={(e) => setOkrInput(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                  Xếp loại
                </label>
                <Select
                  value={gradeInput}
                  onValueChange={(val) => setGradeInput(val as EmployeeKpiRecord['grade'])}
                  options={[
                    { label: 'A+', value: 'A+' },
                    { label: 'A', value: 'A' },
                    { label: 'B+', value: 'B+' },
                    { label: 'B', value: 'B' },
                    { label: 'C', value: 'C' },
                  ]}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#415A54] dark:text-zinc-300">
                Nhận xét đánh giá
              </label>
              <Input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Nhập nhận xét chi tiết..."
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingKpi(null)}>
                Hủy
              </Button>
              <Button type="submit">Lưu đánh giá</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
