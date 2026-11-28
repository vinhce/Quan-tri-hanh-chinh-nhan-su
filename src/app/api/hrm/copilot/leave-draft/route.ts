import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { HRM_CONFIG } from '@/lib/hrm/config';
import { formatEventId } from '@/lib/hrm/ids';
import { can } from '@/lib/hrm/permissions';
import {
  ALLOWED_SESSION_ROLES,
  extractTrustedClientIp,
  isJsonContentType,
  isStrictSameOriginRequest,
  verifySessionFromRequest,
  type HrmSessionPayload,
} from '@/lib/hrm/session-server';
import type { Actor, RoleCode } from '@/lib/hrm/types';
import {
  MOCK_ANNUAL_LEAVE_BALANCES,
  MOCK_LEAVE_OVERTIME_REQUESTS,
} from '@/mock/attendance';
import { MOCK_DEPARTMENTS, MOCK_EMPLOYEES } from '@/mock/employees';
import {
  isOfficialEmployeeStatus,
  type AnnualLeaveBalance,
  type ApprovalStep,
  type AuditLogEntry,
  type Department,
  type Employee,
  type LeaveOvertimeRequest,
  type RequestCategory,
} from '@/mock/types';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
  // eslint-disable-next-line no-var
  var _hrmBootEpoch: string | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');
const STORE_AUDIT_KEY = 'hrm_runtime_audit_logs';
const STORE_REQUESTS_CANONICAL_KEY = 'hrm_runtime_requests_v1';
const STORE_LEAVE_REQUESTS_KEY = 'hrm_runtime_leave_requests';
const STORE_LEAVE_BALANCES_KEY = 'hrm_runtime_leave_balances_v1';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_AUDIT_ENTRIES = 200;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const PRIVILEGED_ROLES: ReadonlySet<RoleCode> = new Set<RoleCode>([
  'SUPER_ADMIN',
  'DIRECTOR',
  'HR_MANAGER',
]);

const ROLE_RANK: Record<RoleCode, number> = {
  CANDIDATE: 0,
  EMPLOYEE: 1,
  DEPT_MANAGER: 2,
  HR_MANAGER: 3,
  DIRECTOR: 4,
  SUPER_ADMIN: 5,
};

const ALLOWED_LEAVE_CATEGORIES: ReadonlySet<RequestCategory> = new Set<RequestCategory>([
  'ANNUAL_LEAVE',
  'SICK_LEAVE',
  'UNPAID_LEAVE',
  'OVERTIME',
  'REMOTE_WORK',
  'LATE_EXPLANATION',
  'BUSINESS_TRIP',
  'OVERSEAS_BUSINESS_TRIP',
]);

const CATEGORY_LABELS: Record<RequestCategory, string> = {
  ANNUAL_LEAVE: 'Nghỉ phép năm có hưởng lương',
  SICK_LEAVE: 'Nghỉ ốm có giấy xác nhận y tế',
  UNPAID_LEAVE: 'Nghỉ không hưởng lương',
  OVERTIME: 'Đăng ký làm thêm giờ (OT)',
  REMOTE_WORK: 'Làm việc từ xa (WFH)',
  LATE_EXPLANATION: 'Giải trình chấm công / đi muộn',
  BUSINESS_TRIP: 'Công tác nội địa',
  OVERSEAS_BUSINESS_TRIP: 'Công tác nước ngoài',
};

const OT_MULTIPLIERS: Record<'WEEKDAY' | 'WEEKEND' | 'HOLIDAY', number> = {
  WEEKDAY: HRM_CONFIG.OT_MULTIPLIER_WEEKDAY,
  WEEKEND: HRM_CONFIG.OT_MULTIPLIER_WEEKEND,
  HOLIDAY: HRM_CONFIG.OT_MULTIPLIER_HOLIDAY,
};

const HANDOVER_PLACEHOLDERS = new Set([
  'chua chi dinh',
  'chua xac dinh',
  'khong co',
  'mac dinh',
  'none',
  'n/a',
  'null',
]);

