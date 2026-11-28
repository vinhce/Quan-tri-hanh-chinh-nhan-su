import { HRM_CONFIG } from './config';
import type {
  PositionQualificationLevel,
  PositionSalaryGradeStep,
  SalaryGradeStepCode,
} from '../../mock/types';

export interface SalaryBandRange {
  salary_band_min_vnd: number;
  salary_band_max_vnd: number;
  grade_steps?: PositionSalaryGradeStep[];
}

export interface SalaryBandValidationResult {
  valid: boolean;
  error: string | null;
  compaRatio: number;
  rangePenetration: number;
  isNearCeiling: boolean;
}

export interface ProbationValidationResult {
  valid: boolean;
  maxDays: number;
  error: string | null;
}

const STEP_ORDER: readonly SalaryGradeStepCode[] = ['S1', 'S2', 'S3', 'S4'];
const DEFAULT_STEP_RATIOS: readonly number[] = [0, 1 / 3, 2 / 3, 1];
const NEAR_CEILING_PENETRATION = 0.95;

function roundTo100k(amount: number): number {
  return Math.round(amount / 100_000) * 100_000;
}

export function resolvePositionGradeSteps(
  band: SalaryBandRange
): PositionSalaryGradeStep[] {
  const min = Math.round(band.salary_band_min_vnd);
  const max = Math.round(band.salary_band_max_vnd);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
    return [];
  }

  const defaultSteps: PositionSalaryGradeStep[] = STEP_ORDER.map((step, idx) => {
    const raw = min + (max - min) * DEFAULT_STEP_RATIOS[idx];
    const salaryVnd =
      idx === 0
        ? min
        : idx === STEP_ORDER.length - 1
          ? max
          : Math.min(max, Math.max(min, roundTo100k(raw)));
    return {
      step,
      label: `Bậc ${step}`,
      salary_vnd: salaryVnd,
    };
  });

  if (!band.grade_steps || band.grade_steps.length === 0) {
    return defaultSteps;
  }

  const customByStep = new Map<SalaryGradeStepCode, PositionSalaryGradeStep>();
  for (const item of band.grade_steps) {
    if (
      STEP_ORDER.includes(item.step) &&
      Number.isFinite(item.salary_vnd) &&
      item.salary_vnd >= min &&
      item.salary_vnd <= max
    ) {
      customByStep.set(item.step, {
        step: item.step,
        label: item.label?.trim() || `Bậc ${item.step}`,
        salary_vnd: Math.round(item.salary_vnd),
      });
    }
  }

  return defaultSteps.map((fallback) => customByStep.get(fallback.step) ?? fallback);
}

export function resolveGradeStepForSalary(
  salaryVnd: number,
  band: SalaryBandRange
): SalaryGradeStepCode {
  const steps = resolvePositionGradeSteps(band);
  if (steps.length === 0 || !Number.isFinite(salaryVnd)) {
    return 'S1';
  }
  let best = steps[0];
  let minDiff = Math.abs(salaryVnd - best.salary_vnd);
  for (let i = 1; i < steps.length; i += 1) {
    const diff = Math.abs(salaryVnd - steps[i].salary_vnd);
    if (diff < minDiff) {
      minDiff = diff;
      best = steps[i];
    }
  }
  return best.step;
}

