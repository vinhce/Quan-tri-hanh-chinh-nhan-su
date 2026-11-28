import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { formatEventId } from '@/lib/hrm/ids';
import type { RouterStateStore } from '@/lib/hrm/copilot-router';
import { can } from '@/lib/hrm/permissions';
import { submitConfirmedDraft } from '@/lib/hrm/request-service';
import {
  ALLOWED_SESSION_ROLES,
  extractTrustedClientIp,
  isJsonContentType,
  isStrictSameOriginRequest,
  verifySessionFromRequest,
  type HrmSessionPayload,
} from '@/lib/hrm/session-server';
import type { Actor, RoleCode } from '@/lib/hrm/types';
import { MOCK_EMPLOYEES } from '@/mock/employees';
import type { AuditLogEntry, Employee } from '@/mock/types';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
  // eslint-disable-next-line no-var
  var _hrmBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmCopilotRouterStore: RouterStateStore | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');
const STORE_AUDIT_KEY = 'hrm_runtime_audit_logs';
const STORE_EMPLOYEES_KEY = 'hrm_runtime_employees_v1';
const MAX_BODY_BYTES = 8 * 1024;
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

function getRuntimeStore(): Record<string, unknown> {
  if (globalThis._hrmSyncStore && Object.keys(globalThis._hrmSyncStore).length > 0) {
    return globalThis._hrmSyncStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (isPlainObject(parsed)) {
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
    // ignore corrupt runtime file
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
    // ignore read-only fs errors
  }
}

function loadMergedEmployees(store: Record<string, unknown>): Employee[] {
  const merged = new Map<string, Employee>();
  for (const e of MOCK_EMPLOYEES) {
    merged.set(e.id, e);
  }
  const raw = store[STORE_EMPLOYEES_KEY];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (isPlainObject(row) && typeof row.id === 'string') {
        const prev = merged.get(row.id);
        merged.set(
          row.id,
          prev ? ({ ...prev, ...row } as Employee) : (row as unknown as Employee)
        );
      }
    }
  }
  return Array.from(merged.values());
}

function appendSecurityAudit(
  req: Request,
  store: Record<string, unknown>,
  params: {
    actorCode: string;
    actorName: string;
    actorRole: RoleCode;
    action: string;
    targetEntity: string;
    detail: string;
  }
): void {
  const raw = store[STORE_AUDIT_KEY];
  const logs = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const now = new Date();
  const entry: AuditLogEntry & { created_via: 'assistant' } = {
    id: formatEventId('aud'),
    log_code: `AUD-${String(now.getTime()).slice(-6)}`,
    timestamp: now.toISOString(),
    actor_employee_code: params.actorCode || 'GUEST',
    actor_name: params.actorName || 'Khách chưa xác thực',
    actor_role: params.actorRole,
    ip_address: extractTrustedClientIp(req),
    action: params.action,
    module: 'AI_COPILOT_SECURITY',
    target_entity: params.targetEntity.slice(0, 160),
    status: 'BLOCKED',
    detail: params.detail.slice(0, 400),
    created_via: 'assistant',
  };
  store[STORE_AUDIT_KEY] = [entry, ...logs].slice(0, MAX_AUDIT_ENTRIES);
  persistStore();
}

