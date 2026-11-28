import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { RouterStateStore } from '@/lib/hrm/copilot-router';
import { HRM_CONFIG, getRequiredNoticeDays } from '@/lib/hrm/config';
import {
  formatContractCode,
  formatDecisionNo,
  formatEmployeeCode,
  formatEventId,
  formatLeaveRequestCode,
  formatPayrollCode,
  formatResignationCode,
  formatReviewCode,
} from '@/lib/hrm/ids';
import { can, type EntityPermissionContext, type HrmAction } from '@/lib/hrm/permissions';
import type { Actor, RoleCode } from '@/lib/hrm/types';

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
  var _hrmPreboardingIpRateLimit:
    | Map<string, { count: number; resetAt: number }>
    | undefined;
  // eslint-disable-next-line no-var
  var _hrmPreboardingTokenRateLimit:
    | Map<string, { count: number; resetAt: number }>
    | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');

const PREBOARDING_STORE_KEYS = [
  'hrm_runtime_preboarding_v1',
  'hrm_runtime_preboarding_invites',
] as const;

const EMPLOYEE_STORE_KEYS = [
  'hrm_runtime_employees_v1',
  'hrm_runtime_employees',
] as const;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const RUNTIME_SYNC_KEY_REGEX = /^hrm_runtime_[a-z0-9_]+$/i;

function isValidRuntimeSyncKey(rawKey: unknown): rawKey is string {
  if (typeof rawKey !== 'string') return false;
  const trimmed = rawKey.trim();
  if (!trimmed || trimmed.length > 96 || FORBIDDEN_KEYS.has(trimmed.toLowerCase())) {
    return false;
  }
  return RUNTIME_SYNC_KEY_REGEX.test(trimmed);
}
const LOCKED_PREBOARDING_EMPLOYEE_STATUSES = new Set([
  'OFFICIAL',
  'ACTIVE',
  'RESIGNED',
  'TERMINATED',
]);

const PREBOARDING_RATE_LIMIT_WINDOW_MS = 60_000;
const PREBOARDING_RATE_LIMIT_MAX_REQUESTS = 30;
const PREBOARDING_RATE_LIMIT_MAX_BUCKETS = 2000;

const ALLOWED_ROLES: ReadonlySet<RoleCode> = new Set<RoleCode>([
  'SUPER_ADMIN',
  'DIRECTOR',
  'HR_MANAGER',
  'DEPT_MANAGER',
  'EMPLOYEE',
  'CANDIDATE',
]);

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

function getStore(): Record<string, unknown> {
  const diskSig = getDiskSignature();
  if (globalThis._hrmSyncStore && globalThis._hrmSyncStoreDiskSig === diskSig) {
    return globalThis._hrmSyncStore;
  }
  if (diskSig !== 'MISSING') {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parsedObj = parsed as Record<string, unknown>;
        const rawEpoch = parsedObj._bootEpoch;
        const parsedBootEpoch =
          typeof rawEpoch === 'string' && rawEpoch.trim().length > 0
            ? rawEpoch.trim()
            : undefined;
        if (parsedBootEpoch !== globalThis._hrmSyncStoreBootEpoch) {
          globalThis._hrmSyncStoreBootEpoch = parsedBootEpoch;
          clearCopilotRouterStoreIfPresent();
        }
        globalThis._hrmSyncStore = parsedObj;
        globalThis._hrmSyncStoreDiskSig = diskSig;
        return parsedObj;
      }
    } catch {
      // ignore corrupt/unavailable local sync file
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

function persistStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const store = globalThis._hrmSyncStore || {};
    const bootEpoch =
      typeof globalThis._hrmSyncStoreBootEpoch === 'string' &&
      globalThis._hrmSyncStoreBootEpoch.trim().length > 0
        ? globalThis._hrmSyncStoreBootEpoch.trim()
        : undefined;
    const payload = bootEpoch ? { ...store, _bootEpoch: bootEpoch } : store;
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    globalThis._hrmSyncStoreDiskSig = getDiskSignature();
  } catch {
    // ignore write errors in read-only environments
  }
}

