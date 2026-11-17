'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Calculator,
  FileSpreadsheet,
  Search,
  Send,
  ShieldCheck,
  Wallet,
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
import { fetchPayrollMock, type PitTaxBracketItem } from '@/lib/mock-fetcher';
import { formatNumberVN, formatVND } from '@/lib/utils';
import { calculateProgressivePitVnd } from '@/mock';
import type { PayrollFormulaConfig, PayrollRecord } from '@/mock/types';

function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const PAYMENT_STATUS_CONFIG: Record<
  PayrollRecord['payment_status'],
  { label: string; variant: 'warning' | 'teal' | 'success' }
> = {
  DRAFT_CALCULATED: { label: 'Nháp tính toán', variant: 'warning' },
  APPROVED: { label: 'Đã duyệt lương', variant: 'teal' },
  PAID: { label: 'Đã phát hành', variant: 'success' },
};

interface PitBracketBreakdownItem {
  level: number;
  label: string;
  ratePercent: number;
  taxableSliceVnd: number;
  taxVnd: number;
}

function computePitBreakdown(
  taxableIncomeVnd: number,
  brackets: PitTaxBracketItem[]
): PitBracketBreakdownItem[] {
  if (taxableIncomeVnd <= 0 || brackets.length === 0) return [];
  const items: PitBracketBreakdownItem[] = [];
  let prevMax = 0;

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

export function PayrollView() {
  const { role, uiState, setUiState, showToast } = useApp();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [formula, setFormula] = useState<PayrollFormulaConfig | null>(null);
  const [pitBrackets, setPitBrackets] = useState<PitTaxBracketItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PayrollRecord['payment_status']>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [editKpiBonusDigits, setEditKpiBonusDigits] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] =
    useState<PayrollRecord['payment_status']>('APPROVED');

  const openPayrollModal = (rec: PayrollRecord) => {
    setSelectedRecord(rec);
    setEditKpiBonusDigits(String(rec.kpi_bonus_vnd));
    setEditPaymentStatus(rec.payment_status);
  };

  const handleSavePayrollAdjustments = () => {
    if (!selectedRecord) return;
    const nextKpiBonus = Math.max(0, Number(editKpiBonusDigits) || 0);
    const nextGross =
      selectedRecord.prorated_base_salary_vnd +
      selectedRecord.allowance_meal_vnd +
      selectedRecord.allowance_transport_vnd +
      selectedRecord.allowance_position_vnd +
      selectedRecord.overtime_pay_vnd +
      nextKpiBonus;
    const nextTaxable = Math.max(
      0,
      nextGross -
        selectedRecord.total_insurance_employee_vnd -
        selectedRecord.personal_deduction_vnd -
        selectedRecord.dependent_deduction_vnd
    );
    const nextPit = calculateProgressivePitVnd(nextTaxable);
    const nextNet = nextGross - selectedRecord.total_insurance_employee_vnd - nextPit;

    const updatedRec: PayrollRecord = {
      ...selectedRecord,
      kpi_bonus_vnd: nextKpiBonus,
      gross_salary_vnd: nextGross,
      taxable_income_vnd: nextTaxable,
      pit_tax_vnd: nextPit,
      net_salary_vnd: nextNet,
      payment_status: editPaymentStatus,
      paid_at:
        editPaymentStatus === 'PAID'
          ? selectedRecord.paid_at ?? new Date().toISOString()
          : null,
    };

    setRecords((prev) => prev.map((item) => (item.id === updatedRec.id ? updatedRec : item)));
    setSelectedRecord(updatedRec);
    showToast(
      `Đã cập nhật phiếu lương ${updatedRec.payslip_code}`,
      `${updatedRec.full_name} — Thực lĩnh mới: ${formatVND(nextNet)}`,
      'success'
    );
  };

  useEffect(() => {
    let active = true;
    fetchPayrollMock()
      .then((data) => {
        if (!active) return;
        setRecords(data.MOCK_PAYROLL_RECORDS);
        setFormula(data.MOCK_PAYROLL_FORMULA);
        setPitBrackets(data.PIT_TAX_BRACKETS);
        setIsLoading(false);
      })
      .catch(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredRecords = useMemo(() => {
    const q = normalizeVietnamese(searchQuery.trim());
    return records.filter((rec) => {
      if (statusFilter !== 'ALL' && rec.payment_status !== statusFilter) {
        return false;
      }
      if (q) {
        const haystack = normalizeVietnamese(
          `${rec.employee_code} ${rec.payslip_code} ${rec.full_name} ${rec.department_name}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [records, searchQuery, statusFilter]);

  const totals = useMemo(() => {
    return records.reduce(
      (acc, r) => ({
        gross: acc.gross + r.gross_salary_vnd,
        insurance: acc.insurance + r.total_insurance_employee_vnd,
        pit: acc.pit + r.pit_tax_vnd,
        net: acc.net + r.net_salary_vnd,
      }),
      { gross: 0, insurance: 0, pit: 0, net: 0 }
    );
  }, [records]);

  const handleRunPayroll = () => {
    setRecords((prev) =>
      prev.map((item) =>
        item.payment_status === 'DRAFT_CALCULATED'
          ? { ...item, payment_status: 'APPROVED' }
          : item
      )
    );
    showToast(
      'Đã chạy tính lương toàn công ty kỳ 11/2026',
      'Toàn bộ bản ghi nháp đã được kiểm tra công thức và chuyển trạng thái Đã duyệt lương.',
      'success'
    );
  };

  const handlePublishPayslips = () => {
    const nowIso = new Date().toISOString();
    setRecords((prev) =>
      prev.map((item) => ({
        ...item,
        payment_status: 'PAID',
        paid_at: item.paid_at ?? nowIso,
      }))
    );
    showToast(
      'Đã phát hành phiếu lương tháng 11/2026',
      `Đã gửi phiếu lương điện tử tới ${records.length} nhân sự qua cổng tự phục vụ.`,
      'success'
    );
  };

  const pitBreakdown = useMemo(() => {
    if (!selectedRecord) return [];
    return computePitBreakdown(selectedRecord.taxable_income_vnd, pitBrackets);
  }, [selectedRecord, pitBrackets]);

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
          <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Không thể tải dữ liệu bảng lương tháng 11/2026
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setUiState('ready')}>
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
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Bảng lương &amp; Thuế TNCN
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Kỳ lương Tháng 11/2026 — Tính toán tự động BHXH/BHYT/BHTN (10,5%) và thuế TNCN lũy tiến 7 bậc.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleRunPayroll}>
            <Calculator className="h-4 w-4" strokeWidth={1.5} />
            Chạy tính lương toàn công ty
          </Button>
          <Button variant="primary" onClick={handlePublishPayslips}>
            <Send className="h-4 w-4" strokeWidth={1.5} />
            Phát hành phiếu lương
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="h-full border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tổng quỹ lương Gross
              </span>
              <Wallet className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {formatVND(totals.gross)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Kỳ 11/2026 ({records.length} nhân sự)
            </p>
          </CardContent>
        </Card>

        <Card className="h-full border-l-4 border-l-violet-500 dark:border-l-violet-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Khấu trừ BHXH/YT/TN (10,5%)
              </span>
              <ShieldCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
              {formatVND(totals.insurance)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              BHXH 8% + BHYT 1,5% + BHTN 1%
            </p>
          </CardContent>
        </Card>

        <Card className="h-full border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tổng thuế TNCN
              </span>
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {formatVND(totals.pit)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Biểu thuế lũy tiến 7 bậc
            </p>
          </CardContent>
        </Card>

        <Card className="h-full border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Tổng thực lĩnh Net
              </span>
              <Banknote className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatVND(totals.net)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Số tiền chi trả qua ngân hàng
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800/80">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Bảng lương chi tiết nhân viên — Tháng 11/2026</CardTitle>
              <CardDescription>
                Nhấp vào từng dòng nhân viên để xem diễn giải chi tiết công thức tính lương và phiếu lương.
              </CardDescription>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[440px]">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
                  strokeWidth={1.5}
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã NV, họ tên..."
                  aria-label="Tìm kiếm nhân viên trong bảng lương"
                  className="pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as 'ALL' | PayrollRecord['payment_status'])}
                aria-label="Lọc trạng thái bảng lương"
                options={[
                  { value: 'ALL', label: 'Tất cả trạng thái' },
                  { value: 'DRAFT_CALCULATED', label: 'Nháp tính toán' },
                  { value: 'APPROVED', label: 'Đã duyệt lương' },
                  { value: 'PAID', label: 'Đã phát hành' },
                ]}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {uiState === 'empty' || filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-8 w-8 text-zinc-400" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Không có bản ghi lương phù hợp
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/80 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-400">
                    <th className="whitespace-nowrap px-4 py-3">Mã NV</th>
                    <th className="px-4 py-3">Họ tên</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Công</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Lương cơ bản</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Phụ cấp + Thưởng</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Gross</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">BHXH/YT/TN</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Thuế TNCN</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Thực lĩnh Net</th>
                    <th className="whitespace-nowrap px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                  {filteredRecords.map((rec) => {
                    const allowanceAndBonus =
                      rec.allowance_meal_vnd +
                      rec.allowance_transport_vnd +
                      rec.allowance_position_vnd +
                      rec.overtime_pay_vnd +
                      rec.kpi_bonus_vnd;
                    const statusCfg = PAYMENT_STATUS_CONFIG[rec.payment_status];

                    return (
                      <tr
                        key={rec.id}
                        onClick={() => openPayrollModal(rec)}
                        className="cursor-pointer transition-colors hover:bg-teal-50/40 dark:hover:bg-teal-950/20"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                          {rec.employee_code}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {rec.full_name}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {rec.department_name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {rec.actual_paid_days}/{rec.standard_days}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {formatVND(rec.prorated_base_salary_vnd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {formatVND(allowanceAndBonus)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                          {formatVND(rec.gross_salary_vnd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                          {formatVND(rec.total_insurance_employee_vnd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                          {formatVND(rec.pit_tax_vnd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                          {formatVND(rec.net_salary_vnd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
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

      <Dialog
        open={selectedRecord !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null);
        }}
      >
        <DialogContent className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden p-0">
          {selectedRecord && (
            <>
              <DialogHeader className="shrink-0 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <Badge variant="teal" className="font-mono tabular-nums">
                    {selectedRecord.payslip_code}
                  </Badge>
                  <Badge variant={PAYMENT_STATUS_CONFIG[selectedRecord.payment_status].variant}>
                    {PAYMENT_STATUS_CONFIG[selectedRecord.payment_status].label}
                  </Badge>
                </div>
                <DialogTitle className="pt-1">
                  Chi tiết phiếu lương — {selectedRecord.full_name}
                </DialogTitle>
                <DialogDescription>
                  <span className="font-mono tabular-nums">{selectedRecord.employee_code}</span> ·{' '}
                  {selectedRecord.position_name} · {selectedRecord.department_name}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4 text-sm">
                <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    1. Thu nhập Gross (Kỳ {selectedRecord.period_month})
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Lương cơ bản theo công ({selectedRecord.actual_paid_days}/
                        {selectedRecord.standard_days} ngày)
                      </span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.prorated_base_salary_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Phụ cấp ăn trưa</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.allowance_meal_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Phụ cấp đi lại</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.allowance_transport_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Phụ cấp chức vụ</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.allowance_position_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Lương làm thêm giờ (OT)</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.overtime_pay_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Thưởng KPI tháng</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.kpi_bonus_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200/80 pt-2 font-semibold dark:border-zinc-800/80">
                      <span className="text-zinc-900 dark:text-zinc-100">Tổng thu nhập Gross</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.gross_salary_vnd)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    2. Khấu trừ Bảo hiểm bắt buộc (10,5% trên mức đóng{' '}
                    <span className="font-mono tabular-nums">
                      {formatVND(selectedRecord.insurance_base_vnd)}
                    </span>
                    )
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        BHXH ({(formula?.bhxh_employee_rate ?? 0.08) * 100}%)
                      </span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        -{formatVND(selectedRecord.bhxh_employee_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        BHYT ({(formula?.bhyt_employee_rate ?? 0.015) * 100}%)
                      </span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        -{formatVND(selectedRecord.bhyt_employee_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        BHTN ({(formula?.bhtn_employee_rate ?? 0.01) * 100}%)
                      </span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        -{formatVND(selectedRecord.bhtn_employee_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200/80 pt-2 font-medium dark:border-zinc-800/80">
                      <span>Tổng khấu trừ bảo hiểm</span>
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                        -{formatVND(selectedRecord.total_insurance_employee_vnd)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
                  <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    3. Giảm trừ gia cảnh &amp; Thuế TNCN lũy tiến 7 bậc
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">Giảm trừ bản thân</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        -{formatVND(formula?.personal_deduction_vnd ?? 11000000)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Giảm trừ người phụ thuộc ({selectedRecord.dependents_count} người ×{' '}
                        <span className="font-mono tabular-nums">
                          {formatVND(formula?.dependent_deduction_vnd ?? 4400000)}
                        </span>
                        )
                      </span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        -{formatVND(selectedRecord.dependent_deduction_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-zinc-200/80 pt-2 font-medium dark:border-zinc-800/80">
                      <span>Thu nhập tính thuế</span>
                      <span className="font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatVND(selectedRecord.taxable_income_vnd)}
                      </span>
                    </div>
                  </div>

                  {pitBreakdown.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200/70 dark:border-zinc-800/70">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200/70 bg-zinc-50 text-zinc-500 dark:border-zinc-800/70 dark:bg-zinc-900 dark:text-zinc-400">
                            <th className="px-3 py-2">Bậc thuế</th>
                            <th className="px-3 py-2 text-right">Phần thu nhập</th>
                            <th className="px-3 py-2 text-right">Thuế suất</th>
                            <th className="px-3 py-2 text-right">Tiền thuế</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                          {pitBreakdown.map((b) => (
                            <tr key={b.level}>
                              <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">
                                Bậc {b.level}: {b.label}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                {formatVND(b.taxableSliceVnd)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                {b.ratePercent}%
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums font-medium">
                                {formatVND(b.taxVnd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-2.5 flex justify-between font-medium">
                    <span>Tổng thuế TNCN phải nộp</span>
                    <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                      -{formatVND(selectedRecord.pit_tax_vnd)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-teal-700/20 bg-teal-50/60 p-4 dark:border-teal-400/20 dark:bg-teal-950/30 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-medium text-teal-800 dark:text-teal-300">
                      Thực lĩnh Net chuyển khoản
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {selectedRecord.bank_name} ·{' '}
                      <span className="font-mono tabular-nums">{selectedRecord.bank_account_no}</span>
                    </div>
                  </div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                    {formatVND(selectedRecord.net_salary_vnd)}
                  </div>
                </div>

                {role === 'SUPER_ADMIN' && (
                  <div className="space-y-3 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Điều chỉnh phiếu lương (Quản trị viên)
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label
                          htmlFor="edit-kpi-bonus"
                          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
                        >
                          Thưởng KPI tháng (VND)
                        </label>
                        <Input
                          id="edit-kpi-bonus"
                          type="text"
                          inputMode="numeric"
                          value={
                            editKpiBonusDigits === ''
                              ? ''
                              : formatNumberVN(Number(editKpiBonusDigits))
                          }
                          onChange={(e) =>
                            setEditKpiBonusDigits(e.target.value.replace(/\D/g, ''))
                          }
                          className="font-mono tabular-nums"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="edit-payment-status"
                          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
                        >
                          Trạng thái duyệt
                        </label>
                        <Select
                          id="edit-payment-status"
                          value={editPaymentStatus}
                          onValueChange={(v) =>
                            setEditPaymentStatus(v as PayrollRecord['payment_status'])
                          }
                          options={[
                            { value: 'DRAFT_CALCULATED', label: 'Nháp tính toán' },
                            { value: 'APPROVED', label: 'Đã duyệt lương' },
                            { value: 'PAID', label: 'Đã phát hành' },
                          ]}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSavePayrollAdjustments}
                      >
                        Lưu điều chỉnh lương
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-0 flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <Button variant="outline" onClick={() => setSelectedRecord(null)}>
                  Đóng
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    showToast(
                      `Đã tải phiếu lương ${selectedRecord.payslip_code}`,
                      `${selectedRecord.full_name} — Thực lĩnh ${formatVND(selectedRecord.net_salary_vnd)}`,
                      'success'
                    );
                  }}
                >
                  Tải phiếu lương PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PayrollView;
