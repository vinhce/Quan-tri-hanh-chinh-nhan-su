import {
  MOCK_LEAVE_OVERTIME_REQUESTS,
  MOCK_MONTHLY_ATTENDANCE,
} from '@/mock/attendance';
import {
  MOCK_EMPLOYEES,
} from '@/mock/employees';
import type {
  MonthlyAttendanceSummary,
} from '@/mock/types';
import {
  SEED_DAILY_ATTENDANCES_2026_11,
  getDailyAttendances,
} from './attendance-rules';
import {
  getAllRuntimeEmployees,
  mergeWithRuntimeRequests,
} from './core-entities';
import {
  STORAGE_MONTHLY_ATTENDANCE_KEY,
  readStorageArray,
  writeStorageArray,
} from './storage';

export function getMonthlyAttendances(
  periodMonth?: string
): MonthlyAttendanceSummary[] {
  const runtimeList =
    readStorageArray<MonthlyAttendanceSummary>(STORAGE_MONTHLY_ATTENDANCE_KEY) ?? [];
  const baseList = MOCK_MONTHLY_ATTENDANCE;

  const baseIds = new Set(baseList.map((m) => m.id));
  const merged = [
    ...runtimeList.filter((rt) => !baseIds.has(rt.id)),
    ...baseList.map((base) => runtimeList.find((rt) => rt.id === base.id) ?? base),
  ];

  return periodMonth
    ? merged.filter((m) => m.month_period === periodMonth)
    : merged;
}