function readStoreArray(store: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const raw = store[key];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

function appendServerAuditLog(
  store: Record<string, unknown>,
  params: {
    actorName: string;
    actorRole: string;
    action: string;
    target: string;
    detail: string;
    module?: string;
  }
): void {
  const logs = readStoreArray(store, 'hrm_runtime_audit_logs');
  const entry = {
    id: formatEventId('aud'),
    log_code: `AUD-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor_name: params.actorName,
    actor_role: params.actorRole,
    action: params.action,
    module: params.module || 'EMPLOYEE_LIFECYCLE',
    target: params.target,
    detail: params.detail,
    status: 'SUCCESS',
  };
  store['hrm_runtime_audit_logs'] = [entry, ...logs].slice(0, 200);
}

function parseActor(raw: unknown): Actor | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const role = String(obj.role || '').trim() as RoleCode;
  if (!ALLOWED_ROLES.has(role)) return null;
  return {
    id: String(obj.id || `actor-${role}`),
    name: String(obj.name || role),
    role,
    departmentId: obj.departmentId ? String(obj.departmentId) : undefined,
    email: obj.email ? String(obj.email) : undefined,
  };
}

function addDaysIso(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().slice(0, 10);
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function isAllowedPostOrigin(req: Request): boolean {
  const rawOrigin = req.headers.get('origin');
  if (rawOrigin === null) {
    return true;
  }
  const trimmedOrigin = rawOrigin.trim();
  if (!trimmedOrigin || trimmedOrigin.toLowerCase() === 'null') {
    return false;
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(trimmedOrigin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    return false;
  }

  const originHostname = parsedOrigin.hostname.toLowerCase();
  if (
    originHostname === 'localhost' ||
    originHostname === '127.0.0.1' ||
    (originHostname.endsWith('.devtunnels.ms') &&
      originHostname.length > '.devtunnels.ms'.length)
  ) {
    return true;
  }

  const requestHostHeader = (
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase();

  let fallbackRequestHost = '';
  try {
    fallbackRequestHost = new URL(req.url).host.toLowerCase();
  } catch {
    fallbackRequestHost = '';
  }

  const effectiveRequestHost = requestHostHeader || fallbackRequestHost;
  if (!effectiveRequestHost) {
    return false;
  }

  const originHost = parsedOrigin.host.toLowerCase();
  if (originHost === effectiveRequestHost) {
    return true;
  }

  return (
    parsedOrigin.port === '' &&
    ((parsedOrigin.protocol === 'https:' &&
      effectiveRequestHost === `${originHostname}:443`) ||
      (parsedOrigin.protocol === 'http:' &&
        effectiveRequestHost === `${originHostname}:80`))
  );
}

function extractRequestClientIp(req: Request): string {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    ...(req.headers.get('x-forwarded-for')?.split(',') ?? []),
  ];
  for (const raw of candidates) {
    const clean = (raw || '').trim();
    if (clean) return clean.slice(0, 64);
  }
  return 'local-or-unknown';
}

function consumeRateLimitBucket(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  now: number
): { allowed: boolean; retryAfterSec: number } {
  const existing = map.get(key);
  if (existing && existing.resetAt > now) {
    if (existing.count >= PREBOARDING_RATE_LIMIT_MAX_REQUESTS) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return { allowed: false, retryAfterSec };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing) {
    map.delete(key);
  }

  if (map.size >= PREBOARDING_RATE_LIMIT_MAX_BUCKETS) {
    map.forEach((entryVal, entryKey) => {
      if (entryVal.resetAt <= now) {
        map.delete(entryKey);
      }
    });
    if (map.size >= PREBOARDING_RATE_LIMIT_MAX_BUCKETS) {
      map.forEach((entryVal, entryKey) => {
        if (
          map.size >= PREBOARDING_RATE_LIMIT_MAX_BUCKETS &&
          entryVal.count < PREBOARDING_RATE_LIMIT_MAX_REQUESTS
        ) {
          map.delete(entryKey);
        }
      });
    }
    while (map.size >= PREBOARDING_RATE_LIMIT_MAX_BUCKETS) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  }

  map.set(key, { count: 1, resetAt: now + PREBOARDING_RATE_LIMIT_WINDOW_MS });
  return { allowed: true, retryAfterSec: 0 };
}

function checkPreboardingRateLimit(
  req: Request,
  token: string
): { allowed: boolean; retryAfterSec: number } {
  if (!globalThis._hrmPreboardingIpRateLimit) {
    globalThis._hrmPreboardingIpRateLimit = new Map();
  }
  if (!globalThis._hrmPreboardingTokenRateLimit) {
    globalThis._hrmPreboardingTokenRateLimit = new Map();
  }
  const now = Date.now();
  const ipCheck = consumeRateLimitBucket(
    globalThis._hrmPreboardingIpRateLimit,
    `ip:${extractRequestClientIp(req)}`,
    now
  );
  if (!ipCheck.allowed) {
    return ipCheck;
  }
  if (token) {
    return consumeRateLimitBucket(
      globalThis._hrmPreboardingTokenRateLimit,
      `tok:${token.slice(0, 128)}`,
      now
    );
  }
  return { allowed: true, retryAfterSec: 0 };
}

function isPreboardingRecordExpired(record: Record<string, unknown>): boolean {
  const status = String(
    record.status || record.preboarding_status || ''
  ).toUpperCase();
  if (status === 'EXPIRED') {
    return true;
  }
  const expiresAtRaw = record.expires_at ? String(record.expires_at) : '';
  if (!expiresAtRaw) {
    return false;
  }
  const expiresAtMs = Date.parse(expiresAtRaw);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasForbiddenPrototypeKey(obj: Record<string, unknown>): boolean {
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return true;
    }
  }
  return false;
}

function readOwnString(
  obj: Record<string, unknown> | null,
  keys: readonly string[]
): { present: boolean; invalidType: boolean; value: string } {
  if (!obj) return { present: false, invalidType: false, value: '' };
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') {
      return { present: true, invalidType: true, value: '' };
    }
    return { present: true, invalidType: false, value: raw.trim() };
  }
  return { present: false, invalidType: false, value: '' };
}

function readMergedString(
  primary: Record<string, unknown> | null,
  fallback: Record<string, unknown>,
  keys: readonly string[]
): { invalidType: boolean; value: string } {
  const fromPrimary = readOwnString(primary, keys);
  if (fromPrimary.invalidType) {
    return { invalidType: true, value: '' };
  }
  if (fromPrimary.present && fromPrimary.value !== '') {
    return { invalidType: false, value: fromPrimary.value };
  }
  const fromFallback = readOwnString(fallback, keys);
  if (fromFallback.invalidType) {
    return { invalidType: true, value: '' };
  }
  return { invalidType: false, value: fromFallback.value };
}

function readMergedNonNegativeInt(
  primary: Record<string, unknown> | null,
  fallback: Record<string, unknown>,
  key: string
): { invalidType: boolean; value?: number } {
  if (FORBIDDEN_KEYS.has(key)) return { invalidType: false };
  const source =
    primary && Object.prototype.hasOwnProperty.call(primary, key)
      ? primary
      : Object.prototype.hasOwnProperty.call(fallback, key)
        ? fallback
        : null;
  if (!source) return { invalidType: false };
  const raw = source[key];
  if (raw === undefined || raw === null || raw === '') {
    return { invalidType: false };
  }
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > 20) {
    return { invalidType: true };
  }
  return { invalidType: false, value: num };
}

export async function GET(req: Request) {
  const stores = getStore();
  try {
    const url = new URL(req.url);
    const entity = url.searchParams.get('entity')?.trim();
    const token = url.searchParams.get('token')?.trim();
    const employeeId = url.searchParams.get('employee_id')?.trim();

    if (token) {
      const matchedInvites: Record<string, unknown>[] = [];
      for (const key of PREBOARDING_STORE_KEYS) {
        const invites = readStoreArray(stores, key);
        for (const item of invites) {
          if (item.token === token || item.preboarding_token === token) {
            matchedInvites.push(item);
          }
        }
      }

      const matchedEmployees: Record<string, unknown>[] = [];
      for (const key of EMPLOYEE_STORE_KEYS) {
        const employees = readStoreArray(stores, key);
        for (const emp of employees) {
          const matchesToken = emp.preboarding_token === token;
          const matchesInvite = matchedInvites.some(
            (inv) =>
              (inv.employee_id && emp.id === inv.employee_id) ||
              (inv.employee_code && emp.employee_code === inv.employee_code)
          );
          if (matchesToken || matchesInvite) {
            matchedEmployees.push(emp);
          }
        }
      }

      if (matchedInvites.length === 0 && matchedEmployees.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Liên kết Pre-boarding không tồn tại hoặc đã hết hạn.' },
          { status: 404 }
        );
      }

      if (
        matchedInvites.some(isPreboardingRecordExpired) ||
        matchedEmployees.some(isPreboardingRecordExpired)
      ) {
        return NextResponse.json(
          { success: false, error: 'Liên kết Pre-boarding đã hết hạn.' },
          { status: 410 }
        );
      }

      return NextResponse.json({
        success: true,
        data: matchedInvites[0] ?? matchedEmployees[0],
      });
    }

    if (entity) {
      const normalizedKey = entity.startsWith('hrm_runtime_') ? entity : `hrm_runtime_${entity}`;
      const list = readStoreArray(
        stores,
        stores[entity] !== undefined ? entity : normalizedKey
      );
      const filtered = employeeId
        ? list.filter((row) => row.employee_id === employeeId || row.id === employeeId)
        : list;
      return NextResponse.json({ success: true, data: filtered });
    }

    return NextResponse.json({
      success: true,
      stores,
      config: HRM_CONFIG,
    });
  } catch {
    // Static export (`output: 'export'`) prerender fallback when `req.url` is dynamic
    return NextResponse.json({
      success: true,
      stores,
      config: HRM_CONFIG,
    });
  }
}

export async function POST(req: Request) {
  try {
    if (!isAllowedPostOrigin(req)) {
      return NextResponse.json(
        { success: false, error: 'Nguồn gửi yêu cầu (Origin) không được phép.' },
        { status: 403 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || 'sync').trim();
    const actor = parseActor(body.actor);
    const hasRawActor = body.actor !== undefined && body.actor !== null;
    const hasRawActorRole = body.actorRole !== undefined && body.actorRole !== null;
    const rawActorRole = hasRawActorRole ? String(body.actorRole).trim() : '';
    const invalidActorInput =
      (hasRawActor && !actor) ||
      (hasRawActorRole && (!rawActorRole || !ALLOWED_ROLES.has(rawActorRole as RoleCode))) ||
      Boolean(hasRawActor && hasRawActorRole && actor && actor.role !== rawActorRole);
    const effectiveActor: Actor | null =
      actor ??
      (hasRawActorRole && ALLOWED_ROLES.has(rawActorRole as RoleCode)
        ? {
            id: `actor-${rawActorRole}`,
            name: String(body.actorName || rawActorRole),
            role: rawActorRole as RoleCode,
          }
        : null);
    const permissionAction = body.permissionAction as HrmAction | undefined;
    const permissionContext = body.permissionContext as EntityPermissionContext | undefined;

    if (permissionAction) {
      if (invalidActorInput || !effectiveActor || !can(effectiveActor, permissionAction, permissionContext)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Bạn không có quyền thực hiện thao tác nghiệp vụ này.',
          },
          { status: 403 }
        );
      }
    }

    const store = getStore();

    // 1. Generic store sync / upsert (compatible with /api/hrm/sync)
    if (action === 'sync' || action === 'upsert') {
      const { key, items, item, fullSync } = body;
      if (fullSync !== undefined) {
        if (!isPlainObject(fullSync) || hasForbiddenPrototypeKey(fullSync)) {
          return NextResponse.json(
            { success: false, error: 'Dữ liệu fullSync không hợp lệ.' },
            { status: 400 }
          );
        }
        const syncKeys = Object.getOwnPropertyNames(fullSync);
        for (const k of syncKeys) {
          if (!isValidRuntimeSyncKey(k)) {
            return NextResponse.json(
              { success: false, error: `Khóa đồng bộ '${k}' không hợp lệ.` },
              { status: 400 }
            );
          }
        }
        for (const k of syncKeys) {
          store[k.trim()] = fullSync[k];
        }
      } else if (key !== undefined) {
        if (!isValidRuntimeSyncKey(key)) {
          return NextResponse.json(
            { success: false, error: 'Khóa đồng bộ không hợp lệ.' },
            { status: 400 }
          );
        }
        const safeKey = key.trim();
        if (items !== undefined) {
          store[safeKey] = items;
        } else if (item !== undefined) {
          if (!isPlainObject(item) || hasForbiddenPrototypeKey(item)) {
            return NextResponse.json(
              { success: false, error: 'Dữ liệu bản ghi đồng bộ không hợp lệ.' },
              { status: 400 }
            );
          }
          const obj = item;
          const current = readStoreArray(store, safeKey);
          const idx = current.findIndex((entry) => entry.id && entry.id === obj.id);
          if (idx >= 0) {
            current[idx] = { ...current[idx], ...obj };
            store[safeKey] = current;
          } else {
            store[safeKey] = [obj, ...current];
          }
        }
      }
      persistStore();
      return NextResponse.json({ success: true });
    }

    // 2. Public Pre-boarding Self-Submission (Stage 1)
    if (action === 'submit_preboarding_info') {
      if (!isPlainObject(body)) {
        return NextResponse.json(
          { success: false, error: 'Dữ liệu gửi lên không hợp lệ.' },
          { status: 400 }
        );
      }

      const rawSubProp = Object.prototype.hasOwnProperty.call(body, 'submission')
        ? body.submission
        : undefined;
      const rawTokenForLimit =
        typeof body.token === 'string'
          ? body.token.trim()
          : isPlainObject(rawSubProp) && typeof rawSubProp.token === 'string'
            ? rawSubProp.token.trim()
            : '';

      const rateLimit = checkPreboardingRateLimit(req, rawTokenForLimit);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(rateLimit.retryAfterSec),
            },
          }
        );
      }

      if (hasForbiddenPrototypeKey(body)) {
        return NextResponse.json(
          { success: false, error: 'Payload chứa khóa không hợp lệ.' },
          { status: 400 }
        );
      }

      let rawSubmission: Record<string, unknown> | null = null;
      if (rawSubProp !== undefined && rawSubProp !== null) {
        if (!isPlainObject(rawSubProp) || hasForbiddenPrototypeKey(rawSubProp)) {
          return NextResponse.json(
            { success: false, error: 'Dữ liệu submission không hợp lệ.' },
            { status: 400 }
          );
        }
        rawSubmission = rawSubProp;
      }

      const tokenField = readMergedString(null, body, ['token']);
      const tokenFromSub = tokenField.value
        ? tokenField
        : readMergedString(rawSubmission, body, ['token']);
      const idCardField = readMergedString(rawSubmission, body, [
        'id_card_no',
        'national_id',
      ]);
      const taxCodeField = readMergedString(rawSubmission, body, ['tax_code']);
      const bankAccountField = readMergedString(rawSubmission, body, [
        'bank_account_no',
      ]);
      const bankNameField = readMergedString(rawSubmission, body, ['bank_name']);
      const bhxhField = readMergedString(rawSubmission, body, [
        'bhxh_no',
        'social_insurance_no',
      ]);
      const emergencyNameField = readMergedString(rawSubmission, body, [
        'emergency_contact_name',
      ]);
      const emergencyPhoneField = readMergedString(rawSubmission, body, [
        'emergency_contact_phone',
      ]);
      const emergencyRelationField = readMergedString(rawSubmission, body, [
        'emergency_contact_relation',
      ]);
      const permanentAddressField = readMergedString(rawSubmission, body, [
        'permanent_address',
        'address',
      ]);
      const personalEmailField = readMergedString(rawSubmission, body, [
        'personal_email',
      ]);
      const phoneField = readMergedString(rawSubmission, body, ['phone']);
      const genderField = readMergedString(rawSubmission, body, ['gender']);
      const dobField = readMergedString(rawSubmission, body, ['date_of_birth']);
      const issueDateField = readMergedString(rawSubmission, body, [
        'national_id_issue_date',
      ]);
      const issuePlaceField = readMergedString(rawSubmission, body, [
        'national_id_issue_place',
      ]);
      const dependentsField = readMergedNonNegativeInt(
        rawSubmission,
        body,
        'dependents_count'
      );
      const idCardFileField = readMergedString(rawSubmission, body, [
        'id_card_file_name',
      ]);
      const degreeFileField = readMergedString(rawSubmission, body, [
        'degree_file_name',
      ]);
      const fullNameField = readMergedString(rawSubmission, body, ['full_name']);

      if (
        tokenFromSub.invalidType ||
        idCardField.invalidType ||
        taxCodeField.invalidType ||
        bankAccountField.invalidType ||
        bankNameField.invalidType ||
        bhxhField.invalidType ||
        emergencyNameField.invalidType ||
        emergencyPhoneField.invalidType ||
        emergencyRelationField.invalidType ||
        permanentAddressField.invalidType ||
        personalEmailField.invalidType ||
        phoneField.invalidType ||
        genderField.invalidType ||
        dobField.invalidType ||
        issueDateField.invalidType ||
        issuePlaceField.invalidType ||
        dependentsField.invalidType ||
        idCardFileField.invalidType ||
        degreeFileField.invalidType ||
        fullNameField.invalidType
      ) {
        return NextResponse.json(
          { success: false, error: 'Định dạng trường dữ liệu Pre-boarding không hợp lệ.' },
          { status: 422 }
        );
      }

      const token = tokenFromSub.value;
      const idCardNo = idCardField.value;
      const taxCode = taxCodeField.value;
      const bankAccountNo = bankAccountField.value;
      const bankName = bankNameField.value;
      const bhxhNo = bhxhField.value;
      const emergencyName = emergencyNameField.value;
      const emergencyPhone = emergencyPhoneField.value;
      const emergencyRelation = emergencyRelationField.value;
      const permanentAddress = permanentAddressField.value;
      const personalEmail = personalEmailField.value;
      const phone = phoneField.value;
      const gender = genderField.value;
      const dateOfBirth = dobField.value;
      const issueDate = issueDateField.value;
      const issuePlace = issuePlaceField.value;
      const dependentsCount = dependentsField.value;
      const idCardFileName = idCardFileField.value;
      const degreeFileName = degreeFileField.value;
      const fullNameInput = fullNameField.value.slice(0, 120);

      if (!token || !idCardNo || !bankAccountNo || !bankName) {
        return NextResponse.json(
          {
            success: false,
            error: 'Vui lòng điền đầy đủ token, số CCCD, số tài khoản và tên ngân hàng.',
          },
          { status: 400 }
        );
      }

      if (token.length > 128) {
        return NextResponse.json(
          { success: false, error: 'Token Pre-boarding vượt quá độ dài cho phép.' },
          { status: 422 }
        );
      }

      if (!/^\d{9}(\d{3})?$/.test(idCardNo)) {
        return NextResponse.json(
          { success: false, error: 'Số CCCD/CMND phải gồm 9 hoặc 12 chữ số hợp lệ.' },
          { status: 422 }
        );
      }

      if (!/^[A-Za-z0-9]{6,24}$/.test(bankAccountNo)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Số tài khoản ngân hàng phải gồm 6–24 ký tự chữ hoặc số.',
          },
          { status: 422 }
        );
      }

      if (bankName.length < 2 || bankName.length > 120) {
        return NextResponse.json(
          {
            success: false,
            error: 'Tên ngân hàng phải từ 2 đến 120 ký tự.',
          },
          { status: 422 }
        );
      }

      if (
        taxCode.length > 25 ||
        bhxhNo.length > 25 ||
        emergencyPhone.length > 25 ||
        phone.length > 25
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Mã số thuế, số BHXH hoặc số điện thoại không được vượt quá 25 ký tự.',
          },
          { status: 422 }
        );
      }

      if (emergencyName.length > 120 || personalEmail.length > 120) {
        return NextResponse.json(
          {
            success: false,
            error: 'Họ tên người liên hệ khẩn cấp hoặc email không được vượt quá 120 ký tự.',
          },
          { status: 422 }
        );
      }

      if (permanentAddress.length > 300) {
        return NextResponse.json(
          {
            success: false,
            error: 'Địa chỉ thường trú không được vượt quá 300 ký tự.',
          },
          { status: 422 }
        );
      }

      if (
        (gender && gender !== 'Nam' && gender !== 'Nữ') ||
        (dateOfBirth && (dateOfBirth.length > 32 || Number.isNaN(Date.parse(dateOfBirth)))) ||
        (issueDate && (issueDate.length > 32 || Number.isNaN(Date.parse(issueDate)))) ||
        issuePlace.length > 160 ||
        emergencyRelation.length > 60 ||
        idCardFileName.length > 200 ||
        degreeFileName.length > 200
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Thông tin bổ sung Pre-boarding vượt quá độ dài hoặc sai định dạng.',
          },
          { status: 422 }
        );
      }

      const safeSubmission: Record<string, string | number> = {
        national_id: idCardNo,
        tax_code: taxCode,
        bank_name: bankName,
        bank_account_no: bankAccountNo,
        emergency_contact_name: emergencyName,
        emergency_contact_phone: emergencyPhone,
      };
      if (personalEmail) safeSubmission.personal_email = personalEmail;
      if (phone) safeSubmission.phone = phone;
      if (gender) safeSubmission.gender = gender;
      if (dateOfBirth) safeSubmission.date_of_birth = dateOfBirth;
      if (issueDate) safeSubmission.national_id_issue_date = issueDate;
      if (issuePlace) safeSubmission.national_id_issue_place = issuePlace;
      if (bhxhNo) safeSubmission.social_insurance_no = bhxhNo;
      if (dependentsCount !== undefined) {
        safeSubmission.dependents_count = dependentsCount;
      }
      if (permanentAddress) safeSubmission.address = permanentAddress;
      if (emergencyRelation) {
        safeSubmission.emergency_contact_relation = emergencyRelation;
      }
      if (idCardFileName) safeSubmission.id_card_file_name = idCardFileName;
      if (degreeFileName) safeSubmission.degree_file_name = degreeFileName;

      const matchedInviteBuckets: Array<{
        key: (typeof PREBOARDING_STORE_KEYS)[number];
        list: Record<string, unknown>[];
        indices: number[];
      }> = [];
      const allMatchedInvites: Record<string, unknown>[] = [];

      for (const key of PREBOARDING_STORE_KEYS) {
        const list = readStoreArray(store, key);
        const indices: number[] = [];
        for (let i = 0; i < list.length; i += 1) {
          const inv = list[i];
          if (inv.token === token || inv.preboarding_token === token) {
            indices.push(i);
            allMatchedInvites.push(inv);
          }
        }
        if (indices.length > 0) {
          matchedInviteBuckets.push({ key, list, indices });
        }
      }

      const matchedEmpBuckets: Array<{
        key: (typeof EMPLOYEE_STORE_KEYS)[number];
        list: Record<string, unknown>[];
        indices: number[];
      }> = [];
      const allMatchedEmployees: Record<string, unknown>[] = [];

      for (const key of EMPLOYEE_STORE_KEYS) {
        const list = readStoreArray(store, key);
        const indices: number[] = [];
        for (let i = 0; i < list.length; i += 1) {
          const emp = list[i];
          const matchesToken = emp.preboarding_token === token;
          const matchesInvite = allMatchedInvites.some(
            (inv) =>
              (inv.employee_id && emp.id === inv.employee_id) ||
              (inv.employee_code && emp.employee_code === inv.employee_code)
          );
          if (matchesToken || matchesInvite) {
            indices.push(i);
            allMatchedEmployees.push(emp);
          }
        }
        if (indices.length > 0) {
          matchedEmpBuckets.push({ key, list, indices });
        }
      }

      if (allMatchedInvites.length === 0 && allMatchedEmployees.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Token Pre-boarding không hợp lệ hoặc không tồn tại.' },
          { status: 404 }
        );
      }

      if (
        allMatchedInvites.some(isPreboardingRecordExpired) ||
        allMatchedEmployees.some(isPreboardingRecordExpired)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Liên kết Pre-boarding đã hết hạn, không thể nộp hồ sơ.',
          },
          { status: 410 }
        );
      }

      if (
        allMatchedInvites.some(
          (inv) => String(inv.status || '').toUpperCase() === 'VERIFIED'
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Hồ sơ Pre-boarding đã được HR xác minh, không thể sửa đổi qua liên kết công khai.',
          },
          { status: 403 }
        );
      }

      for (const emp of allMatchedEmployees) {
        const empStatus = String(emp.employment_status || '').toUpperCase();
        if (LOCKED_PREBOARDING_EMPLOYEE_STATUSES.has(empStatus)) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Nhân sự đã hoàn tất nhận việc hoặc đã nghỉ việc, không thể cập nhật Pre-boarding.',
            },
            { status: 403 }
          );
        }
        if (String(emp.preboarding_status || '').toUpperCase() === 'VERIFIED') {
          return NextResponse.json(
            {
              success: false,
              error:
                'Hồ sơ Pre-boarding đã được HR xác minh, không thể sửa đổi qua liên kết công khai.',
            },
            { status: 403 }
          );
        }
      }

      const now = new Date().toISOString();

      for (const bucket of matchedInviteBuckets) {
        for (const idx of bucket.indices) {
          bucket.list[idx] = {
            ...bucket.list[idx],
            national_id: idCardNo,
            id_card_no: idCardNo,
            tax_code: taxCode,
            social_insurance_no: bhxhNo,
            bhxh_no: bhxhNo,
            bank_account_no: bankAccountNo,
            bank_name: bankName,
            emergency_contact_name: emergencyName,
            emergency_contact_phone: emergencyPhone,
            emergency_contact_relation: emergencyRelation,
            ...(permanentAddress ? { permanent_address: permanentAddress } : {}),
            submitted_data: safeSubmission,
            status: 'SUBMITTED',
            submitted_at: now,
          };
        }
        store[bucket.key] = bucket.list;
      }

      for (const bucket of matchedEmpBuckets) {
        for (const idx of bucket.indices) {
          bucket.list[idx] = {
            ...bucket.list[idx],
            national_id: idCardNo,
            tax_code: taxCode,
            social_insurance_no: bhxhNo,
            bank_account_no: bankAccountNo,
            bank_name: bankName,
            emergency_contact_name: emergencyName,
            emergency_contact_phone: emergencyPhone,
            emergency_contact_relation: emergencyRelation,
            ...(permanentAddress ? { address: permanentAddress } : {}),
            ...(personalEmail ? { personal_email: personalEmail } : {}),
            ...(phone ? { phone } : {}),
            ...(gender ? { gender } : {}),
            ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
            ...(issueDate ? { national_id_issue_date: issueDate } : {}),
            ...(issuePlace ? { national_id_issue_place: issuePlace } : {}),
            ...(dependentsCount !== undefined
              ? { dependents_count: dependentsCount }
              : {}),
            preboarding_status: 'SUBMITTED',
          };
        }
        store[bucket.key] = bucket.list;
      }

      const primaryInvite = allMatchedInvites[0];
      const primaryEmp = allMatchedEmployees[0];

      appendServerAuditLog(store, {
        actorName:
          fullNameInput ||
          String(
            primaryInvite?.full_name ||
              primaryEmp?.full_name ||
              'Ứng viên Pre-boarding'
          ),
        actorRole: 'CANDIDATE',
        action: 'SUBMIT_PREBOARDING',
        target: token,
        detail: 'Ứng viên hoàn tất khai báo hồ sơ pháp lý Pre-boarding trực tuyến.',
        module: 'ONBOARDING',
      });
      persistStore();

      return NextResponse.json({ success: true, data: { submitted_at: now } });
    }

    // 3. Activate or Lock System User Account (Stage 1 IT Activation & Stage 4 Offboarding Lock)
    if (action === 'set_user_active') {
      if (
        invalidActorInput ||
        !effectiveActor ||
        (!can(effectiveActor, 'complete_onboarding_task', { deptScope: 'IT' }) &&
          !can(effectiveActor, 'execute_final_settlement'))
      ) {
        return NextResponse.json(
          { success: false, error: 'Chỉ IT / HR / Ban Giám đốc mới có quyền kích hoạt hoặc khóa tài khoản.' },
          { status: 403 }
        );
      }
      const employeeId = String(body.employee_id || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const isActive = Boolean(body.is_active);
      const accountStatus = isActive ? 'ACTIVE' : String(body.account_status || 'LOCKED');

      if (!employeeId && !email) {
        return NextResponse.json(
          { success: false, error: 'Cần cung cấp employee_id hoặc email tài khoản.' },
          { status: 400 }
        );
      }

      const hasRoleCodeParam =
        body.role_code !== undefined &&
        body.role_code !== null &&
        String(body.role_code).trim() !== '';
      const requestedRoleCode = hasRoleCodeParam
        ? (String(body.role_code).trim() as RoleCode)
        : 'EMPLOYEE';
      if (!ALLOWED_ROLES.has(requestedRoleCode)) {
        return NextResponse.json(
          { success: false, error: 'Mã vai trò (role_code) không hợp lệ.' },
          { status: 422 }
        );
      }
      if (requestedRoleCode === 'SUPER_ADMIN' && effectiveActor.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Chỉ SUPER_ADMIN mới có quyền cấp vai trò SUPER_ADMIN.' },
          { status: 403 }
        );
      }

      const users = readStoreArray(store, 'hrm_runtime_users');
      const idx = users.findIndex(
        (u) =>
          (employeeId && (u.employee_id === employeeId || u.id === employeeId)) ||
          (email && String(u.email || '').toLowerCase() === email)
      );

      if (
        idx >= 0 &&
        users[idx].role_code === 'SUPER_ADMIN' &&
        effectiveActor.role !== 'SUPER_ADMIN'
      ) {
        return NextResponse.json(
          { success: false, error: 'Chỉ SUPER_ADMIN mới có quyền thay đổi trạng thái tài khoản SUPER_ADMIN.' },
          { status: 403 }
        );
      }

      const now = new Date().toISOString();
      if (idx >= 0) {
        users[idx] = {
          ...users[idx],
          ...(hasRoleCodeParam ? { role_code: requestedRoleCode } : {}),
          is_active: isActive,
          account_status: accountStatus,
          ...(isActive ? { activated_at: now } : { locked_at: now }),
        };
      } else {
        users.unshift({
          id: `usr-${Date.now()}`,
          employee_id: employeeId || undefined,
          email: email || `${employeeId}@lacviethrm.vn`,
          is_active: isActive,
          account_status: accountStatus,
          role_code: requestedRoleCode,
          updated_at: now,
        });
      }
      store['hrm_runtime_users'] = users;

      appendServerAuditLog(store, {
        actorName: effectiveActor.name,
        actorRole: effectiveActor.role,
        action: isActive ? 'ACTIVATE_USER_ACCOUNT' : 'LOCK_USER_ACCOUNT',
        target: employeeId || email,
        detail: isActive
          ? 'Kích hoạt quyền đăng nhập hệ thống.'
          : 'Thu hồi quyền truy cập & khóa tài khoản đăng nhập.',
        module: 'SECURITY_RBAC',
      });
      persistStore();

      return NextResponse.json({
        success: true,
        data: { employee_id: employeeId, is_active: isActive, account_status: accountStatus },
      });
    }

    // 4. Append-only Immutable Career History Entry (Stage 3)
    if (action === 'append_career_history') {
      if (invalidActorInput || !effectiveActor) {
        return NextResponse.json(
          { success: false, error: 'Bắt buộc xác thực vai trò người thực hiện hợp lệ.' },
          { status: 403 }
        );
      }
      const rawEntry = body.entry;
      if (!isPlainObject(rawEntry) || hasForbiddenPrototypeKey(rawEntry)) {
        return NextResponse.json(
          { success: false, error: 'Dữ liệu lịch sử công tác (entry) không hợp lệ.' },
          { status: 400 }
        );
      }
      const entry = rawEntry;
      const empId = String(entry.employee_id || '').trim();
      const effectiveDate = String(entry.effective_date || '').trim();
      if (!empId || !effectiveDate) {
        return NextResponse.json(
          { success: false, error: 'Thiếu thông tin employee_id hoặc effective_date cho lịch sử công tác.' },
          { status: 400 }
        );
      }

      const rawNewRole =
        entry.new_role_code !== undefined &&
        entry.new_role_code !== null &&
        String(entry.new_role_code).trim() !== ''
          ? (String(entry.new_role_code).trim() as RoleCode)
          : undefined;
      if (rawNewRole !== undefined && !ALLOWED_ROLES.has(rawNewRole)) {
        return NextResponse.json(
          { success: false, error: 'Vai trò mới (new_role_code) không hợp lệ.' },
          { status: 422 }
        );
      }
      if (rawNewRole === 'SUPER_ADMIN' && effectiveActor.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Chỉ SUPER_ADMIN mới có quyền bổ nhiệm vai trò SUPER_ADMIN.' },
          { status: 403 }
        );
      }

      const rawOldRole =
        entry.old_role_code !== undefined &&
        entry.old_role_code !== null &&
        ALLOWED_ROLES.has(String(entry.old_role_code).trim() as RoleCode)
          ? (String(entry.old_role_code).trim() as RoleCode)
          : undefined;

      const parsedNewSalary = Number(entry.new_salary_vnd ?? entry.new_salary ?? 0);
      const safeNewSalary = Number.isFinite(parsedNewSalary) && parsedNewSalary >= 0 ? parsedNewSalary : 0;
      const parsedOldSalary = Number(entry.old_salary_vnd ?? entry.old_salary ?? 0);
      const safeOldSalary = Number.isFinite(parsedOldSalary) && parsedOldSalary >= 0 ? parsedOldSalary : 0;

      if (
        !can(effectiveActor, 'approve_promotion_or_salary_change', {
          salary: safeNewSalary,
          newRole: rawNewRole,
        })
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Quyết định bổ nhiệm Quản lý hoặc mức lương trên 50.000.000đ cần Giám đốc phê duyệt.',
          },
          { status: 403 }
        );
      }

      const histories = readStoreArray(store, 'hrm_runtime_career_histories');
      const customId = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
      if (customId && histories.some((h) => h.id === customId)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Lịch sử thăng tiến là bất biến (append-only), không cho phép ghi đè bản ghi cũ.',
          },
          { status: 409 }
        );
      }

      const currentYear = new Date().getFullYear();
      const newRecord: Record<string, unknown> = {
        id: customId || `ch-${Date.now()}`,
        decision_no:
          typeof entry.decision_no === 'string' && entry.decision_no.trim()
            ? entry.decision_no.trim().slice(0, 64)
            : formatDecisionNo(currentYear, histories.length + 1),
        employee_id: empId.slice(0, 64),
        effective_date: effectiveDate.slice(0, 32),
        new_salary_vnd: safeNewSalary,
        created_at: new Date().toISOString(),
      };
      if (typeof entry.employee_code === 'string' && entry.employee_code.trim()) {
        newRecord.employee_code = entry.employee_code.trim().slice(0, 32);
      }
      if (typeof entry.full_name === 'string' && entry.full_name.trim()) {
        newRecord.full_name = entry.full_name.trim().slice(0, 120);
      }
      if (typeof entry.change_type === 'string' && entry.change_type.trim()) {
        newRecord.change_type = entry.change_type.trim().slice(0, 48);
      }
      if (typeof entry.old_department_id === 'string') {
        newRecord.old_department_id = entry.old_department_id.trim().slice(0, 64);
      }
      if (typeof entry.old_department_name === 'string') {
        newRecord.old_department_name = entry.old_department_name.trim().slice(0, 120);
      }
      if (typeof entry.new_department_id === 'string') {
        newRecord.new_department_id = entry.new_department_id.trim().slice(0, 64);
      }
      if (typeof entry.new_department_name === 'string') {
        newRecord.new_department_name = entry.new_department_name.trim().slice(0, 120);
      }
      if (typeof entry.old_position_id === 'string') {
        newRecord.old_position_id = entry.old_position_id.trim().slice(0, 64);
      }
      if (typeof entry.old_position_name === 'string') {
        newRecord.old_position_name = entry.old_position_name.trim().slice(0, 120);
      }
      if (typeof entry.new_position_id === 'string') {
        newRecord.new_position_id = entry.new_position_id.trim().slice(0, 64);
      }
      if (typeof entry.new_position_name === 'string') {
        newRecord.new_position_name = entry.new_position_name.trim().slice(0, 120);
      }
      if (entry.old_salary_vnd !== undefined || entry.old_salary !== undefined) {
        newRecord.old_salary_vnd = safeOldSalary;
      }
      if (rawOldRole !== undefined) {
        newRecord.old_role_code = rawOldRole;
      }
      if (rawNewRole !== undefined) {
        newRecord.new_role_code = rawNewRole;
      }
      if (typeof entry.reason === 'string' && entry.reason.trim()) {
        newRecord.reason = entry.reason.trim().slice(0, 500);
      }
      if (typeof entry.signed_by_name === 'string' && entry.signed_by_name.trim()) {
        newRecord.signed_by_name = entry.signed_by_name.trim().slice(0, 120);
      }
      if (entry.addendum_contract_id !== undefined) {
        newRecord.addendum_contract_id =
          typeof entry.addendum_contract_id === 'string'
            ? entry.addendum_contract_id.trim().slice(0, 64)
            : null;
      }
      if (entry.addendum_contract_number !== undefined) {
        newRecord.addendum_contract_number =
          typeof entry.addendum_contract_number === 'string'
            ? entry.addendum_contract_number.trim().slice(0, 64)
            : null;
      }

      store['hrm_runtime_career_histories'] = [newRecord, ...histories];
      appendServerAuditLog(store, {
        actorName: effectiveActor.name,
        actorRole: effectiveActor.role,
        action: 'ISSUE_CAREER_DECISION',
        target: String(newRecord.decision_no),
        detail: `Ban hành quyết định ${String(newRecord.decision_no)} có hiệu lực từ ${effectiveDate}.`,
        module: 'CORE_HR',
      });
      persistStore();

      return NextResponse.json({ success: true, data: newRecord }, { status: 201 });
    }

    // 5. Calculate Legal Resignation Notice Period (Stage 4: 3 / 30 / 45 days)
    if (action === 'calculate_notice_period') {
      const contractType = String(body.contract_type || 'FIXED_TERM');
      const submittedDate = String(
        body.submitted_date || new Date().toISOString().slice(0, 10)
      );
      const requestedLastDay = body.requested_last_day
        ? String(body.requested_last_day)
        : undefined;

      const requiredNoticeDays = getRequiredNoticeDays(contractType);
      const earliestLegalLastDay = addDaysIso(submittedDate, requiredNoticeDays);
      const isCompliant = requestedLastDay ? requestedLastDay >= earliestLegalLastDay : true;

      return NextResponse.json({
        success: true,
        data: {
          contract_type: contractType,
          required_notice_days: requiredNoticeDays,
          submitted_date: submittedDate,
          earliest_legal_last_day: earliestLegalLastDay,
          approved_last_day:
            requestedLastDay && isCompliant ? requestedLastDay : earliestLegalLastDay,
          is_notice_compliant: isCompliant,
        },
      });
    }

    // 6. Verify 100% Clearance & 3-Way Handover Hard Gate before Final Settlement (Stage 4)
    if (action === 'verify_clearance_gate') {
      const resignationId = String(body.resignation_id || '').trim();
      if (!resignationId) {
        return NextResponse.json(
          { success: false, error: 'Thiếu resignation_id để kiểm tra điều kiện quyết toán.' },
          { status: 400 }
        );
      }

      const handovers = readStoreArray(store, 'hrm_runtime_handover_items').filter(
        (h) => h.resignation_id === resignationId
      );
      const incompleteHandovers = handovers.filter(
        (h) => !h.employee_confirmed || !h.receiver_confirmed || !h.manager_confirmed
      );

      const checklists = readStoreArray(store, 'hrm_runtime_clearance_checklists').filter(
        (c) => c.resignation_id === resignationId
      );
      const checklistObj = checklists[0];

      const reasons: string[] = [];
      if (incompleteHandovers.length > 0) {
        reasons.push(`Còn ${incompleteHandovers.length} hạng mục bàn giao tay ba chưa đủ 3 xác nhận.`);
      }
      if (!checklistObj) {
        reasons.push('Chưa khởi tạo phiếu thanh lý (Clearance Checklist).');
      } else {
        if (Array.isArray(checklistObj.assets)) {
          const pendingAssets = (checklistObj.assets as Record<string, unknown>[]).filter(
            (a) => !a.returned && a.condition_status !== 'LOST' && a.return_condition !== 'LOST'
          );
          if (pendingAssets.length > 0) {
            reasons.push(`Còn ${pendingAssets.length} tài sản công ty chưa bàn giao/đối chiếu đền bù.`);
          }
        }
        if (checklistObj.it_revoked_access === false || checklistObj.it_cleared === false) {
          reasons.push('Bộ phận IT chưa xác nhận khóa email & thu hồi quyền truy cập.');
        }
        if (checklistObj.accounting_debt_cleared === false || checklistObj.accounting_cleared === false) {
          reasons.push('Bộ phận Kế toán chưa xác nhận đối chiếu công nợ/tạm ứng.');
        }
        if (checklistObj.hr_insurance_book_closed === false || checklistObj.hr_cleared === false) {
          reasons.push('Bộ phận Nhân sự chưa xác nhận chốt sổ BHXH & hồ sơ gốc.');
        }
      }

      if (reasons.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Chưa đạt 100% điều kiện Clearance để quyết toán: ${reasons.join(' ')}`,
            reasons,
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        success: true,
        data: { is_100_percent_cleared: true, resignation_id: resignationId },
      });
    }

    // 7. Canonical Code Generator Helper
    if (action === 'generate_code') {
      const kind = String(body.kind || 'employee');
      const year = Number(body.year) || new Date().getFullYear();
      const seq = Math.max(1, Number(body.sequence) || 1);
      let code = '';

      switch (kind) {
        case 'contract':
          code = formatContractCode(year, seq, String(body.contract_type || 'FIXED_TERM'));
          break;
        case 'decision':
          code = formatDecisionNo(year, seq, String(body.prefix || ''));
          break;
        case 'resignation':
          code = formatResignationCode(year, seq);
          break;
        case 'payroll':
          code = formatPayrollCode(
            String(body.period_month || year),
            seq,
            Boolean(body.is_final_settlement)
          );
          break;
        case 'leave_request':
          code = formatLeaveRequestCode(year, seq);
          break;
        case 'review':
          code = formatReviewCode(year, seq);
          break;
        default:
          code = formatEmployeeCode(year, seq);
          break;
      }

      return NextResponse.json({ success: true, data: { code } });
    }

    // 8. Reset Demo Sync Store
    if (action === 'reset_demo_sync') {
      if (
        invalidActorInput ||
        !effectiveActor ||
        !can(effectiveActor, 'execute_final_settlement')
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Chỉ Quản trị hệ thống / HR Manager / Ban Giám đốc mới có quyền đặt lại dữ liệu đồng bộ.',
          },
          { status: 403 }
        );
      }
      globalThis._hrmSyncStore = {};
      globalThis._hrmSyncStoreBootEpoch = undefined;
      clearCopilotRouterStoreIfPresent();
      persistStore();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: `Action '${action}' không được hỗ trợ trên /api/hrm/lifecycle.` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi xử lý nghiệp vụ vòng đời nhân sự';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
