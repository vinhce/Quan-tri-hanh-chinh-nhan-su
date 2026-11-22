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
  PROBATION_SHORT_DAYS: 30,
  PROBATION_DEFAULT_DAYS: 60,
  PROBATION_DEFAULT_SALARY_PERCENT: 85,
  OFFICIAL_SALARY_PERCENT: 100,
  PROBATION_EXPIRY_ALERT_DAYS: 15,
  CONTRACT_EXPIRY_ALERT_DAYS: 30,

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
  PIT_PERSONAL_DEDUCTION_VND: 11_000_000,
  PIT_DEPENDENT_DEDUCTION_VND: 4_400_000,

  // Stage 3: Performance & Career Progression
  PROMOTION_DIRECTOR_SALARY_THRESHOLD_VND: 50_000_000,

  // Stage 4: Offboarding Legal Notice Minimums (Vietnam Labor Code Art. 27 & 35)
  NOTICE_DAYS_PROBATION: 3,
  NOTICE_DAYS_FIXED_TERM: 30,
  NOTICE_DAYS_INDEFINITE: 45,
} as const;

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
