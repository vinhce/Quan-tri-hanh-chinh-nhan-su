import type {
  DailyAttendanceRecord,
  WifiMatchMode,
} from '@/mock/types';
import {
  recordAuditLog,
} from '@/lib/audit-logger';
import {
  recomputeMonthlyAttendance,
} from './attendance-monthly';
import {
  DAILY_AUTO_CUTOFF_NOTE,
  deduplicateDailyAttendances,
  evaluateDailyPunch,
  getCurrentHHmmVN,
  getDailyAttendances,
  getTodayDateVN,
  isAttendanceNightLockWindow,
  normalizeHHmm,
  upsertDailyAttendanceInternal,
} from './attendance-rules';
import {
  getAllRuntimeEmployees,
} from './core-entities';
import {
  STORAGE_DAILY_ATTENDANCE_KEY,
  writeStorageArray,
} from './storage';

export function checkInOutToday(params: {
  employeeId: string;
  date?: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  timeHHmm?: string;
  checkInTimeOverride?: string;
  allowPastDate?: boolean;
  note?: string;
  source?: DailyAttendanceRecord['source'];
  authMethod?: DailyAttendanceRecord['auth_method'];
  biometricDeviceLabel?: string;
  biometricModality?: 'FINGERPRINT' | 'FACE_IRIS';
  livenessScore?: number;
  faceMatchScore?: number;
  verifiedNetworkIp?: string;
  wifiMatchMode?: WifiMatchMode;
}): DailyAttendanceRecord {
  const emp = getAllRuntimeEmployees().find(
    (e) => e.id === params.employeeId || e.employee_code === params.employeeId
  );
  if (!emp) {
    throw new Error('Không tìm thấy thông tin nhân viên chấm công.');
  }

  const now = new Date();
  const todayVN = getTodayDateVN(now);
  const isRealtimePunch =
    !params.timeHHmm &&
    !params.allowPastDate &&
    params.source !== 'REQUEST_SYNC';
  const dateStr = isRealtimePunch
    ? params.date && params.date >= todayVN
      ? params.date
      : todayVN
    : params.date ?? todayVN;
  const liveHHmm = getCurrentHHmmVN(now);
  const timeStr = normalizeHHmm(params.timeHHmm ?? liveHHmm) ?? liveHHmm;

  if (params.source !== 'REQUEST_SYNC' && isAttendanceNightLockWindow(timeStr)) {
    throw new Error(
      'Ngoài khung giờ chấm công (Hệ thống tạm khóa chấm công từ 22:00 tối đến 06:00 sáng).'
    );
  }

  const existing = deduplicateDailyAttendances(getDailyAttendances()).find(
    (r) => r.employee_code === emp.employee_code && r.date === dateStr
  );

  // Chế độ thời gian thực: nếu đã có check_in trong ngày thì bấm chấm công lại luôn cập nhật check_out = liveHHmm mới nhất
  const effectiveAction: 'CHECK_IN' | 'CHECK_OUT' =
    isRealtimePunch && Boolean(existing?.check_in)
      ? 'CHECK_OUT'
      : params.action;

  const nextCheckIn =
    effectiveAction === 'CHECK_IN'
      ? timeStr
      : normalizeHHmm(params.checkInTimeOverride ?? existing?.check_in ?? null);
  const nextCheckOut =
    effectiveAction === 'CHECK_OUT'
      ? isRealtimePunch
        ? liveHHmm
        : timeStr
      : normalizeHHmm(existing?.check_out ?? null);
  const evalResult = evaluateDailyPunch({
    shiftCode: emp.work_shift_code || 'HC-08:00',
    checkIn: nextCheckIn,
    checkOut: nextCheckOut,
    date: dateStr,
    todayDate: todayVN,
    nowHHmm: timeStr,
  });

  const resolvedSource = params.source ?? 'WEB_CLOCK';
  const isFaceIris =
    resolvedSource === 'BIOMETRIC_FACE_IRIS' ||
    params.authMethod === 'CAMERA_FACE_IRIS' ||
    params.biometricModality === 'FACE_IRIS';
  const isFingerprint =
    resolvedSource === 'BIOMETRIC_FINGERPRINT' ||
    params.authMethod === 'WEBAUTHN_FINGERPRINT' ||
    params.biometricModality === 'FINGERPRINT';
  const isBiometric = isFaceIris || isFingerprint;
  const autoCutoffNote =
    evalResult.status === 'MISSING_PUNCH' &&
    nextCheckIn &&
    !nextCheckOut &&
    dateStr === todayVN
      ? DAILY_AUTO_CUTOFF_NOTE
      : undefined;

  const saved = upsertDailyAttendanceInternal({
    id: existing?.id ?? `datt-${dateStr.replace(/-/g, '')}-${emp.employee_code.slice(-3)}`,
    employee_id: emp.id,
    employee_code: emp.employee_code,
    full_name: emp.full_name,
    department_name: emp.department_name,
    date: dateStr,
    shift_code: emp.work_shift_code || 'HC-08:00',
    check_in: nextCheckIn,
    check_out: nextCheckOut,
    late_minutes: evalResult.late_minutes,
    early_leave_minutes: evalResult.early_leave_minutes,
    workday_value: evalResult.workday_value,
    overtime_hours: existing?.overtime_hours ?? 0,
    status: evalResult.status,
    note: params.note ?? autoCutoffNote ?? existing?.note,
    source: resolvedSource,
    auth_method:
      params.authMethod ??
      (isFaceIris
        ? 'CAMERA_FACE_IRIS'
        : isFingerprint
          ? 'WEBAUTHN_FINGERPRINT'
          : existing?.auth_method ?? 'MANUAL_WEB'),
    biometric_device_label: params.biometricDeviceLabel ?? existing?.biometric_device_label,
    biometric_modality:
      params.biometricModality ??
      (isFaceIris ? 'FACE_IRIS' : isFingerprint ? 'FINGERPRINT' : existing?.biometric_modality),
    liveness_score:
      typeof params.livenessScore === 'number' && Number.isFinite(params.livenessScore)
        ? params.livenessScore
        : existing?.liveness_score,
    face_match_score:
      typeof params.faceMatchScore === 'number' && Number.isFinite(params.faceMatchScore)
        ? params.faceMatchScore
        : existing?.face_match_score,
    verified_network_ip: params.verifiedNetworkIp ?? existing?.verified_network_ip,
    wifi_match_mode: params.wifiMatchMode ?? existing?.wifi_match_mode,
  });

  recomputeMonthlyAttendance(dateStr.slice(0, 7), emp.id);

  recordAuditLog({
    actor_name: emp.full_name,
    actor_code: emp.employee_code,
    actor_role: emp.role_code,
    action: isBiometric ? 'BIOMETRIC_CHECK_IN_OUT' : 'CHECK_IN_OUT',
    target: `${emp.employee_code} · ${dateStr}`,
    detail: isFaceIris
      ? `Chấm công khuôn mặt ${effectiveAction === 'CHECK_IN' ? 'Check-in' : 'Check-out'} lúc ${timeStr} qua [${params.biometricDeviceLabel || 'Camera Khuôn mặt'}]${typeof params.faceMatchScore === 'number' ? ` · Khớp ${(params.faceMatchScore * 100).toFixed(1)}%` : ''}${typeof params.livenessScore === 'number' ? ` · Liveness ${(params.livenessScore * 100).toFixed(0)}%` : ''} · WiFi IP ${params.verifiedNetworkIp || 'Nội bộ'} (${params.wifiMatchMode || 'SAME_WIFI'}) -> ${saved.status} (${saved.workday_value} công).`
      : isBiometric
        ? `Chấm công vân tay ${effectiveAction === 'CHECK_IN' ? 'Check-in' : 'Check-out'} lúc ${timeStr} qua [${params.biometricDeviceLabel || 'Thiết bị sinh trắc học'}] · WiFi IP ${params.verifiedNetworkIp || 'Nội bộ'} (${params.wifiMatchMode || 'SAME_WIFI'}) -> ${saved.status} (${saved.workday_value} công).`
        : `Thực hiện ${effectiveAction === 'CHECK_IN' ? 'Check-in' : 'Check-out'} lúc ${timeStr} -> trạng thái ${saved.status} (${saved.workday_value} công).`,
  });

  return saved;
}

