'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Banknote,
  Calculator,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Lock,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
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
import { recordAuditLog } from '@/lib/audit-logger';
import { fetchPayrollMock, type PitTaxBracketItem } from '@/lib/mock-fetcher';
import {
  calculateMonthlyPayrolls,
  getPayrollRecords,
  HRM_RUNTIME_EVENT,
  pushNotification,
  savePayrollRecord,
} from '@/lib/runtime-store';
import { alertSwal, confirmSwal } from '@/lib/swal';
import { formatDateVN, formatNumberVN, formatVND } from '@/lib/utils';
import {
  calculateProgressivePitVnd,
  MOCK_PAYROLL_FORMULA,
  PIT_TAX_BRACKETS,
} from '@/mock/payroll';
import type { PayrollFormulaConfig, PayrollRecord } from '@/mock/types';

function normalizeVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function formatPeriodLabel(period: string): string {
  if (period === 'ALL') return 'Tất cả kỳ lương';
  const [yyyy, mm] = period.split('-');
  if (!yyyy || !mm) return period;
  return `Tháng ${mm}/${yyyy}`;
}

const PAYMENT_STATUS_CONFIG: Record<
  PayrollRecord['payment_status'],
  { label: string; variant: 'warning' | 'teal' | 'success' }
> = {
  DRAFT_CALCULATED: { label: 'Nháp tính toán', variant: 'warning' },
  APPROVED: { label: 'Đã duyệt lương', variant: 'teal' },
  PAID: { label: 'Đã phát hành', variant: 'success' },
};

type PayrollSpecialFilter =
  | 'ALL'
  | 'MID_MONTH_SPLIT'
  | 'FINAL_SETTLEMENT'
  | 'PROBATION_EXEMPT';

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

function computeAdjustedPayrollPreview(
  baseRecord: PayrollRecord,
  nextKpiBonusVnd: number,
  nextAdvanceDeductionVnd: number,
  nextPenaltyDeductionVnd: number
) {
  const kpiBonus = Math.max(0, Math.round(nextKpiBonusVnd));
  const advanceDeduction = Math.max(0, Math.round(nextAdvanceDeductionVnd));
  const penaltyDeduction = Math.max(0, Math.round(nextPenaltyDeductionVnd));
  const unusedLeavePayout = baseRecord.unused_leave_payout_vnd ?? 0;

  const gross =
    baseRecord.prorated_base_salary_vnd +
    baseRecord.allowance_meal_vnd +
    baseRecord.allowance_transport_vnd +
    baseRecord.allowance_position_vnd +
    baseRecord.overtime_pay_vnd +
    unusedLeavePayout +
    kpiBonus;

  const taxable = Math.max(
    0,
    gross -
      baseRecord.total_insurance_employee_vnd -
      baseRecord.personal_deduction_vnd -
      baseRecord.dependent_deduction_vnd
  );
  const pit = calculateProgressivePitVnd(taxable);
  const net = Math.max(
    0,
    gross -
      baseRecord.total_insurance_employee_vnd -
      pit -
      advanceDeduction -
      penaltyDeduction
  );
  const employerInsurance =
    baseRecord.insurance_base_vnd > 0
      ? Math.round(baseRecord.insurance_base_vnd * 0.235)
      : 0;
  const employerTotalCost = gross + employerInsurance;

  return {
    kpiBonus,
    advanceDeduction,
    penaltyDeduction,
    gross,
    taxable,
    pit,
    net,
    employerTotalCost,
  };
}

