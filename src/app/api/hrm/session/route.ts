import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { RouterStateStore } from '@/lib/hrm/copilot-router';
import type { RoleCode } from '@/lib/hrm/types';
import {
  ALLOWED_SESSION_ROLES,
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  extractSessionCookieToken,
  extractTrustedClientIp,
  isJsonContentType,
  isStrictSameOriginRequest,
  revokeSessionToken,
  verifySessionFromRequest,
} from '@/lib/hrm/session-server';
import { MOCK_ROLES, MOCK_SYSTEM_USERS } from '@/mock/admin';
import { MOCK_EMPLOYEES } from '@/mock/employees';
import type { Employee, SystemUserAccount } from '@/mock/types';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreDiskSig: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmCopilotRouterStore: RouterStateStore | undefined;
  // eslint-disable-next-line no-var
  var _hrmLoginFailureRateLimit:
    | Map<string, { failures: number; resetAt: number }>
    | undefined;
  // eslint-disable-next-line no-var
  var _hrmRegisteredPasswordDigests: Map<string, string> | undefined;
}

type StoredRuntimeUser = SystemUserAccount & {
  password?: string;
  password_hash?: string;
};

const DATA_FILE = path.join(process.cwd(), '.data', 'runtime-sync.json');
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_BODY_BYTES = 16 * 1024;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_MAX_BUCKETS = 2000;

const INTERNAL_CORPORATE_DOMAINS = new Set(['lacviethrm.vn', 'hrm-enterprise.vn']);

const CANONICAL_DEMO_CODES: Record<RoleCode, string> = {
  SUPER_ADMIN: 'NV-2024-001',
  DIRECTOR: 'NV-2024-000',
  HR_MANAGER: 'NV-2024-002',
  DEPT_MANAGER: 'NV-2024-003',
  EMPLOYEE: 'NV-2024-004',
  CANDIDATE: '',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasForbiddenPrototypeKey(obj: Record<string, unknown>, depth = 0): boolean {
  if (depth > 4) return false;
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    const val = obj[key];
    if (isPlainObject(val) && hasForbiddenPrototypeKey(val, depth + 1)) {
      return true;
    }
  }
  return false;
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function timingSafePasswordMatch(inputPassword: string, expectedSecretOrHash: string): boolean {
  const inputDigest = sha256Buffer(inputPassword);
  if (expectedSecretOrHash.startsWith('sha256:')) {
    const hex = expectedSecretOrHash.slice(7).trim();
    if (!/^[a-f0-9]{64}$/i.test(hex)) {
      return false;
    }
    const expectedDigest = Buffer.from(hex, 'hex');
    return (
      inputDigest.length === expectedDigest.length &&
      crypto.timingSafeEqual(inputDigest, expectedDigest)
    );
  }
  const expectedDigest = sha256Buffer(expectedSecretOrHash);
  return crypto.timingSafeEqual(inputDigest, expectedDigest);
}

function emailsMatchInternalAlias(
  emailA: string | undefined | null,
  emailB: string | undefined | null
): boolean {
  const a = emailA?.trim().toLowerCase();
  const b = emailB?.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const atA = a.lastIndexOf('@');
  const atB = b.lastIndexOf('@');
  if (atA <= 0 || atB <= 0) return false;
  const localA = a.slice(0, atA);
  const domainA = a.slice(atA + 1);
  const localB = b.slice(0, atB);
  const domainB = b.slice(atB + 1);
  return (
    localA === localB &&
    INTERNAL_CORPORATE_DOMAINS.has(domainA) &&
    INTERNAL_CORPORATE_DOMAINS.has(domainB)
  );
}

function isInternalCorporateEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const atIdx = normalized.lastIndexOf('@');
  if (atIdx <= 0) return false;
  return INTERNAL_CORPORATE_DOMAINS.has(normalized.slice(atIdx + 1));
}

function getLoginRateLimitMap(): Map<string, { failures: number; resetAt: number }> {
  if (!globalThis._hrmLoginFailureRateLimit) {
    globalThis._hrmLoginFailureRateLimit = new Map();
  }
  return globalThis._hrmLoginFailureRateLimit;
}