export function recomputeMonthlyAttendance(
  periodMonth = '2026-11',
  targetEmployeeIdOrCode?: string
): MonthlyAttendanceSummary[] {
  const allEmployees = getAllRuntimeEmployees();
  const currentMonthly = MOCK_MONTHLY_ATTENDANCE;
  const dailyInMonth = getDailyAttendances(periodMonth);
  const allRequests = mergeWithRuntimeRequests(MOCK_LEAVE_OVERTIME_REQUESTS);

  const employeesToProcess = targetEmployeeIdOrCode
    ? allEmployees.filter(
        (e) =>
          e.id === targetEmployeeIdOrCode ||
          e.employee_code === targetEmployeeIdOrCode
      )
    : allEmployees.filter((e) => e.employment_status !== 'RESIGNED');

  const runtimeSaved =
    readStorageArray<MonthlyAttendanceSummary>(STORAGE_MONTHLY_ATTENDANCE_KEY) ?? [];
  const runtimeMap = new Map<string, MonthlyAttendanceSummary>();
  for (const item of runtimeSaved) {
    runtimeMap.set(`${item.employee_code}:${item.month_period}`, item);
  }

  const seedDailyIds = new Set(SEED_DAILY_ATTENDANCES_2026_11.map((s) => s.id));
  const seedEmployeeIds = new Set(MOCK_EMPLOYEES.map((e) => e.id));
  const seedEmployeeCodes = new Set(MOCK_EMPLOYEES.map((e) => e.employee_code));

  for (const emp of employeesToProcess) {
    const baseSummary = currentMonthly.find(
      (m) =>
        (m.employee_id === emp.id || m.employee_code === emp.employee_code) &&
        m.month_period === periodMonth
    );
    const empDaily = dailyInMonth.filter(
      (d) => d.employee_id === emp.id || d.employee_code === emp.employee_code
    );
    const nonSeedDaily = empDaily.filter(
      (d) => d.source !== 'SEED' || !seedDailyIds.has(d.id)
    );
    const isSeedMockEmployee =
      seedEmployeeIds.has(emp.id) || seedEmployeeCodes.has(emp.employee_code);
    const hasDailyAttendance = isSeedMockEmployee
      ? nonSeedDaily.length > 0
      : empDaily.length > 0;
    const missingCount = empDaily.filter((d) => d.status === 'MISSING_PUNCH').length;

    const approvedRuntimeReqs = allRequests.filter(
      (r) =>
        (r.employee_id === emp.id || r.employee_code === emp.employee_code) &&
        (r.approval_status === 'APPROVED' || r.status === 'APPROVED') &&
        r.start_datetime.startsWith(periodMonth) &&
        r.id !== 'req-005'
    );

    let paidLeaveDelta = 0;
    let unpaidLeaveDelta = 0;
    let otWeekdayDelta = 0;
    let otWeekendDelta = 0;
    let otHolidayDelta = 0;
    let explainedWorkdayGain = 0;

    for (const req of approvedRuntimeReqs) {
      if (req.request_category === 'ANNUAL_LEAVE' || req.request_category === 'SICK_LEAVE') {
        paidLeaveDelta += req.duration_days_or_hours;
      } else if (req.request_category === 'UNPAID_LEAVE') {
        unpaidLeaveDelta += req.duration_days_or_hours;
      } else if (req.request_category === 'OVERTIME') {
        const hrs = req.ot_hours ?? req.duration_days_or_hours;
        if (req.ot_day_type === 'HOLIDAY' || req.ot_multiplier === 3) {
          otHolidayDelta += hrs;
        } else if (req.ot_day_type === 'WEEKEND' || req.ot_multiplier === 2) {
          otWeekendDelta += hrs;
        } else {
          otWeekdayDelta += hrs;
        }
      } else if (req.request_category === 'LATE_EXPLANATION') {
        const fixedRec = empDaily.find((d) => d.explanation_request_id === req.id);
        explainedWorkdayGain += fixedRec ? fixedRec.workday_value : 1;
      }
    }

    const prevRuntime = runtimeMap.get(`${emp.employee_code}:${periodMonth}`);
    if (
      !baseSummary &&
      !prevRuntime &&
      !hasDailyAttendance &&
      approvedRuntimeReqs.length === 0
    ) {
      continue;
    }
    const standardDays = baseSummary?.standard_work_days ?? 22;
    const basePaidLeave = (baseSummary?.paid_leave_days ?? 0) + paidLeaveDelta;
    const baseUnpaidLeave = (baseSummary?.unpaid_leave_days ?? 0) + unpaidLeaveDelta;
    const rawActual =
      baseSummary
        ? Math.max(
            0,
            Math.min(
              standardDays - basePaidLeave - baseUnpaidLeave,
              baseSummary.actual_work_days - missingCount + explainedWorkdayGain
            )
          )
        : Math.max(
            0,
            Math.min(
              standardDays - basePaidLeave - baseUnpaidLeave,
              empDaily
                .filter((d) => d.status !== 'PAID_LEAVE' && d.status !== 'SICK_LEAVE')
                .reduce((acc, d) => acc + d.workday_value, 0)
            )
          );

    const lateCount = Math.max(
      baseSummary?.late_occurrences ?? 0,
      empDaily.filter((d) => d.late_minutes > 0).length
    );
    const earlyCount = Math.max(
      baseSummary?.early_leave_occurrences ?? 0,
      empDaily.filter((d) => d.early_leave_minutes > 0 && d.status !== 'HALF_DAY').length
    );

    const weekdayOt = (baseSummary?.overtime_hours_weekday ?? 0) + otWeekdayDelta;
    const weekendOt = (baseSummary?.overtime_hours_weekend ?? 0) + otWeekendDelta;
    const holidayOt = (baseSummary?.overtime_hours_holiday ?? 0) + otHolidayDelta;

    const summary: MonthlyAttendanceSummary = {
      id:
        baseSummary?.id ??
        prevRuntime?.id ??
        `att-${periodMonth.replace('-', '')}-${emp.employee_code.slice(-3)}`,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      position_name: emp.position_name,
      shift_code: emp.work_shift_code || 'HC-08:00',
      month_period: periodMonth,
      standard_work_days: standardDays,
      actual_work_days: rawActual,
      paid_leave_days: basePaidLeave,
      unpaid_leave_days: baseUnpaidLeave,
      late_occurrences: lateCount,
      early_leave_occurrences: earlyCount,
      overtime_hours_weekday: weekdayOt,
      overtime_hours_weekend: weekendOt,
      overtime_hours_holiday: holidayOt,
      total_overtime_hours: weekdayOt + weekendOt + holidayOt,
      attendance_status:
        prevRuntime?.attendance_status === 'LOCKED' ||
        baseSummary?.attendance_status === 'LOCKED'
          ? 'LOCKED'
          : missingCount > 0
            ? 'NEEDS_REVIEW'
            : 'VERIFIED',
    };
    runtimeMap.set(`${emp.employee_code}:${periodMonth}`, summary);
  }

  writeStorageArray(
    STORAGE_MONTHLY_ATTENDANCE_KEY,
    Array.from(runtimeMap.values())
  );
  return getMonthlyAttendances(periodMonth);
}