export function PayrollView() {
  const {
    role,
    currentUserProfile,
    navIntent,
    clearNavIntent,
    uiState,
    setUiState,
    showToast,
  } = useApp();

  const actorName =
    currentUserProfile?.fullName ??
    (role === 'DIRECTOR'
      ? 'Trần Quốc Việt'
      : role === 'HR_MANAGER'
        ? 'Trần Thị Bích Ngọc'
        : 'Nguyễn Văn An');
  const actorCode =
    currentUserProfile?.employee_code ??
    (role === 'DIRECTOR'
      ? 'NV-2024-000'
      : role === 'HR_MANAGER'
        ? 'NV-2024-002'
        : 'NV-2024-001');

  const canManagePayroll =
    role === 'SUPER_ADMIN' || role === 'HR_MANAGER' || role === 'DIRECTOR';

  const [allRecords, setAllRecords] = useState<PayrollRecord[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-11');
  const [formula, setFormula] = useState<PayrollFormulaConfig>(MOCK_PAYROLL_FORMULA);
  const [pitBrackets, setPitBrackets] = useState<PitTaxBracketItem[]>(PIT_TAX_BRACKETS);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PayrollRecord['payment_status']>('ALL');
  const [specialFilter, setSpecialFilter] = useState<PayrollSpecialFilter>('ALL');

  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [editKpiBonusDigits, setEditKpiBonusDigits] = useState('');
  const [editAdvanceDigits, setEditAdvanceDigits] = useState('');
  const [editPenaltyDigits, setEditPenaltyDigits] = useState('');

  const syncRecordsFromStore = useCallback(() => {
    const liveRecords = getPayrollRecords();
    setAllRecords(liveRecords);
  }, []);

  useEffect(() => {
    let active = true;
    syncRecordsFromStore();

    fetchPayrollMock()
      .then((data) => {
        if (!active) return;
        if (data.MOCK_PAYROLL_FORMULA) {
          setFormula(data.MOCK_PAYROLL_FORMULA);
        }
        if (Array.isArray(data.PIT_TAX_BRACKETS) && data.PIT_TAX_BRACKETS.length > 0) {
          setPitBrackets(data.PIT_TAX_BRACKETS);
        }
        syncRecordsFromStore();
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        syncRecordsFromStore();
        setIsLoading(false);
      });

    const handleRuntimeUpdate = () => {
      syncRecordsFromStore();
    };
    window.addEventListener(HRM_RUNTIME_EVENT, handleRuntimeUpdate);
    window.addEventListener('storage', handleRuntimeUpdate);

    return () => {
      active = false;
      window.removeEventListener(HRM_RUNTIME_EVENT, handleRuntimeUpdate);
      window.removeEventListener('storage', handleRuntimeUpdate);
    };
  }, [syncRecordsFromStore]);

  const openPayrollModal = useCallback((rec: PayrollRecord) => {
    setSelectedRecordId(rec.id);
    setEditKpiBonusDigits(String(Math.max(0, Math.round(rec.kpi_bonus_vnd ?? 0))));
    setEditAdvanceDigits(String(Math.max(0, Math.round(rec.advance_deduction_vnd ?? 0))));
    setEditPenaltyDigits(String(Math.max(0, Math.round(rec.penalty_deduction_vnd ?? 0))));
  }, []);

  useEffect(() => {
    if (!navIntent || navIntent.navId !== 'payroll') return;
    const liveList = getPayrollRecords();
    if (navIntent.entityId) {
      const target = liveList.find(
        (r) =>
          r.id === navIntent.entityId ||
          r.payslip_code === navIntent.entityId ||
          r.employee_code === navIntent.entityId
      );
      if (target) {
        setSelectedPeriod(target.period_month);
        openPayrollModal(target);
      }
    }
    clearNavIntent();
  }, [navIntent, clearNavIntent, openPayrollModal]);

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) return null;
    return allRecords.find((r) => r.id === selectedRecordId) ?? null;
  }, [allRecords, selectedRecordId]);

  const periodOptions = useMemo(() => {
    const knownPeriods = new Set<string>(['2026-11', '2026-12', '2026-10']);
    for (const r of allRecords) {
      if (r.period_month) knownPeriods.add(r.period_month);
    }
    const sorted = Array.from(knownPeriods).sort((a, b) => b.localeCompare(a));
    return [
      ...sorted.map((p) => {
        const count = allRecords.filter((r) => r.period_month === p).length;
        return {
          value: p,
          label: `${formatPeriodLabel(p)}${count > 0 ? ` (${count})` : ''}`,
        };
      }),
      { value: 'ALL', label: `Tất cả các kỳ (${allRecords.length})` },
    ];
  }, [allRecords]);

  const periodRecords = useMemo(() => {
    if (selectedPeriod === 'ALL') return allRecords;
    return allRecords.filter((r) => r.period_month === selectedPeriod);
  }, [allRecords, selectedPeriod]);

  const otherPeriodSettlements = useMemo(() => {
    if (selectedPeriod === 'ALL') return [];
    return allRecords.filter(
      (r) => r.is_final_settlement && r.period_month !== selectedPeriod
    );
  }, [allRecords, selectedPeriod]);

  const filteredRecords = useMemo(() => {
    const q = normalizeVietnamese(searchQuery.trim());
    return periodRecords.filter((rec) => {
      if (statusFilter !== 'ALL' && rec.payment_status !== statusFilter) {
        return false;
      }
      if (specialFilter === 'MID_MONTH_SPLIT' && !rec.mid_month_split) {
        return false;
      }
      if (specialFilter === 'FINAL_SETTLEMENT' && !rec.is_final_settlement) {
        return false;
      }
      if (
        specialFilter === 'PROBATION_EXEMPT' &&
        rec.contract_type !== 'PROBATION_2M' &&
        !(rec.total_insurance_employee_vnd === 0 && !rec.is_final_settlement)
      ) {
        return false;
      }
      if (q) {
        const haystack = normalizeVietnamese(
          `${rec.employee_code} ${rec.payslip_code} ${rec.full_name} ${rec.department_name} ${rec.position_name}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [periodRecords, searchQuery, statusFilter, specialFilter]);

  const totals = useMemo(() => {
    return periodRecords.reduce(
      (acc, r) => ({
        gross: acc.gross + r.gross_salary_vnd,
        insurance: acc.insurance + r.total_insurance_employee_vnd,
        pit: acc.pit + r.pit_tax_vnd,
        otherDeductions:
          acc.otherDeductions +
          (r.advance_deduction_vnd ?? 0) +
          (r.penalty_deduction_vnd ?? 0),
        net: acc.net + r.net_salary_vnd,
        splitCount: acc.splitCount + (r.mid_month_split ? 1 : 0),
        settlementCount: acc.settlementCount + (r.is_final_settlement ? 1 : 0),
        draftCount:
          acc.draftCount + (r.payment_status === 'DRAFT_CALCULATED' ? 1 : 0),
        unpaidCount: acc.unpaidCount + (r.payment_status !== 'PAID' ? 1 : 0),
      }),
      {
        gross: 0,
        insurance: 0,
        pit: 0,
        otherDeductions: 0,
        net: 0,
        splitCount: 0,
        settlementCount: 0,
        draftCount: 0,
        unpaidCount: 0,
      }
    );
  }, [periodRecords]);

  const targetCalcPeriod = selectedPeriod === 'ALL' ? '2026-11' : selectedPeriod;

  const handleCalculateMonthlyPayroll = async () => {
    const confirmed = await confirmSwal({
      title: `Tổng hợp & Tính lương ${formatPeriodLabel(targetCalcPeriod)}?`,
      html: `Hệ thống sẽ tự động tổng hợp từ nguồn dữ liệu vận hành thời gian thực:<br/><br/>
        • <b>Thu nhập Gross:</b> Công thực tế + Phép hưởng lương + Tiền OT (150%/200%/300%) + Phụ cấp + Thưởng KPI.<br/>
        • <b>Tách lương giữa tháng:</b> Tự động chia 2 giai đoạn công nếu có Quyết định điều chỉnh lương / thăng chức trong kỳ.<br/>
        • <b>Khấu trừ bắt buộc:</b> BHXH/BHYT/BHTN <b>10,5%</b> (trần <b>46.800.000 đ</b>, miễn <b>0%</b> cho HĐ Thử việc), Thuế TNCN lũy tiến <b>7 bậc</b>, Tạm ứng &amp; Phạt/Đền bù.<br/>
        • Các phiếu đã phát hành (<b>PAID</b>) và phiếu Quyết toán kỳ cuối được bảo toàn.`,
      confirmText: 'Tổng hợp & Tính lương',
      cancelText: 'Hủy bỏ',
      variant: 'primary',
    });
    if (!confirmed) return;

    const calculated = calculateMonthlyPayrolls(targetCalcPeriod, actorName);
    syncRecordsFromStore();
    if (selectedPeriod === 'ALL') {
      setSelectedPeriod(targetCalcPeriod);
    }

    const splitCount = calculated.filter((r) => Boolean(r.mid_month_split)).length;
    const probationCount = calculated.filter(
      (r) => r.contract_type === 'PROBATION_2M'
    ).length;

    showToast(
      `Đã tổng hợp & tính lương ${formatPeriodLabel(targetCalcPeriod)}`,
      `Đã tính toán ${calculated.length} nhân sự (${splitCount} ca tách lương giữa tháng, ${probationCount} HĐ thử việc miễn 0% BHXH).`,
      'success'
    );
  };

  const handleBatchApproveDrafts = async () => {
    const drafts = periodRecords.filter((r) => r.payment_status === 'DRAFT_CALCULATED');
    if (drafts.length === 0) {
      await alertSwal({
        title: 'Không có bản ghi nháp cần duyệt',
        text: 'Toàn bộ phiếu lương trong kỳ đang chọn đã ở trạng thái Đã duyệt lương hoặc Đã phát hành.',
        icon: 'info',
      });
      return;
    }

    const confirmed = await confirmSwal({
      title: `Phê duyệt ${drafts.length} phiếu lương nháp?`,
      html: `Chuyển <b>${drafts.length}</b> bản ghi nháp trong <b>${formatPeriodLabel(selectedPeriod)}</b> sang trạng thái <b>Đã duyệt lương (APPROVED)</b> để sẵn sàng chi trả qua ngân hàng.`,
      confirmText: 'Xác nhận duyệt lương',
      cancelText: 'Hủy bỏ',
      variant: 'primary',
    });
    if (!confirmed) return;

    for (const rec of drafts) {
      savePayrollRecord({
        ...rec,
        payment_status: 'APPROVED',
      });
    }
    syncRecordsFromStore();

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'LOCK_PAYROLL',
      target: `Bảng lương ${formatPeriodLabel(selectedPeriod)}`,
      detail: `Phê duyệt ${drafts.length} phiếu lương từ DRAFT_CALCULATED sang APPROVED.`,
    });

    showToast(
      `Đã phê duyệt ${drafts.length} phiếu lương`,
      `Bảng lương ${formatPeriodLabel(selectedPeriod)} đã sẵn sàng phát hành.`,
      'success'
    );
  };

  const handlePublishPayslips = async () => {
    const unpaid = periodRecords.filter((r) => r.payment_status !== 'PAID');
    if (unpaid.length === 0) {
      await alertSwal({
        title: 'Đã phát hành toàn bộ phiếu lương',
        text: `Tất cả ${periodRecords.length} phiếu lương trong ${formatPeriodLabel(selectedPeriod)} đã được chi trả và phát hành (PAID).`,
        icon: 'info',
      });
      return;
    }

    const totalNetUnpaid = unpaid.reduce((sum, r) => sum + r.net_salary_vnd, 0);
    const confirmed = await confirmSwal({
      title: `Phát hành & Xác nhận chi trả (${unpaid.length} nhân sự)?`,
      html: `Xác nhận chốt thanh toán <b>PAID</b> cho <b>${unpaid.length}</b> phiếu lương kỳ <b>${formatPeriodLabel(selectedPeriod)}</b> với tổng thực lĩnh chuyển khoản <b>${formatVND(totalNetUnpaid)}</b>.<br/><br/>Sau khi phát hành, phiếu lương sẽ hiển thị chính thức trên Cổng ESS của từng nhân viên.`,
      confirmText: 'Xác nhận Chi trả & Phát hành',
      cancelText: 'Hủy bỏ',
      variant: 'primary',
    });
    if (!confirmed) return;

    const nowIso = new Date().toISOString();
    for (const rec of unpaid) {
      savePayrollRecord({
        ...rec,
        payment_status: 'PAID',
        paid_at: rec.paid_at ?? nowIso,
      });
    }
    syncRecordsFromStore();

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'EXPORT_SALARY',
      target: `Phiếu lương ${formatPeriodLabel(selectedPeriod)}`,
      detail: `Phát hành và xác nhận thanh toán PAID cho ${unpaid.length} nhân sự (Tổng Net: ${formatVND(totalNetUnpaid)}).`,
    });

    pushNotification({
      title: `Phiếu lương ${formatPeriodLabel(selectedPeriod)} đã phát hành`,
      message: `Phòng Nhân sự đã chốt chi trả và phát hành ${unpaid.length} phiếu lương điện tử kỳ ${formatPeriodLabel(selectedPeriod)} qua cổng tự phục vụ (ESS).`,
      category: 'PAYROLL',
      target_roles: ['EMPLOYEE', 'DEPT_MANAGER', 'HR_MANAGER', 'DIRECTOR'],
      nav_id: 'payslip',
    });

    showToast(
      `Đã phát hành ${unpaid.length} phiếu lương`,
      `Tổng thực lĩnh chi trả: ${formatVND(totalNetUnpaid)} — Đã đồng bộ sang Cổng ESS.`,
      'success'
    );
  };

  const adjustmentPreview = useMemo(() => {
    if (!selectedRecord) return null;
    return computeAdjustedPayrollPreview(
      selectedRecord,
      Number(editKpiBonusDigits) || 0,
      Number(editAdvanceDigits) || 0,
      Number(editPenaltyDigits) || 0
    );
  }, [selectedRecord, editKpiBonusDigits, editAdvanceDigits, editPenaltyDigits]);

  const buildUpdatedRecordFromInputs = (base: PayrollRecord): PayrollRecord => {
    const calc = computeAdjustedPayrollPreview(
      base,
      Number(editKpiBonusDigits) || 0,
      Number(editAdvanceDigits) || 0,
      Number(editPenaltyDigits) || 0
    );
    return {
      ...base,
      kpi_bonus_vnd: calc.kpiBonus,
      advance_deduction_vnd: calc.advanceDeduction,
      penalty_deduction_vnd: calc.penaltyDeduction,
      gross_salary_vnd: calc.gross,
      taxable_income_vnd: calc.taxable,
      pit_tax_vnd: calc.pit,
      net_salary_vnd: calc.net,
      employer_total_cost_vnd: calc.employerTotalCost,
    };
  };

  const handleSavePayrollAdjustments = () => {
    if (!selectedRecord || selectedRecord.payment_status === 'PAID') return;
    const updatedRec = buildUpdatedRecordFromInputs(selectedRecord);
    savePayrollRecord(updatedRec);
    syncRecordsFromStore();

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'CALCULATE_PAYROLL',
      target: `${updatedRec.payslip_code} (${updatedRec.full_name})`,
      detail: `Điều chỉnh phiếu lương: Thưởng KPI ${formatVND(updatedRec.kpi_bonus_vnd)}, Tạm ứng ${formatVND(updatedRec.advance_deduction_vnd ?? 0)}, Phạt/Đền bù ${formatVND(updatedRec.penalty_deduction_vnd ?? 0)} -> Thuế TNCN ${formatVND(updatedRec.pit_tax_vnd)}, Net mới ${formatVND(updatedRec.net_salary_vnd)}.`,
    });

    pushNotification({
      title: `Cập nhật phiếu lương ${updatedRec.payslip_code}`,
      message: `Phiếu lương kỳ ${updatedRec.period_month} của ${updatedRec.full_name} vừa được cập nhật, thực lĩnh Net: ${formatVND(updatedRec.net_salary_vnd)}.`,
      category: 'PAYROLL',
      target_employee_codes: [updatedRec.employee_code],
      nav_id: 'payslip',
      entity_id: updatedRec.payslip_code,
    });

    showToast(
      `Đã lưu điều chỉnh ${updatedRec.payslip_code}`,
      `${updatedRec.full_name} — Thuế TNCN: ${formatVND(updatedRec.pit_tax_vnd)} · Thực lĩnh mới: ${formatVND(updatedRec.net_salary_vnd)}`,
      'success'
    );
  };

  const handleApproveSingleRecord = async () => {
    if (!selectedRecord || selectedRecord.payment_status === 'PAID') return;
    const candidateRec = buildUpdatedRecordFromInputs(selectedRecord);

    const confirmed = await confirmSwal({
      title: `Phê duyệt phiếu lương ${candidateRec.payslip_code}?`,
      html: `Xác nhận duyệt lương kỳ <b>${candidateRec.period_month}</b> của nhân sự <b>${candidateRec.full_name}</b> (${candidateRec.employee_code}) với mức thực lĩnh Net <b>${formatVND(candidateRec.net_salary_vnd)}</b>.`,
      confirmText: 'Duyệt phiếu lương',
      cancelText: 'Hủy bỏ',
      variant: 'primary',
    });
    if (!confirmed) return;

    const approvedRec: PayrollRecord = {
      ...candidateRec,
      payment_status: 'APPROVED',
      paid_at: null,
    };
    savePayrollRecord(approvedRec);
    syncRecordsFromStore();

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'LOCK_PAYROLL',
      target: `${approvedRec.payslip_code} (${approvedRec.full_name})`,
      detail: `Duyệt phiếu lương (APPROVED) — Gross ${formatVND(approvedRec.gross_salary_vnd)}, Net ${formatVND(approvedRec.net_salary_vnd)}.`,
    });

    pushNotification({
      title: `Đã duyệt phiếu lương ${approvedRec.payslip_code}`,
      message: `Phiếu lương kỳ ${approvedRec.period_month} của ${approvedRec.full_name} đã được phê duyệt với mức thực lĩnh ${formatVND(approvedRec.net_salary_vnd)}.`,
      category: 'PAYROLL',
      target_employee_codes: [approvedRec.employee_code],
      nav_id: 'payslip',
      entity_id: approvedRec.payslip_code,
    });

    showToast(
      `Đã duyệt phiếu lương ${approvedRec.payslip_code}`,
      `${approvedRec.full_name} — Chuyển trạng thái Đã duyệt lương.`,
      'success'
    );
  };

  const handleMarkPaidSingleRecord = async () => {
    if (!selectedRecord || selectedRecord.payment_status === 'PAID') return;
    const candidateRec = buildUpdatedRecordFromInputs(selectedRecord);

    const confirmed = await confirmSwal({
      title: `Xác nhận Chi trả & Phát hành (${candidateRec.payslip_code})?`,
      html: `Xác nhận đã chuyển khoản thực lĩnh <b>${formatVND(candidateRec.net_salary_vnd)}</b> tới tài khoản <b>${candidateRec.bank_name} · ${candidateRec.bank_account_no}</b> của <b>${candidateRec.full_name}</b>.<br/><br/>Phiếu lương sẽ chuyển sang trạng thái <b>Đã phát hành (PAID)</b> và khóa chỉnh sửa số liệu.`,
      confirmText: 'Xác nhận PAID',
      cancelText: 'Hủy bỏ',
      variant: 'primary',
    });
    if (!confirmed) return;

    const nowIso = new Date().toISOString();
    const paidRec: PayrollRecord = {
      ...candidateRec,
      payment_status: 'PAID',
      paid_at: selectedRecord.paid_at ?? nowIso,
    };
    savePayrollRecord(paidRec);
    syncRecordsFromStore();

    recordAuditLog({
      actor_name: actorName,
      actor_code: actorCode,
      actor_role: role,
      action: 'EXPORT_SALARY',
      target: `${paidRec.payslip_code} (${paidRec.full_name})`,
      detail: `Xác nhận thanh toán & phát hành PAID — Thực lĩnh Net ${formatVND(paidRec.net_salary_vnd)} qua ${paidRec.bank_name} (${paidRec.bank_account_no}).`,
    });

    pushNotification({
      title: `Đã chi trả phiếu lương ${paidRec.payslip_code}`,
      message: `Phiếu lương kỳ ${paidRec.period_month} của bạn đã được thanh toán chuyển khoản (${formatVND(paidRec.net_salary_vnd)}).`,
      category: 'PAYROLL',
      target_employee_codes: [paidRec.employee_code],
      nav_id: 'payslip',
      entity_id: paidRec.payslip_code,
    });

    showToast(
      `Đã thanh toán & phát hành ${paidRec.payslip_code}`,
      `${paidRec.full_name} — Thực lĩnh ${formatVND(paidRec.net_salary_vnd)} đã khóa sổ PAID.`,
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
          <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
            Không thể tải dữ liệu bảng lương {formatPeriodLabel(selectedPeriod)}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setUiState('ready')}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isRowEditable =
    canManagePayroll &&
    selectedRecord !== null &&
    selectedRecord.payment_status !== 'PAID';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#11221E] dark:text-zinc-100">
            Bảng lương &amp; Thuế TNCN
          </h1>
          <p className="mt-1 text-sm text-[#415A54] dark:text-zinc-400">
            {formatPeriodLabel(selectedPeriod)} — Tổng hợp công thực tế, tách lương giữa kỳ, BHXH 10,5% (trần 46,8 triệu, miễn HĐ thử việc), thuế TNCN 7 bậc và quyết toán nghỉ việc.
          </p>
        </div>

        {canManagePayroll && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void handleCalculateMonthlyPayroll()}>
              <Calculator className="h-4 w-4" strokeWidth={1.5} />
              Tổng hợp &amp; Tính lương tháng
            </Button>
            {totals.draftCount > 0 && (
              <Button variant="secondary" onClick={() => void handleBatchApproveDrafts()}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                Duyệt nháp ({totals.draftCount})
              </Button>
            )}
            <Button variant="primary" onClick={() => void handlePublishPayslips()}>
              <Send className="h-4 w-4" strokeWidth={1.5} />
              Phát hành phiếu lương
            </Button>
          </div>
        )}
      </div>

      {/* Notice if Final Settlement records exist in another month period */}
      {otherPeriodSettlements.length > 0 && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-50/70 px-4 py-3 text-sm dark:border-amber-400/25 dark:bg-amber-950/20 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-amber-950 dark:text-amber-200">
            <FileCheck2 className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={1.5} />
            <span>
              Đang có{' '}
              <span className="font-mono font-semibold tabular-nums">
                {otherPeriodSettlements.length}
              </span>{' '}
              phiếu <strong>Quyết toán nghỉ việc</strong> thuộc kỳ{' '}
              <span className="font-mono font-semibold tabular-nums">
                {otherPeriodSettlements[0].period_month}
              </span>
              .
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedPeriod(otherPeriodSettlements[0].period_month);
              setSpecialFilter('FINAL_SETTLEMENT');
            }}
          >
            Xem phiếu quyết toán ({otherPeriodSettlements[0].period_month})
          </Button>
        </div>
      )}

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="h-full border-l-4 border-l-blue-500 dark:border-l-blue-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tổng quỹ lương Gross
              </span>
              <Wallet className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {formatVND(totals.gross)}
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              <span className="font-mono tabular-nums">{periodRecords.length}</span> phiếu lương
              {totals.splitCount > 0 ? ` · ${totals.splitCount} tách kỳ` : ''}
              {totals.settlementCount > 0 ? ` · ${totals.settlementCount} quyết toán` : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="h-full border-l-4 border-l-violet-500 dark:border-l-violet-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Khấu trừ BHXH/YT/TN (10,5%)
              </span>
              <ShieldCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
              {formatVND(totals.insurance)}
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Trần <span className="font-mono tabular-nums">46.800.000 ₫</span> · Miễn 0% HĐ thử việc
            </p>
          </CardContent>
        </Card>

        <Card className="h-full border-l-4 border-l-amber-500 dark:border-l-amber-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tổng thuế TNCN (7 bậc)
              </span>
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {formatVND(totals.pit)}
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              {totals.otherDeductions > 0 ? (
                <>
                  Tạm ứng &amp; phạt:{' '}
                  <span className="font-mono tabular-nums">
                    {formatVND(totals.otherDeductions)}
                  </span>
                </>
              ) : (
                'Giảm trừ 11tr/tháng + 4,4tr/NPT'
              )}
            </p>
          </CardContent>
        </Card>

        <Card className="h-full border-l-4 border-l-emerald-500 dark:border-l-emerald-400">
          <CardContent className="flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#415A54] dark:text-zinc-400">
                Tổng thực lĩnh Net
              </span>
              <Banknote className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatVND(totals.net)}
            </p>
            <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
              Thực chi chuyển khoản ngân hàng
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Payroll Table */}
      <Card className="overflow-hidden rounded-[12px] border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/80 dark:bg-[#121214]">
        <CardHeader className="border-b border-[#C6D9D3] pb-4 dark:border-zinc-800/80">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>
                Bảng lương chi tiết nhân viên — {formatPeriodLabel(selectedPeriod)}
              </CardTitle>
              <CardDescription>
                Nhấp vào dòng nhân sự để xem diễn giải tách lương giữa tháng, quyết toán phép tồn, bậc thuế TNCN và điều chỉnh thưởng/khấu trừ.
              </CardDescription>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:w-[740px]">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#5C7871] dark:text-zinc-400"
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
                value={selectedPeriod}
                onValueChange={(v) => setSelectedPeriod(v)}
                aria-label="Chọn kỳ lương"
                options={periodOptions}
              />

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

              <Select
                value={specialFilter}
                onValueChange={(v) => setSpecialFilter(v as PayrollSpecialFilter)}
                aria-label="Lọc nghiệp vụ lương đặc thù"
                options={[
                  { value: 'ALL', label: 'Mọi loại phiếu lương' },
                  { value: 'MID_MONTH_SPLIT', label: 'Tách lương giữa tháng' },
                  { value: 'FINAL_SETTLEMENT', label: 'Quyết toán nghỉ việc' },
                  { value: 'PROBATION_EXEMPT', label: 'HĐ Thử việc (0% BHXH)' },
                ]}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {uiState === 'empty' || filteredRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-8 w-8 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-[#11221E] dark:text-zinc-100">
                Không có bản ghi lương phù hợp bộ lọc hiện tại
              </p>
              <p className="mt-1 text-xs text-[#5C7871] dark:text-zinc-400">
                Nhấn &ldquo;Tổng hợp &amp; Tính lương tháng&rdquo; để tính động từ bảng công và hợp đồng hiện hành.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-[#FCFEFD] dark:bg-transparent">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#F2F7F5] dark:bg-zinc-900/60">
                  <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] text-xs font-semibold text-[#415A54] dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-400">
                    <th className="whitespace-nowrap px-3 py-2.5">Mã NV</th>
                    <th className="px-3 py-2.5">Nhân sự &amp; Nghiệp vụ</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Công</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Lương theo công</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">PC + OT + Thưởng</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Gross</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">BHXH (10,5%)</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Thuế TNCN</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Tạm ứng / Phạt</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Thực lĩnh Net</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/70">
                  {filteredRecords.map((rec) => {
                    const unusedLeavePayout = rec.unused_leave_payout_vnd ?? 0;
                    const allowanceAndBonus =
                      rec.allowance_meal_vnd +
                      rec.allowance_transport_vnd +
                      rec.allowance_position_vnd +
                      rec.overtime_pay_vnd +
                      rec.kpi_bonus_vnd +
                      unusedLeavePayout;
                    const postTaxDeductions =
                      (rec.advance_deduction_vnd ?? 0) + (rec.penalty_deduction_vnd ?? 0);
                    const isProbationRow =
                      rec.contract_type === 'PROBATION_2M' ||
                      (rec.total_insurance_employee_vnd === 0 && !rec.is_final_settlement);
                    const statusCfg = PAYMENT_STATUS_CONFIG[rec.payment_status];

                    return (
                      <tr
                        key={rec.id}
                        onClick={() => openPayrollModal(rec)}
                        className="cursor-pointer odd:bg-[#FCFEFD] even:bg-[#F5FAF8] transition-colors hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-teal-950/20"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-xs font-normal tabular-nums text-[#415A54] dark:text-zinc-300">
                          <div>{rec.employee_code}</div>
                          {selectedPeriod === 'ALL' && (
                            <div className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-500">
                              {rec.period_month}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-2.5 align-top">
                          <div className="font-semibold text-[#11221E] dark:text-zinc-100">
                            {rec.full_name}
                          </div>
                          <div className="text-xs text-[#415A54] dark:text-zinc-400">
                            {rec.department_name}
                          </div>
                          {(rec.is_final_settlement || rec.mid_month_split || isProbationRow) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {rec.is_final_settlement && (
                                <Badge variant="warning">
                                  <FileCheck2 className="h-3 w-3" strokeWidth={1.5} />
                                  Quyết toán nghỉ việc
                                </Badge>
                              )}
                              {rec.mid_month_split && (
                                <Badge variant="teal">
                                  <ArrowRightLeft className="h-3 w-3" strokeWidth={1.5} />
                                  Tách lương ({formatDateVN(rec.mid_month_split.effective_date)})
                                </Badge>
                              )}
                              {isProbationRow && (
                                <Badge variant="outline">HĐ Thử việc · 0% BHXH</Badge>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                          <div>
                            {rec.actual_paid_days}/{rec.standard_days}
                          </div>
                          {rec.is_final_settlement && (rec.unused_leave_days ?? 0) > 0 && (
                            <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                              +{rec.unused_leave_days} phép tồn
                            </div>
                          )}
                          {!rec.is_final_settlement && (rec.overtime_hours ?? 0) > 0 && (
                            <div className="mt-0.5 text-[11px] text-[#5C7871] dark:text-zinc-400">
                              +{rec.overtime_hours}h OT
                            </div>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-200">
                          <div>{formatVND(rec.prorated_base_salary_vnd)}</div>
                          {rec.mid_month_split && (
                            <div className="mt-0.5 text-[11px] font-normal text-[#0F766E] dark:text-teal-400">
                              {rec.mid_month_split.days_at_old_salary}c cũ +{' '}
                              {rec.mid_month_split.days_at_new_salary}c mới
                            </div>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                          <div>{formatVND(allowanceAndBonus)}</div>
                          {unusedLeavePayout > 0 && (
                            <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                              Gồm phép tồn {formatVND(unusedLeavePayout)}
                            </div>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                          {formatVND(rec.gross_salary_vnd)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                          {rec.total_insurance_employee_vnd > 0 ? (
                            `-${formatVND(rec.total_insurance_employee_vnd)}`
                          ) : (
                            <span className="text-xs text-[#5C7871] dark:text-zinc-500">
                              0 ₫ (Miễn)
                            </span>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono tabular-nums text-[#415A54] dark:text-zinc-400">
                          {rec.pit_tax_vnd > 0 ? `-${formatVND(rec.pit_tax_vnd)}` : '0 ₫'}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono tabular-nums">
                          {postTaxDeductions > 0 ? (
                            <span className="font-medium text-red-600 dark:text-red-400">
                              -{formatVND(postTaxDeductions)}
                            </span>
                          ) : (
                            <span className="text-xs text-[#5C7871] dark:text-zinc-500">0 ₫</span>
                          )}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {formatVND(rec.net_salary_vnd)}
                        </td>

                        <td className="whitespace-nowrap px-3 py-2.5 align-top">
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

      {/* Payslip Detail & Adjustment Modal */}
      <Dialog
        open={selectedRecord !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRecordId(null);
        }}
      >
        <DialogContent className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden p-0">
          {selectedRecord && (
            <>
              <DialogHeader className="shrink-0 border-b border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <Badge variant="teal" className="font-mono tabular-nums">
                    {selectedRecord.payslip_code}
                  </Badge>
                  <Badge variant={PAYMENT_STATUS_CONFIG[selectedRecord.payment_status].variant}>
                    {PAYMENT_STATUS_CONFIG[selectedRecord.payment_status].label}
                  </Badge>
                  {selectedRecord.is_final_settlement && (
                    <Badge variant="warning">
                      <FileCheck2 className="h-3 w-3" strokeWidth={1.5} />
                      Quyết toán nghỉ việc
                    </Badge>
                  )}
                  {selectedRecord.mid_month_split && (
                    <Badge variant="teal">
                      <ArrowRightLeft className="h-3 w-3" strokeWidth={1.5} />
                      Tách lương giữa tháng
                    </Badge>
                  )}
                  {selectedRecord.contract_type === 'PROBATION_2M' && (
                    <Badge variant="outline">HĐ Thử việc · Miễn 0% BHXH</Badge>
                  )}
                </div>
                <DialogTitle className="pt-1">
                  Chi tiết phiếu lương — {selectedRecord.full_name}
                </DialogTitle>
                <DialogDescription>
                  <span className="font-mono tabular-nums">{selectedRecord.employee_code}</span> ·{' '}
                  {selectedRecord.position_name} · {selectedRecord.department_name} · Kỳ{' '}
                  <span className="font-mono tabular-nums">{selectedRecord.period_month}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4 text-sm">
                {/* Highlighted Box: Mid-month Salary Split */}
                {selectedRecord.mid_month_split && (
                  <div className="rounded-xl border border-[#C6D9D3] border-l-4 border-l-[#0F766E] bg-[#F2F7F5] p-4 dark:border-zinc-800 dark:border-l-teal-400 dark:bg-teal-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#0B4F4A] dark:text-teal-300">
                        <ArrowRightLeft className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        <span>
                          Diễn giải Tách lương giữa tháng (Hiệu lực từ{' '}
                          <span className="font-mono tabular-nums">
                            {formatDateVN(selectedRecord.mid_month_split.effective_date)}
                          </span>
                          )
                        </span>
                      </div>
                      {selectedRecord.mid_month_split.decision_no && (
                        <Badge variant="outline" className="font-mono tabular-nums">
                          {selectedRecord.mid_month_split.decision_no}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 space-y-2 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] p-3 text-xs dark:border-zinc-800 dark:bg-[#121214]">
                      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                        <span className="text-[#415A54] dark:text-zinc-300">
                          Giai đoạn 1 (Trước{' '}
                          <span className="font-mono tabular-nums">
                            {formatDateVN(selectedRecord.mid_month_split.effective_date)}
                          </span>
                          ):{' '}
                          <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                            {selectedRecord.mid_month_split.days_at_old_salary} công
                          </span>{' '}
                          × Lương cũ{' '}
                          <span className="font-mono tabular-nums">
                            {formatVND(selectedRecord.mid_month_split.old_salary_vnd)}
                          </span>{' '}
                          / {selectedRecord.standard_days} ngày
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                          {formatVND(selectedRecord.mid_month_split.old_prorated_vnd)}
                        </span>
                      </div>

                      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                        <span className="text-[#415A54] dark:text-zinc-300">
                          Giai đoạn 2 (Từ{' '}
                          <span className="font-mono tabular-nums">
                            {formatDateVN(selectedRecord.mid_month_split.effective_date)}
                          </span>
                          ):{' '}
                          <span className="font-mono font-semibold tabular-nums text-[#11221E] dark:text-zinc-100">
                            {selectedRecord.mid_month_split.days_at_new_salary} công
                          </span>{' '}
                          × Lương mới{' '}
                          <span className="font-mono tabular-nums">
                            {formatVND(selectedRecord.mid_month_split.new_salary_vnd)}
                          </span>{' '}
                          / {selectedRecord.standard_days} ngày
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                          {formatVND(selectedRecord.mid_month_split.new_prorated_vnd)}
                        </span>
                      </div>

                      <div className="flex justify-between border-t border-[#D5E3DF] pt-2 font-semibold text-[#11221E] dark:border-zinc-800 dark:text-zinc-100">
                        <span>
                          Tổng lương cơ bản gộp 2 giai đoạn ({selectedRecord.actual_paid_days}/
                          {selectedRecord.standard_days} công)
                        </span>
                        <span className="font-mono tabular-nums text-[#0F766E] dark:text-teal-400">
                          {formatVND(selectedRecord.prorated_base_salary_vnd)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Highlighted Box: Final Offboarding Settlement */}
                {selectedRecord.is_final_settlement && (
                  <div className="rounded-xl border border-amber-500/35 border-l-4 border-l-amber-500 bg-amber-50/60 p-4 dark:border-amber-400/25 dark:border-l-amber-400 dark:bg-amber-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-950 dark:text-amber-200">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={1.5} />
                        <span>Chi tiết Quyết toán hợp đồng kỳ cuối (Offboarding Settlement)</span>
                      </div>
                      <Badge variant="warning">Quyết toán nghỉ việc</Badge>
                    </div>

                    <div className="mt-3 space-y-2 rounded-lg border border-amber-500/25 bg-[#FCFEFD] p-3 text-xs dark:border-zinc-800 dark:bg-[#121214]">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#415A54] dark:text-zinc-300">
                          + Thanh toán phép năm tồn (
                          <span className="font-mono font-semibold tabular-nums">
                            {selectedRecord.unused_leave_days ?? 0} ngày
                          </span>
                          )
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          +{formatVND(selectedRecord.unused_leave_payout_vnd ?? 0)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-2">
                        <span className="text-[#415A54] dark:text-zinc-300">
                          − Đền bù tài sản / Phạt thanh lý
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                          -{formatVND(selectedRecord.penalty_deduction_vnd ?? 0)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-2">
                        <span className="text-[#415A54] dark:text-zinc-300">
                          − Khấu trừ tạm ứng tồn đọng
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                          -{formatVND(selectedRecord.advance_deduction_vnd ?? 0)}
                        </span>
                      </div>
                    </div>

                    {selectedRecord.calculation_note && (
                      <p className="mt-2.5 text-xs text-amber-900/90 dark:text-amber-300/90">
                        {selectedRecord.calculation_note}
                      </p>
                    )}
                  </div>
                )}

                {/* 1. Gross Income Breakdown */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                  <h3 className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                    1. Thu nhập Gross (Kỳ {selectedRecord.period_month})
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        Lương cơ bản theo công (
                        <span className="font-mono tabular-nums">
                          {selectedRecord.actual_paid_days}/{selectedRecord.standard_days}
                        </span>{' '}
                        ngày
                        {(selectedRecord.paid_leave_days ?? 0) > 0
                          ? `, gồm ${selectedRecord.paid_leave_days} ngày phép hưởng lương`
                          : ''}
                        )
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.prorated_base_salary_vnd)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-2">
                      <span className="text-[#415A54] dark:text-zinc-400">Phụ cấp ăn trưa</span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.allowance_meal_vnd)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-2">
                      <span className="text-[#415A54] dark:text-zinc-400">Phụ cấp đi lại</span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.allowance_transport_vnd)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-2">
                      <span className="text-[#415A54] dark:text-zinc-400">Phụ cấp chức vụ</span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.allowance_position_vnd)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-2">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        Lương làm thêm giờ (OT
                        {(selectedRecord.overtime_hours ?? 0) > 0
                          ? ` · ${selectedRecord.overtime_hours} giờ`
                          : ''}
                        )
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.overtime_pay_vnd)}
                      </span>
                    </div>

                    <div className="flex justify-between gap-2">
                      <span className="text-[#415A54] dark:text-zinc-400">Thưởng KPI tháng</span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.kpi_bonus_vnd)}
                      </span>
                    </div>

                    {(selectedRecord.is_final_settlement ||
                      (selectedRecord.unused_leave_payout_vnd ?? 0) > 0) && (
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-emerald-800 dark:text-emerald-300">
                          + Thanh toán phép năm tồn ({selectedRecord.unused_leave_days ?? 0} ngày)
                        </span>
                        <span className="font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                          +{formatVND(selectedRecord.unused_leave_payout_vnd ?? 0)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between border-t border-[#C6D9D3] pt-2 font-semibold dark:border-zinc-800/80">
                      <span className="text-[#11221E] dark:text-zinc-100">Tổng thu nhập Gross</span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.gross_salary_vnd)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Mandatory Insurance Breakdown */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-transparent">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                      2. Khấu trừ Bảo hiểm bắt buộc (10,5% trên mức đóng{' '}
                      <span className="font-mono tabular-nums">
                        {formatVND(selectedRecord.insurance_base_vnd)}
                      </span>
                      )
                    </h3>
                    {selectedRecord.contract_type === 'PROBATION_2M' ||
                    selectedRecord.insurance_base_vnd === 0 ? (
                      <Badge variant="outline">Miễn đóng 0% (HĐ Thử việc / Kỳ ngắn)</Badge>
                    ) : selectedRecord.base_salary_vnd > formula.insurance_salary_cap_vnd ? (
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        Áp trần 46.800.000 ₫
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        BHXH ({formula.bhxh_employee_rate * 100}%)
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        -{formatVND(selectedRecord.bhxh_employee_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        BHYT ({formula.bhyt_employee_rate * 100}%)
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        -{formatVND(selectedRecord.bhyt_employee_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        BHTN ({formula.bhtn_employee_rate * 100}%)
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        -{formatVND(selectedRecord.bhtn_employee_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#C6D9D3] pt-2 font-medium text-[#11221E] dark:border-zinc-800/80 dark:text-zinc-100">
                      <span>Tổng khấu trừ bảo hiểm</span>
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                        -{formatVND(selectedRecord.total_insurance_employee_vnd)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Progressive 7-Bracket PIT Breakdown */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-transparent">
                  <h3 className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                    3. Giảm trừ gia cảnh &amp; Thuế TNCN lũy tiến 7 bậc
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[#415A54] dark:text-zinc-400">Giảm trừ bản thân</span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        -{formatVND(selectedRecord.personal_deduction_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        Giảm trừ người phụ thuộc ({selectedRecord.dependents_count} người ×{' '}
                        <span className="font-mono tabular-nums">
                          {formatVND(formula.dependent_deduction_vnd)}
                        </span>
                        )
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        -{formatVND(selectedRecord.dependent_deduction_vnd)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#C6D9D3] pt-2 font-medium text-[#11221E] dark:border-zinc-800/80 dark:text-zinc-100">
                      <span>Thu nhập tính thuế</span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        {formatVND(selectedRecord.taxable_income_vnd)}
                      </span>
                    </div>
                  </div>

                  {pitBreakdown.length > 0 ? (
                    <div className="mt-3 overflow-x-auto rounded-[12px] border border-[#C6D9D3] bg-[#FCFEFD] shadow-[0_1px_3px_rgba(17,34,30,0.05)] dark:border-zinc-800/70 dark:bg-transparent">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="bg-[#F2F7F5] dark:bg-zinc-900">
                          <tr className="border-b border-[#C6D9D3] bg-[#F2F7F5] font-semibold text-[#415A54] dark:border-zinc-800/70 dark:bg-zinc-900 dark:text-zinc-400">
                            <th className="px-3 py-2">Bậc thuế</th>
                            <th className="px-3 py-2 text-right">Phần thu nhập</th>
                            <th className="px-3 py-2 text-right">Thuế suất</th>
                            <th className="px-3 py-2 text-right">Tiền thuế</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D5E3DF] dark:divide-zinc-800/60">
                          {pitBreakdown.map((b) => (
                            <tr
                              key={b.level}
                              className="odd:bg-[#FCFEFD] even:bg-[#F5FAF8] hover:bg-[#E8F3EF] dark:odd:bg-transparent dark:even:bg-transparent dark:hover:bg-zinc-900/40"
                            >
                              <td className="px-3 py-1.5 text-[#415A54] dark:text-zinc-300">
                                Bậc {b.level}: {b.label}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[#11221E] dark:text-zinc-200">
                                {formatVND(b.taxableSliceVnd)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[#415A54] dark:text-zinc-300">
                                {b.ratePercent}%
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-medium tabular-nums text-[#11221E] dark:text-zinc-100">
                                {formatVND(b.taxVnd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2.5 rounded-lg border border-[#D5E3DF] bg-[#F2F7F5] px-3 py-2 text-xs text-[#415A54] dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                      Thu nhập sau giảm trừ bằng 0 ₫ — Không phát sinh thuế TNCN phải nộp.
                    </p>
                  )}

                  <div className="mt-2.5 flex justify-between font-medium text-[#11221E] dark:text-zinc-100">
                    <span>Tổng thuế TNCN phải nộp</span>
                    <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                      -{formatVND(selectedRecord.pit_tax_vnd)}
                    </span>
                  </div>
                </div>

                {/* 4. Post-Tax Deductions (Advances & Penalties / Asset Compensation) */}
                <div className="rounded-xl border border-[#C6D9D3] bg-[#FCFEFD] p-4 dark:border-zinc-800/80 dark:bg-transparent">
                  <h3 className="text-xs font-semibold text-[#5C7871] dark:text-zinc-400">
                    4. Khấu trừ tạm ứng &amp; Phạt / Đền bù tài sản
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        Khấu trừ tạm ứng lương
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        -{formatVND(selectedRecord.advance_deduction_vnd ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#415A54] dark:text-zinc-400">
                        Đền bù tài sản / Phạt vi phạm
                      </span>
                      <span className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                        -{formatVND(selectedRecord.penalty_deduction_vnd ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-[#C6D9D3] pt-2 font-medium text-[#11221E] dark:border-zinc-800/80 dark:text-zinc-100">
                      <span>Tổng khấu trừ sau thuế</span>
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                        -
                        {formatVND(
                          (selectedRecord.advance_deduction_vnd ?? 0) +
                            (selectedRecord.penalty_deduction_vnd ?? 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Final Net Salary Card */}
                <div className="flex flex-col gap-1 rounded-xl border border-[#0F766E]/25 bg-[#CBE8E2]/50 p-4 dark:border-teal-400/20 dark:bg-teal-950/30 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-medium text-[#0B4F4A] dark:text-teal-300">
                      Thực lĩnh Net chuyển khoản
                    </div>
                    <div className="mt-0.5 text-xs text-[#415A54] dark:text-zinc-400">
                      {selectedRecord.bank_name} ·{' '}
                      <span className="font-mono tabular-nums">{selectedRecord.bank_account_no}</span>
                      {selectedRecord.paid_at ? (
                        <>
                          {' '}
                          · Đã chi trả ngày{' '}
                          <span className="font-mono tabular-nums">
                            {formatDateVN(selectedRecord.paid_at)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-[#0F766E] dark:text-teal-400">
                    {formatVND(selectedRecord.net_salary_vnd)}
                  </div>
                </div>

                {/* HR / Admin Adjustment Panel */}
                {canManagePayroll && (
                  <div className="space-y-3 rounded-xl border border-[#C6D9D3] bg-[#F2F7F5] p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#11221E] dark:text-zinc-200">
                        {isRowEditable ? (
                          <SlidersHorizontal className="h-4 w-4 text-[#0F766E] dark:text-teal-400" strokeWidth={1.5} />
                        ) : (
                          <Lock className="h-4 w-4 text-[#5C7871] dark:text-zinc-400" strokeWidth={1.5} />
                        )}
                        <span>
                          Điều chỉnh Thưởng KPI, Tạm ứng &amp; Phạt/Đền bù (HR / Quản trị)
                        </span>
                      </div>
                      {!isRowEditable && (
                        <Badge variant="success">Đã khóa sổ (PAID)</Badge>
                      )}
                    </div>

                    {isRowEditable ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <label
                              htmlFor="edit-kpi-bonus"
                              className="text-xs font-medium text-[#415A54] dark:text-zinc-400"
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
                              htmlFor="edit-advance-deduction"
                              className="text-xs font-medium text-[#415A54] dark:text-zinc-400"
                            >
                              Khấu trừ tạm ứng (VND)
                            </label>
                            <Input
                              id="edit-advance-deduction"
                              type="text"
                              inputMode="numeric"
                              value={
                                editAdvanceDigits === ''
                                  ? ''
                                  : formatNumberVN(Number(editAdvanceDigits))
                              }
                              onChange={(e) =>
                                setEditAdvanceDigits(e.target.value.replace(/\D/g, ''))
                              }
                              className="font-mono tabular-nums"
                            />
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="edit-penalty-deduction"
                              className="text-xs font-medium text-[#415A54] dark:text-zinc-400"
                            >
                              Phạt / Đền bù tài sản (VND)
                            </label>
                            <Input
                              id="edit-penalty-deduction"
                              type="text"
                              inputMode="numeric"
                              value={
                                editPenaltyDigits === ''
                                  ? ''
                                  : formatNumberVN(Number(editPenaltyDigits))
                              }
                              onChange={(e) =>
                                setEditPenaltyDigits(e.target.value.replace(/\D/g, ''))
                              }
                              className="font-mono tabular-nums"
                            />
                          </div>
                        </div>

                        {adjustmentPreview && (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#C6D9D3] bg-[#FCFEFD] px-3 py-2 text-xs dark:border-zinc-800 dark:bg-[#121214]">
                            <div className="flex flex-wrap items-center gap-4">
                              <span className="text-[#415A54] dark:text-zinc-400">
                                Gross mới:{' '}
                                <strong className="font-mono tabular-nums text-[#11221E] dark:text-zinc-100">
                                  {formatVND(adjustmentPreview.gross)}
                                </strong>
                              </span>
                              <span className="text-[#415A54] dark:text-zinc-400">
                                Thuế TNCN mới:{' '}
                                <strong className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                                  {formatVND(adjustmentPreview.pit)}
                                </strong>
                              </span>
                              <span className="text-[#415A54] dark:text-zinc-400">
                                Thực lĩnh Net mới:{' '}
                                <strong className="font-mono tabular-nums text-[#0F766E] dark:text-teal-400">
                                  {formatVND(adjustmentPreview.net)}
                                </strong>
                              </span>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleSavePayrollAdjustments}
                            >
                              Lưu điều chỉnh số liệu
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[#415A54] dark:text-zinc-400">
                        Phiếu lương đã phát hành và xác nhận thanh toán (PAID). Mọi số liệu thu nhập, thuế TNCN và khấu trừ đã được niêm phong phục vụ kiểm toán.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="mt-0 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#C6D9D3] px-6 py-4 dark:border-zinc-800">
                <Button variant="outline" onClick={() => setSelectedRecordId(null)}>
                  Đóng
                </Button>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      showToast(
                        `Đã tải phiếu lương ${selectedRecord.payslip_code}`,
                        `${selectedRecord.full_name} — Thực lĩnh ${formatVND(selectedRecord.net_salary_vnd)}`,
                        'success'
                      );
                    }}
                  >
                    <Download className="h-4 w-4" strokeWidth={1.5} />
                    Tải PDF
                  </Button>

                  {canManagePayroll && selectedRecord.payment_status === 'DRAFT_CALCULATED' && (
                    <Button
                      variant="outline"
                      onClick={() => void handleApproveSingleRecord()}
                    >
                      <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                      Duyệt lương
                    </Button>
                  )}

                  {canManagePayroll && selectedRecord.payment_status !== 'PAID' && (
                    <Button
                      variant="primary"
                      onClick={() => void handleMarkPaidSingleRecord()}
                    >
                      <Send className="h-4 w-4" strokeWidth={1.5} />
                      Xác nhận Chi trả (PAID)
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PayrollView;
