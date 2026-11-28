import {
  MOCK_ANNUAL_LEAVE_BALANCES,
} from '@/mock/attendance';
import {
  isOfficialEmployeeStatus,
} from '@/mock/types';
import type {
  AnnualLeaveBalance,
  DailyAttendanceRecord,
  Employee,
  LeaveOvertimeRequest,
  MonthlyAttendanceSummary,
  MultiStepRequestStatus,
  RequestApprovalStatus,
} from '@/mock/types';
import {
  getMonthlyAttendances,
  recomputeMonthlyAttendance,
} from './attendance-monthly';
import {
  evaluateDailyPunch,
  getDailyAttendances,
  upsertDailyAttendanceInternal,
} from './attendance-rules';
import {
  getAllRuntimeEmployees,
  saveRuntimeRequest,
} from './core-entities';
import {
  STORAGE_LEAVE_BALANCES_KEY,
  readStorageArray,
  writeStorageArray,
} from './storage';

export function getLeaveBalances(year = 2026): AnnualLeaveBalance[] {
  const runtimeList =
    readStorageArray<AnnualLeaveBalance>(STORAGE_LEAVE_BALANCES_KEY) ?? [];
  const baseList = MOCK_ANNUAL_LEAVE_BALANCES.filter((b) => b.year === year);

  const baseIds = new Set(baseList.map((b) => b.id));
  const baseEmpCodes = new Set(baseList.map((b) => b.employee_code));

  const mergedBase = baseList.map((base) => {
    const override = runtimeList.find(
      (rt) =>
        rt.year === year &&
        (rt.id === base.id || rt.employee_code === base.employee_code)
    );
    return override ?? base;
  });

  const brandNew = runtimeList.filter(
    (rt) =>
      rt.year === year &&
      !baseIds.has(rt.id) &&
      !baseEmpCodes.has(rt.employee_code)
  );

  const allEmployees = getAllRuntimeEmployees();
  const empById = new Map<string, Employee>();
  const empByCode = new Map<string, Employee>();
  for (const emp of allEmployees) {
    if (emp.id) empById.set(emp.id, emp);
    if (emp.employee_code) empByCode.set(emp.employee_code, emp);
  }

  const existing = [...brandNew, ...mergedBase].filter((b) => {
    const emp =
      (b.employee_id ? empById.get(b.employee_id) : undefined) ??
      (b.employee_code ? empByCode.get(b.employee_code) : undefined);
    if (!emp) return false;
    return (
      isOfficialEmployeeStatus(emp.employment_status) ||
      emp.employment_status === 'NOTICE_PERIOD' ||
      emp.employment_status === 'ON_LEAVE'
    );
  });
  const coveredEmpIds = new Set(
    existing.map((b) => b.employee_id).filter(Boolean)
  );
  const coveredEmpCodes = new Set(
    existing.map((b) => b.employee_code).filter(Boolean)
  );

  const officialFallbacks: AnnualLeaveBalance[] = [];
  for (const emp of allEmployees) {
    if (!isOfficialEmployeeStatus(emp.employment_status)) continue;
    if (coveredEmpIds.has(emp.id) || coveredEmpCodes.has(emp.employee_code)) {
      continue;
    }

    const nearestRuntime = runtimeList
      .filter(
        (rt) =>
          rt.employee_id === emp.id || rt.employee_code === emp.employee_code
      )
      .sort(
        (a, b) =>
          Math.abs(a.year - year) - Math.abs(b.year - year) || b.year - a.year
      )[0];

    const fallbackRecord: AnnualLeaveBalance = nearestRuntime
      ? {
          ...nearestRuntime,
          id: `alb-rt-${emp.employee_code || emp.id}-${year}`,
          employee_id: emp.id,
          employee_code: emp.employee_code,
          full_name: emp.full_name,
          department_name: emp.department_name,
          year,
          carried_over_days: 0,
          used_days: 0,
          pending_days: 0,
          remaining_days: nearestRuntime.total_entitled_days,
        }
      : {
          id: `alb-rt-${emp.employee_code || emp.id}-${year}`,
          employee_id: emp.id,
          employee_code: emp.employee_code,
          full_name: emp.full_name,
          department_name: emp.department_name,
          year,
          total_entitled_days: 12,
          carried_over_days: 0,
          used_days: 0,
          pending_days: 0,
          remaining_days: 12,
        };

    coveredEmpIds.add(emp.id);
    coveredEmpCodes.add(emp.employee_code);
    officialFallbacks.push(fallbackRecord);
  }

  return [...existing, ...officialFallbacks];
}

