import { PayrollFormulaConfig, PayrollRecord } from './types';

export const MOCK_PAYROLL_FORMULA: PayrollFormulaConfig = {
  bhxh_employee_rate: 0.08,
  bhyt_employee_rate: 0.015,
  bhtn_employee_rate: 0.01,
  total_insurance_employee_rate: 0.105,
  bhxh_employer_rate: 0.175,
  bhyt_employer_rate: 0.03,
  bhtn_employer_rate: 0.01,
  union_fee_employer_rate: 0.02,
  insurance_salary_cap_vnd: 46800000,
  personal_deduction_vnd: 11000000,
  dependent_deduction_vnd: 4400000,
  standard_work_days_per_month: 22,
};

export const PIT_TAX_BRACKETS = [
  { level: 1, label: 'Đến 5 triệu VND', max_taxable_vnd: 5000000, rate_percent: 5, quick_subtract_vnd: 0 },
  { level: 2, label: 'Trên 5 đến 10 triệu VND', max_taxable_vnd: 10000000, rate_percent: 10, quick_subtract_vnd: 250000 },
  { level: 3, label: 'Trên 10 đến 18 triệu VND', max_taxable_vnd: 18000000, rate_percent: 15, quick_subtract_vnd: 750000 },
  { level: 4, label: 'Trên 18 đến 32 triệu VND', max_taxable_vnd: 32000000, rate_percent: 20, quick_subtract_vnd: 1650000 },
  { level: 5, label: 'Trên 32 đến 52 triệu VND', max_taxable_vnd: 52000000, rate_percent: 25, quick_subtract_vnd: 3250000 },
  { level: 6, label: 'Trên 52 đến 80 triệu VND', max_taxable_vnd: 80000000, rate_percent: 30, quick_subtract_vnd: 5850000 },
  { level: 7, label: 'Trên 80 triệu VND', max_taxable_vnd: null, rate_percent: 35, quick_subtract_vnd: 9850000 },
];

export function calculateProgressivePitVnd(taxableIncomeVnd: number): number {
  if (taxableIncomeVnd <= 0) return 0;
  if (taxableIncomeVnd <= 5000000) return Math.round(taxableIncomeVnd * 0.05);
  if (taxableIncomeVnd <= 10000000) return Math.round(taxableIncomeVnd * 0.1 - 250000);
  if (taxableIncomeVnd <= 18000000) return Math.round(taxableIncomeVnd * 0.15 - 750000);
  if (taxableIncomeVnd <= 32000000) return Math.round(taxableIncomeVnd * 0.2 - 1650000);
  if (taxableIncomeVnd <= 52000000) return Math.round(taxableIncomeVnd * 0.25 - 3250000);
  if (taxableIncomeVnd <= 80000000) return Math.round(taxableIncomeVnd * 0.3 - 5850000);
  return Math.round(taxableIncomeVnd * 0.35 - 9850000);
}

