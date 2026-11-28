export const HRM_CONFIG = {
  // Recruitment (ATS) Constants
  DIRECTOR_APPROVAL_HEADCOUNT_THRESHOLD: 3,
  DIRECTOR_APPROVAL_SALARY_THRESHOLD_VND: 50_000_000,
  OFFER_EXPIRY_DAYS: 7,
  MAX_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  ALLOWED_CV_MIMES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  ALLOWED_CV_EXTENSIONS: ['.pdf', '.doc', '.docx'],
  AUTO_ARCHIVE_HIRED_DAYS: 3,
  DEFAULT_TIMEZONE: 'Asia/Ho_Chi_Minh',

  // Stage 1: Pre-boarding, Onboarding & Probation Constants
  PREBOARDING_TOKEN_EXPIRY_DAYS: 7,
  PROBATION_OTHER_MAX_DAYS: 6,
  PROBATION_SHORT_DAYS: 30,
  PROBATION_DEFAULT_DAYS: 60,
  PROBATION_DEFAULT_SALARY_PERCENT: 85,
  OFFICIAL_SALARY_PERCENT: 100,
  PROBATION_EXPIRY_ALERT_DAYS: 15,
  CONTRACT_EXPIRY_ALERT_DAYS: 30,
  SALARY_REVIEW_INTERVAL_MONTHS: 6,

  // Stage 2: Attendance, Leave, OT & Payroll (Vietnam Labor Law & Tax)
  STANDARD_WORK_START: '08:30',
  STANDARD_WORK_END: '17:30',
  LATE_GRACE_MINUTES: 15,
  HALF_DAY_THRESHOLD_MINUTES: 120,
  STANDARD_MONTHLY_WORKDAYS: 22,
  ANNUAL_LEAVE_DEFAULT_DAYS: 12,
  DIRECTOR_LEAVE_APPROVAL_DAYS_THRESHOLD: 3,
  OT_MULTIPLIER_WEEKDAY: 1.5,
  OT_MULTIPLIER_WEEKEND: 2.0,
  OT_MULTIPLIER_HOLIDAY: 3.0,
  BHXH_EMPLOYEE_RATE: 0.105, // 8% BHXH + 1.5% BHYT + 1% BHTN
  BHXH_SALARY_CAP_VND: 46_800_000,
  PIT_PERSONAL_DEDUCTION_VND: 15_500_000, // Kỳ tính thuế >= 2026 (NQ 110/2025/UBTVQH15)
  PIT_DEPENDENT_DEDUCTION_VND: 6_200_000, // Kỳ tính thuế >= 2026 (NQ 110/2025/UBTVQH15)

  // Stage 3: Performance & Career Progression
  PROMOTION_DIRECTOR_SALARY_THRESHOLD_VND: 50_000_000,

  // Stage 4: Offboarding Legal Notice Minimums (Vietnam Labor Code Art. 27 & 35)
  NOTICE_DAYS_PROBATION: 3,
  NOTICE_DAYS_FIXED_TERM: 30,
  NOTICE_DAYS_INDEFINITE: 45,
} as const;

export interface PitTaxBracket {
  level: number;
  label: string;
  max_taxable_vnd: number | null;
  rate_percent: number;
  quick_subtract_vnd: number;
}

export interface PitTaxScheduleConfig {
  tax_year: 2025 | 2026;
  effective_from: string;
  legal_basis: string;
  personal_deduction_vnd: number;
  personal_deduction_annual_vnd: number;
  dependent_deduction_vnd: number;
  bracket_count: number;
  brackets: readonly PitTaxBracket[];
}

export const PIT_TAX_SCHEDULES: Readonly<Record<'legacy_2025' | 'reform_2026', PitTaxScheduleConfig>> = {
  legacy_2025: {
    tax_year: 2025,
    effective_from: '2020-07-01',
    legal_basis: 'Nghị quyết 954/2020/UBTVQH14 & Luật Thuế TNCN 2007',
    personal_deduction_vnd: 11_000_000,
    personal_deduction_annual_vnd: 132_000_000,
    dependent_deduction_vnd: 4_400_000,
    bracket_count: 7,
    brackets: [
      { level: 1, label: 'Đến 5 triệu VND', max_taxable_vnd: 5_000_000, rate_percent: 5, quick_subtract_vnd: 0 },
      { level: 2, label: 'Trên 5 đến 10 triệu VND', max_taxable_vnd: 10_000_000, rate_percent: 10, quick_subtract_vnd: 250_000 },
      { level: 3, label: 'Trên 10 đến 18 triệu VND', max_taxable_vnd: 18_000_000, rate_percent: 15, quick_subtract_vnd: 750_000 },
      { level: 4, label: 'Trên 18 đến 32 triệu VND', max_taxable_vnd: 32_000_000, rate_percent: 20, quick_subtract_vnd: 1_650_000 },
      { level: 5, label: 'Trên 32 đến 52 triệu VND', max_taxable_vnd: 52_000_000, rate_percent: 25, quick_subtract_vnd: 3_250_000 },
      { level: 6, label: 'Trên 52 đến 80 triệu VND', max_taxable_vnd: 80_000_000, rate_percent: 30, quick_subtract_vnd: 5_850_000 },
      { level: 7, label: 'Trên 80 triệu VND', max_taxable_vnd: null, rate_percent: 35, quick_subtract_vnd: 9_850_000 },
    ],
  },
  reform_2026: {
    tax_year: 2026,
    effective_from: '2026-01-01',
    legal_basis: 'Nghị quyết 110/2025/UBTVQH15 & Luật Thuế TNCN 109/2025/QH15',
    personal_deduction_vnd: 15_500_000,
    personal_deduction_annual_vnd: 186_000_000,
    dependent_deduction_vnd: 6_200_000,
    bracket_count: 5,
    brackets: [
      { level: 1, label: 'Đến 10 triệu VND', max_taxable_vnd: 10_000_000, rate_percent: 5, quick_subtract_vnd: 0 },
      { level: 2, label: 'Trên 10 đến 30 triệu VND', max_taxable_vnd: 30_000_000, rate_percent: 15, quick_subtract_vnd: 1_000_000 },
      { level: 3, label: 'Trên 30 đến 60 triệu VND', max_taxable_vnd: 60_000_000, rate_percent: 25, quick_subtract_vnd: 4_000_000 },
      { level: 4, label: 'Trên 60 đến 100 triệu VND', max_taxable_vnd: 100_000_000, rate_percent: 30, quick_subtract_vnd: 7_000_000 },
      { level: 5, label: 'Trên 100 triệu VND', max_taxable_vnd: null, rate_percent: 35, quick_subtract_vnd: 12_000_000 },
    ],
  },
};