function checkLoginFailureLimit(rateKey: string): { allowed: boolean; retryAfterSec: number } {
  const map = getLoginRateLimitMap();
  const now = Date.now();
  const existing = map.get(rateKey);
  if (existing) {
    if (existing.resetAt <= now) {
      map.delete(rateKey);
      return { allowed: true, retryAfterSec: 0 };
    }
    if (existing.failures >= LOGIN_MAX_FAILURES) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordLoginFailure(rateKey: string): void {
  const map = getLoginRateLimitMap();
  const now = Date.now();
  const existing = map.get(rateKey);

  if (existing && existing.resetAt > now) {
    existing.failures += 1;
    return;
  }

  if (map.size >= LOGIN_MAX_BUCKETS) {
    map.forEach((val, key) => {
      if (val.resetAt <= now) map.delete(key);
    });
    while (map.size >= LOGIN_MAX_BUCKETS) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }

  map.set(rateKey, { failures: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
}

function clearLoginFailure(rateKey: string): void {
  getLoginRateLimitMap().delete(rateKey);
}

function getDiskSignature(): string {
  try {
    const stat = fs.statSync(DATA_FILE);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'MISSING';
  }
}

function clearCopilotRouterStoreIfPresent(): void {
  if (globalThis._hrmCopilotRouterStore) {
    const maybeClearable = globalThis._hrmCopilotRouterStore as RouterStateStore & {
      clear?: () => void;
    };
    if (typeof maybeClearable.clear === 'function') {
      maybeClearable.clear();
    }
    globalThis._hrmCopilotRouterStore = undefined;
  }
}

function getRuntimeStore(): Record<string, unknown> {
  const diskSig = getDiskSignature();
  if (globalThis._hrmSyncStore && globalThis._hrmSyncStoreDiskSig === diskSig) {
    return globalThis._hrmSyncStore;
  }
  if (diskSig !== 'MISSING') {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as unknown;
      if (isPlainObject(parsed)) {
        const rawEpoch = parsed._bootEpoch;
        const parsedBootEpoch =
          typeof rawEpoch === 'string' && rawEpoch.trim().length > 0
            ? rawEpoch.trim()
            : undefined;
        if (parsedBootEpoch !== globalThis._hrmSyncStoreBootEpoch) {
          globalThis._hrmSyncStoreBootEpoch = parsedBootEpoch;
          clearCopilotRouterStoreIfPresent();
        }
        globalThis._hrmSyncStore = parsed;
        globalThis._hrmSyncStoreDiskSig = diskSig;
        return parsed;
      }
    } catch {
      // fallback to static seeds
    }
  }
  if (globalThis._hrmSyncStoreBootEpoch !== undefined) {
    globalThis._hrmSyncStoreBootEpoch = undefined;
    clearCopilotRouterStoreIfPresent();
  }
  globalThis._hrmSyncStore = {};
  if (diskSig === 'MISSING') {
    globalThis._hrmSyncStoreDiskSig = diskSig;
  }
  return globalThis._hrmSyncStore;
}

function loadMergedEmployees(store: Record<string, unknown>): Employee[] {
  const merged = new Map<string, Employee>();
  for (const emp of MOCK_EMPLOYEES) {
    merged.set(emp.employee_code.toLowerCase(), emp);
  }

  for (const key of ['hrm_runtime_employees_v1', 'hrm_runtime_employees'] as const) {
    const raw = store[key];
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!isPlainObject(item) || hasForbiddenPrototypeKey(item)) continue;
      const code = String(item.employee_code || '').trim().toLowerCase();
      if (!code) continue;
      const existing = merged.get(code);
      merged.set(
        code,
        existing ? ({ ...existing, ...item } as Employee) : (item as unknown as Employee)
      );
    }
  }

  return Array.from(merged.values());
}

function loadMergedSystemUsers(store: Record<string, unknown>): {
  allUsers: StoredRuntimeUser[];
  runtimeUsers: StoredRuntimeUser[];
} {
  const merged = new Map<string, StoredRuntimeUser>();
  for (const u of MOCK_SYSTEM_USERS) {
    merged.set(u.email.toLowerCase(), u);
  }

  const runtimeUsers: StoredRuntimeUser[] = [];
  for (const key of ['hrm_runtime_users_v1', 'hrm_runtime_users'] as const) {
    const raw = store[key];
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!isPlainObject(item) || hasForbiddenPrototypeKey(item)) continue;
      const email = String(item.email || '').trim().toLowerCase();
      if (!email) continue;
      const typed = item as unknown as StoredRuntimeUser;
      runtimeUsers.push(typed);
      const existing = merged.get(email);
      merged.set(email, existing ? ({ ...existing, ...typed } as StoredRuntimeUser) : typed);
    }
  }

  return {
    allUsers: Array.from(merged.values()),
    runtimeUsers,
  };
}