interface ResolvedSessionActor {
  session: HrmSessionPayload;
  actor: Actor | null;
  employee: Employee | null;
  blockedImpersonation: boolean;
  isUnlinked: boolean;
  isResigned: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasForbiddenPrototypeKey(obj: Record<string, unknown>, depth = 0): boolean {
  if (depth > 5) return false;
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    const val = obj[key];
    if (isPlainObject(val) && hasForbiddenPrototypeKey(val, depth + 1)) {
      return true;
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        if (isPlainObject(item) && hasForbiddenPrototypeKey(item, depth + 1)) {
          return true;
        }
      }
    }
  }
  return false;
}

function stripVietnameseDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function getRuntimeStore(): Record<string, unknown> {
  if (globalThis._hrmSyncStore && Object.keys(globalThis._hrmSyncStore).length > 0) {
    return globalThis._hrmSyncStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (isPlainObject(parsed)) {
        const rawEpoch = parsed._bootEpoch;
        if (typeof rawEpoch === 'string' && rawEpoch.trim()) {
          globalThis._hrmBootEpoch = rawEpoch.trim();
        }
        const safeStore: Record<string, unknown> = Object.create(null);
        for (const [k, v] of Object.entries(parsed)) {
          if (k !== '_bootEpoch' && !FORBIDDEN_KEYS.has(k)) {
            safeStore[k] = v;
          }
        }
        globalThis._hrmSyncStore = safeStore;
        return safeStore;
      }
    }
  } catch {
    // ignore missing or corrupt runtime file
  }
  if (!globalThis._hrmSyncStore) {
    globalThis._hrmSyncStore = Object.create(null) as Record<string, unknown>;
  }
  return globalThis._hrmSyncStore;
}

function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = {
      ...(globalThis._hrmBootEpoch ? { _bootEpoch: globalThis._hrmBootEpoch } : {}),
      ...(globalThis._hrmSyncStore || {}),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // ignore write error in read-only environments
  }
}

function readStoreArrayByKeys(
  store: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown>[] {
  for (const key of keys) {
    const raw = store[key];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.filter((item): item is Record<string, unknown> => isPlainObject(item));
    }
  }
  return [];
}

function mergeSeedWithRuntime<T extends object>(
  seed: T[],
  runtimeRows: Record<string, unknown>[],
  keyFn: (row: Record<string, unknown>) => string
): T[] {
  const merged = new Map<string, T>();
  for (const item of seed) {
    const k = keyFn(item as unknown as Record<string, unknown>);
    if (k) merged.set(k, item);
  }
  for (const row of runtimeRows) {
    const k = keyFn(row);
    if (k) {
      const existing = merged.get(k);
      merged.set(
        k,
        existing
          ? ({ ...(existing as object), ...(row as object) } as T)
          : (row as unknown as T)
      );
    }
  }
  return Array.from(merged.values());
}

function appendLeaveAuditLog(
  req: Request,
  store: Record<string, unknown>,
  params: {
    actorCode: string;
    actorName: string;
    actorRole: RoleCode;
    action: 'COPILOT_RBAC_BLOCKED' | 'COPILOT_SECURITY_BLOCKED' | 'COPILOT_LEAVE_CREATED';
    status: 'SUCCESS' | 'BLOCKED';
    targetEntity: string;
    detail: string;
  }
): void {
  const raw = store[STORE_AUDIT_KEY];
  const logs = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const now = new Date();
  const entry: AuditLogEntry = {
    id: formatEventId('aud'),
    log_code: `AUD-${String(now.getTime()).slice(-6)}`,
    timestamp: now.toISOString(),
    actor_employee_code: params.actorCode || 'GUEST',
    actor_name: params.actorName || 'Khách chưa xác thực',
    actor_role: params.actorRole,
    ip_address: extractTrustedClientIp(req),
    action: params.action,
    module: params.status === 'BLOCKED' ? 'AI_COPILOT_SECURITY' : 'TIME_ATTENDANCE',
    target_entity: params.targetEntity.slice(0, 160),
    status: params.status,
    detail: params.detail.slice(0, 400),
  };
  store[STORE_AUDIT_KEY] = [entry, ...logs].slice(0, MAX_AUDIT_ENTRIES);
  persistStore();
}