export function computeNextReviewDate(
  officialDateIso: string,
  intervalMonths: number = HRM_CONFIG.SALARY_REVIEW_INTERVAL_MONTHS
): string {
  const match = officialDateIso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    throw new Error('Ngày bắt đầu chính thức không đúng định dạng YYYY-MM-DD.');
  }
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const targetTotalMonths = monthIdx + Math.max(1, Math.trunc(intervalMonths));
  const targetYear = year + Math.floor(targetTotalMonths / 12);
  const targetMonthIdx = ((targetTotalMonths % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIdx + 1, 0)
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  const mm = String(targetMonthIdx + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

export function computeCompaRatio(
  salaryVnd: number,
  band: SalaryBandRange
): number {
  const min = band.salary_band_min_vnd;
  const max = band.salary_band_max_vnd;
  if (!Number.isFinite(salaryVnd) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }
  const midpoint = (min + max) / 2;
  if (midpoint <= 0) return 0;
  return Number((salaryVnd / midpoint).toFixed(4));
}

export function computeRangePenetration(
  salaryVnd: number,
  band: SalaryBandRange
): number {
  const min = band.salary_band_min_vnd;
  const max = band.salary_band_max_vnd;
  if (!Number.isFinite(salaryVnd) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }
  const span = max - min;
  if (span <= 0) {
    return salaryVnd >= max ? 1 : 0;
  }
  return Number(((salaryVnd - min) / span).toFixed(4));
}

export function isNearSalaryBandCeiling(
  salaryVnd: number,
  band: SalaryBandRange
): boolean {
  return computeRangePenetration(salaryVnd, band) >= NEAR_CEILING_PENETRATION;
}

export function validateSalaryInBand(
  salaryVnd: number,
  band: SalaryBandRange
): SalaryBandValidationResult {
  const compaRatio = computeCompaRatio(salaryVnd, band);
  const rangePenetration = computeRangePenetration(salaryVnd, band);
  const isNearCeiling = rangePenetration >= NEAR_CEILING_PENETRATION;

  if (!Number.isFinite(salaryVnd) || salaryVnd <= 0) {
    return {
      valid: false,
      error: 'Mức lương đề xuất phải lớn hơn 0 VND.',
      compaRatio,
      rangePenetration,
      isNearCeiling,
    };
  }
  if (
    !Number.isFinite(band.salary_band_min_vnd) ||
    !Number.isFinite(band.salary_band_max_vnd) ||
    band.salary_band_max_vnd < band.salary_band_min_vnd
  ) {
    return {
      valid: false,
      error: 'Khung lương vị trí không hợp lệ.',
      compaRatio,
      rangePenetration,
      isNearCeiling,
    };
  }
  if (salaryVnd < band.salary_band_min_vnd) {
    return {
      valid: false,
      error: `Mức lương ${salaryVnd.toLocaleString('vi-VN')} ₫ thấp hơn mức tối thiểu của dải (${band.salary_band_min_vnd.toLocaleString('vi-VN')} ₫).`,
      compaRatio,
      rangePenetration,
      isNearCeiling,
    };
  }
  if (salaryVnd > band.salary_band_max_vnd) {
    return {
      valid: false,
      error: `Mức lương ${salaryVnd.toLocaleString('vi-VN')} ₫ vượt quá mức tối đa của dải (${band.salary_band_max_vnd.toLocaleString('vi-VN')} ₫).`,
      compaRatio,
      rangePenetration,
      isNearCeiling,
    };
  }
  return {
    valid: true,
    error: null,
    compaRatio,
    rangePenetration,
    isNearCeiling,
  };
}

export function validateProbationDurationDays(
  probationDays: number,
  qualification: PositionQualificationLevel
): ProbationValidationResult {
  const maxDays =
    qualification === 'COLLEGE_OR_HIGHER'
      ? HRM_CONFIG.PROBATION_DEFAULT_DAYS
      : qualification === 'INTERMEDIATE_VOCATIONAL'
        ? HRM_CONFIG.PROBATION_SHORT_DAYS
        : HRM_CONFIG.PROBATION_OTHER_MAX_DAYS;

  if (!Number.isFinite(probationDays) || probationDays <= 0) {
    return {
      valid: false,
      maxDays,
      error: 'Thời gian thử việc phải lớn hơn 0 ngày.',
    };
  }
  if (probationDays > maxDays) {
    return {
      valid: false,
      maxDays,
      error: `Thời gian thử việc ${probationDays} ngày vượt quá giới hạn tối đa ${maxDays} ngày cho trình độ vị trí đã chọn.`,
    };
  }
  return {
    valid: true,
    maxDays,
    error: null,
  };
}