function getDemoFallbackPassword(): string {
  return (process.env.HRM_DEMO_PASSWORD || '').trim() || 'LacVietHRM@2026';
}

function issueSessionResponse(
  req: Request,
  identity: { role: RoleCode; employeeCode: string; email: string; fullName: string }
) {
  try {
    const cookieHeader = buildSessionCookieHeader(req, identity);
    return NextResponse.json(
      {
        success: true,
        data: {
          authenticated: true,
          role: identity.role,
          employeeCode: identity.employeeCode,
          email: identity.email,
          fullName: identity.fullName,
        },
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': cookieHeader,
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SESSION_CONFIG_ERROR',
          message: 'Hệ thống chưa cấu hình khóa phiên bảo mật hợp lệ.',
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET(req: Request) {
  try {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return NextResponse.json({
        success: true,
        data: { authenticated: false },
      });
    }

    const session = verifySessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        {
          success: true,
          data: { authenticated: false },
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          authenticated: true,
          role: session.role,
          employeeCode: session.employeeCode,
          email: session.email,
          fullName: session.fullName,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      {
        success: true,
        data: { authenticated: false },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(req: Request) {
  if (!isStrictSameOriginRequest(req)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: 'Origin không hợp lệ hoặc không được phép khởi tạo phiên.',
        },
      },
      { status: 403 }
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
      { status: 415 }
    );
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload vượt quá giới hạn.' },
      },
      { status: 413 }
    );
  }

  let rawBody = '';
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'Không đọc được payload.' } },
      { status: 400 }
    );
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload vượt quá giới hạn.' },
      },
      { status: 413 }
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_JSON', message: 'JSON không hợp lệ.' } },
      { status: 400 }
    );
  }

  if (!isPlainObject(parsedBody) || hasForbiddenPrototypeKey(parsedBody)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'Cấu trúc payload không hợp lệ.' } },
      { status: 400 }
    );
  }

  const mode = typeof parsedBody.mode === 'string' ? parsedBody.mode.trim() : '';
  if (mode !== 'login' && mode !== 'register' && mode !== 'demo_switch') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INVALID_MODE',
          message: 'Trường mode phải là login, register hoặc demo_switch.',
        },
      },
      { status: 400 }
    );
  }

  const store = getRuntimeStore();
  const employees = loadMergedEmployees(store);
  const { allUsers, runtimeUsers } = loadMergedSystemUsers(store);

  if (mode === 'login') {
    const rawEmail = parsedBody.email;
    const rawPassword = parsedBody.password;
    if (
      typeof rawEmail !== 'string' ||
      typeof rawPassword !== 'string' ||
      !rawEmail.trim() ||
      !rawPassword ||
      rawEmail.trim().length > 160 ||
      rawPassword.length > 256
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Vui lòng cung cấp email và mật khẩu hợp lệ.',
          },
        },
        { status: 422 }
      );
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();
    const rateKey = `login:${extractTrustedClientIp(req)}:${normalizedEmail}`;
    const rateCheck = checkLoginFailureLimit(rateKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Bạn đã đăng nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSec),
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    let matchedUser =
      allUsers.find((u) => emailsMatchInternalAlias(u.email, normalizedEmail)) || null;
    const matchedEmployee =
      (matchedUser?.employee_code
        ? employees.find(
            (e) => e.employee_code.toLowerCase() === matchedUser!.employee_code.toLowerCase()
          ) || null
        : null) ||
      employees.find(
        (e) =>
          emailsMatchInternalAlias(e.email, normalizedEmail) ||
          (e.personal_email && e.personal_email.toLowerCase() === normalizedEmail)
      ) ||
      null;

    if (!matchedUser && matchedEmployee?.employee_code) {
      matchedUser =
        allUsers.find(
          (u) =>
            u.employee_code &&
            u.employee_code.toLowerCase() === matchedEmployee.employee_code.toLowerCase()
        ) || null;
    }

    if (!matchedUser && !matchedEmployee) {
      recordLoginFailure(rateKey);
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không chính xác.' },
        },
        { status: 401 }
      );
    }

    const expectedSecret =
      (typeof matchedUser?.password_hash === 'string' && matchedUser.password_hash) ||
      (typeof matchedUser?.password === 'string' && matchedUser.password) ||
      getDemoFallbackPassword();

    if (!timingSafePasswordMatch(rawPassword, expectedSecret)) {
      recordLoginFailure(rateKey);
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không chính xác.' },
        },
        { status: 401 }
      );
    }

    if (
      matchedUser?.account_status === 'LOCKED' ||
      matchedUser?.account_status === 'INACTIVE' ||
      matchedUser?.is_active === false ||
      matchedEmployee?.employment_status === 'RESIGNED'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Tài khoản đã bị khóa, ngừng hoạt động hoặc nhân sự đã nghỉ việc.',
          },
        },
        { status: 403 }
      );
    }

    clearLoginFailure(rateKey);

    const serverRole: RoleCode =
      matchedUser?.role_code || matchedEmployee?.role_code || 'EMPLOYEE';
    const serverCode =
      serverRole === 'CANDIDATE'
        ? ''
        : matchedEmployee?.employee_code || matchedUser?.employee_code || '';
    const serverEmail = matchedUser?.email || matchedEmployee?.email || normalizedEmail;
    const serverFullName =
      matchedEmployee?.full_name || matchedUser?.full_name || serverEmail;

    return issueSessionResponse(req, {
      role: serverRole,
      employeeCode: serverCode,
      email: serverEmail,
      fullName: serverFullName,
    });
  }

  if (mode === 'register') {
    const rawEmail = parsedBody.email;
    const rawPassword = parsedBody.password;
    const rawFullName = parsedBody.fullName;

    if (
      typeof rawEmail !== 'string' ||
      typeof rawPassword !== 'string' ||
      !EMAIL_REGEX.test(rawEmail.trim().toLowerCase()) ||
      rawEmail.trim().length > 160 ||
      rawPassword.length < 8 ||
      rawPassword.length > 256 ||
      (rawFullName !== undefined && rawFullName !== null && typeof rawFullName !== 'string')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Vui lòng cung cấp email hợp lệ và mật khẩu tối thiểu 8 ký tự.',
          },
        },
        { status: 422 }
      );
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();
    const cleanFullName =
      typeof rawFullName === 'string' && rawFullName.trim()
        ? rawFullName.trim().slice(0, 120)
        : normalizedEmail;

    if (parsedBody.role !== undefined && parsedBody.role !== 'EMPLOYEE') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_ROLE',
            message: 'Đăng ký tự phục vụ chỉ được cấp vai trò EMPLOYEE.',
          },
        },
        { status: 403 }
      );
    }

    const bodyEmployeeCode =
      typeof parsedBody.employeeCode === 'string' ? parsedBody.employeeCode.trim() : '';

    // Reject internal corporate domain emails or collisions with mock/privileged accounts
    const collidesWithMock =
      isInternalCorporateEmail(normalizedEmail) ||
      MOCK_SYSTEM_USERS.some((u) => emailsMatchInternalAlias(u.email, normalizedEmail)) ||
      MOCK_EMPLOYEES.some(
        (e) =>
          emailsMatchInternalAlias(e.email, normalizedEmail) ||
          (e.personal_email && e.personal_email.toLowerCase() === normalizedEmail)
      ) ||
      MOCK_ROLES.some((r) => {
        const emp = MOCK_EMPLOYEES.find((e) => e.employee_code === r.default_employee_code);
        return emp ? emailsMatchInternalAlias(emp.email, normalizedEmail) : false;
      });

    if (collidesWithMock) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_REGISTER_EMAIL',
            message: 'Không thể đăng ký bằng email nội bộ hoặc email tài khoản mẫu/quản trị.',
          },
        },
        { status: 403 }
      );
    }

    if (bodyEmployeeCode) {
      const collidesWithMockEmp = MOCK_EMPLOYEES.some(
        (e) => e.employee_code.toLowerCase() === bodyEmployeeCode.toLowerCase()
      );
      if (collidesWithMockEmp) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN_ROLE',
              message: 'Không được phép gắn mã nhân viên nội bộ có sẵn khi đăng ký.',
            },
          },
          { status: 403 }
        );
      }
    }

    const rateKey = `reg:${extractTrustedClientIp(req)}:${normalizedEmail}`;
    const rateCheck = checkLoginFailureLimit(rateKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Quá nhiều lần xác thực thất bại. Vui lòng thử lại sau 15 phút.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSec),
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const runtimeUser =
      runtimeUsers.find((u) => u.email.trim().toLowerCase() === normalizedEmail) || null;

    if (runtimeUser) {
      if (runtimeUser.role_code !== 'EMPLOYEE') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN_ROLE',
              message: 'Email này thuộc tài khoản có vai trò không hợp lệ để tự đăng ký.',
            },
          },
          { status: 403 }
        );
      }

      if (
        runtimeUser.account_status === 'LOCKED' ||
        runtimeUser.account_status === 'INACTIVE' ||
        runtimeUser.is_active === false
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ACCOUNT_DISABLED',
              message: 'Tài khoản đã bị khóa hoặc ngừng hoạt động.',
            },
          },
          { status: 403 }
        );
      }

      const storedSecret =
        (typeof runtimeUser.password_hash === 'string' && runtimeUser.password_hash) ||
        (typeof runtimeUser.password === 'string' && runtimeUser.password) ||
        '';
      if (!storedSecret || !timingSafePasswordMatch(rawPassword, storedSecret)) {
        recordLoginFailure(rateKey);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Thông tin xác thực tài khoản đăng ký không khớp.',
            },
          },
          { status: 401 }
        );
      }

      clearLoginFailure(rateKey);

      const matchedRtEmployee =
        employees.find(
          (e) =>
            e.email.toLowerCase() === normalizedEmail ||
            (runtimeUser.employee_code &&
              e.employee_code.toLowerCase() === runtimeUser.employee_code.toLowerCase())
        ) || null;

      if (matchedRtEmployee && matchedRtEmployee.role_code !== 'EMPLOYEE') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN_ROLE',
              message: 'Không được phép gắn hồ sơ ngoài vai trò EMPLOYEE.',
            },
          },
          { status: 403 }
        );
      }

      return issueSessionResponse(req, {
        role: 'EMPLOYEE',
        employeeCode: matchedRtEmployee?.employee_code || runtimeUser.employee_code || '',
        email: normalizedEmail,
        fullName: matchedRtEmployee?.full_name || runtimeUser.full_name || cleanFullName,
      });
    }

    // Not yet synced into runtime store: verify against server-side registration digest cache if seen before
    if (!globalThis._hrmRegisteredPasswordDigests) {
      globalThis._hrmRegisteredPasswordDigests = new Map();
    }
    const digestStore = globalThis._hrmRegisteredPasswordDigests;
    const incomingDigestHex = `sha256:${sha256Buffer(rawPassword).toString('hex')}`;
    const existingDigest = digestStore.get(normalizedEmail);
    if (existingDigest) {
      if (!timingSafePasswordMatch(rawPassword, existingDigest)) {
        recordLoginFailure(rateKey);
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Email đã được đăng ký với mật khẩu khác.',
            },
          },
          { status: 401 }
        );
      }
      clearLoginFailure(rateKey);
    } else {
      if (digestStore.size > 2000) {
        const oldest = digestStore.keys().next().value;
        if (oldest !== undefined) digestStore.delete(oldest);
      }
      digestStore.set(normalizedEmail, incomingDigestHex);
    }

    return issueSessionResponse(req, {
      role: 'EMPLOYEE',
      employeeCode: '',
      email: normalizedEmail,
      fullName: cleanFullName,
    });
  }

  // mode === 'demo_switch'
  const demoAuthEnabled =
    process.env.NODE_ENV !== 'production' || process.env.HRM_ENABLE_DEMO_AUTH === 'true';
  if (!demoAuthEnabled) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DEMO_AUTH_DISABLED',
          message: 'Chế độ chuyển vai trò demo không được phép trong môi trường production.',
        },
      },
      { status: 403 }
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(parsedBody, 'employeeCode') ||
    Object.prototype.hasOwnProperty.call(parsedBody, 'email')
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_OVERRIDE_FIELDS',
          message: 'Chế độ demo_switch không cho phép truyền employeeCode hoặc email từ client.',
        },
      },
      { status: 400 }
    );
  }

  const rawRole = parsedBody.role;
  if (typeof rawRole !== 'string' || !ALLOWED_SESSION_ROLES.has(rawRole.trim() as RoleCode)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Vai trò demo không hợp lệ.',
        },
      },
      { status: 422 }
    );
  }
  const targetRole = rawRole.trim() as RoleCode;
  const canonicalCode = CANONICAL_DEMO_CODES[targetRole];
  const roleDef = MOCK_ROLES.find((r) => r.role_code === targetRole);
  const INACTIVE_EMP_STATUSES = new Set(['RESIGNED', 'INACTIVE', 'TERMINATED']);
  const isActiveEmployee = (emp: Employee): boolean =>
    !INACTIVE_EMP_STATUSES.has(String(emp.employment_status || '').trim().toUpperCase());
  const isActiveUser = (usr: StoredRuntimeUser): boolean =>
    usr.account_status !== 'LOCKED' &&
    usr.account_status !== 'INACTIVE' &&
    usr.is_active !== false;
  const findLinkedUserByCode = (empCode: string): StoredRuntimeUser | null =>
    allUsers.find(
      (u) => String(u.employee_code || '').trim().toLowerCase() === empCode.toLowerCase()
    ) || null;

  let selectedEmp: Employee | null = null;
  let selectedUser: StoredRuntimeUser | null = null;

  if (canonicalCode) {
    const candidateEmp =
      employees.find((e) => e.employee_code.toLowerCase() === canonicalCode.toLowerCase()) || null;
    const candidateUser = findLinkedUserByCode(canonicalCode);
    const empRoleOk = candidateEmp ? candidateEmp.role_code === targetRole : false;
    const userRoleOk = candidateUser ? candidateUser.role_code === targetRole : true;
    if (
      candidateEmp &&
      isActiveEmployee(candidateEmp) &&
      (!candidateUser || isActiveUser(candidateUser)) &&
      empRoleOk &&
      userRoleOk
    ) {
      selectedEmp = candidateEmp;
      selectedUser = candidateUser;
    } else {
      for (const emp of employees) {
        if (!isActiveEmployee(emp)) continue;
        const linkedUser = findLinkedUserByCode(emp.employee_code);
        if (linkedUser && !isActiveUser(linkedUser)) continue;
        const empMatches = emp.role_code === targetRole;
        const userMatches = linkedUser ? linkedUser.role_code === targetRole : true;
        if (empMatches && userMatches) {
          selectedEmp = emp;
          selectedUser = linkedUser;
          break;
        }
      }
      if (!selectedEmp) {
        for (const usr of allUsers) {
          if (!isActiveUser(usr) || usr.role_code !== targetRole) continue;
          const usrCode = String(usr.employee_code || '').trim();
          const linkedEmp = usrCode
            ? employees.find((e) => e.employee_code.toLowerCase() === usrCode.toLowerCase()) || null
            : null;
          if (linkedEmp && (!isActiveEmployee(linkedEmp) || linkedEmp.role_code !== targetRole)) {
            continue;
          }
          selectedEmp = linkedEmp;
          selectedUser = usr;
          break;
        }
      }
    }
  } else if (targetRole === 'CANDIDATE') {
    selectedUser =
      allUsers.find((u) => isActiveUser(u) && u.role_code === 'CANDIDATE') || null;
  }

  const resolvedCode =
    targetRole === 'CANDIDATE'
      ? ''
      : selectedEmp?.employee_code || selectedUser?.employee_code || canonicalCode;
  const resolvedEmail =
    selectedEmp?.email ||
    selectedUser?.email ||
    (targetRole === 'CANDIDATE' ? 'minh.hoang@gmail.com' : '');
  const resolvedFullName =
    selectedEmp?.full_name ||
    selectedUser?.full_name ||
    roleDef?.default_user_name ||
    targetRole;

  return issueSessionResponse(req, {
    role: targetRole,
    employeeCode: resolvedCode,
    email: resolvedEmail,
    fullName: resolvedFullName,
  });
}

export async function DELETE(req: Request) {
  if (!isStrictSameOriginRequest(req)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: 'Origin không hợp lệ.',
        },
      },
      { status: 403 }
    );
  }

  const rawToken = extractSessionCookieToken(req);
  if (rawToken) {
    revokeSessionToken(rawToken);
  }

  const clearHeader = buildClearSessionCookieHeader(req);
  return NextResponse.json(
    {
      success: true,
      data: { authenticated: false },
    },
    {
      status: 200,
      headers: {
        'Set-Cookie': clearHeader,
        'Cache-Control': 'no-store',
      },
    }
  );
}