/**
 * Resolves the verified HRM actor strictly from the HMAC-signed `hrm_session` cookie.
 * Never trusts employee identifiers or role claims from the request body.
 */
function resolveHrmSessionActor(
  req: Request,
  employees: Employee[]
): ResolvedSessionActor | null {
  const session = verifySessionFromRequest(req);
  if (!session) return null;

  const effectiveRole = session.role;
  const codeCandidate = session.employeeCode.trim();
  const cleanCode = codeCandidate.toUpperCase().startsWith('UV-') ? '' : codeCandidate;
  const cleanEmail = session.email.trim().toLowerCase();

  let matchedEmployee: Employee | null = null;
  if (cleanCode) {
    matchedEmployee =
      employees.find((e) => e.employee_code.toLowerCase() === cleanCode.toLowerCase()) || null;
  } else if (cleanEmail) {
    matchedEmployee =
      employees.find(
        (e) =>
          e.email.toLowerCase() === cleanEmail ||
          (e.personal_email && e.personal_email.toLowerCase() === cleanEmail)
      ) || null;
  }

  if (!matchedEmployee) {
    return {
      session,
      actor: null,
      employee: null,
      blockedImpersonation: false,
      isUnlinked: true,
      isResigned: false,
    };
  }

  const blockedImpersonation =
    ((effectiveRole === 'EMPLOYEE' || effectiveRole === 'DEPT_MANAGER') &&
      PRIVILEGED_ROLES.has(matchedEmployee.role_code)) ||
    ROLE_RANK[matchedEmployee.role_code] > ROLE_RANK[effectiveRole];

  if (blockedImpersonation) {
    return {
      session,
      actor: null,
      employee: null,
      blockedImpersonation: true,
      isUnlinked: false,
      isResigned: false,
    };
  }

  const isResigned = matchedEmployee.employment_status === 'RESIGNED';
  return {
    session,
    actor: {
      id: matchedEmployee.id,
      name: matchedEmployee.full_name,
      role: effectiveRole,
      departmentId: matchedEmployee.department_id,
      email: matchedEmployee.email,
    },
    employee: matchedEmployee,
    blockedImpersonation: false,
    isUnlinked: false,
    isResigned,
  };
}

