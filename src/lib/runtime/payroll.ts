import {
  calculateProgressivePitByPeriod,
  getPitTaxConfigForPeriod,
} from '@/lib/hrm/config';
import {
  MOCK_PAYROLL_FORMULA,
  MOCK_PAYROLL_RECORDS,
} from '@/mock/payroll';
import type {
  MidMonthSalarySplit,
  PayrollRecord,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getMonthlyAttendances,
  recomputeMonthlyAttendance,
} from './attendance-monthly';
import {
  getContracts,
} from './contracts-assets';
import {
  getAllRuntimeEmployees,
} from './core-entities';
import {
  getClearanceChecklists,
} from './offboarding-store';
import {
  getCareerHistories,
  getPerformanceReviews,
} from './performance';
import {
  STORAGE_PAYROLLS_KEY,
  addDaysIso,
  countWeekdaysInRange,
  getMonthBoundsIso,
  readStorageArray,
  writeStorageArray,
} from './storage';

export function getPayrollRecords(periodMonth?: string): PayrollRecord[] {
  const runtimeList = readStorageArray<PayrollRecord>(STORAGE_PAYROLLS_KEY) ?? [];
  const baseList = MOCK_PAYROLL_RECORDS;

  const baseIds = new Set(baseList.map((p) => p.id));
  const baseCodes = new Set(baseList.map((p) => p.payslip_code));

  const mergedBase = baseList.map((baseItem) => {
    const override = runtimeList.find(
      (rt) =>
        rt.id === baseItem.id ||
        rt.payslip_code === baseItem.payslip_code ||
        (rt.employee_code === baseItem.employee_code &&
          rt.period_month === baseItem.period_month &&
          !rt.is_final_settlement)
    );
    return override ?? baseItem;
  });

  const brandNew = runtimeList.filter(
    (rt) =>
      !baseIds.has(rt.id) &&
      !baseCodes.has(rt.payslip_code) &&
      !baseList.some(
        (b) =>
          b.employee_code === rt.employee_code &&
          b.period_month === rt.period_month &&
          !rt.is_final_settlement
      )
  );

  const combined = [...brandNew, ...mergedBase];
  return periodMonth
    ? combined.filter((p) => p.period_month === periodMonth)
    : combined;
}

export function savePayrollRecord(record: PayrollRecord): PayrollRecord {
  const current = readStorageArray<PayrollRecord>(STORAGE_PAYROLLS_KEY) ?? [];
  const idx = current.findIndex(
    (p) =>
      p.id === record.id ||
      p.payslip_code === record.payslip_code ||
      (p.employee_code === record.employee_code &&
        p.period_month === record.period_month &&
        Boolean(p.is_final_settlement) === Boolean(record.is_final_settlement))
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? record : item))
      : [record, ...current];
  writeStorageArray(STORAGE_PAYROLLS_KEY, updated);
  return record;
}