function buildPayrollRecord(params: {
  id: string;
  payslip_code: string;
  period_month: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name: string;
  position_name: string;
  bank_name: string;
  bank_account_no: string;
  standard_days: number;
  actual_paid_days: number;
  dependents_count: number;
  base_salary_vnd: number;
  allowance_meal_vnd: number;
  allowance_transport_vnd: number;
  allowance_position_vnd: number;
  overtime_pay_vnd: number;
  kpi_bonus_vnd: number;
  payment_status: 'PAID' | 'APPROVED' | 'DRAFT_CALCULATED';
  paid_at: string | null;
}): PayrollRecord {
  const prorated_base_salary_vnd = Math.round(
    (params.base_salary_vnd * params.actual_paid_days) / params.standard_days
  );
  const gross_salary_vnd =
    prorated_base_salary_vnd +
    params.allowance_meal_vnd +
    params.allowance_transport_vnd +
    params.allowance_position_vnd +
    params.overtime_pay_vnd +
    params.kpi_bonus_vnd;

  const insurance_base_vnd = Math.min(
    params.base_salary_vnd,
    MOCK_PAYROLL_FORMULA.insurance_salary_cap_vnd
  );
  const bhxh_employee_vnd = Math.round(insurance_base_vnd * MOCK_PAYROLL_FORMULA.bhxh_employee_rate);
  const bhyt_employee_vnd = Math.round(insurance_base_vnd * MOCK_PAYROLL_FORMULA.bhyt_employee_rate);
  const bhtn_employee_vnd = Math.round(insurance_base_vnd * MOCK_PAYROLL_FORMULA.bhtn_employee_rate);
  const total_insurance_employee_vnd = bhxh_employee_vnd + bhyt_employee_vnd + bhtn_employee_vnd;

  const personal_deduction_vnd = MOCK_PAYROLL_FORMULA.personal_deduction_vnd;
  const dependent_deduction_vnd =
    params.dependents_count * MOCK_PAYROLL_FORMULA.dependent_deduction_vnd;

  const raw_taxable =
    gross_salary_vnd -
    total_insurance_employee_vnd -
    personal_deduction_vnd -
    dependent_deduction_vnd;
  const taxable_income_vnd = Math.max(0, raw_taxable);
  const pit_tax_vnd = calculateProgressivePitVnd(taxable_income_vnd);
  const net_salary_vnd = gross_salary_vnd - total_insurance_employee_vnd - pit_tax_vnd;

  const employer_insurance_vnd = Math.round(insurance_base_vnd * 0.235);
  const employer_total_cost_vnd = gross_salary_vnd + employer_insurance_vnd;

  return {
    ...params,
    prorated_base_salary_vnd,
    gross_salary_vnd,
    insurance_base_vnd,
    bhxh_employee_vnd,
    bhyt_employee_vnd,
    bhtn_employee_vnd,
    total_insurance_employee_vnd,
    personal_deduction_vnd,
    dependent_deduction_vnd,
    taxable_income_vnd,
    pit_tax_vnd,
    net_salary_vnd,
    employer_total_cost_vnd,
  };
}