function parseStrictDateToIso(rawInput: unknown): string | null {
  if (typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const vnMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (vnMatch) {
    day = Number(vnMatch[1]);
    month = Number(vnMatch[2]);
    year = Number(vnMatch[3]);
  } else {
    return null;
  }

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 2024 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsedMs = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(parsedMs)) return null;
  const check = new Date(parsedMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return iso;
}

function resolveHandoverEmployee(params: {
  handoverEmployeeCode: unknown;
  handoverToName: unknown;
  employees: Employee[];
  actorEmployee: Employee;
}): { ok: true; handoverToName: string | null } | { ok: false; message: string } {
  const { handoverEmployeeCode, handoverToName, employees, actorEmployee } = params;

  const rawCode =
    typeof handoverEmployeeCode === 'string' ? handoverEmployeeCode.trim() : '';
  const rawName =
    typeof handoverToName === 'string' ? handoverToName.trim() : '';

  if (rawCode) {
    const target = employees.find(
      (e) =>
        e.employee_code.toLowerCase() === rawCode.toLowerCase() &&
        e.employment_status !== 'RESIGNED'
    );
    if (!target) {
      return { ok: false, message: 'Mã nhân viên nhận bàn giao không tồn tại hoặc đã nghỉ việc.' };
    }
    if (target.employee_code.toLowerCase() === actorEmployee.employee_code.toLowerCase()) {
      return { ok: false, message: 'Không thể chọn chính bạn làm người nhận bàn giao.' };
    }
    return { ok: true, handoverToName: `${target.full_name} (${target.employee_code})` };
  }

  if (!rawName) {
    return { ok: true, handoverToName: null };
  }

  const asciiNorm = stripVietnameseDiacritics(rawName).toLowerCase().trim();
  if (HANDOVER_PLACEHOLDERS.has(asciiNorm)) {
    return { ok: true, handoverToName: null };
  }

  const embeddedCodeMatch = rawName.match(/\b(NV-\d{4}-\d+)\b/i);
  if (embeddedCodeMatch?.[1]) {
    const code = embeddedCodeMatch[1];
    const target = employees.find(
      (e) =>
        e.employee_code.toLowerCase() === code.toLowerCase() &&
        e.employment_status !== 'RESIGNED'
    );
    if (!target) {
      return { ok: false, message: 'Người nhận bàn giao không khớp với hồ sơ nhân sự hợp lệ.' };
    }
    if (target.employee_code.toLowerCase() === actorEmployee.employee_code.toLowerCase()) {
      return { ok: false, message: 'Không thể chọn chính bạn làm người nhận bàn giao.' };
    }
    return { ok: true, handoverToName: `${target.full_name} (${target.employee_code})` };
  }

  const targetByName = employees.find((e) => {
    if (e.employment_status === 'RESIGNED') return false;
    return stripVietnameseDiacritics(e.full_name).toLowerCase() === asciiNorm;
  });
  if (!targetByName) {
    return { ok: false, message: 'Người nhận bàn giao không tồn tại trong danh sách nhân sự đang làm việc.' };
  }
  if (targetByName.employee_code.toLowerCase() === actorEmployee.employee_code.toLowerCase()) {
    return { ok: false, message: 'Không thể chọn chính bạn làm người nhận bàn giao.' };
  }
  return { ok: true, handoverToName: `${targetByName.full_name} (${targetByName.employee_code})` };
}

function sanitizeReasonText(rawReason: unknown): string {
  if (typeof rawReason !== 'string') return '';
  return rawReason.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export async function POST(req: Request) {
  const store = getRuntimeStore();

  if (!isStrictSameOriginRequest(req)) {
    appendLeaveAuditLog(req, store, {
      actorCode: 'GUEST',
      actorName: 'Nguồn không hợp lệ',
      actorRole: 'CANDIDATE',
      action: 'COPILOT_SECURITY_BLOCKED',
      status: 'BLOCKED',
      targetEntity: 'POST /api/hrm/copilot/leave-draft (origin)',
      detail: 'Chặn yêu cầu tạo đơn từ trợ lý do sai Origin/Same-Site.',
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: 'Origin không hợp lệ hoặc không được phép gửi yêu cầu.',
        },
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!isJsonContentType(req)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Yêu cầu Content-Type: application/json.',
        },
      },
      { status: 415, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const employees = mergeSeedWithRuntime<Employee>(
    MOCK_EMPLOYEES,
    readStoreArrayByKeys(store, ['hrm_runtime_employees_v1', 'hrm_runtime_employees']),
    (row) => String(row.employee_code || row.id || '').trim()
  );

  const resolved = resolveHrmSessionActor(req, employees);
  if (!resolved) {
    appendLeaveAuditLog(req, store, {
      actorCode: 'GUEST',
      actorName: 'Chưa đăng nhập',
      actorRole: 'CANDIDATE',
      action: 'COPILOT_SECURITY_BLOCKED',
      status: 'BLOCKED',
      targetEntity: 'POST /api/hrm/copilot/leave-draft (401)',
      detail: 'Từ chối tạo đơn vì thiếu cookie phiên hợp lệ hoặc phiên đã hết hạn.',
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
        },
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { session, actor, employee, blockedImpersonation, isUnlinked, isResigned } = resolved;

  if (!ALLOWED_SESSION_ROLES.has(session.role) || session.role === 'CANDIDATE') {
    appendLeaveAuditLog(req, store, {
      actorCode: session.employeeCode || 'UV',
      actorName: session.fullName || 'Ứng viên',
      actorRole: session.role,
      action: 'COPILOT_RBAC_BLOCKED',
      status: 'BLOCKED',
      targetEntity: 'POST /api/hrm/copilot/leave-draft (role)',
      detail: `Chặn vai trò ${session.role} tạo đơn nghỉ phép qua trợ lý.`,
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: 'Vai trò hiện tại không có quyền tạo đơn từ nhân sự.',
        },
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (blockedImpersonation || isUnlinked || isResigned || !actor || !employee) {
    appendLeaveAuditLog(req, store, {
      actorCode: employee?.employee_code || session.employeeCode || 'UNLINKED',
      actorName: employee?.full_name || session.fullName || session.email || 'Chưa liên kết',
      actorRole: session.role,
      action: 'COPILOT_RBAC_BLOCKED',
      status: 'BLOCKED',
      targetEntity: 'POST /api/hrm/copilot/leave-draft (actor)',
      detail: blockedImpersonation
        ? 'Chặn tạo đơn do lệch vai trò phiên và hồ sơ nhân sự.'
        : isResigned
          ? 'Chặn tạo đơn do nhân sự đã nghỉ việc.'
          : 'Chặn tạo đơn do tài khoản chưa liên kết hồ sơ nhân sự chính thức.',
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_UNLINKED',
          message: 'Tài khoản chưa liên kết hồ sơ nhân sự hợp lệ nên không thể tạo đơn.',
        },
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!can(actor, 'create_leave_request')) {
    appendLeaveAuditLog(req, store, {
      actorCode: employee.employee_code,
      actorName: employee.full_name,
      actorRole: session.role,
      action: 'COPILOT_RBAC_BLOCKED',
      status: 'BLOCKED',
      targetEntity: 'POST /api/hrm/copilot/leave-draft (permission)',
      detail: `Vai trò ${session.role} không có quyền create_leave_request.`,
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ACTION',
          message: 'Bạn không có quyền thực hiện thao tác tạo đơn.',
        },
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Kích thước dữ liệu vượt quá giới hạn cho phép.',
        },
      },
      { status: 413, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let rawBodyText = '';
  try {
    rawBodyText = await req.text();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INVALID_BODY', message: 'Không đọc được nội dung yêu cầu.' },
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (Buffer.byteLength(rawBodyText, 'utf-8') > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Kích thước dữ liệu vượt quá giới hạn cho phép.',
        },
      },
      { status: 413, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INVALID_JSON', message: 'Dữ liệu gửi lên không đúng định dạng JSON.' },
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!isPlainObject(parsedBody) || hasForbiddenPrototypeKey(parsedBody)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'INVALID_BODY', message: 'Cấu trúc dữ liệu gửi lên không hợp lệ.' },
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Strictly ignore any client-supplied employeeCode/employeeId/role
  const rawType = String(
    parsedBody.type ?? parsedBody.request_category ?? parsedBody.parsed_category ?? ''
  ).trim() as RequestCategory;
  if (!ALLOWED_LEAVE_CATEGORIES.has(rawType)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Loại đơn không hợp lệ.',
          fieldErrors: { type: 'Vui lòng chọn loại đơn hợp lệ.' },
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const startIso = parseStrictDateToIso(
    parsedBody.startDate ?? parsedBody.start_date ?? parsedBody.parsed_start_date
  );
  if (!startIso) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ngày bắt đầu không hợp lệ (hỗ trợ YYYY-MM-DD hoặc DD/MM/YYYY).',
          fieldErrors: { startDate: 'Ngày bắt đầu không hợp lệ.' },
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const rawEndInput =
    parsedBody.endDate ?? parsedBody.end_date ?? parsedBody.parsed_end_date;
  const endIso =
    rawEndInput === undefined || rawEndInput === null || String(rawEndInput).trim() === ''
      ? startIso
      : parseStrictDateToIso(rawEndInput);
  if (!endIso || endIso < startIso) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ngày kết thúc không hợp lệ hoặc nhỏ hơn ngày bắt đầu.',
          fieldErrors: { endDate: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.' },
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const rawDays = Number(
    parsedBody.daysCount ?? parsedBody.days_count ?? parsedBody.parsed_duration_days
  );
  if (!Number.isFinite(rawDays) || rawDays < 0.5 || rawDays > 30) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Số ngày/giờ đăng ký phải nằm trong khoảng 0.5 đến 30.',
          fieldErrors: { daysCount: 'Giá trị phải từ 0.5 đến 30.' },
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const daysCount = Math.round(rawDays * 2) / 2;

  const reason = sanitizeReasonText(parsedBody.reason ?? parsedBody.parsed_reason);
  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Lý do tạo đơn phải từ 3 đến 500 ký tự.',
          fieldErrors: { reason: 'Vui lòng nhập lý do từ 3 đến 500 ký tự.' },
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const handoverResult = resolveHandoverEmployee({
    handoverEmployeeCode: parsedBody.handoverEmployeeCode ?? parsedBody.handover_employee_code,
    handoverToName: parsedBody.handoverToName ?? parsedBody.handover_to_name,
    employees,
    actorEmployee: employee,
  });
  if (!handoverResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: handoverResult.message,
          fieldErrors: { handoverEmployeeCode: handoverResult.message },
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const requestYear = Number.parseInt(startIso.slice(0, 4), 10) || 2026;
  const runtimeBalances = readStoreArrayByKeys(store, [STORE_LEAVE_BALANCES_KEY]);
  const mergedBalances = mergeSeedWithRuntime<AnnualLeaveBalance>(
    MOCK_ANNUAL_LEAVE_BALANCES,
    runtimeBalances,
    (row) => `${String(row.employee_code || row.employee_id || '').trim()}:${String(row.year || 2026)}`
  );

  let targetBalance: AnnualLeaveBalance | null = null;
  if (rawType === 'ANNUAL_LEAVE') {
    if (employee.employment_status === 'PROBATION') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PROBATION_NO_ANNUAL_LEAVE',
            message:
              'Nhân sự đang thử việc có 0 ngày phép năm khả dụng. Vui lòng chọn loại Nghỉ không hưởng lương.',
          },
        },
        { status: 422, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    targetBalance =
      mergedBalances.find(
        (b) =>
          (b.employee_code === employee.employee_code || b.employee_id === employee.id) &&
          b.year === requestYear
      ) ||
      (isOfficialEmployeeStatus(employee.employment_status)
        ? {
            id: `alb-rt-${employee.employee_code}-${requestYear}`,
            employee_id: employee.id,
            employee_code: employee.employee_code,
            full_name: employee.full_name,
            department_name: employee.department_name,
            year: requestYear,
            total_entitled_days: HRM_CONFIG.ANNUAL_LEAVE_DEFAULT_DAYS,
            carried_over_days: 0,
            used_days: 0,
            pending_days: 0,
            remaining_days: HRM_CONFIG.ANNUAL_LEAVE_DEFAULT_DAYS,
          }
        : null);

    const availableDays = targetBalance
      ? Math.min(
          targetBalance.remaining_days,
          Math.max(
            0,
            targetBalance.total_entitled_days +
              targetBalance.carried_over_days -
              targetBalance.used_days -
              targetBalance.pending_days
          )
        )
      : 0;

    if (daysCount > availableDays) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INSUFFICIENT_LEAVE_BALANCE',
            message: `Số ngày xin nghỉ (${daysCount} ngày) vượt quá quỹ phép khả dụng (${availableDays} ngày).`,
          },
        },
        { status: 422, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  const existingRequests = mergeSeedWithRuntime<LeaveOvertimeRequest>(
    MOCK_LEAVE_OVERTIME_REQUESTS,
    readStoreArrayByKeys(store, [STORE_REQUESTS_CANONICAL_KEY, STORE_LEAVE_REQUESTS_KEY]),
    (row) => String(row.request_code || row.id || '').trim()
  );

  const maxCodeNum = existingRequests.reduce((max, r) => {
    const match = /^REQ-202611-(\d+)$/.exec(r.request_code || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 87);
  const nextCodeNum = String(maxCodeNum + 1).padStart(3, '0');
  const requestCode = `REQ-202611-${nextCodeNum}`;

  const departments = mergeSeedWithRuntime<Department>(
    MOCK_DEPARTMENTS,
    readStoreArrayByKeys(store, ['hrm_runtime_departments_v1']),
    (row) => String(row.id || row.department_code || '').trim()
  );

  const matchedDept = departments.find(
    (d) => d.id === employee.department_id || d.department_name === employee.department_name
  );
  const directManager =
    (employee.manager_id
      ? employees.find((e) => e.id === employee.manager_id)
      : null) ??
    (matchedDept?.manager_id
      ? employees.find((e) => e.id === matchedDept.manager_id)
      : null) ??
    employees.find((e) => e.employee_code === 'NV-2024-003') ??
    null;

  const hrManager = employees.find((e) => e.role_code === 'HR_MANAGER') ?? null;
  const directorEmp = employees.find((e) => e.role_code === 'DIRECTOR') ?? null;

  const skipDeptManagerStep =
    session.role === 'DEPT_MANAGER' ||
    session.role === 'HR_MANAGER' ||
    session.role === 'DIRECTOR' ||
    session.role === 'SUPER_ADMIN';

  const durationUnit: 'NGAY' | 'GIO' = rawType === 'OVERTIME' ? 'GIO' : 'NGAY';
  const needsDirector =
    (durationUnit === 'NGAY' &&
      rawType !== 'LATE_EXPLANATION' &&
      daysCount > HRM_CONFIG.DIRECTOR_LEAVE_APPROVAL_DAYS_THRESHOLD) ||
    rawType === 'UNPAID_LEAVE' ||
    rawType === 'OVERSEAS_BUSINESS_TRIP';

  const steps: ApprovalStep[] = [
    {
      step_order: 1,
      role: 'DEPT_MANAGER',
      label: 'Cấp 1 · Trưởng bộ phận duyệt',
      status: skipDeptManagerStep ? 'SKIPPED' : 'PENDING',
      actor_name: directManager?.full_name ?? 'Quản lý trực tiếp',
      note: skipDeptManagerStep
        ? 'Tự động bỏ qua do người đề xuất thuộc cấp Quản lý'
        : undefined,
    },
    {
      step_order: 2,
      role: 'HR_MANAGER',
      label: 'Cấp 2 · Trưởng phòng Nhân sự kiểm tra',
      status: 'PENDING',
      actor_name: hrManager?.full_name ?? 'Trưởng phòng Nhân sự',
    },
  ];

  if (needsDirector) {
    steps.push({
      step_order: 3,
      role: 'DIRECTOR',
      label: `Cấp 3 · Giám đốc phê duyệt (${
        rawType === 'UNPAID_LEAVE'
          ? 'Nghỉ không lương'
          : rawType === 'OVERSEAS_BUSINESS_TRIP'
            ? 'Công tác nước ngoài'
            : `> ${HRM_CONFIG.DIRECTOR_LEAVE_APPROVAL_DAYS_THRESHOLD} ngày`
      })`,
      status: 'PENDING',
      actor_name: directorEmp?.full_name ?? 'Giám đốc Điều hành',
    });
  }

  const firstStepRole: 'DEPT_MANAGER' | 'HR_MANAGER' = skipDeptManagerStep
    ? 'HR_MANAGER'
    : 'DEPT_MANAGER';
  const firstApproverId = skipDeptManagerStep
    ? hrManager?.id ?? 'emp-002'
    : directManager?.id ?? 'emp-003';
  const firstApproverName = skipDeptManagerStep
    ? hrManager?.full_name ?? 'Trần Thị Bích Ngọc'
    : directManager?.full_name ?? 'Lê Hoàng Nam';

  const rawCheckIn =
    typeof parsedBody.actualCheckIn === 'string' && /^\d{2}:\d{2}$/.test(parsedBody.actualCheckIn.trim())
      ? parsedBody.actualCheckIn.trim()
      : '08:30';
  const rawCheckOut =
    typeof parsedBody.actualCheckOut === 'string' && /^\d{2}:\d{2}$/.test(parsedBody.actualCheckOut.trim())
      ? parsedBody.actualCheckOut.trim()
      : '17:30';

  const rawOtDayType = String(parsedBody.otDayType || 'WEEKDAY').trim().toUpperCase();
  const otDayType: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY' =
    rawOtDayType === 'WEEKEND' || rawOtDayType === 'HOLIDAY' ? rawOtDayType : 'WEEKDAY';

  const medicalDocNote =
    typeof parsedBody.medicalDocNote === 'string'
      ? sanitizeReasonText(parsedBody.medicalDocNote).slice(0, 200)
      : '';

  const createdRequest: LeaveOvertimeRequest = {
    id: formatEventId('req'),
    request_code: requestCode,
    employee_id: employee.id,
    employee_code: employee.employee_code,
    full_name: employee.full_name,
    department_name: employee.department_name,
    position_name: employee.position_name || 'Nhân viên',
    requester_role: session.role,
    request_category: rawType,
    category_label: CATEGORY_LABELS[rawType],
    start_datetime: `${startIso}T${rawType === 'LATE_EXPLANATION' ? rawCheckIn : '08:30'}:00+07:00`,
    end_datetime: `${endIso}T${rawType === 'LATE_EXPLANATION' ? rawCheckOut : '17:30'}:00+07:00`,
    duration_days_or_hours: daysCount,
    duration_unit: durationUnit,
    reason,
    handover_to_name: handoverResult.handoverToName,
    approver_id: firstApproverId,
    approver_name: firstApproverName,
    current_approver_id: firstApproverId,
    approval_status: 'PENDING',
    status: 'PENDING',
    current_step_role: firstStepRole,
    approval_steps: steps,
    leave_deducted: false,
    created_at: new Date().toISOString(),
    responded_at: null,
    source: 'AI_COPILOT',
    ...(rawType === 'SICK_LEAVE' && medicalDocNote ? { medical_doc_note: medicalDocNote } : {}),
    ...(rawType === 'OVERTIME'
      ? {
          ot_hours: daysCount,
          ot_day_type: otDayType,
          ot_multiplier: OT_MULTIPLIERS[otDayType],
        }
      : {}),
    ...(rawType === 'LATE_EXPLANATION'
      ? {
          target_date: startIso,
          actual_check_in: rawCheckIn,
          actual_check_out: rawCheckOut,
        }
      : {}),
  };

  const currentCanonicalReqs = readStoreArrayByKeys(store, [STORE_REQUESTS_CANONICAL_KEY]);
  const currentLegacyReqs = readStoreArrayByKeys(store, [STORE_LEAVE_REQUESTS_KEY]);
  store[STORE_REQUESTS_CANONICAL_KEY] = [createdRequest, ...currentCanonicalReqs];
  store[STORE_LEAVE_REQUESTS_KEY] = [createdRequest, ...currentLegacyReqs];

  if (rawType === 'ANNUAL_LEAVE' && targetBalance) {
    const updatedBalance: AnnualLeaveBalance = {
      ...targetBalance,
      pending_days: targetBalance.pending_days + daysCount,
    };
    const otherBalances = runtimeBalances.filter(
      (b) =>
        String(b.id || '') !== updatedBalance.id &&
        !(
          String(b.employee_code || '') === updatedBalance.employee_code &&
          Number(b.year || 2026) === updatedBalance.year
        )
    );
    store[STORE_LEAVE_BALANCES_KEY] = [updatedBalance, ...otherBalances];
  }

  appendLeaveAuditLog(req, store, {
    actorCode: employee.employee_code,
    actorName: employee.full_name,
    actorRole: session.role,
    action: 'COPILOT_LEAVE_CREATED',
    status: 'SUCCESS',
    targetEntity: `${createdRequest.request_code} (${createdRequest.category_label})`,
    detail: `Tạo đơn ${createdRequest.category_label} (${daysCount} ${durationUnit === 'GIO' ? 'giờ' : 'ngày'}, ${startIso} -> ${endIso}) từ trợ lý nhân sự.`,
  });

  return NextResponse.json(
    {
      success: true,
      data: createdRequest,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
