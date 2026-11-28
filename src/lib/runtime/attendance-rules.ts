import {
  MOCK_WORK_SHIFTS,
} from '@/mock/attendance';
import type {
  DailyAttendanceRecord,
  DailyAttendanceStatus,
} from '@/mock/types';
import {
  STORAGE_DAILY_ATTENDANCE_KEY,
  cloneJson,
  readStorageArray,
  writeStorageArray,
} from './storage';

// ---------------------------------------------------------------------------
// Stage 2: Daily Attendance, Leave Balances, Request Side-Effects & Payroll
// ---------------------------------------------------------------------------
export function getTodayDateVN(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
    return new Date(vnMs).toISOString().slice(0, 10);
  }
}

export function getCurrentHHmmVN(now: Date = new Date()): string {
  try {
    const formatted = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    })
      .format(now)
      .replace(/^24:/, '00:');
    const match = formatted.match(/^(\d{2}):(\d{2})$/);
    if (match) return formatted;
  } catch {
    // fallback below
  }
  const vnDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const h = String(vnDate.getUTCHours()).padStart(2, '0');
  const m = String(vnDate.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const DAILY_AUTO_CUTOFF_MINUTES = 22 * 60;

export const DAILY_AUTO_CUTOFF_NOTE =
  'Quá 22:00 chưa chấm công ra — Tự động ngắt ca (Quên chấm công)';

export function normalizeHHmm(hhmm: string | null | undefined): string | null {
  if (!hhmm || !hhmm.includes(':')) return hhmm ?? null;
  return hhmm.trim().replace(/^24:/, '00:');
}

function parseHHmmToMinutes(hhmm: string | null | undefined): number | null {
  const normalized = normalizeHHmm(hhmm);
  if (!normalized || !normalized.includes(':')) return null;
  const [hStr, mStr] = normalized.split(':');
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function isAttendanceNightLockWindow(hhmm?: string): boolean {
  const time = (hhmm || getCurrentHHmmVN()).slice(0, 5);
  const minutes = parseHHmmToMinutes(time);
  if (minutes === null) return false;
  return minutes >= 22 * 60 || minutes < 6 * 60;
}

export function evaluateDailyPunch(params: {
  shiftCode: string;
  checkIn: string | null;
  checkOut: string | null;
  date?: string;
  todayDate?: string;
  nowHHmm?: string;
}): {
  late_minutes: number;
  early_leave_minutes: number;
  workday_value: 1 | 0.5 | 0;
  status: DailyAttendanceStatus;
} {
  const shift =
    MOCK_WORK_SHIFTS.find((s) => s.shift_code === params.shiftCode) ??
    MOCK_WORK_SHIFTS[0];
  const inMin = parseHHmmToMinutes(params.checkIn);
  const outMin = parseHHmmToMinutes(params.checkOut);
  const startMin = parseHHmmToMinutes(shift.start_time) ?? 480;
  const endMin = parseHHmmToMinutes(shift.end_time) ?? 1020;

  if (inMin === null && outMin === null) {
    return {
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      status: 'ABSENT',
    };
  }

  if (inMin !== null && outMin === null) {
    const refToday = params.todayDate ?? getTodayDateVN();
    if (params.date && params.date > refToday) {
      const lateMinutes =
        inMin > startMin + shift.late_grace_minutes ? inMin - startMin : 0;
      return {
        late_minutes: lateMinutes,
        early_leave_minutes: 0,
        workday_value: 0,
        status: 'WORKING',
      };
    }
    if (params.date && params.date === refToday) {
      const nowMin = parseHHmmToMinutes(params.nowHHmm ?? getCurrentHHmmVN()) ?? 0;
      // Ca ban ngày (< 22:00) nhưng hiện tại đã quá 22:00 mà chưa check-out -> tự động ngắt ca
      if (inMin < DAILY_AUTO_CUTOFF_MINUTES && nowMin >= DAILY_AUTO_CUTOFF_MINUTES) {
        return {
          late_minutes: 0,
          early_leave_minutes: 0,
          workday_value: 0,
          status: 'MISSING_PUNCH',
        };
      }
      const lateMinutes =
        inMin > startMin + shift.late_grace_minutes ? inMin - startMin : 0;
      return {
        late_minutes: lateMinutes,
        early_leave_minutes: 0,
        workday_value: 0,
        status: 'WORKING',
      };
    }
    return {
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      status: 'MISSING_PUNCH',
    };
  }

  if (inMin === null || outMin === null) {
    return {
      late_minutes: 0,
      early_leave_minutes: 0,
      workday_value: 0,
      status: 'MISSING_PUNCH',
    };
  }

  const lateMinutes =
    inMin > startMin + shift.late_grace_minutes ? inMin - startMin : 0;
  const earlyLeaveMinutes = outMin < endMin ? endMin - outMin : 0;

  let rawDuration = Math.max(0, outMin - inMin);
  if (inMin <= 720 && outMin >= 780) {
    rawDuration = Math.max(0, rawDuration - shift.break_minutes);
  }
  const workedHours = rawDuration / 60;

  if (workedHours >= 6.5) {
    return {
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      workday_value: 1,
      status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
    };
  }
  if (workedHours >= 3.5) {
    return {
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      workday_value: 0.5,
      status: 'HALF_DAY',
    };
  }
  return {
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    workday_value: 0,
    status: 'ABSENT',
  };
}

export const SEED_DAILY_ATTENDANCES_2026_11: DailyAttendanceRecord[] = [
  {
    id: 'datt-20261118-004',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-18',
    shift_code: 'HC-08:30',
    check_in: '08:28',
    check_out: null,
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 0,
    overtime_hours: 0,
    status: 'MISSING_PUNCH',
    note: 'Quên chấm vân tay lúc ra về do họp khắc phục sự cố production muộn (0 công đến khi duyệt giải trình).',
    source: 'SEED',
  },
  {
    id: 'datt-20261119-004',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-19',
    shift_code: 'HC-08:30',
    check_in: '08:52',
    check_out: '18:05',
    late_minutes: 22,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'LATE',
    note: 'Đi muộn 22 phút so với ca HC-08:30.',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-004',
    employee_id: 'emp-004',
    employee_code: 'NV-2024-004',
    full_name: 'Phạm Minh Tuấn',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-20',
    shift_code: 'HC-08:30',
    check_in: '08:24',
    check_out: '19:30',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 2,
    ot_multiplier: 1.5,
    status: 'PRESENT',
    source: 'SEED',
  },
  {
    id: 'datt-20261119-009',
    employee_id: 'emp-009',
    employee_code: 'NV-2025-009',
    full_name: 'Bùi Trọng Nghĩa',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-19',
    shift_code: 'HC-08:30',
    check_in: null,
    check_out: '17:40',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 0,
    overtime_hours: 0,
    status: 'MISSING_PUNCH',
    note: 'Thiếu dữ liệu check-in buổi sáng, tạm tính 0 công chờ giải trình chấm công.',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-009',
    employee_id: 'emp-009',
    employee_code: 'NV-2025-009',
    full_name: 'Bùi Trọng Nghĩa',
    department_name: 'Phòng Kỹ thuật Phần mềm',
    date: '2026-11-20',
    shift_code: 'HC-08:30',
    check_in: '08:32',
    check_out: '12:30',
    late_minutes: 0,
    early_leave_minutes: 300,
    workday_value: 0.5,
    overtime_hours: 0,
    status: 'HALF_DAY',
    note: 'Làm nửa ngày buổi sáng (0.5 công).',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-011',
    employee_id: 'emp-011',
    employee_code: 'NV-2026-011',
    full_name: 'Trương Gia Huy',
    department_name: 'Phòng Dữ liệu & AI',
    date: '2026-11-20',
    shift_code: 'HC-08:30',
    check_in: '08:22',
    check_out: '17:38',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'PRESENT',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-008',
    employee_id: 'emp-008',
    employee_code: 'NV-2025-008',
    full_name: 'Ngô Thanh Hà',
    department_name: 'Phòng Nhân sự & Hành chính',
    date: '2026-11-20',
    shift_code: 'HC-08:00',
    check_in: '07:54',
    check_out: '17:08',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'PRESENT',
    source: 'SEED',
  },
  {
    id: 'datt-20261120-002',
    employee_id: 'emp-002',
    employee_code: 'NV-2024-002',
    full_name: 'Trần Thị Bích Ngọc',
    department_name: 'Phòng Nhân sự & Hành chính',
    date: '2026-11-20',
    shift_code: 'HC-08:00',
    check_in: '07:56',
    check_out: '17:15',
    late_minutes: 0,
    early_leave_minutes: 0,
    workday_value: 1,
    overtime_hours: 0,
    status: 'PRESENT',
    source: 'SEED',
  },
];

type DailyAttendanceWithMeta = DailyAttendanceRecord & { updated_at?: string };

function getDailyRecordUpdatedMs(rec: DailyAttendanceRecord): number {
  const raw = (rec as DailyAttendanceWithMeta).updated_at;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

export function deduplicateDailyAttendances(
  records: DailyAttendanceRecord[]
): DailyAttendanceRecord[] {
  const byKey = new Map<string, DailyAttendanceRecord>();
  for (const rec of records) {
    const key =
      rec.employee_code && rec.date
        ? `${rec.employee_code}__${rec.date}`
        : rec.id;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, rec);
      continue;
    }
    const prevTs = getDailyRecordUpdatedMs(prev);
    const nextTs = getDailyRecordUpdatedMs(rec);
    if (nextTs > prevTs) {
      byKey.set(key, rec);
    } else if (nextTs === prevTs && !prev.check_out && rec.check_out) {
      byKey.set(key, rec);
    }
  }
  return Array.from(byKey.values());
}

export function getDailyAttendances(
  periodMonth?: string,
  employeeIdOrCode?: string
): DailyAttendanceRecord[] {
  const stored = readStorageArray<DailyAttendanceRecord>(
    STORAGE_DAILY_ATTENDANCE_KEY
  );
  const all = deduplicateDailyAttendances(
    stored ?? cloneJson(SEED_DAILY_ATTENDANCES_2026_11)
  );
  const todayVN = getTodayDateVN();
  const nowMin = parseHHmmToMinutes(getCurrentHHmmVN()) ?? 0;

  return all
    .map((rec) => {
      const normalizedCheckIn = normalizeHHmm(rec.check_in);
      const normalizedCheckOut = normalizeHHmm(rec.check_out);
      const baseRec =
        normalizedCheckIn !== rec.check_in || normalizedCheckOut !== rec.check_out
          ? { ...rec, check_in: normalizedCheckIn, check_out: normalizedCheckOut }
          : rec;

      if (baseRec.check_in && !baseRec.check_out) {
        if (baseRec.date < todayVN && baseRec.status === 'WORKING') {
          return {
            ...baseRec,
            status: 'MISSING_PUNCH' as const,
            late_minutes: 0,
            workday_value: 0 as const,
          };
        }
        if (baseRec.date === todayVN && baseRec.status === 'WORKING') {
          const inMin = parseHHmmToMinutes(baseRec.check_in);
          if (
            inMin !== null &&
            inMin < DAILY_AUTO_CUTOFF_MINUTES &&
            nowMin >= DAILY_AUTO_CUTOFF_MINUTES
          ) {
            return {
              ...baseRec,
              status: 'MISSING_PUNCH' as const,
              late_minutes: 0,
              workday_value: 0 as const,
              note:
                baseRec.note && baseRec.note.includes('Quá 22:00')
                  ? baseRec.note
                  : DAILY_AUTO_CUTOFF_NOTE,
            };
          }
        }
      }
      return baseRec;
    })
    .filter((rec) => {
      if (periodMonth && !rec.date.startsWith(periodMonth)) return false;
      if (
        employeeIdOrCode &&
        rec.employee_id !== employeeIdOrCode &&
        rec.employee_code !== employeeIdOrCode
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function upsertDailyAttendanceInternal(
  record: DailyAttendanceRecord
): DailyAttendanceRecord {
  const stamped: DailyAttendanceWithMeta = {
    ...record,
    updated_at: new Date().toISOString(),
  };
  const current = deduplicateDailyAttendances(getDailyAttendances());
  const remaining = current.filter(
    (r) =>
      r.id !== stamped.id &&
      !(r.employee_code === stamped.employee_code && r.date === stamped.date)
  );
  const updated = deduplicateDailyAttendances([stamped, ...remaining]);
  writeStorageArray(STORAGE_DAILY_ATTENDANCE_KEY, updated);
  return stamped;
}