export function resolveTaxYearFromPeriod(periodOrYear?: string | number | null): number {
  if (typeof periodOrYear === 'number' && Number.isFinite(periodOrYear)) {
    return Math.trunc(periodOrYear);
  }
  const raw = String(periodOrYear ?? '').trim();
  if (!raw) return 2026;
  const isoMatch = raw.match(/\b(20\d{2})\b/);
  if (isoMatch) {
    const parsed = Number(isoMatch[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 2026;
}

export function getPitTaxConfigForPeriod(
  periodOrYear?: string | number | null
): PitTaxScheduleConfig {
  const taxYear = resolveTaxYearFromPeriod(periodOrYear);
  return taxYear <= 2025 ? PIT_TAX_SCHEDULES.legacy_2025 : PIT_TAX_SCHEDULES.reform_2026;
}

export function calculateProgressivePitByPeriod(
  taxableIncomeVnd: number,
  periodOrYear?: string | number | null
): number {
  if (!Number.isFinite(taxableIncomeVnd) || taxableIncomeVnd <= 0) return 0;
  const config = getPitTaxConfigForPeriod(periodOrYear);
  for (const bracket of config.brackets) {
    if (bracket.max_taxable_vnd === null || taxableIncomeVnd <= bracket.max_taxable_vnd) {
      return Math.max(
        0,
        Math.round((taxableIncomeVnd * bracket.rate_percent) / 100 - bracket.quick_subtract_vnd)
      );
    }
  }
  return 0;
}

export function computePitBreakdownByPeriod(
  taxableIncomeVnd: number,
  periodOrYear?: string | number | null
): {
  schedule: PitTaxScheduleConfig;
  rows: Array<{ level: number; label: string; rate_percent: number; portion_vnd: number; tax_vnd: number }>;
  total_tax_vnd: number;
} {
  const schedule = getPitTaxConfigForPeriod(periodOrYear);
  if (!Number.isFinite(taxableIncomeVnd) || taxableIncomeVnd <= 0) {
    return { schedule, rows: [], total_tax_vnd: 0 };
  }
  const rows: Array<{
    level: number;
    label: string;
    rate_percent: number;
    portion_vnd: number;
    tax_vnd: number;
  }> = [];
  let prevCap = 0;
  for (const bracket of schedule.brackets) {
    if (taxableIncomeVnd <= prevCap) break;
    const cap = bracket.max_taxable_vnd ?? Number.POSITIVE_INFINITY;
    const portion = Math.max(0, Math.min(taxableIncomeVnd, cap) - prevCap);
    if (portion > 0) {
      rows.push({
        level: bracket.level,
        label: bracket.label,
        rate_percent: bracket.rate_percent,
        portion_vnd: portion,
        tax_vnd: Math.round((portion * bracket.rate_percent) / 100),
      });
    }
    prevCap = cap;
  }
  return {
    schedule,
    rows,
    total_tax_vnd: calculateProgressivePitByPeriod(taxableIncomeVnd, periodOrYear),
  };
}

export const LIFECYCLE_NOTICE_DAYS_BY_CONTRACT: Record<string, 3 | 30 | 45> = {
  PROBATION: 3,
  PROBATION_2M: 3,
  FIXED_TERM: 30,
  FIXED_1Y: 30,
  FIXED_3Y: 30,
  FIXED_TERM_12M: 30,
  FIXED_TERM_24M: 30,
  INDEFINITE: 45,
  INDEFINITE_TERM: 45,
};

export function getRequiredNoticeDays(contractType?: string | null): 3 | 30 | 45 {
  if (!contractType) return HRM_CONFIG.NOTICE_DAYS_FIXED_TERM;
  const upper = contractType.trim().toUpperCase();
  if (upper in LIFECYCLE_NOTICE_DAYS_BY_CONTRACT) {
    return LIFECYCLE_NOTICE_DAYS_BY_CONTRACT[upper];
  }
  if (upper.includes('PROBATION')) return 3;
  if (upper.includes('INDEFINITE')) return 45;
  return 30;
}