export function calculateMonthlyPayrolls(
  periodMonth = '2026-11',
  actorName = 'Phòng Nhân sự (C&B)'
): PayrollRecord[] {
  recomputeMonthlyAttendance(periodMonth);
  const allEmps = getAllRuntimeEmployees().filter(
    (e) =>
      e.employment_status !== 'PENDING_ONBOARD' &&
      (e.employment_status !== 'RESIGNED' ||
        (e.resigned_date && e.resigned_date.startsWith(periodMonth)))
  );
  const monthlySummaries = getMonthlyAttendances(periodMonth);
  const contracts = getContracts();
  const existingPayrolls = getPayrollRecords(periodMonth);
  const reviews = getPerformanceReviews();
  const clearances = getClearanceChecklists();
  const { firstDay, lastDay } = getMonthBoundsIso(periodMonth);
  const totalWeekdays = Math.max(1, countWeekdaysInRange(firstDay, lastDay));

  const computedList: PayrollRecord[] = [];

  for (const emp of allEmps) {
    const existingRec = existingPayrolls.find(
      (p) => p.employee_code === emp.employee_code && !p.is_final_settlement
    );
    if (existingRec?.payment_status === 'PAID') {
      computedList.push(existingRec);
      continue;
    }

    const att = monthlySummaries.find(
      (m) => m.employee_code === emp.employee_code || m.employee_id === emp.id
    );
    const standardDays =
      att?.standard_work_days ?? MOCK_PAYROLL_FORMULA.standard_work_days_per_month;
    const paidLeaveDays = att?.paid_leave_days ?? 0;
    const unpaidLeaveDays = att?.unpaid_leave_days ?? 0;
    const actualWorkDays = att?.actual_work_days ?? standardDays - paidLeaveDays - unpaidLeaveDays;
    const actualPaidDays = Math.min(
      standardDays,
      Math.max(0, actualWorkDays + paidLeaveDays)
    );

    const activeContract = contracts.find(
      (c) =>
        (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
        c.status !== 'EXPIRED' &&
        !c.is_addendum
    );
    const isProbation =
      emp.employment_status === 'PROBATION' ||
      activeContract?.contract_type === 'PROBATION_2M' ||
      (emp.contract_type === 'PROBATION_2M' && emp.employment_status !== 'OFFICIAL' && emp.employment_status !== 'ACTIVE');

    // Check CareerHistoryEntry for mid-month salary split inside periodMonth
    const empHistories = getCareerHistories(emp.id).filter(
      (h) =>
        h.effective_date.startsWith(periodMonth) &&
        h.old_salary_vnd !== h.new_salary_vnd
    );
    const splitHistory = empHistories[0] ?? null;

    let proratedBaseVnd = Math.round(
      (emp.base_salary_vnd * actualPaidDays) / standardDays
    );
    let midMonthSplit: MidMonthSalarySplit | null = null;

    if (splitHistory) {
      const dayBeforeEff = addDaysIso(splitHistory.effective_date, -1);
      const weekdaysOld =
        splitHistory.effective_date > firstDay
          ? countWeekdaysInRange(firstDay, dayBeforeEff)
          : 0;
      const weekdaysNew = Math.max(0, totalWeekdays - weekdaysOld);

      if (weekdaysOld > 0 && weekdaysNew > 0) {
        const daysAtOld =
          Math.round((actualPaidDays * (weekdaysOld / totalWeekdays)) * 2) / 2;
        const daysAtNew = Math.max(
          0,
          Number((actualPaidDays - daysAtOld).toFixed(1))
        );
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
    const totalOtHours = weekdayOt + weekendOt + holidayOt;
    const computedOtPay = Math.round(
      weekdayOt * hourlyWage * 1.5 +
        weekendOt * hourlyWage * 2.0 +
        holidayOt * hourlyWage * 3.0
    );
    const overtimePayVnd =
      att ? computedOtPay : existingRec?.overtime_pay_vnd ?? 0;

    const latestApprovedReview = reviews.find(
      (r) =>
        (r.employee_id === emp.id || r.employee_code === emp.employee_code) &&
        r.status === 'APPROVED' &&
        typeof r.suggested_bonus_vnd === 'number'
    );
    const kpiBonusVnd =
      existingRec && existingRec.kpi_bonus_vnd > 0
        ? existingRec.kpi_bonus_vnd
        : (latestApprovedReview?.suggested_bonus_vnd ?? existingRec?.kpi_bonus_vnd ?? 0);

    const allowanceRatio = actualPaidDays > 0 ? 1 : 0;
    const mealVnd = emp.allowance_meal_vnd * allowanceRatio;
    const transportVnd = emp.allowance_transport_vnd * allowanceRatio;
    const positionVnd = emp.allowance_position_vnd * allowanceRatio;

    const grossSalaryVnd =
      proratedBaseVnd +
      mealVnd +
      transportVnd +
      positionVnd +
      overtimePayVnd +
      kpiBonusVnd;

    const insuranceBaseVnd = isProbation
      ? 0
      : Math.min(
          emp.base_salary_vnd,
          MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd
        );
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

    const empClearance = clearances.find(
      (cl) => cl.employee_code === emp.employee_code || cl.employee_id === emp.id
    );
    const advanceDeductionVnd =
      existingRec?.advance_deduction_vnd ??
      empClearance?.advance_deduction_vnd ??
      0;
    const penaltyDeductionVnd =
      existingRec?.penalty_deduction_vnd ?? empClearance?.total_penalty_vnd ?? 0;

    const netSalaryVnd = Math.max(
      0,
      grossSalaryVnd -
        totalInsuranceVnd -
        pitTaxVnd -
        advanceDeductionVnd -
        penaltyDeductionVnd
    );

    const employerInsuranceVnd = isProbation
      ? 0
      : Math.round(insuranceBaseVnd * 0.235);
    const employerTotalCostVnd = grossSalaryVnd + employerInsuranceVnd;

    const nextRecord: PayrollRecord = {
      id:
        existingRec?.id ??
        `pay-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
      payslip_code:
        existingRec?.payslip_code ??
        `PS-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
      period_month: periodMonth,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      position_name: emp.position_name,
      bank_name: emp.bank_name || 'Techcombank',
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
      kpi_bonus_vnd: kpiBonusVnd,
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
      payment_status: existingRec?.payment_status ?? 'DRAFT_CALCULATED',
      paid_at: existingRec?.paid_at ?? null,
      contract_type: activeContract?.contract_type ?? emp.contract_type,
      paid_leave_days: paidLeaveDays,
      unpaid_leave_days: unpaidLeaveDays,
      overtime_hours: totalOtHours,
      advance_deduction_vnd: advanceDeductionVnd,
      penalty_deduction_vnd: penaltyDeductionVnd,
      is_final_settlement: false,
      mid_month_split: midMonthSplit,
      calculation_note: isProbation
        ? 'Hợp đồng thử việc (PROBATION_2M): miễn khấu trừ BHXH/BHYT/BHTN 10.5%.'
        : midMonthSplit
          ? `Tách lương giữa kỳ từ ${midMonthSplit.effective_date} theo ${midMonthSplit.decision_no || 'Quyết định điều chỉnh'}.`
          : undefined,
    };

    savePayrollRecord(nextRecord);
    computedList.push(nextRecord);
  }

  recordAuditLog({
    actor_name: actorName,
    actor_code: 'CB-ENGINE',
    actor_role: 'HR_MANAGER',
    action: 'CALCULATE_PAYROLL',
    target: `Bảng lương kỳ ${periodMonth} (${computedList.length} nhân sự)`,
    detail: `Tổng hợp công thực tế, phép năm, tăng ca, tách lương giữa tháng (mid-month split), BHXH 10.5% (miễn thử việc) và thuế TNCN ${getPitTaxConfigForPeriod(periodMonth).bracket_count} bậc.`,
  });

  return getPayrollRecords(periodMonth);
}