export function importDailyAttendances(
  rows: Array<{
    employee_code: string;
    date: string;
    check_in?: string | null;
    check_out?: string | null;
    shift_code?: string;
    overtime_hours?: number;
    note?: string;
  }>,
  actorName = 'HR Admin'
): {
  importedCount: number;
  missingPunchCount: number;
  records: DailyAttendanceRecord[];
} {
  const allEmps = getAllRuntimeEmployees();
  const current = getDailyAttendances();
  const importedRecords: DailyAttendanceRecord[] = [];
  const affectedMonths = new Set<string>();
  let missingPunchCount = 0;

  const workingMap = new Map<string, DailyAttendanceRecord>();
  for (const item of current) {
    workingMap.set(`${item.employee_code}:${item.date}`, item);
  }

  for (const row of rows) {
    const emp = allEmps.find((e) => e.employee_code === row.employee_code.trim());
    if (!emp) continue;
    const shiftCode = row.shift_code || emp.work_shift_code || 'HC-08:00';
    const evalRes = evaluateDailyPunch({
      shiftCode,
      checkIn: row.check_in ?? null,
      checkOut: row.check_out ?? null,
    });
    if (evalRes.status === 'MISSING_PUNCH') {
      missingPunchCount += 1;
    }
    const key = `${emp.employee_code}:${row.date}`;
    const prev = workingMap.get(key);
    const nextRec: DailyAttendanceRecord = {
      id: prev?.id ?? `datt-imp-${row.date.replace(/-/g, '')}-${emp.employee_code.slice(-3)}`,
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      department_name: emp.department_name,
      date: row.date,
      shift_code: shiftCode,
      check_in: row.check_in ?? null,
      check_out: row.check_out ?? null,
      late_minutes: evalRes.late_minutes,
      early_leave_minutes: evalRes.early_leave_minutes,
      workday_value: evalRes.workday_value,
      overtime_hours: row.overtime_hours ?? prev?.overtime_hours ?? 0,
      status: evalRes.status,
      note:
        row.note ??
        (evalRes.status === 'MISSING_PUNCH'
          ? 'Thiếu 1 đầu chấm công từ dữ liệu máy sinh trắc học (0 công đến khi duyệt giải trình).'
          : undefined),
      source: 'BIOMETRIC_IMPORT',
    };
    workingMap.set(key, nextRec);
    importedRecords.push(nextRec);
    affectedMonths.add(row.date.slice(0, 7));
  }

  const mergedAll = Array.from(workingMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  writeStorageArray(STORAGE_DAILY_ATTENDANCE_KEY, mergedAll);

  for (const month of Array.from(affectedMonths)) {
    recomputeMonthlyAttendance(month);
  }

  recordAuditLog({
    actor_name: actorName,
    actor_code: 'HR-ATT',
    actor_role: 'HR_MANAGER',
    action: 'ATTENDANCE_IMPORT',
    target: `Import ${importedRecords.length} dòng chấm công`,
    detail: `Đã đồng bộ ${importedRecords.length} bản ghi chấm công máy vân tay (phát hiện ${missingPunchCount} ca quên chấm công MISSING_PUNCH).`,
  });

  return {
    importedCount: importedRecords.length,
    missingPunchCount,
    records: importedRecords,
  };
}