export const MOCK_PAYROLL_RECORDS: PayrollRecord[] = [
  buildPayrollRecord({
    id: 'pay-202611-001',
    payslip_code: 'PS-202611-001',
    period_month: '2026-11',
    employee_id: 'emp-001',
    employee_code: 'NV-2024-001',
    full_name: 'Nguyễn Văn An',
    department_name: 'Ban Điều hành',
    position_name: 'Quản trị Hệ thống Cấp cao',
    bank_name: 'Vietcombank',
    bank_account_no: '0071000891234',
    standard_days: 22,
    actual_paid_days: 22,
    dependents_count: 2,
    base_salary_vnd: 40600000,
    allowance_meal_vnd: 1200000,
    allowance_transport_vnd: 1500000,
    allowance_position_vnd: 6000000,
    overtime_pay_vnd: 0,
    kpi_bonus_vnd: 5000000,
    payment_status: 'APPROVED',
    paid_at: null,
  }),
  buildPayrollRecord({
    id: 'pay-202611-002',
    payslip_code: 'PS-202611-002',
    period_month: '2026-11',
    employee_id: 'emp-002',
    employee_code: 'NV-2024-002',
    full_name: 'Trần Thị Bích Ngọc',
    department_name: 'Phòng Nhân sự & Hành chính',
    position_name: 'Trưởng phòng Nhân sự & Hành chính',
    bank_name: 'Techcombank',
    bank_account_no: '19034567891011',
    standard_days: 22,
    actual_paid_days: 22,
    dependents_count: 1,
    base_salary_vnd: 29400000,
    allowance_meal_vnd: 1200000,
    allowance_transport_vnd: 1000000,
    allowance_position_vnd: 4500000,
    overtime_pay_vnd: 0,
    kpi_bonus_vnd: 3500000,
    payment_status: 'APPROVED',
    paid_at: null,
  }),
  buildPayrollRecord({
    id: 'pay-202611-003',
    payslip_code: 'PS-202611-003',
    period_month: '2026-11',
    employee_id: 'emp-003',
    employee_code: 'NV-2024-003',
    full_name: 'Lê Hoàng Nam',
    department_name: 'Khối Công nghệ',
    position_name: 'Trưởng khối Công nghệ',
    bank_name: 'MBBank',
    bank_account_no: '0310101293847',
    standard_days: 22,
    actual_paid_days: 22,
    dependents_count: 2,
    base_salary_vnd: 36400000,
    allowance_meal_vnd: 1200000,
    allowance_transport_vnd: 1200000,
    allowance_position_vnd: 5500000,
    overtime_pay_vnd: 0,
    kpi_bonus_vnd: 4000000,
    payment_status: 'APPROVED',
    paid_at: null,
  }),
  buildPayrollRecord({
    id: 'pay-202611-004',
    payslip_code: 'PS-202611-004',
    period_month: '2026-11',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_name: 'Kỹ sư Phần mềm Cao cấp (Senior Fullstack)',
    bank_name: 'VietinBank',
    bank_account_no: '102938475610',
    standard_days: 22,
    actual_paid_days: 22,
    dependents_count: 1,
    base_salary_vnd: 22800000,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 600000,
    allowance_position_vnd: 2000000,
    overtime_pay_vnd: 5850000,
    kpi_bonus_vnd: 2500000,
    payment_status: 'DRAFT_CALCULATED',
    paid_at: null,
  }),
  buildPayrollRecord({
    id: 'pay-202611-005',
    payslip_code: 'PS-202611-005',
    period_month: '2026-11',
    employee_id: 'emp-005',
    employee_code: 'NV-2024-005',
    full_name: 'Vũ Thị Mai Phương',
    department_name: 'Phòng Dữ liệu & AI',
    position_name: 'Trưởng nhóm Kỹ thuật Dữ liệu & AI',
    bank_name: 'Techcombank',
    bank_account_no: '19029384756123',
    standard_days: 22,
    actual_paid_days: 22,
    dependents_count: 1,
    base_salary_vnd: 31500000,
    allowance_meal_vnd: 1200000,
    allowance_transport_vnd: 1000000,
    allowance_position_vnd: 3500000,
    overtime_pay_vnd: 2400000,
    kpi_bonus_vnd: 4000000,
    payment_status: 'APPROVED',
    paid_at: null,
  }),
  buildPayrollRecord({
    id: 'pay-202611-006',
    payslip_code: 'PS-202611-006',
    period_month: '2026-11',
    employee_id: 'emp-006',
    employee_code: 'NV-2024-006',
    full_name: 'Đặng Quốc Khánh',
    department_name: 'Phòng Tài chính - Kế toán',
    position_name: 'Kế toán trưởng',
    bank_name: 'Vietcombank',
    bank_account_no: '0071009988776',
    standard_days: 22,
    actual_paid_days: 22,
    dependents_count: 2,
    base_salary_vnd: 26600000,
    allowance_meal_vnd: 1200000,
    allowance_transport_vnd: 800000,
    allowance_position_vnd: 4000000,
    overtime_pay_vnd: 0,
    kpi_bonus_vnd: 3000000,
    payment_status: 'APPROVED',
    paid_at: null,
  }),
  buildPayrollRecord({
    id: 'pay-202611-008',
    payslip_code: 'PS-202611-008',
    period_month: '2026-11',
    employee_id: 'emp-008',
    employee_code: 'NV-2025-008',
    full_name: 'Ngô Thanh Hà',
    department_name: 'Phòng Nhân sự & Hành chính',
    position_name: 'Chuyên viên Tiền lương & Phúc lợi (C&B)',
    bank_name: 'Techcombank',
    bank_account_no: '19038899001122',
    standard_days: 22,
    actual_paid_days: 22,
    dependents_count: 0,
    base_salary_vnd: 13000000,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 500000,
    allowance_position_vnd: 0,
    overtime_pay_vnd: 1260000,
    kpi_bonus_vnd: 1500000,
    payment_status: 'APPROVED',
    paid_at: null,
  }),
  buildPayrollRecord({
    id: 'pay-202611-009',
    payslip_code: 'PS-202611-009',
    period_month: '2026-11',
    employee_id: 'emp-009',
    employee_code: 'NV-2025-009',
    full_name: 'Bùi Trọng Nghĩa',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    position_name: 'Kỹ sư Giao diện (Frontend Engineer)',
    bank_name: 'Vietcombank',
    bank_account_no: '0381000456789',
    standard_days: 22,
    actual_paid_days: 21,
    dependents_count: 0,
    base_salary_vnd: 16800000,
    allowance_meal_vnd: 900000,
    allowance_transport_vnd: 600000,
    allowance_position_vnd: 0,
    overtime_pay_vnd: 3150000,
    kpi_bonus_vnd: 1000000,
    payment_status: 'DRAFT_CALCULATED',
    paid_at: null,
  }),
];

export const MOCK_PERSONAL_PAYSLIP: PayrollRecord = MOCK_PAYROLL_RECORDS[3];
