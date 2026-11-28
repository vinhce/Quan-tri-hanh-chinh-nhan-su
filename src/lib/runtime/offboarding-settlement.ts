import {
  calculateProgressivePitByPeriod,
  getPitTaxConfigForPeriod,
} from '@/lib/hrm/config';
import {
  MOCK_PAYROLL_FORMULA,
} from '@/mock/payroll';
import type {
  Employee,
  PayrollRecord,
  ResignationRequest,
  SystemUserAccount,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  getMonthlyAttendances,
} from './attendance-monthly';
import {
  getContracts,
  saveContract,
} from './contracts-assets';
import {
  getAllRuntimeEmployees,
  saveRuntimeEmployee,
} from './core-entities';
import {
  getLeaveBalances,
  saveLeaveBalance,
} from './leave-requests';
import {
  pushNotification,
} from './notifications';
import {
  checkClearance100Percent,
} from './offboarding-clearance';
import {
  getClearanceChecklists,
  getResignations,
  saveResignationInternal,
} from './offboarding-store';
import {
  savePayrollRecord,
} from './payroll';
import {
  countWeekdaysInRange,
  getMonthBoundsIso,
} from './storage';
import {
  setUserActiveByEmployee,
} from './users-auth';

export function executeFinalSettlement(params: {
  resignationId: string;
  isRehireable: boolean;
  rehireNote?: string;
  actorName: string;
}): {
  resignation: ResignationRequest;
  finalPayroll: PayrollRecord;
  employee: Employee;
  lockedUser: SystemUserAccount;
} {
  const resignation = getResignations().find(
    (r) =>
      r.id === params.resignationId ||
      r.resignation_code === params.resignationId
  );
  if (!resignation) {
    throw new Error('Không tìm thấy hồ sơ thôi việc cần quyết toán.');
  }
  if (resignation.status === 'COMPLETED') {
    throw new Error('Hồ sơ thôi việc này đã hoàn tất quyết toán cuối cùng.');
  }

  // HARD GATE: Must pass 100% of Clearance & 3-way Handover & Manager Re-assign
  const gate = checkClearance100Percent(resignation.id);
  if (!gate.is_100_percent_cleared) {
    throw new Error(
      `Chặn Quyết toán cuối cùng — Hồ sơ mới đạt ${gate.completion_percent}% (yêu cầu đủ 100%): ${gate.blocking_reasons.join('; ')}.`
    );
  }

  const emp = getAllRuntimeEmployees().find(
    (e) =>
      e.id === resignation.employee_id ||
      e.employee_code === resignation.employee_code
  );
  if (!emp) {
    throw new Error('Không tìm thấy hồ sơ nhân sự cần quyết toán nghỉ việc.');
  }

  const clearance = getClearanceChecklists(resignation.id)[0];
  const nowIso = new Date().toISOString();
  const approvedLastDay =
    resignation.approved_last_day || nowIso.slice(0, 10);
  const periodMonth = approvedLastDay.slice(0, 7);
  const yearNum = Number.parseInt(approvedLastDay.slice(0, 4), 10) || 2026;
  const { firstDay } = getMonthBoundsIso(periodMonth);

  const att = getMonthlyAttendances(periodMonth).find(
    (m) => m.employee_code === emp.employee_code || m.employee_id === emp.id
  );
  const standardDays =
    att?.standard_work_days ?? MOCK_PAYROLL_FORMULA.standard_work_days_per_month;
  const estimatedDaysUpToLast = Math.min(
    standardDays,
    Math.max(1, countWeekdaysInRange(firstDay, approvedLastDay))
  );
  const actualPaidDays = att
    ? Math.min(
        standardDays,
        Math.max(1, att.actual_work_days + att.paid_leave_days)
      )
    : estimatedDaysUpToLast;

  // Unused annual leave payout
  const leaveBal = getLeaveBalances(yearNum).find(
    (b) => b.employee_id === emp.id || b.employee_code === emp.employee_code
  );
  const unusedLeaveDays = Math.max(0, leaveBal?.remaining_days ?? 0);
  const dailyWage = emp.base_salary_vnd / standardDays;
  const unusedLeavePayoutVnd = Math.round(unusedLeaveDays * dailyWage);

  if (leaveBal && unusedLeaveDays > 0) {
    saveLeaveBalance({
      ...leaveBal,
      remaining_days: 0,
      pending_days: 0,
    });
  }

  const proratedBaseVnd = Math.round(
    (emp.base_salary_vnd * actualPaidDays) / standardDays
  );
  const allowanceRatio = actualPaidDays / standardDays;
  const mealVnd = Math.round(emp.allowance_meal_vnd * allowanceRatio);
  const transportVnd = Math.round(emp.allowance_transport_vnd * allowanceRatio);
  const positionVnd = Math.round(emp.allowance_position_vnd * allowanceRatio);

  const hourlyWage = emp.base_salary_vnd / (standardDays * 8);
  const otPayVnd = att
    ? Math.round(
        att.overtime_hours_weekday * hourlyWage * 1.5 +
          att.overtime_hours_weekend * hourlyWage * 2.0 +
          att.overtime_hours_holiday * hourlyWage * 3.0
      )
    : 0;

  const grossSalaryVnd =
    proratedBaseVnd +
    mealVnd +
    transportVnd +
    positionVnd +
    otPayVnd +
    unusedLeavePayoutVnd;

  const isProbation =
    resignation.contract_type === 'PROBATION_2M' ||
    emp.employment_status === 'PROBATION';
  const unpaidDaysInMonth = Math.max(0, standardDays - actualPaidDays);
  const exemptInsuranceForShortMonth = unpaidDaysInMonth >= 14;

  const insuranceBaseVnd =
    isProbation || exemptInsuranceForShortMonth
      ? 0
      : Math.min(
          emp.base_salary_vnd,
          MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd
        );
  const bhxhVnd = Math.round(
    insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhxh_employee_rate
  );
  const bhytVnd = Math.round(
    insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhyt_employee_rate
  );
  const bhtnVnd = Math.round(
    insuranceBaseVnd * MOCK_PAYROLL_FORMULA.bhtn_employee_rate
  );
  const totalInsuranceVnd = bhxhVnd + bhytVnd + bhtnVnd;

  const settlementPitConfig = getPitTaxConfigForPeriod(periodMonth);
  const personalDeduction = settlementPitConfig.personal_deduction_vnd;
  const dependentDeduction =
    emp.dependents_count * settlementPitConfig.dependent_deduction_vnd;
  const taxableIncomeVnd = Math.max(
    0,
    grossSalaryVnd - totalInsuranceVnd - personalDeduction - dependentDeduction
  );
  const pitTaxVnd = calculateProgressivePitByPeriod(taxableIncomeVnd, periodMonth);

  const penaltyDeductionVnd = clearance?.total_penalty_vnd ?? 0;
  const advanceDeductionVnd = clearance?.advance_deduction_vnd ?? 0;
  const netSalaryVnd = Math.max(
    0,
    grossSalaryVnd -
      totalInsuranceVnd -
      pitTaxVnd -
      penaltyDeductionVnd -
      advanceDeductionVnd
  );
  const employerTotalCostVnd =
    grossSalaryVnd + Math.round(insuranceBaseVnd * 0.235);

  const finalPayroll: PayrollRecord = {
    id: `pay-final-${Date.now()}`,
    payslip_code: `PS-FINAL-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
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
    overtime_pay_vnd: otPayVnd,
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
    payment_status: 'PAID',
    paid_at: nowIso,
    contract_type: resignation.contract_type,
    unused_leave_days: unusedLeaveDays,
    unused_leave_payout_vnd: unusedLeavePayoutVnd,
    penalty_deduction_vnd: penaltyDeductionVnd,
    advance_deduction_vnd: advanceDeductionVnd,
    is_final_settlement: true,
    calculation_note: `Quyết toán cuối cùng đến ngày ${approvedLastDay}: +${unusedLeaveDays} ngày phép tồn (${unusedLeavePayoutVnd.toLocaleString('vi-VN')} đ), khấu trừ bồi thường tài sản ${penaltyDeductionVnd.toLocaleString('vi-VN')} đ, tạm ứng ${advanceDeductionVnd.toLocaleString('vi-VN')} đ.`,
  };
  savePayrollRecord(finalPayroll);

  // Expire all active contracts of this employee
  for (const contract of getContracts()) {
    if (
      (contract.employee_id === emp.id ||
        contract.employee_code === emp.employee_code) &&
      contract.status !== 'EXPIRED'
    ) {
      saveContract({
        ...contract,
        status: 'EXPIRED',
        end_date: approvedLastDay,
        days_until_expiry: 0,
      });
    }
  }

  // Transition Employee to RESIGNED while preserving 100% historical records
  const resignedEmployee: Employee = {
    ...emp,
    employment_status: 'RESIGNED',
    resigned_date: approvedLastDay,
    approved_last_day: approvedLastDay,
    contract_status: 'EXPIRED',
    is_rehireable: params.isRehireable,
    rehire_note:
      params.rehireNote?.trim() ||
      (params.isRehireable
        ? 'Nghỉ việc đúng quy định, bàn giao tốt — đủ điều kiện tuyển dụng lại (Re-hire).'
        : 'Không khuyến nghị tuyển dụng lại theo đánh giá khi thanh lý hợp đồng.'),
  };
  saveRuntimeEmployee(resignedEmployee);

  // Lock SystemUserAccount immediately (is_active = false, account_status = 'LOCKED')
  const lockedUser = setUserActiveByEmployee({
    employeeId: emp.id,
    employeeCode: emp.employee_code,
    email: emp.email,
    fullName: emp.full_name,
    departmentName: emp.department_name,
    positionName: emp.position_name,
    roleCode: emp.role_code,
    isActive: false,
    targetStatus: 'LOCKED',
    reason: `Đã tất toán hợp đồng & nghỉ việc từ ngày ${approvedLastDay}`,
    actorName: params.actorName,
  });

  const completedResignation = saveResignationInternal({
    ...resignation,
    status: 'COMPLETED',
    is_rehireable: params.isRehireable,
    rehire_note: resignedEmployee.rehire_note,
    final_payslip_id: finalPayroll.id,
    settled_at: nowIso,
  });

  pushNotification({
    title: `Hoàn tất Quyết toán nghỉ việc: ${emp.full_name} (${emp.employee_code})`,
    message: `Phiếu lương quyết toán ${finalPayroll.payslip_code} (${netSalaryVnd.toLocaleString('vi-VN')} đ) đã khóa & thanh toán. Nhân sự chuyển sang RESIGNED và tài khoản đã khóa.`,
    category: 'OFFBOARDING',
    target_roles: ['HR_MANAGER', 'DIRECTOR', 'SUPER_ADMIN'],
    nav_id: 'offboarding',
    entity_id: completedResignation.id,
  });

  recordAuditLog({
    actor_name: params.actorName,
    actor_code: 'HR-SETTLE',
    actor_role: 'HR_MANAGER',
    action: 'FINAL_SETTLEMENT',
    target: `${emp.employee_code} · ${finalPayroll.payslip_code}`,
    detail: `Hoàn tất Quyết toán cuối cùng (Net: ${netSalaryVnd.toLocaleString('vi-VN')} đ, phép tồn: ${unusedLeaveDays} ngày, phạt TS: ${penaltyDeductionVnd.toLocaleString('vi-VN')} đ). Chuyển sang RESIGNED (is_rehireable=${params.isRehireable}) và khóa đăng nhập.`,
  });

  return {
    resignation: completedResignation,
    finalPayroll,
    employee: resignedEmployee,
    lockedUser,
  };
}

export function checkCandidateRehireWarning(params: {
  email?: string;
  nationalId?: string;
  phone?: string;
}): {
  matchedFormerEmployee: Employee | null;
  isRehireable: boolean | null;
  rehireNote?: string;
} {
  const emailNeedle = params.email?.trim().toLowerCase();
  const idNeedle = params.nationalId?.trim();
  const phoneNeedle = params.phone?.trim();

  const former =
    getAllRuntimeEmployees().find((e) => {
      if (e.employment_status !== 'RESIGNED') return false;
      if (
        emailNeedle &&
        (e.email.toLowerCase() === emailNeedle ||
          e.personal_email?.toLowerCase() === emailNeedle)
      ) {
        return true;
      }
      if (idNeedle && e.national_id === idNeedle) return true;
      if (phoneNeedle && e.phone === phoneNeedle) return true;
      return false;
    }) ?? null;

  if (!former) {
    return { matchedFormerEmployee: null, isRehireable: null };
  }

  return {
    matchedFormerEmployee: former,
    isRehireable: former.is_rehireable ?? true,
    rehireNote: former.rehire_note,
  };
}
