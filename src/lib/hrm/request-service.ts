import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { HRM_CONFIG, getRequiredNoticeDays } from '@/lib/hrm/config';
import { formatEventId } from '@/lib/hrm/ids';
import {
  DRAFT_RATE_LIMIT_MAX,
  DRAFT_RATE_LIMIT_WINDOW_MS,
  DRAFT_TTL_MS,
  TPL_SUBMITTED,
  TPL_VALIDATION_ERROR,
  stripDiacritics,
  type ColleagueCandidate,
  type DraftPreview,
  type DraftRecord,
  type OrderContext,
  type OrderSummary,
  type RequestInput,
  type RequestType,
  type RouterServices,
  type RouterStateStore,
  type Session,
  type ValidationError,
  type ValidationResult,
} from '@/lib/hrm/copilot-router';
import type { RoleCode } from '@/lib/hrm/types';
import { MOCK_SYSTEM_CONFIG, MOCK_SYSTEM_USERS } from '@/mock/admin';
import {
  MOCK_ANNUAL_LEAVE_BALANCES,
  MOCK_LEAVE_OVERTIME_REQUESTS,
  MOCK_MONTHLY_ATTENDANCE,
} from '@/mock/attendance';
import { MOCK_CONTRACTS, MOCK_DEPARTMENTS, MOCK_EMPLOYEES } from '@/mock/employees';
import {
  isOfficialEmployeeStatus,
  type AnnualLeaveBalance,
  type ApprovalStep,
  type AuditLogEntry,
  type Department,
  type Employee,
  type EmploymentContract,
  type LeaveOvertimeRequest,
  type MonthlyAttendanceSummary,
  type RequestCategory,
} from '@/mock/types';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
  // eslint-disable-next-line no-var
  var _hrmBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreDiskSig: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmCopilotRouterStore: RouterStateStore | undefined;
  // eslint-disable-next-line no-var
  var _hrmSessionSecret: string | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');

const STORE_AUDIT_KEY = 'hrm_runtime_audit_logs';
const STORE_REQUESTS_CANONICAL_KEY = 'hrm_runtime_requests_v1';
const STORE_LEAVE_REQUESTS_KEY = 'hrm_runtime_leave_requests';
const STORE_LEAVE_BALANCES_KEY = 'hrm_runtime_leave_balances_v1';
const STORE_MONTHLY_ATTENDANCE_KEY = 'hrm_runtime_monthly_attendance_v1';
const STORE_EMPLOYEES_KEY = 'hrm_runtime_employees_v1';
const STORE_CONTRACTS_KEY = 'hrm_runtime_contracts_v1';
const STORE_COPILOT_DRAFTS_KEY = 'hrm_runtime_copilot_drafts_v1';

const MAX_AUDIT_ENTRIES = 200;
const MIN_SECRET_LENGTH = 32;
const MONTHLY_EXPLANATION_LIMIT = 3;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface StoredCopilotDraft {
  draftId: string;
  userId: string;
  employeeCode: string;
  kind: 'create' | 'cancel';
  input?: RequestInput;
  targetRequestId?: string;
  preview: DraftPreview;
  contentHash: string;
  expiresAt: string;
  expiresAtMs: number;
  createdAtMs: number;
  status: 'ACTIVE' | 'SUBMITTED' | 'CANCELLED';
  submittedRequestCode?: string;
  submittedNextApprover?: string;
  submittedAt?: string;
}

export interface SubmitDraftSuccess {
  ok: true;
  idempotent: boolean;
  requestCode: string;
  nextApprover: string;
  reply: string;
  request?: LeaveOvertimeRequest;
}

export interface SubmitDraftFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export type SubmitDraftOutcome = SubmitDraftSuccess | SubmitDraftFailure;