export function saveLeaveBalance(
  balance: AnnualLeaveBalance
): AnnualLeaveBalance {
  const current =
    readStorageArray<AnnualLeaveBalance>(STORAGE_LEAVE_BALANCES_KEY) ?? [];
  const idx = current.findIndex(
    (b) =>
      b.id === balance.id ||
      (b.employee_code === balance.employee_code && b.year === balance.year)
  );
  const updated =
    idx >= 0
      ? current.map((item, i) => (i === idx ? balance : item))
      : [balance, ...current];
  writeStorageArray(STORAGE_LEAVE_BALANCES_KEY, updated);
  return balance;
}

export function applyApprovedRequestSideEffects(
  request: LeaveOvertimeRequest
): {
  request: LeaveOvertimeRequest;
  leaveBalance: AnnualLeaveBalance | null;
  dailyRecord: DailyAttendanceRecord | null;
  monthlySummary: MonthlyAttendanceSummary | null;
} {
  const targetDate = (
    request.target_date ||
    request.start_datetime.slice(0, 10)
  ).slice(0, 10);
  const periodMonth = targetDate.slice(0, 7);
  const yearNum = Number.parseInt(targetDate.slice(0, 4), 10) || 2026;

  if (request.side_effects_applied) {
    return {
      request,
      leaveBalance:
        getLeaveBalances(yearNum).find(
          (b) =>
            b.employee_id === request.employee_id ||
            b.employee_code === request.employee_code
        ) ?? null,
      dailyRecord:
        getDailyAttendances(periodMonth, request.employee_code).find(
          (d) => d.date === targetDate
        ) ?? null,
      monthlySummary:
        getMonthlyAttendances(periodMonth).find(
          (m) => m.employee_code === request.employee_code
        ) ?? null,
    };
  }

  let updatedBalance: AnnualLeaveBalance | null = null;
  let updatedDaily: DailyAttendanceRecord | null = null;
  const emp = getAllRuntimeEmployees().find(
    (e) =>
      e.id === request.employee_id || e.employee_code === request.employee_code
  );
  const shiftCode = emp?.work_shift_code || 'HC-08:30';

  if (request.request_category === 'ANNUAL_LEAVE') {
    const balances = getLeaveBalances(yearNum);
    const currentBal =
      balances.find(
        (b) =>
          b.employee_id === request.employee_id ||
          b.employee_code === request.employee_code
      ) ?? {
        id: `alb-rt-${Date.now()}`,
        employee_id: request.employee_id,
        employee_code: request.employee_code,
        full_name: request.full_name,
        department_name: request.department_name,
        year: yearNum,
        total_entitled_days: 12,
        carried_over_days: 0,
        used_days: 0,
        pending_days: 0,
        remaining_days: 12,
      };
    const days = request.duration_days_or_hours;
    updatedBalance = saveLeaveBalance({
      ...currentBal,
      used_days: currentBal.used_days + days,
      pending_days: Math.max(0, currentBal.pending_days - days),
      remaining_days: Math.max(0, currentBal.remaining_days - days),
    });

    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-lv-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: null,
      check_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 1,
      overtime_hours: 0,
      status: 'PAID_LEAVE',
      note: `Nghỉ phép năm đã duyệt (${request.request_code}) — tính 1.0 công hưởng lương.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'UNPAID_LEAVE') {
    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-ulv-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: null,
      check_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      overtime_hours: 0,
      status: 'UNPAID_LEAVE',
      note: `Nghỉ không hưởng lương (${request.request_code}) — tính 0.0 công.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'SICK_LEAVE') {
    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-slv-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: null,
      check_out: null,
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 1,
      overtime_hours: 0,
      status: 'SICK_LEAVE',
      note: `Nghỉ ốm chế độ BHXH đã duyệt (${request.request_code}).`,
      source: 'REQUEST_SYNC',
    });
  } else if (
    request.request_category === 'REMOTE_WORK' ||
    request.request_category === 'BUSINESS_TRIP' ||
    request.request_category === 'OVERSEAS_BUSINESS_TRIP'
  ) {
    updatedDaily = upsertDailyAttendanceInternal({
      id: `datt-wfh-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: shiftCode,
      check_in: '08:30',
      check_out: '17:30',
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 1,
      overtime_hours: 0,
      status: 'REMOTE_WORK',
      note: `${request.category_label} (${request.request_code}) — tính 1.0 công.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'LATE_EXPLANATION') {
    const existingDaily = getDailyAttendances(
      periodMonth,
      request.employee_code
    ).find((d) => d.date === targetDate);
    const resolvedCheckIn =
      request.actual_check_in || existingDaily?.check_in || '08:30';
    const resolvedCheckOut =
      request.actual_check_out || existingDaily?.check_out || '17:30';
    const evalFixed = evaluateDailyPunch({
      shiftCode: existingDaily?.shift_code || shiftCode,
      checkIn: resolvedCheckIn,
      checkOut: resolvedCheckOut,
    });
    const fixedWorkday: 1 | 0.5 | 0 =
      evalFixed.workday_value > 0 ? evalFixed.workday_value : 1;

    updatedDaily = upsertDailyAttendanceInternal({
      id:
        existingDaily?.id ??
        `datt-exp-${targetDate.replace(/-/g, '')}-${request.employee_code.slice(-3)}`,
      employee_id: request.employee_id,
      employee_code: request.employee_code,
      full_name: request.full_name,
      department_name: request.department_name,
      date: targetDate,
      shift_code: existingDaily?.shift_code || shiftCode,
      check_in: resolvedCheckIn,
      check_out: resolvedCheckOut,
      late_minutes: evalFixed.late_minutes,
      early_leave_minutes: evalFixed.early_leave_minutes,
      workday_value: fixedWorkday,
      overtime_hours: existingDaily?.overtime_hours ?? 0,
      status: fixedWorkday === 0.5 ? 'HALF_DAY' : 'PRESENT',
      explanation_request_id: request.id,
      note: `Đã duyệt giải trình chấm công (${request.request_code}: ${resolvedCheckIn} - ${resolvedCheckOut}) -> phục hồi ${fixedWorkday} công.`,
      source: 'REQUEST_SYNC',
    });
  } else if (request.request_category === 'OVERTIME') {
    const otHours = request.ot_hours ?? request.duration_days_or_hours;
    const existingDaily = getDailyAttendances(
      periodMonth,
      request.employee_code
    ).find((d) => d.date === targetDate);
    if (existingDaily) {
      updatedDaily = upsertDailyAttendanceInternal({
        ...existingDaily,
        overtime_hours: (existingDaily.overtime_hours || 0) + otHours,
        ot_multiplier: request.ot_multiplier ?? 1.5,
      });
    }
  }

  const stampedRequest: LeaveOvertimeRequest = {
    ...request,
    leave_deducted:
      request.request_category === 'ANNUAL_LEAVE' ? true : request.leave_deducted,
    side_effects_applied: true,
  };
  saveRuntimeRequest(stampedRequest);

  const monthlyList = recomputeMonthlyAttendance(periodMonth, request.employee_id);
  const monthlySummary =
    monthlyList.find((m) => m.employee_code === request.employee_code) ?? null;

  return {
    request: stampedRequest,
    leaveBalance: updatedBalance,
    dailyRecord: updatedDaily,
    monthlySummary,
  };
}

export function handleRequestLifecycleChange(
  request: LeaveOvertimeRequest,
  prevStatus?: MultiStepRequestStatus | RequestApprovalStatus
): LeaveOvertimeRequest {
  const effectiveStatus = request.status ?? request.approval_status;
  const yearNum =
    Number.parseInt(request.start_datetime.slice(0, 4), 10) || 2026;

  // Newly submitted ANNUAL_LEAVE -> reserve pending_days
  if (
    !prevStatus &&
    (effectiveStatus === 'PENDING' || effectiveStatus === 'IN_PROGRESS') &&
    request.request_category === 'ANNUAL_LEAVE'
  ) {
    const curBal = getLeaveBalances(yearNum).find(
      (b) =>
        b.employee_id === request.employee_id ||
        b.employee_code === request.employee_code
    );
    if (curBal) {
      if (request.duration_days_or_hours > curBal.remaining_days) {
        throw new Error(
          `Số ngày xin nghỉ phép năm (${request.duration_days_or_hours} ngày) vượt quá quỹ phép còn lại (${curBal.remaining_days} ngày). Vui lòng giảm số ngày hoặc tách sang đơn Nghỉ không lương.`
        );
      }
      saveLeaveBalance({
        ...curBal,
        pending_days: curBal.pending_days + request.duration_days_or_hours,
      });
    }
  }

  // Rejected or Cancelled -> release reserved pending_days
  if (
    (prevStatus === 'PENDING' || prevStatus === 'IN_PROGRESS') &&
    (effectiveStatus === 'REJECTED' || effectiveStatus === 'CANCELLED') &&
    request.request_category === 'ANNUAL_LEAVE' &&
    !request.side_effects_applied
  ) {
    const curBal = getLeaveBalances(yearNum).find(
      (b) =>
        b.employee_id === request.employee_id ||
        b.employee_code === request.employee_code
    );
    if (curBal) {
      saveLeaveBalance({
        ...curBal,
        pending_days: Math.max(
          0,
          curBal.pending_days - request.duration_days_or_hours
        ),
      });
    }
  }

  saveRuntimeRequest(request);

  if (
    effectiveStatus === 'APPROVED' ||
    request.approval_status === 'APPROVED'
  ) {
    return applyApprovedRequestSideEffects(request).request;
  }

  return request;
}