function resolveSessionEmployee(
  session: HrmSessionPayload,
  employees: Employee[]
): {
  actor: Actor | null;
  employee: Employee | null;
  blockedImpersonation: boolean;
  isUnlinked: boolean;
  isResigned: boolean;
} {
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
      actor: null,
      employee: null,
      blockedImpersonation: true,
      isUnlinked: false,
      isResigned: false,
    };
  }

  const isResigned = matchedEmployee.employment_status === 'RESIGNED';
  return {
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

export async function POST(req: Request) {
  const noStoreHeaders = { 'Cache-Control': 'no-store' };

  // 1. Strict Same-Origin / CSRF check
  if (!isStrictSameOriginRequest(req)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: 'Yêu cầu không hợp lệ do sai nguồn gốc (CSRF/Origin).',
        },
      },
      { status: 403, headers: noStoreHeaders }
    );
  }

  // 2. Strict JSON Content-Type check
  if (!isJsonContentType(req)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Content-Type phải là application/json.',
        },
      },
      { status: 415, headers: noStoreHeaders }
    );
  }

  // 3. HMAC-signed session verification
  const session = verifySessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
        },
      },
      { status: 401, headers: noStoreHeaders }
    );
  }

  const store = getRuntimeStore();
  const employees = loadMergedEmployees(store);

  // 4. Role & RBAC checks strictly from verified session (never trust body userId/role)
  if (!ALLOWED_SESSION_ROLES.has(session.role) || session.role === 'CANDIDATE') {
    appendSecurityAudit(req, store, {
      actorCode: session.employeeCode || 'UV',
      actorName: session.fullName || 'Ứng viên',
      actorRole: session.role,
      action: 'ASSISTANT_SUBMIT_RBAC_BLOCKED',
      targetEntity: 'POST /api/requests/submit (role)',
      detail: `Chặn vai trò ${session.role} gửi đơn nháp.`,
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: 'Vai trò hiện tại không có quyền gửi đơn nhân sự.',
        },
      },
      { status: 403, headers: noStoreHeaders }
    );
  }

  const resolved = resolveSessionEmployee(session, employees);
  if (
    resolved.blockedImpersonation ||
    resolved.isUnlinked ||
    resolved.isResigned ||
    !resolved.actor ||
    !resolved.employee
  ) {
    appendSecurityAudit(req, store, {
      actorCode: resolved.employee?.employee_code || session.employeeCode || 'UNLINKED',
      actorName: resolved.employee?.full_name || session.fullName || 'Chưa liên kết',
      actorRole: session.role,
      action: 'ASSISTANT_SUBMIT_RBAC_BLOCKED',
      targetEntity: 'POST /api/requests/submit (actor)',
      detail: resolved.blockedImpersonation
        ? 'Chặn gửi đơn do lệch vai trò phiên và hồ sơ nhân sự.'
        : resolved.isResigned
          ? 'Chặn gửi đơn do nhân sự đã nghỉ việc.'
          : 'Chặn gửi đơn do tài khoản chưa liên kết hồ sơ nhân sự hợp lệ.',
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_UNLINKED',
          message: 'Tài khoản chưa liên kết hồ sơ nhân sự hợp lệ.',
        },
      },
      { status: 403, headers: noStoreHeaders }
    );
  }

  if (!can(resolved.actor, 'create_leave_request')) {
    appendSecurityAudit(req, store, {
      actorCode: resolved.employee.employee_code,
      actorName: resolved.employee.full_name,
      actorRole: session.role,
      action: 'ASSISTANT_SUBMIT_RBAC_BLOCKED',
      targetEntity: 'POST /api/requests/submit (permission)',
      detail: `Vai trò ${session.role} không có quyền create_leave_request.`,
    });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ACTION',
          message: 'Bạn không có quyền gửi đơn nhân sự.',
        },
      },
      { status: 403, headers: noStoreHeaders }
    );
  }

  // 5. Body size <= 8KB & JSON + prototype-pollution guards
  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Kích thước dữ liệu vượt quá giới hạn 8KB.',
        },
      },
      { status: 413, headers: noStoreHeaders }
    );
  }

  let rawBodyText = '';
  try {
    rawBodyText = await req.text();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_BODY',
          message: 'Không thể đọc dữ liệu yêu cầu.',
        },
      },
      { status: 400, headers: noStoreHeaders }
    );
  }

  if (Buffer.byteLength(rawBodyText, 'utf-8') > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Kích thước dữ liệu vượt quá giới hạn 8KB.',
        },
      },
      { status: 413, headers: noStoreHeaders }
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Dữ liệu JSON không hợp lệ.',
        },
      },
      { status: 400, headers: noStoreHeaders }
    );
  }

  if (!isPlainObject(parsedBody) || hasForbiddenPrototypeKey(parsedBody)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Payload không hợp lệ.',
        },
      },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const draftId =
    typeof parsedBody.draftId === 'string' ? parsedBody.draftId.trim() : '';
  const confirmToken =
    typeof parsedBody.confirmToken === 'string' ? parsedBody.confirmToken.trim() : '';

  if (!draftId || !confirmToken || draftId.length > 128 || confirmToken.length > 256) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Thiếu draftId hoặc confirmToken hợp lệ.',
          fieldErrors: {
            ...(draftId ? {} : { draftId: 'draftId là bắt buộc.' }),
            ...(confirmToken ? {} : { confirmToken: 'confirmToken là bắt buộc.' }),
          },
        },
      },
      { status: 422, headers: noStoreHeaders }
    );
  }

  // 6. Execute confirmed draft submission strictly using session-resolved employee
  const outcome = await submitConfirmedDraft({
    userId: resolved.employee.id,
    draftId,
    confirmToken,
    ipAddress: extractTrustedClientIp(req),
    actorRole: session.role,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: outcome.code,
          message: outcome.message,
        },
      },
      { status: outcome.status, headers: noStoreHeaders }
    );
  }

  // Bug 1A fix: reset shared router state for this employee to IDLE after successful submit
  globalThis._hrmCopilotRouterStore?.reset(resolved.employee.id);

  return NextResponse.json(
    {
      success: true,
      data: {
        requestCode: outcome.requestCode,
        nextApprover: outcome.nextApprover,
        reply: outcome.reply,
      },
    },
    { status: 201, headers: noStoreHeaders }
  );
}