// ---------------------------------------------------------------------------
// Runtime Store Helpers (100% compatible with copilot & leave-draft routes)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (isPlainObject(parsed)) {
        const rawEpoch = parsed._bootEpoch;
        const parsedBootEpoch =
          typeof rawEpoch === 'string' && rawEpoch.trim() ? rawEpoch.trim() : undefined;
        if (parsedBootEpoch !== globalThis._hrmSyncStoreBootEpoch) {
          globalThis._hrmSyncStoreBootEpoch = parsedBootEpoch;
          clearCopilotRouterStoreIfPresent();
        }
        globalThis._hrmBootEpoch = parsedBootEpoch;
        const safeStore: Record<string, unknown> = Object.create(null);
        for (const [k, v] of Object.entries(parsed)) {
          if (k !== '_bootEpoch' && !FORBIDDEN_KEYS.has(k)) {
            safeStore[k] = v;
          }
        }
        globalThis._hrmSyncStore = safeStore;
        globalThis._hrmSyncStoreDiskSig = diskSig;
        return safeStore;
      }
    } catch {
      // ignore missing or corrupt runtime file
    }
  }
  if (globalThis._hrmSyncStoreBootEpoch !== undefined) {
    globalThis._hrmSyncStoreBootEpoch = undefined;
    clearCopilotRouterStoreIfPresent();
  }
  globalThis._hrmBootEpoch = undefined;
  globalThis._hrmSyncStore = Object.create(null) as Record<string, unknown>;
  if (diskSig === 'MISSING') {
    globalThis._hrmSyncStoreDiskSig = diskSig;
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
    globalThis._hrmSyncStoreDiskSig = getDiskSignature();
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

// ---------------------------------------------------------------------------
// Security Helpers (HMAC confirmToken, Sanitization, Audit Log)
// ---------------------------------------------------------------------------

function getDraftHmacSecret(): string {
  const envSecret = (process.env.HRM_SESSION_SECRET || '').trim();
  if (envSecret.length >= MIN_SECRET_LENGTH) {
    return envSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('HRM_SESSION_SECRET must be set (>= 32 chars) in production.');
  }
  if (!globalThis._hrmSessionSecret || globalThis._hrmSessionSecret.length < MIN_SECRET_LENGTH) {
    globalThis._hrmSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis._hrmSessionSecret;
}

function computeContentHash(payload: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function signConfirmToken(params: {
  userId: string;
  draftId: string;
  contentHash: string;
  expiresAt: string;
}): string {
  const secret = getDraftHmacSecret();
  const data = `${params.userId}|${params.draftId}|${params.contentHash}|${params.expiresAt}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function verifyConfirmToken(params: {
  userId: string;
  draftId: string;
  contentHash: string;
  expiresAt: string;
  providedToken: string;
}): boolean {
  if (!params.providedToken || typeof params.providedToken !== 'string') return false;
  let expectedHex = '';
  try {
    expectedHex = signConfirmToken(params);
  } catch {
    return false;
  }
  const providedBuf = Buffer.from(params.providedToken.trim(), 'utf-8');
  const expectedBuf = Buffer.from(expectedHex, 'utf-8');
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export function sanitizePlainReason(raw: unknown, fallback = 'Không có lý do'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return cleaned || fallback;
}

function appendAssistantAuditLog(
  store: Record<string, unknown>,
  params: {
    actorCode: string;
    actorName: string;
    actorRole: RoleCode;
    ipAddress?: string;
    action: string;
    status: 'SUCCESS' | 'BLOCKED' | 'WARNING';
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
    actor_name: params.actorName || 'Người dùng',
    actor_role: params.actorRole,
    ip_address: params.ipAddress || 'assistant-router',
    action: params.action,
    module: params.status === 'BLOCKED' ? 'AI_COPILOT_SECURITY' : 'TIME_ATTENDANCE',
    target_entity: params.targetEntity.slice(0, 160),
    status: params.status,
    detail: params.detail.slice(0, 400),
    created_via: 'assistant',
  };
  store[STORE_AUDIT_KEY] = [entry, ...logs].slice(0, MAX_AUDIT_ENTRIES);
  persistStore();
}

// ---------------------------------------------------------------------------
// Domain Helpers (Employees, Holidays, OT Multiplier, Approval Chain, Dates)
// ---------------------------------------------------------------------------

function loadEmployees(store: Record<string, unknown>): Employee[] {
  return mergeSeedWithRuntime<Employee>(
    MOCK_EMPLOYEES,
    readStoreArrayByKeys(store, [STORE_EMPLOYEES_KEY]),
    (row) => String(row.id || row.employee_code || '').trim()
  );
}

function resolveEmployeeByUserId(employees: Employee[], userId: string): Employee | null {
  const key = (userId || '').trim().toLowerCase();
  if (!key) return null;

  const direct = employees.find(
    (e) =>
      e.id.toLowerCase() === key ||
      e.employee_code.toLowerCase() === key ||
      e.email.toLowerCase() === key
  );
  if (direct) return direct;

  const sysUser = MOCK_SYSTEM_USERS.find(
    (u) => u.id.toLowerCase() === key || u.user_code.toLowerCase() === key
  );
  if (sysUser) {
    return (
      employees.find(
        (e) => e.employee_code.toLowerCase() === sysUser.employee_code.toLowerCase()
      ) || null
    );
  }
  return null;
}

function loadRequests(store: Record<string, unknown>): LeaveOvertimeRequest[] {
  return mergeSeedWithRuntime<LeaveOvertimeRequest>(
    MOCK_LEAVE_OVERTIME_REQUESTS,
    readStoreArrayByKeys(store, [STORE_REQUESTS_CANONICAL_KEY, STORE_LEAVE_REQUESTS_KEY]),
    (row) => String(row.request_code || row.id || '').trim()
  );
}

function loadLeaveBalances(store: Record<string, unknown>): AnnualLeaveBalance[] {
  return mergeSeedWithRuntime<AnnualLeaveBalance>(
    MOCK_ANNUAL_LEAVE_BALANCES,
    readStoreArrayByKeys(store, [STORE_LEAVE_BALANCES_KEY]),
    (row) =>
      `${String(row.employee_code || row.employee_id || '').trim()}:${String(row.year || 2026)}`
  );
}

function loadContracts(store: Record<string, unknown>): EmploymentContract[] {
  return mergeSeedWithRuntime<EmploymentContract>(
    MOCK_CONTRACTS,
    readStoreArrayByKeys(store, [STORE_CONTRACTS_KEY]),
    (row) => String(row.id || row.contract_number || '').trim()
  );
}

function loadMonthlyAttendance(store: Record<string, unknown>): MonthlyAttendanceSummary[] {
  return mergeSeedWithRuntime<MonthlyAttendanceSummary>(
    MOCK_MONTHLY_ATTENDANCE,
    readStoreArrayByKeys(store, [STORE_MONTHLY_ATTENDANCE_KEY]),
    (row) => String(row.id || `${row.employee_code}:${row.month_period}`).trim()
  );
}

function readStoredDrafts(store: Record<string, unknown>): StoredCopilotDraft[] {
  const raw = store[STORE_COPILOT_DRAFTS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is StoredCopilotDraft =>
      isPlainObject(d) && typeof d.draftId === 'string' && typeof d.userId === 'string'
  );
}

function writeStoredDrafts(store: Record<string, unknown>, drafts: StoredCopilotDraft[]): void {
  store[STORE_COPILOT_DRAFTS_KEY] = drafts.slice(0, 300);
  persistStore();
}

function isStrictIsoDate(iso: string | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function getVnTodayIso(nowMs: number): string {
  const d = new Date(nowMs + 7 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

function diffDaysInclusive(startIso: string, endIso: string): number {
  const s = Date.parse(`${startIso}T00:00:00Z`);
  const e = Date.parse(`${endIso}T00:00:00Z`);
  return Math.floor((e - s) / 86_400_000) + 1;
}

function diffCalendarDays(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000);
}

function formatDateRangeText(startIso: string, endIso: string, session?: Session): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  };
  if (startIso === endIso) {
    if (session === 'am') return `ngày ${fmt(startIso)} (buổi sáng)`;
    if (session === 'pm') return `ngày ${fmt(startIso)} (buổi chiều)`;
    return `ngày ${fmt(startIso)} (cả ngày)`;
  }
  return `từ ${fmt(startIso)} đến ${fmt(endIso)}`;
}

function parseHmToMinutes(hm: string | undefined): number | null {
  if (!hm || !/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function resolveOtDayInfo(workDate: string): {
  otDayType: 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';
  otMultiplier: number;
} {
  const isHoliday = MOCK_SYSTEM_CONFIG.public_holidays_2026.some(
    (h) => workDate >= h.start_date && workDate <= h.end_date
  );
  if (isHoliday) {
    return { otDayType: 'HOLIDAY', otMultiplier: HRM_CONFIG.OT_MULTIPLIER_HOLIDAY };
  }
  const [y, m, d] = workDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) {
    return { otDayType: 'WEEKEND', otMultiplier: HRM_CONFIG.OT_MULTIPLIER_WEEKEND };
  }
  return { otDayType: 'WEEKDAY', otMultiplier: HRM_CONFIG.OT_MULTIPLIER_WEEKDAY };
}

const ROUTER_TYPE_TO_CATEGORY: Record<RequestType, RequestCategory> = {
  annual_leave: 'ANNUAL_LEAVE',
  unpaid_leave: 'UNPAID_LEAVE',
  sick_leave: 'SICK_LEAVE',
  attendance_explanation: 'LATE_EXPLANATION',
  overtime: 'OVERTIME',
};

const CATEGORY_TO_ROUTER_LABEL: Record<RequestCategory, string> = {
  ANNUAL_LEAVE: 'Nghỉ phép năm',
  SICK_LEAVE: 'Nghỉ ốm có giấy xác nhận y tế',
  UNPAID_LEAVE: 'Nghỉ không hưởng lương',
  OVERTIME: 'Đăng ký làm thêm giờ (OT)',
  REMOTE_WORK: 'Làm việc từ xa (WFH)',
  LATE_EXPLANATION: 'Giải trình chấm công / đi muộn',
  BUSINESS_TRIP: 'Công tác nội địa',
  OVERSEAS_BUSINESS_TRIP: 'Công tác nước ngoài',
};

function computeAvailableBalance(
  emp: Employee,
  balances: AnnualLeaveBalance[],
  year: number
): { balance: AnnualLeaveBalance | null; available: number } {
  if (emp.employment_status === 'PROBATION' || emp.employment_status === 'RESIGNED') {
    return { balance: null, available: 0 };
  }
  const found =
    balances.find(
      (b) =>
        (b.employee_code === emp.employee_code || b.employee_id === emp.id) &&
        b.year === year
    ) ||
    (isOfficialEmployeeStatus(emp.employment_status)
      ? {
          id: `alb-rt-${emp.employee_code}-${year}`,
          employee_id: emp.id,
          employee_code: emp.employee_code,
          full_name: emp.full_name,
          department_name: emp.department_name,
          year,
          total_entitled_days: HRM_CONFIG.ANNUAL_LEAVE_DEFAULT_DAYS,
          carried_over_days: 0,
          used_days: 0,
          pending_days: 0,
          remaining_days: HRM_CONFIG.ANNUAL_LEAVE_DEFAULT_DAYS,
        }
      : null);

  if (!found) return { balance: null, available: 0 };

  const available = Math.min(
    found.remaining_days,
    Math.max(
      0,
      found.total_entitled_days +
        found.carried_over_days -
        found.used_days -
        found.pending_days
    )
  );
  return { balance: found, available };
}

function buildApprovalMetadata(params: {
  store: Record<string, unknown>;
  employees: Employee[];
  employee: Employee;
  category: RequestCategory;
  daysCount: number;
}): {
  steps: ApprovalStep[];
  firstStepRole: 'DEPT_MANAGER' | 'HR_MANAGER';
  firstApproverId: string;
  firstApproverName: string;
  approvalFlow: string;
} {
  const { store, employees, employee, category, daysCount } = params;

  const departments = mergeSeedWithRuntime<Department>(
    MOCK_DEPARTMENTS,
    readStoreArrayByKeys(store, ['hrm_runtime_departments_v1']),
    (row) => String(row.id || row.department_code || '').trim()
  );
  const matchedDept = departments.find(
    (d) => d.id === employee.department_id || d.department_name === employee.department_name
  );
  const directManager =
    (employee.manager_id ? employees.find((e) => e.id === employee.manager_id) : null) ??
    (matchedDept?.manager_id ? employees.find((e) => e.id === matchedDept.manager_id) : null) ??
    employees.find((e) => e.employee_code === 'NV-2024-003') ??
    null;

  const hrManager = employees.find((e) => e.role_code === 'HR_MANAGER') ?? null;
  const directorEmp = employees.find((e) => e.role_code === 'DIRECTOR') ?? null;

  const skipDeptManagerStep =
    employee.role_code === 'DEPT_MANAGER' ||
    employee.role_code === 'HR_MANAGER' ||
    employee.role_code === 'DIRECTOR' ||
    employee.role_code === 'SUPER_ADMIN';

  const needsDirector =
    (category !== 'OVERTIME' &&
      category !== 'LATE_EXPLANATION' &&
      daysCount > HRM_CONFIG.DIRECTOR_LEAVE_APPROVAL_DAYS_THRESHOLD) ||
    category === 'UNPAID_LEAVE' ||
    category === 'OVERSEAS_BUSINESS_TRIP';

  const steps: ApprovalStep[] = [
    {
      step_order: 1,
      role: 'DEPT_MANAGER',
      label: 'Cấp 1 · Trưởng bộ phận duyệt',
      status: skipDeptManagerStep ? 'SKIPPED' : 'PENDING',
      actor_name: directManager?.full_name ?? 'Quản lý trực tiếp',
      ...(skipDeptManagerStep
        ? { note: 'Tự động bỏ qua do người đề xuất thuộc cấp Quản lý' }
        : {}),
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
        category === 'UNPAID_LEAVE'
          ? 'Nghỉ không lương'
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

  const flowNames: string[] = [];
  if (!skipDeptManagerStep) {
    flowNames.push(`Trưởng bộ phận (${directManager?.full_name ?? 'Quản lý trực tiếp'})`);
  }
  flowNames.push(`HR (${hrManager?.full_name ?? 'Trưởng phòng Nhân sự'})`);
  if (needsDirector) {
    flowNames.push(`Giám đốc (${directorEmp?.full_name ?? 'Giám đốc Điều hành'})`);
  }

  return {
    steps,
    firstStepRole,
    firstApproverId,
    firstApproverName,
    approvalFlow: flowNames.join(' → '),
  };
}

function getExplanationsCountInMonth(
  requests: LeaveOvertimeRequest[],
  employee: Employee,
  monthPeriod: string
): number {
  return requests.filter((r) => {
    const isOwner = r.employee_id === employee.id || r.employee_code === employee.employee_code;
    if (!isOwner || r.request_category !== 'LATE_EXPLANATION') return false;
    if (r.status === 'CANCELLED' || r.approval_status === 'REJECTED') return false;
    const reqDate = (r.target_date || r.start_datetime || '').slice(0, 7);
    return reqDate === monthPeriod;
  }).length;
}

// ---------------------------------------------------------------------------
// Core Validation (shared by validateRequest & submitConfirmedDraft)
// ---------------------------------------------------------------------------

function validateInputForEmployee(params: {
  store: Record<string, unknown>;
  employees: Employee[];
  employee: Employee;
  input: RequestInput;
  nowMs: number;
}): ValidationResult {
  const { store, employees, employee, input, nowMs } = params;
  const errors: ValidationError[] = [];
  const todayIso = getVnTodayIso(nowMs);
  const category = ROUTER_TYPE_TO_CATEGORY[input.type];
  const typeLabel = CATEGORY_TO_ROUTER_LABEL[category];
  const reason = sanitizePlainReason(
    input.reason,
    input.type === 'attendance_explanation'
      ? 'Giải trình chấm công'
      : input.type === 'overtime'
        ? 'Làm thêm giờ theo yêu cầu công việc'
        : 'Không có lý do'
  );

  if (employee.employment_status === 'RESIGNED') {
    errors.push({
      code: 'OT_NOT_ELIGIBLE',
      message: 'Nhân sự đã nghỉ việc không thể tạo đơn mới.',
    });
    return { ok: false, errors };
  }

  const allRequests = loadRequests(store);
  const monthlySummaries = loadMonthlyAttendance(store);

  if (input.type === 'attendance_explanation') {
    const workDate = input.workDate || input.startDate;
    if (!workDate) {
      errors.push({ code: 'MISSING_FIELD', field: 'workDate', message: 'Thiếu ngày giải trình.' });
      return { ok: false, errors };
    }
    if (!isStrictIsoDate(workDate)) {
      errors.push({ code: 'INVALID_DATE_RANGE', message: 'Ngày giải trình không hợp lệ.' });
      return { ok: false, errors };
    }
    const monthPeriod = workDate.slice(0, 7);
    const monthRecord = monthlySummaries.find(
      (m) =>
        (m.employee_id === employee.id || m.employee_code === employee.employee_code) &&
        m.month_period === monthPeriod
    );
    if (
      monthRecord &&
      (String(monthRecord.attendance_status) === 'LOCKED' ||
        String(monthRecord.attendance_status) === 'CLOSED')
    ) {
      errors.push({
        code: 'TIMESHEET_LOCKED',
        message: `Bảng công kỳ ${monthPeriod} đã khóa, không thể giải trình bổ sung.`,
      });
      return { ok: false, errors };
    }
    const ageDays = diffCalendarDays(workDate, todayIso);
    if (ageDays > 7 || ageDays < 0) {
      errors.push({
        code: 'PAST_DEADLINE',
        message:
          ageDays < 0
            ? 'Không thể giải trình chấm công cho ngày trong tương lai.'
            : 'Đã quá thời hạn giải trình chấm công (tối đa 7 ngày).',
      });
      return { ok: false, errors };
    }

    const usedExplanations = getExplanationsCountInMonth(allRequests, employee, monthPeriod);
    if (usedExplanations >= MONTHLY_EXPLANATION_LIMIT) {
      errors.push({
        code: 'EXPLAIN_LIMIT',
        message: `Bạn đã dùng hết ${MONTHLY_EXPLANATION_LIMIT}/${MONTHLY_EXPLANATION_LIMIT} lượt giải trình trong tháng ${monthPeriod}.`,
      });
      return { ok: false, errors };
    }

    const flow = buildApprovalMetadata({
      store,
      employees,
      employee,
      category,
      daysCount: 1,
    });
    const explanationsLeft = Math.max(0, MONTHLY_EXPLANATION_LIMIT - usedExplanations - 1);

    return {
      ok: true,
      errors: [],
      normalized: {
        ...input,
        workDate,
        startDate: workDate,
        endDate: workDate,
        actualIn: input.actualIn || '08:30',
        actualOut: input.actualOut || '17:30',
        days: 1,
        reason,
        explanationsLeft,
        approvalFlow: flow.approvalFlow,
        nextApprover: flow.firstApproverName,
        typeLabel,
        dateText: formatDateRangeText(workDate, workDate, 'full'),
      },
    };
  }

  if (input.type === 'overtime') {
    const workDate = input.workDate || input.startDate;
    if (!workDate) {
      errors.push({ code: 'MISSING_FIELD', field: 'workDate', message: 'Thiếu ngày đăng ký OT.' });
      return { ok: false, errors };
    }
    if (!isStrictIsoDate(workDate)) {
      errors.push({ code: 'INVALID_DATE_RANGE', message: 'Ngày OT không hợp lệ.' });
      return { ok: false, errors };
    }
    if (employee.employment_status === 'PROBATION') {
      errors.push({
        code: 'OT_NOT_ELIGIBLE',
        message: 'Nhân sự đang thử việc chưa thuộc diện đăng ký làm thêm giờ (OT).',
      });
      return { ok: false, errors };
    }
    const startMin = parseHmToMinutes(input.otStart);
    const endMin = parseHmToMinutes(input.otEnd);
    if (startMin === null || endMin === null) {
      errors.push({ code: 'MISSING_FIELD', field: 'otTime', message: 'Thiếu khung giờ làm thêm.' });
      return { ok: false, errors };
    }
    const hours = Number(((endMin - startMin) / 60).toFixed(2));
    if (hours <= 0 || hours > 12) {
      errors.push({
        code: 'INVALID_DATE_RANGE',
        message: 'Khung giờ làm thêm (OT) phải lớn hơn 0 và tối đa 12 giờ.',
      });
      return { ok: false, errors };
    }
    if (diffCalendarDays(workDate, todayIso) > 0) {
      errors.push({
        code: 'PAST_DEADLINE',
        message: 'Không thể đăng ký làm thêm giờ (OT) cho ngày đã qua.',
      });
      return { ok: false, errors };
    }
    const monthPeriod = workDate.slice(0, 7);
    const monthRecord = monthlySummaries.find(
      (m) =>
        (m.employee_id === employee.id || m.employee_code === employee.employee_code) &&
        m.month_period === monthPeriod
    );
    if (
      monthRecord &&
      (String(monthRecord.attendance_status) === 'LOCKED' ||
        String(monthRecord.attendance_status) === 'CLOSED')
    ) {
      errors.push({
        code: 'TIMESHEET_LOCKED',
        message: `Bảng công kỳ ${monthPeriod} đã khóa, không thể đăng ký OT.`,
      });
      return { ok: false, errors };
    }

    const { otMultiplier } = resolveOtDayInfo(workDate);
    const flow = buildApprovalMetadata({
      store,
      employees,
      employee,
      category,
      daysCount: hours,
    });

    return {
      ok: true,
      errors: [],
      normalized: {
        ...input,
        workDate,
        startDate: workDate,
        endDate: workDate,
        hours,
        otMultiplier,
        reason,
        approvalFlow: flow.approvalFlow,
        nextApprover: flow.firstApproverName,
        typeLabel,
        dateText: formatDateRangeText(workDate, workDate, 'full'),
      },
    };
  }

  // Leave types: annual_leave, unpaid_leave, sick_leave
  const startDate = input.startDate;
  const endDate = input.endDate || input.startDate;
  if (!startDate || !endDate) {
    errors.push({ code: 'MISSING_FIELD', field: 'dates', message: 'Thiếu ngày nghỉ.' });
    return { ok: false, errors };
  }
  if (!isStrictIsoDate(startDate) || !isStrictIsoDate(endDate) || endDate < startDate) {
    errors.push({
      code: 'INVALID_DATE_RANGE',
      message: 'Khoảng ngày nghỉ không hợp lệ (ngày kết thúc phải sau hoặc bằng ngày bắt đầu).',
    });
    return { ok: false, errors };
  }

  const session: Session = input.session || 'full';
  const spanDays = diffDaysInclusive(startDate, endDate);
  const days =
    spanDays === 1 && (session === 'am' || session === 'pm')
      ? 0.5
      : input.days && input.days > 0
        ? input.days
        : spanDays;

  if (days <= 0 || days > 90) {
    errors.push({
      code: 'INVALID_DATE_RANGE',
      message: 'Số ngày nghỉ phải lớn hơn 0 và không vượt quá 90 ngày.',
    });
    return { ok: false, errors };
  }

  const monthPeriod = startDate.slice(0, 7);
  const monthRecord = monthlySummaries.find(
    (m) =>
      (m.employee_id === employee.id || m.employee_code === employee.employee_code) &&
      m.month_period === monthPeriod
  );
  if (
    monthRecord &&
    (String(monthRecord.attendance_status) === 'LOCKED' ||
      String(monthRecord.attendance_status) === 'CLOSED')
  ) {
    errors.push({
      code: 'TIMESHEET_LOCKED',
      message: `Bảng công kỳ ${monthPeriod} đã khóa, không thể tạo đơn nghỉ phép.`,
    });
    return { ok: false, errors };
  }

  const pastDays = diffCalendarDays(startDate, todayIso);
  const maxBackdate = input.type === 'sick_leave' ? 3 : 0;
  if (pastDays > maxBackdate) {
    errors.push({
      code: 'PAST_DEADLINE',
      message: 'Ngày bắt đầu nghỉ đã ở quá khứ, quá thời hạn tạo đơn.',
    });
    return { ok: false, errors };
  }

  // Overlap check against active PENDING / IN_PROGRESS / APPROVED requests
  const overlapping = allRequests.find((r) => {
    const isOwner = r.employee_id === employee.id || r.employee_code === employee.employee_code;
    if (!isOwner) return false;
    if (r.status === 'CANCELLED' || r.approval_status === 'REJECTED' || r.status === 'REJECTED') {
      return false;
    }
    if (r.request_category === 'OVERTIME' || r.request_category === 'LATE_EXPLANATION') {
      return false;
    }
    const rStart = (r.start_datetime || '').slice(0, 10);
    const rEnd = (r.end_datetime || rStart).slice(0, 10);
    if (!rStart || !rEnd) return false;
    return !(endDate < rStart || startDate > rEnd);
  });

  if (overlapping) {
    const rStart = overlapping.start_datetime.slice(0, 10);
    const rEnd = overlapping.end_datetime.slice(0, 10);
    errors.push({
      code: 'OVERLAP',
      message: `Trùng lịch với đơn ${overlapping.request_code}.`,
      conflictCode: overlapping.request_code,
      conflictRequestId: overlapping.id,
      conflictDateText: formatDateRangeText(rStart, rEnd),
    });
    return { ok: false, errors };
  }

  let balanceBefore: number | null = null;
  let balanceAfter: number | null = null;
  if (input.type === 'annual_leave') {
    const year = Number(startDate.slice(0, 4)) || 2026;
    const balances = loadLeaveBalances(store);
    const { available } = computeAvailableBalance(employee, balances, year);
    balanceBefore = available;
    if (days > available) {
      errors.push({
        code: 'INSUFFICIENT_BALANCE',
        message: `Số ngày xin nghỉ (${days}) vượt quá phép khả dụng (${available}).`,
        availableDays: available,
        requestedDays: days,
        unpaidDays: Number((days - available).toFixed(1)),
      });
      return { ok: false, errors };
    }
    balanceAfter = Number((available - days).toFixed(1));
  }

  const flow = buildApprovalMetadata({
    store,
    employees,
    employee,
    category,
    daysCount: days,
  });

  return {
    ok: true,
    errors: [],
    normalized: {
      ...input,
      startDate,
      endDate,
      days,
      session,
      reason,
      balanceBefore,
      balanceAfter,
      approvalFlow: flow.approvalFlow,
      nextApprover: flow.firstApproverName,
      typeLabel,
      dateText: formatDateRangeText(startDate, endDate, session),
    },
  };
}

// ---------------------------------------------------------------------------
// Public Factory: createServerRouterServices() (Exactly 7 methods)
// ---------------------------------------------------------------------------

export function createServerRouterServices(): RouterServices {
  return {
    async getOrderContext(userId: string): Promise<OrderContext> {
      const store = getRuntimeStore();
      const employees = loadEmployees(store);
      const emp = resolveEmployeeByUserId(employees, userId);
      if (!emp) {
        return {
          leaveAvailable: 0,
          noticeDays: null,
          pendingApprovalCount: null,
          explanationsLeft: MONTHLY_EXPLANATION_LIMIT,
        };
      }

      const year = 2026;
      const balances = loadLeaveBalances(store);
      const { available } = computeAvailableBalance(emp, balances, year);

      const contracts = loadContracts(store);
      const activeContract =
        contracts.find(
          (c) =>
            (c.employee_id === emp.id || c.employee_code === emp.employee_code) &&
            String(c.status) !== 'TERMINATED' &&
            String(c.status) !== 'EXPIRED'
        ) || null;
      const contractType = activeContract?.contract_type || emp.contract_type;
      const noticeDays = contractType ? getRequiredNoticeDays(contractType) : null;

      const allRequests = loadRequests(store);
      let pendingApprovalCount: number | null = null;
      if (emp.role_code !== 'EMPLOYEE' && emp.role_code !== 'CANDIDATE') {
        pendingApprovalCount = allRequests.filter((r) => {
          const isOpen = r.approval_status === 'PENDING' || r.status === 'IN_PROGRESS';
          if (!isOpen) return false;
          if (emp.role_code === 'SUPER_ADMIN') return true;
          return (
            r.approver_id === emp.id ||
            r.current_approver_id === emp.id ||
            r.current_step_role === emp.role_code
          );
        }).length;
      }

      const todayMonth = getVnTodayIso(Date.now()).slice(0, 7);
      const usedExp = getExplanationsCountInMonth(allRequests, emp, todayMonth);

      return {
        leaveAvailable: available,
        noticeDays,
        pendingApprovalCount,
        explanationsLeft: Math.max(0, MONTHLY_EXPLANATION_LIMIT - usedExp),
      };
    },

    async validateRequest(
      userId: string,
      input: RequestInput,
      nowMs = Date.now()
    ): Promise<ValidationResult> {
      const store = getRuntimeStore();
      const employees = loadEmployees(store);
      const emp = resolveEmployeeByUserId(employees, userId);
      if (!emp) {
        return {
          ok: false,
          errors: [
            {
              code: 'OT_NOT_ELIGIBLE',
              message: 'Không tìm thấy hồ sơ nhân sự hợp lệ.',
            },
          ],
        };
      }
      return validateInputForEmployee({
        store,
        employees,
        employee: emp,
        input,
        nowMs,
      });
    },

    async createDraft(
      userId: string,
      input: RequestInput,
      nowMs = Date.now()
    ): Promise<DraftRecord> {
      const store = getRuntimeStore();
      const employees = loadEmployees(store);
      const emp = resolveEmployeeByUserId(employees, userId);
      if (!emp) {
        throw new Error('Không tìm thấy hồ sơ nhân sự để tạo nháp.');
      }

      const drafts = readStoredDrafts(store);
      const cutoff = nowMs - DRAFT_RATE_LIMIT_WINDOW_MS;
      const recentCount = drafts.filter(
        (d) =>
          (d.userId === emp.id || d.userId === userId) && d.createdAtMs >= cutoff
      ).length;
      if (recentCount >= DRAFT_RATE_LIMIT_MAX) {
        appendAssistantAuditLog(store, {
          actorCode: emp.employee_code,
          actorName: emp.full_name,
          actorRole: emp.role_code,
          action: 'ASSISTANT_DRAFT_RATE_LIMITED',
          status: 'BLOCKED',
          targetEntity: 'createDraft',
          detail: `Chặn tạo nháp do vượt giới hạn ${DRAFT_RATE_LIMIT_MAX} nháp/giờ.`,
        });
        throw new Error('Vượt giới hạn tạo tối đa 5 nháp/giờ.');
      }

      const validation = validateInputForEmployee({
        store,
        employees,
        employee: emp,
        input,
        nowMs,
      });
      if (!validation.ok || !validation.normalized) {
        throw new Error(
          validation.errors[0]
            ? TPL_VALIDATION_ERROR(validation.errors[0])
            : 'Dữ liệu đơn chưa hợp lệ.'
        );
      }

      const norm = validation.normalized;
      const draftId = `drf-${crypto.randomUUID()}`;
      const expiresAtMs = nowMs + DRAFT_TTL_MS;
      const expiresAt = new Date(expiresAtMs).toISOString();

      const preview: DraftPreview = {
        type: norm.type,
        typeLabel: norm.typeLabel,
        dateText: norm.dateText,
        startDate: norm.startDate || getVnTodayIso(nowMs),
        endDate: norm.endDate || norm.startDate || getVnTodayIso(nowMs),
        days: norm.days,
        session: norm.session,
        reason: norm.reason,
        handoverToId: norm.handoverToId ?? null,
        handoverToName: norm.handoverToName ?? null,
        balanceAfter: norm.balanceAfter ?? null,
        explanationsLeft: norm.explanationsLeft ?? null,
        actualIn: norm.actualIn,
        actualOut: norm.actualOut,
        otStart: norm.otStart,
        otEnd: norm.otEnd,
        hours: norm.hours,
        otMultiplier: norm.otMultiplier,
        approvalFlow: norm.approvalFlow,
        nextApprover: norm.nextApprover,
      };

      const cleanInput: RequestInput = {
        ...input,
        startDate: preview.startDate,
        endDate: preview.endDate,
        days: preview.days,
        session: preview.session,
        reason: preview.reason,
        workDate: norm.workDate,
        actualIn: norm.actualIn,
        actualOut: norm.actualOut,
        otStart: norm.otStart,
        otEnd: norm.otEnd,
        hours: norm.hours,
      };

      const contentHash = computeContentHash({
        kind: 'create',
        input: cleanInput,
        preview,
      });
      const confirmToken = signConfirmToken({
        userId: emp.id,
        draftId,
        contentHash,
        expiresAt,
      });

      const record: StoredCopilotDraft = {
        draftId,
        userId: emp.id,
        employeeCode: emp.employee_code,
        kind: 'create',
        input: cleanInput,
        preview,
        contentHash,
        expiresAt,
        expiresAtMs,
        createdAtMs: nowMs,
        status: 'ACTIVE',
      };

      writeStoredDrafts(store, [record, ...drafts]);
      appendAssistantAuditLog(store, {
        actorCode: emp.employee_code,
        actorName: emp.full_name,
        actorRole: emp.role_code,
        action: 'ASSISTANT_DRAFT_CREATED',
        status: 'SUCCESS',
        targetEntity: `${draftId} (${preview.typeLabel})`,
        detail: `Soạn nháp ${preview.typeLabel}, ${preview.dateText} qua trợ lý.`,
      });

      return {
        draftId,
        confirmToken,
        expiresAt,
        preview,
        kind: 'create',
      };
    },

    async cancelDraft(userId: string, draftId: string): Promise<{ ok: boolean }> {
      const store = getRuntimeStore();
      const employees = loadEmployees(store);
      const emp = resolveEmployeeByUserId(employees, userId);
      const drafts = readStoredDrafts(store);

      const idx = drafts.findIndex(
        (d) =>
          d.draftId === draftId &&
          (d.userId === userId || (emp && d.userId === emp.id))
      );
      if (idx === -1) return { ok: false };

      drafts[idx] = {
        ...drafts[idx],
        status: 'CANCELLED',
        // Changing contentHash invalidates any previously issued confirmToken
        contentHash: `${drafts[idx].contentHash}:cancelled:${Date.now()}`,
      };
      writeStoredDrafts(store, drafts);

      if (emp) {
        appendAssistantAuditLog(store, {
          actorCode: emp.employee_code,
          actorName: emp.full_name,
          actorRole: emp.role_code,
          action: 'ASSISTANT_DRAFT_CANCELLED',
          status: 'SUCCESS',
          targetEntity: draftId,
          detail: `Hủy nháp đơn ${draftId} qua trợ lý.`,
        });
      }

      return { ok: true };
    },

    async listMyRequests(userId: string): Promise<OrderSummary[]> {
      const store = getRuntimeStore();
      const employees = loadEmployees(store);
      const emp = resolveEmployeeByUserId(employees, userId);
      if (!emp) return [];

      const requests = loadRequests(store);
      return requests
        .filter((r) => r.employee_id === emp.id || r.employee_code === emp.employee_code)
        .map((r) => ({
          id: r.id,
          requestCode: r.request_code,
          type: r.request_category,
          typeLabel: r.category_label,
          startDate: (r.start_datetime || '').slice(0, 10),
          endDate: (r.end_datetime || '').slice(0, 10),
          status: r.status || r.approval_status,
        }));
    },

    async draftCancelRequest(
      userId: string,
      targetRequestId: string,
      nowMs = Date.now()
    ): Promise<DraftRecord> {
      const store = getRuntimeStore();
      const employees = loadEmployees(store);
      const emp = resolveEmployeeByUserId(employees, userId);
      if (!emp) {
        throw new Error('Không tìm thấy hồ sơ nhân sự.');
      }

      const requests = loadRequests(store);
      const target = requests.find(
        (r) =>
          (r.id === targetRequestId || r.request_code === targetRequestId) &&
          (r.employee_id === emp.id || r.employee_code === emp.employee_code)
      );
      if (!target) {
        throw new Error('Không tìm thấy đơn hợp lệ thuộc tài khoản của bạn để hủy.');
      }
      const targetStatus = target.status || target.approval_status;
      if (targetStatus !== 'PENDING' && targetStatus !== 'IN_PROGRESS') {
        throw new Error('Chỉ có thể hủy đơn đang ở trạng thái chờ duyệt.');
      }

      const drafts = readStoredDrafts(store);
      const cutoff = nowMs - DRAFT_RATE_LIMIT_WINDOW_MS;
      const recentCount = drafts.filter(
        (d) =>
          (d.userId === emp.id || d.userId === userId) && d.createdAtMs >= cutoff
      ).length;
      if (recentCount >= DRAFT_RATE_LIMIT_MAX) {
        appendAssistantAuditLog(store, {
          actorCode: emp.employee_code,
          actorName: emp.full_name,
          actorRole: emp.role_code,
          action: 'ASSISTANT_DRAFT_RATE_LIMITED',
          status: 'BLOCKED',
          targetEntity: 'draftCancelRequest',
          detail: `Chặn tạo nháp hủy đơn do vượt giới hạn ${DRAFT_RATE_LIMIT_MAX} nháp/giờ.`,
        });
        throw new Error('Vượt giới hạn tạo tối đa 5 nháp/giờ.');
      }

      const draftId = `drf-${crypto.randomUUID()}`;
      const expiresAtMs = nowMs + DRAFT_TTL_MS;
      const expiresAt = new Date(expiresAtMs).toISOString();
      const startIso = (target.start_datetime || '').slice(0, 10);
      const endIso = (target.end_datetime || startIso).slice(0, 10);

      const preview: DraftPreview = {
        type: 'annual_leave',
        typeLabel: `Hủy đơn ${target.request_code}`,
        dateText: formatDateRangeText(startIso, endIso),
        startDate: startIso,
        endDate: endIso,
        days: target.duration_days_or_hours,
        reason: `Hủy đơn ${target.request_code}`,
        approvalFlow: 'Cập nhật trạng thái trực tiếp sau khi xác nhận',
        nextApprover: 'Hệ thống',
        cancelRequestCode: target.request_code,
        cancelCategoryLabel: target.category_label,
      };

      const contentHash = computeContentHash({
        kind: 'cancel',
        targetRequestId: target.id,
        preview,
      });
      const confirmToken = signConfirmToken({
        userId: emp.id,
        draftId,
        contentHash,
        expiresAt,
      });

      const record: StoredCopilotDraft = {
        draftId,
        userId: emp.id,
        employeeCode: emp.employee_code,
        kind: 'cancel',
        targetRequestId: target.id,
        preview,
        contentHash,
        expiresAt,
        expiresAtMs,
        createdAtMs: nowMs,
        status: 'ACTIVE',
      };

      writeStoredDrafts(store, [record, ...drafts]);
      appendAssistantAuditLog(store, {
        actorCode: emp.employee_code,
        actorName: emp.full_name,
        actorRole: emp.role_code,
        action: 'ASSISTANT_CANCEL_DRAFT_CREATED',
        status: 'SUCCESS',
        targetEntity: `${draftId} -> ${target.request_code}`,
        detail: `Soạn nháp hủy đơn ${target.request_code} qua trợ lý.`,
      });

      return {
        draftId,
        confirmToken,
        expiresAt,
        preview,
        kind: 'cancel',
        targetRequestId: target.id,
      };
    },

    async searchColleagues(
      userId: string,
      query: string
    ): Promise<ColleagueCandidate[]> {
      const store = getRuntimeStore();
      const employees = loadEmployees(store);
      const selfEmp = resolveEmployeeByUserId(employees, userId);

      const normQuery = stripDiacritics(query || '').toLowerCase().trim();
      if (!normQuery) return [];

      return employees
        .filter((e) => {
          if (e.employment_status === 'RESIGNED') return false;
          if (selfEmp && e.id === selfEmp.id) return false;
          const normName = stripDiacritics(e.full_name).toLowerCase();
          const normCode = e.employee_code.toLowerCase();
          return normName.includes(normQuery) || normCode.includes(normQuery);
        })
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          name: e.full_name,
          department: e.department_name,
        }));
    },
  };
}

// ---------------------------------------------------------------------------
// Exclusive Server Submit Handler (ONLY for src/app/api/requests/submit/route.ts)
// ---------------------------------------------------------------------------

export async function submitConfirmedDraft(params: {
  userId: string;
  draftId: string;
  confirmToken: string;
  ipAddress?: string;
  actorRole?: RoleCode;
  nowMs?: number;
}): Promise<SubmitDraftOutcome> {
  const { userId, draftId, confirmToken, ipAddress, actorRole, nowMs = Date.now() } = params;
  const store = getRuntimeStore();
  const employees = loadEmployees(store);
  const employee = resolveEmployeeByUserId(employees, userId);

  if (!employee || employee.employment_status === 'RESIGNED') {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_ACTOR',
      message: 'Hồ sơ nhân sự không hợp lệ hoặc đã nghỉ việc.',
    };
  }

  const drafts = readStoredDrafts(store);
  const draftIdx = drafts.findIndex((d) => d.draftId === draftId);
  if (draftIdx === -1) {
    return {
      ok: false,
      status: 404,
      code: 'DRAFT_NOT_FOUND',
      message: 'Không tìm thấy đơn nháp.',
    };
  }

  const draft = drafts[draftIdx];

  // Strict ownership check (prevent IDOR across employees)
  if (draft.userId !== employee.id && draft.userId !== userId) {
    appendAssistantAuditLog(store, {
      actorCode: employee.employee_code,
      actorName: employee.full_name,
      actorRole: actorRole || employee.role_code,
      ipAddress,
      action: 'ASSISTANT_SUBMIT_IDOR_BLOCKED',
      status: 'BLOCKED',
      targetEntity: draftId,
      detail: `Chặn truy cập nháp ${draftId} không thuộc sở hữu của ${employee.employee_code}.`,
    });
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_DRAFT_OWNER',
      message: 'Bạn không có quyền gửi đơn nháp của người khác.',
    };
  }

  // Verify HMAC confirmToken with timingSafeEqual
  const validToken = verifyConfirmToken({
    userId: draft.userId,
    draftId: draft.draftId,
    contentHash: draft.contentHash,
    expiresAt: draft.expiresAt,
    providedToken: confirmToken,
  });

  if (!validToken) {
    appendAssistantAuditLog(store, {
      actorCode: employee.employee_code,
      actorName: employee.full_name,
      actorRole: actorRole || employee.role_code,
      ipAddress,
      action: 'ASSISTANT_SUBMIT_TOKEN_INVALID',
      status: 'BLOCKED',
      targetEntity: draftId,
      detail: `Chặn gửi nháp ${draftId} do confirmToken không hợp lệ hoặc đã bị thay đổi.`,
    });
    return {
      ok: false,
      status: 403,
      code: 'INVALID_CONFIRM_TOKEN',
      message: 'Mã xác nhận đơn nháp không hợp lệ.',
    };
  }

  // Idempotency by draftId: return original confirmation if already submitted
  if (draft.status === 'SUBMITTED' && draft.submittedRequestCode) {
    const requestCode = draft.submittedRequestCode;
    const nextApprover = draft.submittedNextApprover || 'Quản lý trực tiếp';
    return {
      ok: true,
      idempotent: true,
      requestCode,
      nextApprover,
      reply: TPL_SUBMITTED({ requestCode, nextApprover }),
    };
  }

  if (draft.status === 'CANCELLED') {
    return {
      ok: false,
      status: 409,
      code: 'DRAFT_CANCELLED',
      message: 'Đơn nháp này đã bị hủy.',
    };
  }

  if (nowMs > draft.expiresAtMs) {
    return {
      ok: false,
      status: 410,
      code: 'DRAFT_EXPIRED',
      message: 'Đơn nháp đã hết hạn sau 10 phút. Vui lòng tạo nháp mới.',
    };
  }

  // Branch A: Cancel an existing request
  if (draft.kind === 'cancel' && draft.targetRequestId) {
    const existingRequests = loadRequests(store);
    const target = existingRequests.find(
      (r) =>
        (r.id === draft.targetRequestId || r.request_code === draft.targetRequestId) &&
        (r.employee_id === employee.id || r.employee_code === employee.employee_code)
    );
    if (!target) {
      return {
        ok: false,
        status: 404,
        code: 'TARGET_REQUEST_NOT_FOUND',
        message: 'Không tìm thấy đơn cần hủy.',
      };
    }
    const targetStatus = target.status || target.approval_status;
    if (targetStatus !== 'PENDING' && targetStatus !== 'IN_PROGRESS') {
      return {
        ok: false,
        status: 409,
        code: 'INVALID_REQUEST_STATUS',
        message: 'Chỉ có thể hủy đơn đang ở trạng thái chờ duyệt.',
      };
    }

    const cancelledReq: LeaveOvertimeRequest = {
      ...target,
      status: 'CANCELLED',
      responded_at: new Date(nowMs).toISOString(),
    };

    const currentCanonical = readStoreArrayByKeys(store, [STORE_REQUESTS_CANONICAL_KEY]);
    const currentLegacy = readStoreArrayByKeys(store, [STORE_LEAVE_REQUESTS_KEY]);
    const upsert = (arr: Record<string, unknown>[]) => {
      const rest = arr.filter(
        (r) => r.id !== cancelledReq.id && r.request_code !== cancelledReq.request_code
      );
      return [cancelledReq, ...rest];
    };
    store[STORE_REQUESTS_CANONICAL_KEY] = upsert(currentCanonical);
    store[STORE_LEAVE_REQUESTS_KEY] = upsert(currentLegacy);

    if (
      target.request_category === 'ANNUAL_LEAVE' &&
      (target.approval_status === 'PENDING' || target.status === 'IN_PROGRESS')
    ) {
      const year = Number((target.start_datetime || '').slice(0, 4)) || 2026;
      const runtimeBalances = readStoreArrayByKeys(store, [STORE_LEAVE_BALANCES_KEY]);
      const balances = loadLeaveBalances(store);
      const { balance } = computeAvailableBalance(employee, balances, year);
      if (balance) {
        const updatedBal: AnnualLeaveBalance = {
          ...balance,
          pending_days: Math.max(0, balance.pending_days - target.duration_days_or_hours),
        };
        const others = runtimeBalances.filter(
          (b) =>
            String(b.id || '') !== updatedBal.id &&
            !(
              String(b.employee_code || '') === updatedBal.employee_code &&
              Number(b.year || 2026) === updatedBal.year
            )
        );
        store[STORE_LEAVE_BALANCES_KEY] = [updatedBal, ...others];
      }
    }

    drafts[draftIdx] = {
      ...draft,
      status: 'SUBMITTED',
      submittedRequestCode: cancelledReq.request_code,
      submittedNextApprover: 'Đã hủy đơn',
      submittedAt: new Date(nowMs).toISOString(),
    };
    writeStoredDrafts(store, drafts);

    appendAssistantAuditLog(store, {
      actorCode: employee.employee_code,
      actorName: employee.full_name,
      actorRole: actorRole || employee.role_code,
      ipAddress,
      action: 'ASSISTANT_REQUEST_CANCELLED',
      status: 'SUCCESS',
      targetEntity: cancelledReq.request_code,
      detail: `Xác nhận hủy đơn ${cancelledReq.request_code} qua trợ lý.`,
    });

    return {
      ok: true,
      idempotent: false,
      requestCode: cancelledReq.request_code,
      nextApprover: 'Đã hủy đơn',
      reply: `Đơn ${cancelledReq.request_code} đã được hủy thành công.`,
      request: cancelledReq,
    };
  }

  // Branch B: Create a new request (RE-VALIDATE everything at submit time!)
  if (!draft.input) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_DRAFT',
      message: 'Dữ liệu đơn nháp bị thiếu.',
    };
  }

  const recheck = validateInputForEmployee({
    store,
    employees,
    employee,
    input: draft.input,
    nowMs,
  });

  if (!recheck.ok || !recheck.normalized) {
    const err = recheck.errors[0];
    appendAssistantAuditLog(store, {
      actorCode: employee.employee_code,
      actorName: employee.full_name,
      actorRole: actorRole || employee.role_code,
      ipAddress,
      action: 'ASSISTANT_SUBMIT_REVALIDATE_BLOCKED',
      status: 'BLOCKED',
      targetEntity: draftId,
      detail: err ? err.message : 'Đơn nháp không còn hợp lệ tại thời điểm gửi.',
    });
    return {
      ok: false,
      status: 422,
      code: err?.code || 'VALIDATION_ERROR',
      message: err ? TPL_VALIDATION_ERROR(err) : 'Đơn nháp không còn hợp lệ để gửi.',
    };
  }

  const norm = recheck.normalized;
  const existingRequests = loadRequests(store);
  const maxCodeNum = existingRequests.reduce((max, r) => {
    const m = /^REQ-202611-(\d+)$/.exec(r.request_code || '');
    return m ? Math.max(max, Number(m[1])) : max;
  }, 87);
  const requestCode = `REQ-202611-${String(maxCodeNum + 1).padStart(3, '0')}`;

  const category = ROUTER_TYPE_TO_CATEGORY[norm.type];
  const durationUnit: 'NGAY' | 'GIO' = norm.type === 'overtime' ? 'GIO' : 'NGAY';
  const durationCount =
    norm.type === 'overtime' ? norm.hours ?? 1 : norm.days ?? 1;

  const flow = buildApprovalMetadata({
    store,
    employees,
    employee,
    category,
    daysCount: durationCount,
  });

  const startIso = norm.startDate || norm.workDate || getVnTodayIso(nowMs);
  const endIso = norm.endDate || startIso;
  const otInfo = norm.type === 'overtime' ? resolveOtDayInfo(startIso) : null;

  const createdRequest: LeaveOvertimeRequest = {
    id: formatEventId('req'),
    request_code: requestCode,
    employee_id: employee.id,
    employee_code: employee.employee_code,
    full_name: employee.full_name,
    department_name: employee.department_name,
    position_name: employee.position_name || 'Nhân viên',
    requester_role: actorRole || employee.role_code,
    request_category: category,
    category_label: CATEGORY_TO_ROUTER_LABEL[category],
    start_datetime: `${startIso}T${
      norm.type === 'attendance_explanation'
        ? norm.actualIn || '08:30'
        : norm.type === 'overtime'
          ? norm.otStart || '18:00'
          : '08:30'
    }:00+07:00`,
    end_datetime: `${endIso}T${
      norm.type === 'attendance_explanation'
        ? norm.actualOut || '17:30'
        : norm.type === 'overtime'
          ? norm.otEnd || '20:00'
          : '17:30'
    }:00+07:00`,
    duration_days_or_hours: durationCount,
    duration_unit: durationUnit,
    reason: norm.reason,
    handover_to_name: norm.handoverToName ?? draft.preview.handoverToName ?? null,
    approver_id: flow.firstApproverId,
    approver_name: flow.firstApproverName,
    current_approver_id: flow.firstApproverId,
    approval_status: 'PENDING',
    status: 'PENDING',
    current_step_role: flow.firstStepRole,
    approval_steps: flow.steps,
    leave_deducted: false,
    created_at: new Date(nowMs).toISOString(),
    responded_at: null,
    source: 'AI_COPILOT',
    ...(norm.type === 'overtime' && otInfo
      ? {
          ot_hours: durationCount,
          ot_day_type: otInfo.otDayType,
          ot_multiplier: otInfo.otMultiplier,
        }
      : {}),
    ...(norm.type === 'attendance_explanation'
      ? {
          target_date: startIso,
          actual_check_in: norm.actualIn || '08:30',
          actual_check_out: norm.actualOut || '17:30',
        }
      : {}),
  };

  const currentCanonicalReqs = readStoreArrayByKeys(store, [STORE_REQUESTS_CANONICAL_KEY]);
  const currentLegacyReqs = readStoreArrayByKeys(store, [STORE_LEAVE_REQUESTS_KEY]);
  store[STORE_REQUESTS_CANONICAL_KEY] = [createdRequest, ...currentCanonicalReqs];
  store[STORE_LEAVE_REQUESTS_KEY] = [createdRequest, ...currentLegacyReqs];

  if (norm.type === 'annual_leave') {
    const year = Number(startIso.slice(0, 4)) || 2026;
    const runtimeBalances = readStoreArrayByKeys(store, [STORE_LEAVE_BALANCES_KEY]);
    const balances = loadLeaveBalances(store);
    const { balance } = computeAvailableBalance(employee, balances, year);
    if (balance) {
      const updatedBalance: AnnualLeaveBalance = {
        ...balance,
        pending_days: balance.pending_days + durationCount,
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
  }

  drafts[draftIdx] = {
    ...draft,
    status: 'SUBMITTED',
    submittedRequestCode: requestCode,
    submittedNextApprover: flow.firstApproverName,
    submittedAt: new Date(nowMs).toISOString(),
  };
  writeStoredDrafts(store, drafts);

  appendAssistantAuditLog(store, {
    actorCode: employee.employee_code,
    actorName: employee.full_name,
    actorRole: actorRole || employee.role_code,
    ipAddress,
    action: 'ASSISTANT_REQUEST_SUBMITTED',
    status: 'SUCCESS',
    targetEntity: `${requestCode} (${createdRequest.category_label})`,
    detail: `Gửi đơn ${requestCode} (${durationCount} ${durationUnit === 'GIO' ? 'giờ' : 'ngày'}) từ nháp ${draftId}.`,
  });

  return {
    ok: true,
    idempotent: false,
    requestCode,
    nextApprover: flow.firstApproverName,
    reply: TPL_SUBMITTED({
      requestCode,
      nextApprover: flow.firstApproverName,
    }),
    request: createdRequest,
  };
}
