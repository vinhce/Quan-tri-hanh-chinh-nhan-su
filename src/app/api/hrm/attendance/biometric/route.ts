import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_SERVER_WIFI_POLICY,
  FACE_MATCH_THRESHOLD,
  FACE_MIN_ANTISPOOF,
  FACE_MIN_BLINKS,
  FACE_MIN_LIVENESS,
  checkFacePunchRateLimit,
  checkMaskFromPeriocularService,
  computeCosineSimilarity,
  consumeFaceChallenge,
  consumeFaceRateLimit,
  decryptFaceEmbedding,
  encryptFaceEmbedding,
  evaluateSameWifiGate,
  extractForwardedClientIp,
  extractHostnameFromHeaders,
  extractPeriocularFromService,
  formatFaceCoverLabelVi,
  getHostLanInterfaces,
  getHostPublicIpInfo,
  getHostWifiDetails,
  getPeriocularMatchThreshold,
  isVnNightAttendanceLocked,
  issueFaceChallenge,
  issueWebAuthnChallenge,
  probePeriocularHealth,
  recordFacePunchFailure,
  resetFaceEmployeeRateLimits,
  resetFacePunchRateLimit,
  validateAndNormalizeFaceEmbedding,
  validatePeriocularFrameBase64,
  verifyHrmSessionFromBiometricRequest,
  verifyWebAuthnAssertion,
  verifyWebAuthnRegistration,
  type FaceCoverStatus,
  type VerifiedBiometricHrmSession,
} from '@/lib/hrm/biometric-server';
import { formatEventId } from '@/lib/hrm/ids';
import { MOCK_EMPLOYEES } from '@/mock/employees';
import type {
  BiometricCredentialRecord,
  BiometricDeviceKind,
  FaceBiometricProfileDto,
  RoleCode,
  WifiAttendancePolicy,
} from '@/mock/types';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
  // eslint-disable-next-line no-var
  var _hrmBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreBootEpoch: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmSyncStoreDiskSig: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmVerifiedBiometricActors:
    | Map<string, { employeeId: string; employeeCode: string; expiresAt: number }>
    | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');

const STORE_CREDS_KEY = 'hrm_runtime_biometric_creds_v1';
const STORE_FACE_PROFILES_KEY = 'hrm_runtime_face_profiles_v1';
const STORE_EMPLOYEES_KEY = 'hrm_runtime_employees_v1';
const STORE_POLICY_KEY = 'hrm_runtime_wifi_policy_v1';
const STORE_AUDIT_KEY = 'hrm_runtime_audit_logs';
const BIO_SESSION_COOKIE = 'hrm_bio_session';
const CLI_LOOPBACK_SESSION_KEY = '__cli_loopback_test__';
const VERIFIED_ACTOR_TTL_MS = 5 * 60_000;
const INTERNAL_STAFF_ROLES = new Set(['EMPLOYEE', 'DEPT_MANAGER', 'DIRECTOR']);
const WRITE_ACTIONS_REQUIRING_CSRF_CHECK = new Set([
  'save_wifi_policy',
  'delete_credential',
  'verify_register',
  'verify_punch',
  'face_issue_challenge',
  'face_mask_check',
  'face_register',
  'face_verify_punch',
  'face_delete_profile',
]);

function isAdminOrHrRole(role: string | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'HR_MANAGER';
}

function sanitizeWifiPolicyPatch(
  current: WifiAttendancePolicy,
  rawPolicy: Record<string, unknown>,
  actorName: string
): WifiAttendancePolicy {
  const safeLabel =
    typeof rawPolicy.wifi_ssid_label === 'string' && rawPolicy.wifi_ssid_label.trim()
      ? rawPolicy.wifi_ssid_label.trim().slice(0, 120)
      : current.wifi_ssid_label;
  const safeEnforce =
    typeof rawPolicy.enforce_same_wifi === 'boolean'
      ? rawPolicy.enforce_same_wifi
      : current.enforce_same_wifi;
  const safeRequireBio =
    typeof rawPolicy.require_biometric_for_punch === 'boolean'
      ? rawPolicy.require_biometric_for_punch
      : current.require_biometric_for_punch;
  const safePublicIps = Array.isArray(rawPolicy.allowed_public_ips)
    ? rawPolicy.allowed_public_ips
        .filter((ip): ip is string => typeof ip === 'string' && ip.trim().length > 0 && ip.length <= 64)
        .slice(0, 50)
        .map((ip) => ip.trim())
    : current.allowed_public_ips;
  const safeLanCidrs = Array.isArray(rawPolicy.allowed_lan_cidrs)
    ? rawPolicy.allowed_lan_cidrs
        .filter((c): c is string => typeof c === 'string' && c.trim().length > 0 && c.length <= 64)
        .slice(0, 50)
        .map((c) => c.trim())
    : current.allowed_lan_cidrs;

  return {
    id: 'wifi-policy-default',
    wifi_ssid_label: safeLabel,
    enforce_same_wifi: safeEnforce,
    require_biometric_for_punch: safeRequireBio,
    allowed_public_ips: safePublicIps,
    allowed_lan_cidrs: safeLanCidrs,
    updated_by: (actorName || current.updated_by || 'Quản trị hệ thống').slice(0, 120),
    updated_at: new Date().toISOString(),
  };
}

function extractRealHostHostname(req: Request): string {
  const rawHost = (req.headers.get('host') || '').trim().toLowerCase();
  if (!rawHost) return '';
  if (rawHost.startsWith('[')) {
    const closeIdx = rawHost.indexOf(']');
    return closeIdx > 0 ? rawHost.slice(1, closeIdx) : rawHost;
  }
  return rawHost.split(':')[0] || '';
}

function isRealHostLocal(req: Request): boolean {
  const hostname = extractRealHostHostname(req);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isDevTunnelHost(req: Request): boolean {
  const hostname = extractRealHostHostname(req);
  return hostname.endsWith('.devtunnels.ms') && hostname.length > '.devtunnels.ms'.length;
}

function stripUntrustedProxyHeaders(req: Request): Pick<Request, 'headers'> {
  const filtered = new Headers(req.headers);
  filtered.delete('cf-connecting-ip');
  filtered.delete('x-real-ip');
  filtered.delete('x-forwarded-for');
  filtered.delete('x-forwarded-host');
  return { headers: filtered };
}

function isCookieLessLoopbackCliRequest(req: Request): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  const rawCookie = req.headers.get('cookie');
  if (rawCookie !== null && rawCookie.trim().length > 0) {
    return false;
  }
  if (
    req.headers.get('x-forwarded-for') !== null ||
    req.headers.get('x-real-ip') !== null ||
    req.headers.get('cf-connecting-ip') !== null ||
    req.headers.get('x-forwarded-host') !== null ||
    req.headers.get('x-forwarded-proto') !== null
  ) {
    return false;
  }
  // Chặn mọi request từ trình duyệt (kể cả fetch(..., { credentials: 'omit' }))
  if (
    req.headers.get('referer') !== null ||
    req.headers.get('sec-fetch-site') !== null ||
    req.headers.get('sec-fetch-mode') !== null ||
    req.headers.get('sec-fetch-dest') !== null ||
    req.headers.get('user-agent') !== null ||
    req.headers.get('accept-language') !== null
  ) {
    return false;
  }
  if (!isRealHostLocal(req)) {
    return false;
  }
  const originHeader = (req.headers.get('origin') || '').trim();
  if (originHeader) {
    try {
      const parsedOrigin = new URL(originHeader);
      const originHostname = parsedOrigin.hostname.toLowerCase();
      const rawHost = (req.headers.get('host') || '').trim().toLowerCase();
      if (
        (originHostname !== 'localhost' &&
          originHostname !== '127.0.0.1' &&
          originHostname !== '::1') ||
        !rawHost ||
        parsedOrigin.host.toLowerCase() !== rawHost
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function extractCookieValue(req: Request, name: string): string {
  const cookieHeader = req.headers.get('cookie') || '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`).exec(cookieHeader);
  return match ? decodeURIComponent(match[1]).trim() : '';
}

function resolveAuthenticatedRole(
  req: Request,
  rawBodyRole: unknown
): { ok: boolean; role: string | null; session: VerifiedBiometricHrmSession | null } {
  const hrmSession = verifyHrmSessionFromBiometricRequest(req);
  if (hrmSession) {
    return { ok: true, role: hrmSession.role, session: hrmSession };
  }

  const rawCookieHeader = req.headers.get('cookie');
  const hasCookieHeader =
    rawCookieHeader !== null && rawCookieHeader.trim().length > 0;
  if (hasCookieHeader) {
    // Fail closed: tuyệt đối không tin cookie hrm_role không có chữ ký HMAC
    return { ok: false, role: null, session: null };
  }

  if (isCookieLessLoopbackCliRequest(req)) {
    const bodyRole = rawBodyRole ? String(rawBodyRole).trim() : '';
    return { ok: true, role: bodyRole || null, session: null };
  }

  return { ok: false, role: null, session: null };
}

function issueVerifiedBiometricSessionCookie(
  req: Request,
  employeeId: string,
  employeeCode: string
): string {
  if (!globalThis._hrmVerifiedBiometricActors) {
    globalThis._hrmVerifiedBiometricActors = new Map();
  }
  const now = Date.now();
  if (globalThis._hrmVerifiedBiometricActors.size > 500) {
    globalThis._hrmVerifiedBiometricActors.forEach((val, key) => {
      if (val.expiresAt <= now) {
        globalThis._hrmVerifiedBiometricActors?.delete(key);
      }
    });
  }
  const token = crypto.randomBytes(24).toString('hex');
  const record = {
    employeeId,
    employeeCode,
    expiresAt: now + VERIFIED_ACTOR_TTL_MS,
  };
  globalThis._hrmVerifiedBiometricActors.set(token, record);
  if (isCookieLessLoopbackCliRequest(req)) {
    globalThis._hrmVerifiedBiometricActors.set(CLI_LOOPBACK_SESSION_KEY, record);
  }
  const isHttps =
    req.url.startsWith('https://') ||
    req.headers.get('x-forwarded-proto') === 'https';
  return `${BIO_SESSION_COOKIE}=${token}; Path=/; Max-Age=300; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`;
}

function getVerifiedBiometricActor(
  req: Request
): { employeeId: string; employeeCode: string } | null {
  const map = globalThis._hrmVerifiedBiometricActors;
  if (!map) return null;
  const now = Date.now();

  const cookieToken = extractCookieValue(req, BIO_SESSION_COOKIE);
  if (cookieToken && /^[a-f0-9]{48}$/i.test(cookieToken)) {
    const entry = map.get(cookieToken);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      map.delete(cookieToken);
      return null;
    }
    return { employeeId: entry.employeeId, employeeCode: entry.employeeCode };
  }

  if (isCookieLessLoopbackCliRequest(req)) {
    const cliEntry = map.get(CLI_LOOPBACK_SESSION_KEY);
    if (!cliEntry) return null;
    if (cliEntry.expiresAt <= now) {
      map.delete(CLI_LOOPBACK_SESSION_KEY);
      return null;
    }
    return { employeeId: cliEntry.employeeId, employeeCode: cliEntry.employeeCode };
  }

  return null;
}

const FORBIDDEN_STORE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function readDiskBootEpoch(): string | undefined {
  try {
    if (!fs.existsSync(DATA_FILE)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const raw = (parsed as Record<string, unknown>)._bootEpoch;
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw.trim();
      }
    }
  } catch {
    // ignore read error
  }
  return undefined;
}

function getSyncStore(): Record<string, unknown> {
  const g = globalThis as typeof globalThis & {
    _hrmSyncStoreLoadedMtimeMs?: number;
  };
  try {
    if (fs.existsSync(DATA_FILE)) {
      const stat = fs.statSync(DATA_FILE);
      const diskSig = `${stat.mtimeMs}:${stat.size}`;
      const hasRam =
        Boolean(globalThis._hrmSyncStore) &&
        Object.keys(globalThis._hrmSyncStore as Record<string, unknown>).length > 0;
      const isDiskNewer =
        typeof g._hrmSyncStoreLoadedMtimeMs !== 'number' ||
        stat.mtimeMs > g._hrmSyncStoreLoadedMtimeMs ||
        globalThis._hrmSyncStoreDiskSig !== diskSig;
      if (!hasRam || isDiskNewer) {
        const content = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(content) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const parsedRec = parsed as Record<string, unknown>;
          const rawEpoch = parsedRec._bootEpoch;
          if (typeof rawEpoch === 'string' && rawEpoch.trim().length > 0) {
            const epoch = rawEpoch.trim();
            globalThis._hrmBootEpoch = epoch;
            globalThis._hrmSyncStoreBootEpoch = epoch;
          }
          const cleanStore: Record<string, unknown> = Object.create(null);
          for (const [k, v] of Object.entries(parsedRec)) {
            if (k !== '_bootEpoch' && !FORBIDDEN_STORE_KEYS.has(k)) {
              cleanStore[k] = v;
            }
          }
          globalThis._hrmSyncStore = cleanStore;
          globalThis._hrmSyncStoreDiskSig = diskSig;
          g._hrmSyncStoreLoadedMtimeMs = stat.mtimeMs;
        }
      }
      return globalThis._hrmSyncStore || {};
    }
  } catch {
    // ignore read error
  }
  if (!globalThis._hrmSyncStore) {
    const emptyStore: Record<string, unknown> = Object.create(null);
    globalThis._hrmSyncStore = emptyStore;
    return emptyStore;
  }
  return globalThis._hrmSyncStore;
}

function persistSyncStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const existingEpoch =
      (typeof globalThis._hrmBootEpoch === 'string' && globalThis._hrmBootEpoch.trim()) ||
      (typeof globalThis._hrmSyncStoreBootEpoch === 'string' &&
        globalThis._hrmSyncStoreBootEpoch.trim()) ||
      readDiskBootEpoch() ||
      undefined;

    const ramStore = globalThis._hrmSyncStore || {};
    const payload: Record<string, unknown> = {
      ...(existingEpoch ? { _bootEpoch: existingEpoch } : {}),
    };
    for (const [k, v] of Object.entries(ramStore)) {
      if (k !== '_bootEpoch' && !FORBIDDEN_STORE_KEYS.has(k)) {
        payload[k] = v;
      }
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    const stat = fs.statSync(DATA_FILE);
    if (existingEpoch) {
      globalThis._hrmBootEpoch = existingEpoch;
      globalThis._hrmSyncStoreBootEpoch = existingEpoch;
    }
    globalThis._hrmSyncStoreDiskSig = `${stat.mtimeMs}:${stat.size}`;
    const g = globalThis as typeof globalThis & {
      _hrmSyncStoreLoadedMtimeMs?: number;
    };
    g._hrmSyncStoreLoadedMtimeMs = stat.mtimeMs;
  } catch {
    // ignore write error in read-only environments
  }
}

function readCreds(store: Record<string, unknown>): BiometricCredentialRecord[] {
  const raw = store[STORE_CREDS_KEY];
  return Array.isArray(raw) ? (raw as BiometricCredentialRecord[]) : [];
}

interface StoredFaceBiometricProfile {
  id: string;
  employee_id: string;
  employee_code: string;
  device_label: string;
  embedding_dim: number;
  registered_by_role: RoleCode;
  created_at: string;
  last_used_at: string | null;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  periocular_ciphertext?: string;
  periocular_iv?: string;
  periocular_auth_tag?: string;
  periocular_dim?: number;
  periocular_engine?: string;
}

function parseFiniteNumber(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function readFaceProfiles(store: Record<string, unknown>): StoredFaceBiometricProfile[] {
  const raw = store[STORE_FACE_PROFILES_KEY];
  return Array.isArray(raw) ? (raw as StoredFaceBiometricProfile[]) : [];
}

function writeFaceProfiles(
  store: Record<string, unknown>,
  list: StoredFaceBiometricProfile[]
): void {
  store[STORE_FACE_PROFILES_KEY] = list;
}

function toPublicFaceProfileDto(
  rec: StoredFaceBiometricProfile
): FaceBiometricProfileDto {
  const hasPeriocular = Boolean(
    rec.periocular_ciphertext && rec.periocular_iv && rec.periocular_auth_tag
  );
  return {
    id: rec.id,
    employee_id: rec.employee_id,
    employee_code: rec.employee_code,
    device_label: rec.device_label,
    embedding_dim: rec.embedding_dim,
    registered_by_role: rec.registered_by_role,
    created_at: rec.created_at,
    last_used_at: rec.last_used_at ?? null,
    has_periocular_template: hasPeriocular,
    supported_modalities: hasPeriocular ? ['FACE_FULL', 'PERIOCULAR'] : ['FACE_FULL'],
  };
}

function validateFaceWriteRequestHeaders(req: Request): NextResponse | null {
  if (isCookieLessLoopbackCliRequest(req)) {
    return null;
  }

  const contentType = (req.headers.get('content-type') || '').trim().toLowerCase();
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      {
        success: false,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        error: 'Yêu cầu Content-Type: application/json cho thao tác ghi dữ liệu sinh trắc học.',
      },
      { status: 415 }
    );
  }

  const originHeader = (req.headers.get('origin') || '').trim();
  if (!originHeader) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN_ORIGIN',
        error: 'Thiếu header Origin hợp lệ cho yêu cầu ghi dữ liệu.',
      },
      { status: 403 }
    );
  }

  const hostHeader = (req.headers.get('host') || '').trim().toLowerCase();
  let originHost = '';
  try {
    const parsedOrigin = new URL(originHeader);
    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
      return NextResponse.json(
        {
          success: false,
          code: 'FORBIDDEN_ORIGIN',
          error: 'Giao thức Origin không hợp lệ.',
        },
        { status: 403 }
      );
    }
    originHost = parsedOrigin.host.toLowerCase();
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN_ORIGIN',
        error: 'Header Origin không hợp lệ.',
      },
      { status: 403 }
    );
  }

  if (!hostHeader || originHost !== hostHeader) {
    return NextResponse.json(
      {
        success: false,
        code: 'FORBIDDEN_ORIGIN',
        error: 'Nguồn gửi yêu cầu (Origin) không khớp tên miền máy chủ.',
      },
      { status: 403 }
    );
  }

  return null;
}

function sanitizeFaceClientHints(rawHints: unknown): {
  connectionType?: string;
  effectiveType?: string;
} {
  if (!rawHints || typeof rawHints !== 'object' || Array.isArray(rawHints)) {
    return {};
  }
  const hints = rawHints as Record<string, unknown>;
  const sanitized: { connectionType?: string; effectiveType?: string } = {};
  if (typeof hints.connectionType === 'string' && hints.connectionType.trim()) {
    sanitized.connectionType = hints.connectionType.trim().slice(0, 32);
  }
  if (typeof hints.effectiveType === 'string' && hints.effectiveType.trim()) {
    sanitized.effectiveType = hints.effectiveType.trim().slice(0, 32);
  }
  // Xóa bỏ publicIpv4 & publicIpv6Prefix64 để client không thể tự khai IP vượt WiFi Gate
  return sanitized;
}

function readKnownEmployeesDirectory(
  store: Record<string, unknown>
): Array<{ id: string; employee_code: string }> {
  const byId = new Map<string, { id: string; employee_code: string }>();
  for (const emp of MOCK_EMPLOYEES) {
    if (emp.id && emp.employee_code) {
      byId.set(emp.id, {
        id: emp.id.trim(),
        employee_code: emp.employee_code.trim(),
      });
    }
  }
  const rawRuntime = store[STORE_EMPLOYEES_KEY];
  if (Array.isArray(rawRuntime)) {
    for (const item of rawRuntime) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === 'string' ? rec.id.trim() : '';
        const code =
          typeof rec.employee_code === 'string' ? rec.employee_code.trim() : '';
        if (id && code) {
          byId.set(id, { id, employee_code: code });
        }
      }
    }
  }
  return Array.from(byId.values());
}

function hasFaceEmployeeIdOwnershipConflict(
  store: Record<string, unknown>,
  employeeId: string,
  effectiveEmployeeCode: string
): boolean {
  const cleanId = employeeId.trim();
  const codeUpper = effectiveEmployeeCode.trim().toUpperCase();
  if (!cleanId || !codeUpper) return true;

  const profiles = readFaceProfiles(store);
  if (
    profiles.some(
      (p) =>
        p.employee_id === cleanId && p.employee_code.toUpperCase() !== codeUpper
    )
  ) {
    return true;
  }

  const creds = readCreds(store);
  if (
    creds.some(
      (c) =>
        (c.employee_id === cleanId && c.employee_code.toUpperCase() !== codeUpper) ||
        (c.employee_code.toUpperCase() === codeUpper && c.employee_id !== cleanId)
    )
  ) {
    return true;
  }

  const directory = readKnownEmployeesDirectory(store);
  if (
    directory.some(
      (e) =>
        (e.id === cleanId && e.employee_code.toUpperCase() !== codeUpper) ||
        (e.employee_code.toUpperCase() === codeUpper && e.id !== cleanId)
    )
  ) {
    return true;
  }

  return false;
}

function filterVisibleCredentialsForRequest(
  creds: BiometricCredentialRecord[],
  session: VerifiedBiometricHrmSession | null,
  isLoopbackCli: boolean,
  employeeFilter?: string
): BiometricCredentialRecord[] {
  const applyFilter = (list: BiometricCredentialRecord[]) =>
    employeeFilter
      ? list.filter(
          (c) =>
            c.employee_id === employeeFilter ||
            c.employee_code.toUpperCase() === employeeFilter.toUpperCase()
        )
      : list;

  if (isLoopbackCli) {
    return applyFilter(creds);
  }
  if (!session || session.role === 'CANDIDATE') {
    return [];
  }
  if (isAdminOrHrRole(session.role)) {
    return applyFilter(creds);
  }
  if (!session.employeeCode) {
    return [];
  }
  const ownCode = session.employeeCode.toUpperCase();
  return applyFilter(
    creds.filter((c) => c.employee_code.toUpperCase() === ownCode)
  );
}

function sanitizePolicyForNonAdmin(
  policy: WifiAttendancePolicy
): WifiAttendancePolicy {
  return {
    ...policy,
    allowed_public_ips: [],
    allowed_lan_cidrs: [],
  };
}

function sanitizeWifiForNonAdmin(
  verification: Awaited<ReturnType<typeof evaluateRequestWifi>>['verification']
) {
  const safeReason =
    !verification.allowed && verification.code === 'WIFI_MISMATCH'
      ? 'Thiết bị chưa kết nối cùng mạng WiFi văn phòng được phê duyệt. Vui lòng tắt 4G/VPN và kết nối đúng mạng WiFi công ty.'
      : verification.allowed && verification.mode !== 'POLICY_DISABLED'
        ? 'Đã xác thực kết nối cùng mạng WiFi văn phòng hợp lệ.'
        : verification.reason;
  return {
    ...verification,
    reason: safeReason,
    verifiedIp: verification.allowed ? 'verified-network' : 'blocked-network',
    hostPublicIpv4: null,
    hostLanIps: [],
    clientObservedIp: null,
    policy: sanitizePolicyForNonAdmin(verification.policy),
  };
}

function filterVisibleFaceProfilesForSession(
  profiles: StoredFaceBiometricProfile[],
  session: VerifiedBiometricHrmSession | null,
  employeeFilter?: string
): FaceBiometricProfileDto[] {
  if (!session || session.role === 'CANDIDATE') {
    return [];
  }
  const isAdminOrHr = isAdminOrHrRole(session.role);
  if (isAdminOrHr) {
    const scoped = employeeFilter
      ? profiles.filter(
          (p) =>
            p.employee_id === employeeFilter ||
            p.employee_code.toUpperCase() === employeeFilter.toUpperCase()
        )
      : profiles;
    return scoped.map(toPublicFaceProfileDto);
  }
  if (!session.employeeCode) {
    return [];
  }
  const ownCode = session.employeeCode.toUpperCase();
  const ownProfiles = profiles.filter((p) => {
    if (p.employee_code.toUpperCase() !== ownCode) return false;
    if (employeeFilter) {
      return (
        p.employee_id === employeeFilter ||
        p.employee_code.toUpperCase() === employeeFilter.toUpperCase()
      );
    }
    return true;
  });
  return ownProfiles.map(toPublicFaceProfileDto);
}

function readPolicy(store: Record<string, unknown>): WifiAttendancePolicy {
  const raw = store[STORE_POLICY_KEY];
  const first = Array.isArray(raw)
    ? (raw[0] as Partial<WifiAttendancePolicy> | undefined)
    : undefined;
  if (!first) {
    return {
      ...DEFAULT_SERVER_WIFI_POLICY,
      allowed_public_ips: [],
      allowed_lan_cidrs: [],
    };
  }
  return {
    ...DEFAULT_SERVER_WIFI_POLICY,
    ...first,
    allowed_public_ips: Array.isArray(first.allowed_public_ips)
      ? first.allowed_public_ips
      : [],
    allowed_lan_cidrs: Array.isArray(first.allowed_lan_cidrs)
      ? first.allowed_lan_cidrs
      : [],
  };
}

function appendBiometricAudit(
  store: Record<string, unknown>,
  params: {
    actorName: string;
    actorCode: string;
    actorRole: string;
    action: string;
    target: string;
    detail: string;
    ipAddress?: string;
    status?: 'SUCCESS' | 'WARNING' | 'BLOCKED';
  }
): void {
  const raw = store[STORE_AUDIT_KEY];
  const logs = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const now = new Date();
  const entry = {
    id: formatEventId('aud'),
    log_code: `AUD-${String(now.getTime()).slice(-6)}`,
    timestamp: now.toISOString(),
    actor_employee_code: params.actorCode || 'EMP',
    actor_name: params.actorName || 'Hệ thống',
    actor_role: params.actorRole || 'EMPLOYEE',
    ip_address: params.ipAddress || '127.0.0.1',
    action: params.action,
    module: 'TIME_ATTENDANCE',
    target_entity: params.target,
    status: params.status || 'SUCCESS',
    detail: params.detail,
  };
  store[STORE_AUDIT_KEY] = [entry, ...logs].slice(0, 150);
}

async function evaluateRequestWifi(
  req: Pick<Request, 'headers'>,
  body: Record<string, unknown>,
  policyOverride?: WifiAttendancePolicy
) {
  const store = getSyncStore();
  const policy = policyOverride ?? readPolicy(store);
  const hostLanInterfaces = getHostLanInterfaces();
  const forceRefreshIp = body.forceRefreshIp === true;
  const { publicIpv4, publicIpv6Prefix64 } = await getHostPublicIpInfo(forceRefreshIp);

  const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const originHeader = req.headers.get('origin') || req.headers.get('referer');
  const forwardedIp = extractForwardedClientIp({
    cfConnectingIp: req.headers.get('cf-connecting-ip'),
    xRealIp: req.headers.get('x-real-ip'),
    xForwardedFor: req.headers.get('x-forwarded-for'),
  });

  const rawHints =
    body.clientHints && typeof body.clientHints === 'object'
      ? (body.clientHints as Record<string, unknown>)
      : {};

  const verification = evaluateSameWifiGate({
    hostHeader,
    originHeader,
    forwardedIp,
    clientHints: {
      connectionType: rawHints.connectionType
        ? String(rawHints.connectionType)
        : undefined,
      effectiveType: rawHints.effectiveType
        ? String(rawHints.effectiveType)
        : undefined,
      publicIpv4: rawHints.publicIpv4 ? String(rawHints.publicIpv4) : null,
      publicIpv6Prefix64: rawHints.publicIpv6Prefix64
        ? String(rawHints.publicIpv6Prefix64)
        : null,
    },
    hostLanInterfaces,
    hostPublicIpv4: publicIpv4,
    hostPublicIpv6Prefix64: publicIpv6Prefix64,
    policy,
  });

  const hostWifiDetails = getHostWifiDetails({
    hostLanInterfaces,
    publicIpv4,
    publicIpv6Prefix64,
    forceRefresh: forceRefreshIp,
  });

  return {
    verification,
    hostLanInterfaces,
    hostPublicIpv4: publicIpv4,
    hostWifiDetails,
    rpId: extractHostnameFromHeaders(hostHeader, originHeader) || 'localhost',
  };
}

export async function GET(req: Request) {
  const store = getSyncStore();
  const policy = readPolicy(store);
  const creds = readCreds(store);
  const faceProfiles = readFaceProfiles(store);
  const isLoopbackCli = isCookieLessLoopbackCliRequest(req);
  const hrmSession = verifyHrmSessionFromBiometricRequest(req);
  const canExposeHostNetwork =
    isLoopbackCli || isAdminOrHrRole(hrmSession?.role);

  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get('employee_id')?.trim();
    const [{ verification, hostLanInterfaces, hostPublicIpv4, hostWifiDetails }, periocularHealth] =
      await Promise.all([
        evaluateRequestWifi(req, {}, policy),
        probePeriocularHealth(),
      ]);

    const filteredCreds = filterVisibleCredentialsForRequest(
      creds,
      hrmSession,
      isLoopbackCli,
      employeeId
    );
    const visibleFaceProfiles = filterVisibleFaceProfilesForSession(
      faceProfiles,
      hrmSession,
      employeeId
    );

    if (!canExposeHostNetwork) {
      return NextResponse.json({
        success: true,
        wifi: sanitizeWifiForNonAdmin(verification),
        hostLanInterfaces: [],
        hostPublicIpv4: null,
        hostWifiDetails: null,
        policy: sanitizePolicyForNonAdmin(policy),
        credentials: filteredCreds,
        faceProfiles: visibleFaceProfiles,
        periocularEngine: { online: periocularHealth.online },
      });
    }

    return NextResponse.json({
      success: true,
      wifi: verification,
      hostLanInterfaces,
      hostPublicIpv4,
      hostWifiDetails,
      policy,
      credentials: filteredCreds,
      faceProfiles: visibleFaceProfiles,
      periocularEngine: { online: periocularHealth.online },
    });
  } catch {
    return NextResponse.json({
      success: true,
      policy: canExposeHostNetwork ? policy : sanitizePolicyForNonAdmin(policy),
      credentials: filterVisibleCredentialsForRequest(
        creds,
        hrmSession,
        isLoopbackCli
      ),
      faceProfiles: filterVisibleFaceProfilesForSession(faceProfiles, hrmSession),
      periocularEngine: { online: false },
    });
  }
}

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_BODY',
            error: 'Dữ liệu yêu cầu phải là đối tượng JSON hợp lệ.',
          },
          { status: 400 }
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      const contentType = (req.headers.get('content-type') || '').trim().toLowerCase();
      if (
        !isCookieLessLoopbackCliRequest(req) &&
        !contentType.includes('application/json')
      ) {
        return NextResponse.json(
          {
            success: false,
            code: 'UNSUPPORTED_MEDIA_TYPE',
            error: 'Yêu cầu Content-Type: application/json cho thao tác sinh trắc học.',
          },
          { status: 415 }
        );
      }
      return NextResponse.json(
        { success: false, code: 'INVALID_JSON', error: 'Nội dung JSON không hợp lệ.' },
        { status: 400 }
      );
    }

    const action = String(body.action || 'network_status').trim();
    const store = getSyncStore();

    if (WRITE_ACTIONS_REQUIRING_CSRF_CHECK.has(action)) {
      const headerViolation = validateFaceWriteRequestHeaders(req);
      if (headerViolation) {
        return headerViolation;
      }
    }

    if (action === 'save_wifi_policy') {
      const roleCheck = resolveAuthenticatedRole(req, body.actorRole);
      const actorRole = roleCheck.role;
      const actorName = String(
        roleCheck.session?.fullName || body.actorName || 'Quản trị hệ thống'
      ).trim();
      if (
        !roleCheck.ok ||
        (actorRole !== 'SUPER_ADMIN' &&
          actorRole !== 'HR_MANAGER' &&
          actorRole !== 'DIRECTOR')
      ) {
        return NextResponse.json(
          { success: false, error: 'Bạn không có quyền thay đổi chính sách WiFi chấm công.' },
          { status: 403 }
        );
      }
      const rawPolicy =
        body.policy && typeof body.policy === 'object' && !Array.isArray(body.policy)
          ? (body.policy as Record<string, unknown>)
          : {};
      const current = readPolicy(store);
      const nextPolicy = sanitizeWifiPolicyPatch(current, rawPolicy, actorName);
      store[STORE_POLICY_KEY] = [nextPolicy];
      persistSyncStore();
      return NextResponse.json({ success: true, policy: nextPolicy });
    }

    if (action === 'delete_credential') {
      const idOrCredId = String(body.id || body.credentialId || '').trim();
      if (!idOrCredId) {
        return NextResponse.json(
          { success: false, error: 'Thiếu mã thiết bị cần gỡ bỏ.' },
          { status: 400 }
        );
      }
      const creds = readCreds(store);
      const targetCred = creds.find(
        (c) => c.id === idOrCredId || c.credential_id === idOrCredId
      );

      const rawActorObj =
        body.actor && typeof body.actor === 'object' && !Array.isArray(body.actor)
          ? (body.actor as Record<string, unknown>)
          : null;
      const roleCheck = resolveAuthenticatedRole(
        req,
        body.actorRole ?? rawActorObj?.role
      );
      if (!roleCheck.ok) {
        return NextResponse.json(
          { success: false, error: 'Vai trò xác thực không hợp lệ hoặc không nhất quán.' },
          { status: 403 }
        );
      }
      const effectiveRole = roleCheck.role;
      const isAdminOrHr = isAdminOrHrRole(effectiveRole);

      if (!isAdminOrHr) {
        if (effectiveRole === 'CANDIDATE' || !targetCred) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Bạn chỉ được phép gỡ thiết bị sinh trắc học của chính mình hoặc cần quyền Quản trị / HR Manager.',
            },
            { status: 403 }
          );
        }

        const verifiedSessionActor = getVerifiedBiometricActor(req);
        const actorEmpId = (verifiedSessionActor?.employeeId || '').trim();
        const actorEmpCode = (verifiedSessionActor?.employeeCode || '').trim();
        const targetEmpId = (targetCred.employee_id || '').trim();
        const targetEmpCode = (targetCred.employee_code || '').trim();

        const hasValidBioActorMatch =
          Boolean(verifiedSessionActor) &&
          Boolean(actorEmpId) &&
          Boolean(targetEmpId) &&
          targetEmpId.toLowerCase() === actorEmpId.toLowerCase() &&
          Boolean(actorEmpCode) &&
          Boolean(targetEmpCode) &&
          targetEmpCode.toUpperCase() === actorEmpCode.toUpperCase();

        const hrmSession = roleCheck.session;
        const hasValidSessionOwnerMatch =
          !hrmSession ||
          (Boolean(hrmSession.employeeCode) &&
            Boolean(targetEmpCode) &&
            targetEmpCode.toUpperCase() === hrmSession.employeeCode.toUpperCase());

        const isOwner =
          (!effectiveRole || INTERNAL_STAFF_ROLES.has(effectiveRole)) &&
          hasValidBioActorMatch &&
          hasValidSessionOwnerMatch;

        if (!isOwner) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Bạn chỉ được phép gỡ thiết bị sinh trắc học của chính mình hoặc cần quyền Quản trị / HR Manager.',
            },
            { status: 403 }
          );
        }
      }

      const next = creds.filter(
        (c) => c.id !== idOrCredId && c.credential_id !== idOrCredId
      );
      store[STORE_CREDS_KEY] = next;
      persistSyncStore();
      const visibleCreds = filterVisibleCredentialsForRequest(
        next,
        roleCheck.session,
        isCookieLessLoopbackCliRequest(req)
      );
      return NextResponse.json({ success: true, credentials: visibleCreds });
    }

    if (action === 'face_delete_profile') {
      const session = verifyHrmSessionFromBiometricRequest(req);
      if (!session) {
        return NextResponse.json(
          {
            success: false,
            code: 'UNAUTHENTICATED',
            error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          },
          { status: 401 }
        );
      }
      if (session.role !== 'SUPER_ADMIN') {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Chỉ Quản trị viên hệ thống (Admin) mới có quyền xóa dữ liệu khuôn mặt.',
          },
          { status: 403 }
        );
      }

      const profileId = String(body.profileId || body.id || '').trim();
      const employeeId = String(body.employeeId || '').trim();
      const rawEmployeeCode = String(body.employeeCode || '').trim();
      if (!profileId && !employeeId && !rawEmployeeCode) {
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_PARAMS',
            error: 'Thiếu mã hồ sơ khuôn mặt (profileId, employeeId hoặc employeeCode) cần gỡ bỏ.',
          },
          { status: 400 }
        );
      }

      const profiles = readFaceProfiles(store);
      const effectiveEmployeeCode = (rawEmployeeCode || session.employeeCode).trim();

      let targetProfile: StoredFaceBiometricProfile | undefined;
      if (profileId) {
        targetProfile = profiles.find((p) => p.id === profileId);
      } else if (rawEmployeeCode) {
        targetProfile = profiles.find(
          (p) => p.employee_code.toUpperCase() === rawEmployeeCode.toUpperCase()
        );
      } else {
        targetProfile = profiles.find((p) => p.employee_id === employeeId);
      }

      const targetCodeUpper = targetProfile
        ? targetProfile.employee_code.toUpperCase()
        : '';
      const nextProfiles = targetProfile
        ? profiles.filter(
            (p) =>
              p.id !== targetProfile.id &&
              p.employee_code.toUpperCase() !== targetCodeUpper
          )
        : profiles;
      writeFaceProfiles(store, nextProfiles);
      if (targetProfile) {
        appendBiometricAudit(store, {
          actorName: session.fullName || 'Nhân sự',
          actorCode: session.employeeCode || targetProfile.employee_code || 'EMP',
          actorRole: session.role,
          action: 'BIOMETRIC_REGISTER',
          target: `${targetProfile.employee_code} · ${targetProfile.device_label}`,
          detail: `Gỡ bỏ hồ sơ khuôn mặt (${targetProfile.id}) bởi ${session.employeeCode} (${session.role}).`,
          ipAddress:
            extractForwardedClientIp({
              cfConnectingIp: req.headers.get('cf-connecting-ip'),
              xRealIp: req.headers.get('x-real-ip'),
              xForwardedFor: req.headers.get('x-forwarded-for'),
            }) || '127.0.0.1',
          status: 'SUCCESS',
        });
      }
      resetFaceEmployeeRateLimits(targetProfile?.employee_code || effectiveEmployeeCode);
      if (
        targetProfile?.employee_code &&
        effectiveEmployeeCode &&
        targetProfile.employee_code.toUpperCase() !== effectiveEmployeeCode.toUpperCase()
      ) {
        resetFaceEmployeeRateLimits(effectiveEmployeeCode);
      }
      persistSyncStore();
      return NextResponse.json({
        success: true,
        faceProfiles: filterVisibleFaceProfilesForSession(nextProfiles, session),
      });
    }

    if (action === 'face_mask_check') {
      const session = verifyHrmSessionFromBiometricRequest(req);
      if (!session) {
        return NextResponse.json(
          {
            success: false,
            code: 'UNAUTHENTICATED',
            error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          },
          { status: 401 }
        );
      }
      if (session.role === 'CANDIDATE') {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Vai trò hiện tại không được phép kiểm tra sinh trắc học chấm công.',
          },
          { status: 403 }
        );
      }

      const clientIp =
        extractForwardedClientIp({
          cfConnectingIp: req.headers.get('cf-connecting-ip'),
          xRealIp: req.headers.get('x-real-ip'),
          xForwardedFor: req.headers.get('x-forwarded-for'),
        }) || 'local';
      const empCode = (session.employeeCode || 'EMP').toUpperCase();
      const rlCheck = consumeFaceRateLimit('mask_check', `${empCode}:${clientIp}`, empCode);
      if (!rlCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: 'RATE_LIMITED',
            error: 'Quá nhiều yêu cầu kiểm tra khẩu trang. Vui lòng thử lại sau.',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rlCheck.retryAfterSec) },
          }
        );
      }

      const rawGuide =
        body.guideBox && typeof body.guideBox === 'object' && !Array.isArray(body.guideBox)
          ? (body.guideBox as Record<string, unknown>)
          : undefined;
      const guideBox =
        rawGuide &&
        typeof rawGuide.x === 'number' &&
        typeof rawGuide.y === 'number' &&
        typeof rawGuide.w === 'number' &&
        typeof rawGuide.h === 'number'
          ? { x: rawGuide.x, y: rawGuide.y, w: rawGuide.w, h: rawGuide.h }
          : undefined;

      const maskRes = await checkMaskFromPeriocularService({
        frameB64: body.frameB64 ?? body.periocularFrameB64,
        guideBox,
      });
      if (!maskRes.ok) {
        return NextResponse.json(
          { success: false, code: maskRes.code, error: maskRes.error },
          { status: maskRes.status }
        );
      }

      return NextResponse.json({
        success: true,
        faceCover: maskRes.faceCover,
        maskScore: Number(maskRes.maskScore.toFixed(4)),
        eyeLandmarks: maskRes.eyeLandmarks,
      });
    }

    // Read optional policy snapshot synced from admin client ONLY if server cache is empty
    // Không áp dụng policySnapshot trong action chỉ đọc network_status; chỉ chấp nhận khi đạt CSRF header + SUPER_ADMIN/HR_MANAGER
    if (action !== 'network_status') {
      const snapshotRoleCheck = resolveAuthenticatedRole(req, body.actorRole);
      const snapshotRole = snapshotRoleCheck.role;
      const canSeedSnapshot =
        snapshotRoleCheck.ok &&
        isAdminOrHrRole(snapshotRole) &&
        validateFaceWriteRequestHeaders(req) === null;
      const incomingPolicyRaw =
        canSeedSnapshot &&
        body.policySnapshot &&
        typeof body.policySnapshot === 'object' &&
        !Array.isArray(body.policySnapshot)
          ? (body.policySnapshot as Record<string, unknown>)
          : undefined;
      if (
        incomingPolicyRaw &&
        (!store[STORE_POLICY_KEY] ||
          (Array.isArray(store[STORE_POLICY_KEY]) &&
            (store[STORE_POLICY_KEY] as unknown[]).length === 0))
      ) {
        const seeded = sanitizeWifiPolicyPatch(
          readPolicy(store),
          incomingPolicyRaw,
          String(snapshotRoleCheck.session?.fullName || body.actorName || snapshotRole)
        );
        store[STORE_POLICY_KEY] = [seeded];
        persistSyncStore();
      }
    }

    const isLoopbackCli = isCookieLessLoopbackCliRequest(req);
    const isFaceWifiAction =
      action === 'face_issue_challenge' ||
      action === 'face_register' ||
      action === 'face_verify_punch';
    const wifiEvalBody = isFaceWifiAction
      ? {
          ...body,
          clientHints: sanitizeFaceClientHints(body.clientHints),
        }
      : body;
    const shouldStripFaceProxyHeaders =
      isFaceWifiAction &&
      !isLoopbackCli &&
      process.env.HRM_TRUSTED_PROXY !== 'true' &&
      !isDevTunnelHost(req);
    const wifiEvalReq: Pick<Request, 'headers'> = shouldStripFaceProxyHeaders
      ? stripUntrustedProxyHeaders(req)
      : req;

    const { verification, hostLanInterfaces, hostPublicIpv4, hostWifiDetails, rpId: serverRpId } =
      await evaluateRequestWifi(wifiEvalReq, wifiEvalBody);

    const normalizedServerRpId = serverRpId.toLowerCase();
    const clientRpId = body.rpId ? String(body.rpId).trim().toLowerCase() : '';
    if (clientRpId && clientRpId !== normalizedServerRpId) {
      return NextResponse.json(
        { success: false, error: 'Tên miền xác thực sinh trắc học (rpId) không khớp với máy chủ.' },
        { status: 403 }
      );
    }
    const requestedRpId = normalizedServerRpId;

    if (action === 'network_status') {
      const employeeId = body.employeeId ? String(body.employeeId).trim() : undefined;
      const hrmSession = verifyHrmSessionFromBiometricRequest(req);
      const canExposeHostNetwork =
        isLoopbackCli || isAdminOrHrRole(hrmSession?.role);

      const creds = readCreds(store);
      const filteredCreds = filterVisibleCredentialsForRequest(
        creds,
        hrmSession,
        isLoopbackCli,
        employeeId
      );
      const faceProfiles = readFaceProfiles(store);
      const visibleFaceProfiles = filterVisibleFaceProfilesForSession(
        faceProfiles,
        hrmSession,
        employeeId
      );

      if (!canExposeHostNetwork) {
        return NextResponse.json({
          success: true,
          wifi: sanitizeWifiForNonAdmin(verification),
          hostLanInterfaces: [],
          hostPublicIpv4: null,
          hostWifiDetails: null,
          rpId: requestedRpId,
          credentials: filteredCreds,
          faceProfiles: visibleFaceProfiles,
        });
      }

      return NextResponse.json({
        success: true,
        wifi: verification,
        hostLanInterfaces,
        hostPublicIpv4,
        hostWifiDetails,
        rpId: requestedRpId,
        credentials: filteredCreds,
        faceProfiles: visibleFaceProfiles,
      });
    }

    if (!verification.allowed) {
      const blockedSession = verifyHrmSessionFromBiometricRequest(req);
      const canExposeBlockedHostNetwork =
        isLoopbackCli || isAdminOrHrRole(blockedSession?.role);
      const blockedCode =
        blockedSession?.employeeCode || String(body.employeeCode || 'EMP');
      appendBiometricAudit(store, {
        actorName:
          blockedSession?.fullName || String(body.employeeName || 'Nhân viên'),
        actorCode: blockedCode,
        actorRole: blockedSession?.role || String(body.actorRole || 'EMPLOYEE'),
        action: 'WIFI_CHECK_BLOCKED',
        target: `${blockedCode || 'NV'} · ${verification.verifiedIp}`,
        detail: verification.reason,
        ipAddress: verification.verifiedIp,
        status: 'BLOCKED',
      });
      persistSyncStore();
      const safeBlockedWifi = canExposeBlockedHostNetwork
        ? verification
        : sanitizeWifiForNonAdmin(verification);
      return NextResponse.json(
        {
          success: false,
          code: verification.code || 'WIFI_MISMATCH',
          error: safeBlockedWifi.reason,
          wifi: safeBlockedWifi,
        },
        { status: 403 }
      );
    }

    if (action === 'issue_challenge') {
      const employeeId = String(body.employeeId || '').trim();
      const employeeCode = String(body.employeeCode || '').trim();
      const purpose = body.purpose === 'register' ? 'register' : 'punch';
      if (!employeeId || !employeeCode) {
        return NextResponse.json(
          { success: false, error: 'Thiếu employeeId hoặc employeeCode để cấp challenge.' },
          { status: 400 }
        );
      }

      const issued = issueWebAuthnChallenge({
        employeeId,
        employeeCode,
        purpose,
        rpId: requestedRpId,
      });

      return NextResponse.json({
        success: true,
        challengeId: issued.challengeId,
        challenge: issued.challenge,
        rpId: issued.rpId,
        wifi: verification,
      });
    }

    if (action === 'verify_register') {
      const challengeId = String(body.challengeId || '').trim();
      const credentialId = String(body.credentialId || '').trim();
      const clientDataJSON = String(body.clientDataJSON || '').trim();
      const publicKeySpki = String(body.publicKeySpki || '').trim();
      const publicKeyAlg = Number(body.publicKeyAlg ?? -7);
      const authenticatorData = body.authenticatorData
        ? String(body.authenticatorData)
        : null;
      const employeeId = String(body.employeeId || '').trim();
      const employeeCode = String(body.employeeCode || '').trim();
      const fullName = String(body.fullName || 'Nhân viên').trim();
      const deviceLabel = String(
        body.deviceLabel || 'Cảm biến vân tay thiết bị'
      ).trim();
      const rawKind = String(body.deviceKind || 'LAPTOP').toUpperCase();
      const deviceKind: BiometricDeviceKind =
        rawKind === 'MOBILE' || rawKind === 'LAPTOP' ? rawKind : 'OTHER';

      if (
        !challengeId ||
        !credentialId ||
        !clientDataJSON ||
        !publicKeySpki ||
        !employeeId ||
        !employeeCode
      ) {
        return NextResponse.json(
          { success: false, error: 'Thiếu thông tin khóa sinh trắc học từ thiết bị.' },
          { status: 400 }
        );
      }

      const regCheck = verifyWebAuthnRegistration({
        challengeId,
        rpId: requestedRpId,
        clientDataJSON,
        publicKeySpki,
        publicKeyAlg,
        authenticatorData,
      });

      if (!regCheck.ok) {
        return NextResponse.json(
          { success: false, error: regCheck.error },
          { status: 400 }
        );
      }

      const creds = readCreds(store);
      const existingSameCred = creds.find((c) => c.credential_id === credentialId);
      if (
        existingSameCred &&
        existingSameCred.employee_id !== employeeId &&
        existingSameCred.employee_code !== employeeCode
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Khóa thiết bị sinh trắc học này đã gắn với nhân sự khác, không thể ghi đè.',
          },
          { status: 409 }
        );
      }
      const newRecord: BiometricCredentialRecord = {
        id: `bio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        employee_id: employeeId,
        employee_code: employeeCode,
        full_name: fullName,
        credential_id: credentialId,
        public_key_spki: publicKeySpki,
        public_key_alg: publicKeyAlg,
        rp_id: requestedRpId,
        device_label: deviceLabel,
        device_kind: deviceKind,
        sign_count: regCheck.initialSignCount,
        registered_ip: verification.verifiedIp,
        last_used_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const regRoleCheck = resolveAuthenticatedRole(req, body.actorRole);
      const rawCookieForReg = req.headers.get('cookie');
      const hasRegCookie =
        rawCookieForReg !== null && rawCookieForReg.trim().length > 0;
      const rawBodyRoleStr = body.actorRole ? String(body.actorRole).trim() : '';
      if (
        regRoleCheck.role === 'CANDIDATE' ||
        rawBodyRoleStr === 'CANDIDATE' ||
        (hasRegCookie && !regRoleCheck.ok)
      ) {
        return NextResponse.json(
          { success: false, error: 'Vai trò hiện tại không được phép đăng ký thiết bị chấm công.' },
          { status: 403 }
        );
      }

      if (regRoleCheck.session && !isAdminOrHrRole(regRoleCheck.session.role)) {
        const sessionEmpCode = regRoleCheck.session.employeeCode.trim();
        if (
          !sessionEmpCode ||
          employeeCode.toUpperCase() !== sessionEmpCode.toUpperCase()
        ) {
          return NextResponse.json(
            {
              success: false,
              error: 'Bạn chỉ được phép đăng ký thiết bị sinh trắc học cho chính tài khoản của mình.',
            },
            { status: 403 }
          );
        }
        newRecord.employee_code = sessionEmpCode;
      }

      const nextCreds = [
        newRecord,
        ...creds.filter((c) => c.credential_id !== credentialId),
      ];
      store[STORE_CREDS_KEY] = nextCreds;
      const regSessionCookie =
        regRoleCheck.ok && regRoleCheck.role !== 'CANDIDATE'
          ? issueVerifiedBiometricSessionCookie(
              req,
              newRecord.employee_id,
              newRecord.employee_code
            )
          : null;
      appendBiometricAudit(store, {
        actorName: regRoleCheck.session?.fullName || fullName,
        actorCode: regRoleCheck.session?.employeeCode || newRecord.employee_code,
        actorRole: regRoleCheck.role || 'EMPLOYEE',
        action: 'BIOMETRIC_REGISTER',
        target: `${newRecord.employee_code} · ${deviceLabel}`,
        detail: `Đăng ký vân tay/sinh trắc học [${deviceKind}] qua domain ${requestedRpId} từ WiFi IP ${verification.verifiedIp}.`,
        ipAddress: verification.verifiedIp,
      });
      persistSyncStore();

      return NextResponse.json(
        {
          success: true,
          credential: newRecord,
          wifi: verification,
        },
        {
          status: 201,
          ...(regSessionCookie
            ? { headers: { 'Set-Cookie': regSessionCookie } }
            : {}),
        }
      );
    }

    if (action === 'verify_punch') {
      const challengeId = String(body.challengeId || '').trim();
      const credentialId = String(body.credentialId || '').trim();
      const clientDataJSON = String(body.clientDataJSON || '').trim();
      const authenticatorData = String(body.authenticatorData || '').trim();
      const signature = String(body.signature || '').trim();
      const employeeId = String(body.employeeId || '').trim();
      const employeeCode = String(body.employeeCode || '').trim();

      if (!employeeId) {
        return NextResponse.json(
          { success: false, error: 'Thiếu mã định danh nhân sự (employeeId) khi xác thực chấm công.' },
          { status: 400 }
        );
      }

      const creds = readCreds(store);
      const matchedCredential = creds.find(
        (c) =>
          c.credential_id === credentialId &&
          (c.employee_id === employeeId ||
            (Boolean(employeeCode) && c.employee_code === employeeCode))
      );

      if (!matchedCredential) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Không tìm thấy khóa vân tay của thiết bị này trên hệ thống. Vui lòng bấm "Đăng ký vân tay máy này" trước khi chấm công.',
          },
          { status: 404 }
        );
      }

      const punchHrmSession = verifyHrmSessionFromBiometricRequest(req);
      if (
        punchHrmSession &&
        !isAdminOrHrRole(punchHrmSession.role) &&
        (!punchHrmSession.employeeCode ||
          matchedCredential.employee_code.toUpperCase() !==
            punchHrmSession.employeeCode.toUpperCase())
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Bạn chỉ được phép xác thực chấm công bằng thiết bị thuộc tài khoản của mình.',
          },
          { status: 403 }
        );
      }

      const verifyRes = verifyWebAuthnAssertion({
        challengeId,
        rpId: requestedRpId,
        credential: matchedCredential,
        clientDataJSON,
        authenticatorData,
        signature,
      });

      if (!verifyRes.ok) {
        return NextResponse.json(
          { success: false, error: verifyRes.error },
          { status: 403 }
        );
      }

      const updatedCred: BiometricCredentialRecord = {
        ...matchedCredential,
        sign_count: verifyRes.nextSignCount,
        last_used_at: new Date().toISOString(),
      };
      store[STORE_CREDS_KEY] = creds.map((c) =>
        c.credential_id === updatedCred.credential_id ? updatedCred : c
      );
      const punchSessionCookie = issueVerifiedBiometricSessionCookie(
        req,
        matchedCredential.employee_id,
        matchedCredential.employee_code
      );
      persistSyncStore();

      return NextResponse.json(
        {
          success: true,
          credential: updatedCred,
          wifi: verification,
        },
        {
          headers: { 'Set-Cookie': punchSessionCookie },
        }
      );
    }

    if (action === 'face_issue_challenge') {
      if (verification.mode === 'HOST_LOCAL' && !isRealHostLocal(req)) {
        return NextResponse.json(
          {
            success: false,
            code: 'WIFI_MISMATCH',
            error: 'Host thực tế không phải localhost khi kết nối chế độ HOST_LOCAL.',
            wifi: sanitizeWifiForNonAdmin(verification),
          },
          { status: 403 }
        );
      }

      const session = verifyHrmSessionFromBiometricRequest(req);
      if (!session) {
        return NextResponse.json(
          {
            success: false,
            code: 'UNAUTHENTICATED',
            error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          },
          { status: 401 }
        );
      }
      if (session.role === 'CANDIDATE') {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Vai trò hiện tại không được phép xác thực khuôn mặt.',
          },
          { status: 403 }
        );
      }

      const isAdminOrHr = isAdminOrHrRole(session.role);
      const employeeId = String(body.employeeId || '').trim();
      const rawEmployeeCode = String(body.employeeCode || '').trim();
      const rawPurpose = String(body.purpose || '').trim();
      const purpose =
        rawPurpose === 'register' || rawPurpose === 'punch' ? rawPurpose : null;

      if (!isAdminOrHr) {
        if (
          !session.employeeCode ||
          (rawEmployeeCode &&
            rawEmployeeCode.toUpperCase() !== session.employeeCode.toUpperCase())
        ) {
          return NextResponse.json(
            {
              success: false,
              code: 'FORBIDDEN',
              error:
                'Bạn chỉ được phép tạo phiên xác thực khuôn mặt cho chính tài khoản của mình.',
            },
            { status: 403 }
          );
        }
      }

      const effectiveEmployeeCode = isAdminOrHr
        ? (rawEmployeeCode || session.employeeCode).trim()
        : session.employeeCode.trim();

      if (
        !employeeId ||
        !effectiveEmployeeCode ||
        !purpose ||
        employeeId.length > 100 ||
        effectiveEmployeeCode.length > 64
      ) {
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_PARAMS',
            error:
              'Thiếu hoặc sai định dạng employeeId, employeeCode hoặc purpose (register | punch).',
          },
          { status: 400 }
        );
      }

      if (hasFaceEmployeeIdOwnershipConflict(store, employeeId, effectiveEmployeeCode)) {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Mã định danh nhân sự không khớp tài khoản đăng nhập hiện tại.',
          },
          { status: 403 }
        );
      }

      const effectiveCodeUpper = effectiveEmployeeCode.toUpperCase();
      const rlKey = `${effectiveCodeUpper}:${verification.verifiedIp || 'unknown'}`;
      const rlCheck = consumeFaceRateLimit('issue', rlKey, effectiveEmployeeCode);
      if (!rlCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: 'RATE_LIMITED',
            error: 'Quá nhiều yêu cầu tạo phiên xác thực khuôn mặt. Vui lòng thử lại sau.',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rlCheck.retryAfterSec) },
          }
        );
      }

      const issued = issueFaceChallenge({
        employeeId,
        employeeCode: effectiveEmployeeCode,
        rpId: requestedRpId,
        purpose,
      });

      return NextResponse.json({
        success: true,
        challengeId: issued.challengeId,
        challenge: issued.challenge,
        rpId: issued.rpId,
        wifi: isAdminOrHr ? verification : sanitizeWifiForNonAdmin(verification),
      });
    }

    if (action === 'face_register') {
      if (verification.mode === 'HOST_LOCAL' && !isRealHostLocal(req)) {
        return NextResponse.json(
          {
            success: false,
            code: 'WIFI_MISMATCH',
            error: 'Host thực tế không phải localhost khi kết nối chế độ HOST_LOCAL.',
            wifi: sanitizeWifiForNonAdmin(verification),
          },
          { status: 403 }
        );
      }

      const session = verifyHrmSessionFromBiometricRequest(req);
      if (!session) {
        return NextResponse.json(
          {
            success: false,
            code: 'UNAUTHENTICATED',
            error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          },
          { status: 401 }
        );
      }
      if (session.role === 'CANDIDATE') {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Vai trò hiện tại không được phép đăng ký mẫu khuôn mặt.',
          },
          { status: 403 }
        );
      }

      const isAdminOrHr = isAdminOrHrRole(session.role);
      const challengeId = String(body.challengeId || '').trim();
      const challenge = String(body.challenge || '').trim();
      const employeeId = String(body.employeeId || '').trim();
      const rawEmployeeCode = String(body.employeeCode || '').trim();
      const actorName = (
        session.fullName ||
        String(body.fullName || body.employeeName || 'Nhân viên')
      )
        .trim()
        .slice(0, 120);
      const deviceLabel = String(
        body.deviceLabel || 'Camera Khuôn mặt'
      )
        .trim()
        .slice(0, 120);

      if (!isAdminOrHr) {
        if (
          !session.employeeCode ||
          (rawEmployeeCode &&
            rawEmployeeCode.toUpperCase() !== session.employeeCode.toUpperCase())
        ) {
          return NextResponse.json(
            {
              success: false,
              code: 'FORBIDDEN',
              error:
                'Bạn chỉ được phép đăng ký mẫu khuôn mặt cho chính tài khoản của mình.',
            },
            { status: 403 }
          );
        }
      }

      const effectiveEmployeeCode = isAdminOrHr
        ? (rawEmployeeCode || session.employeeCode).trim()
        : session.employeeCode.trim();

      if (!challengeId || !challenge || !employeeId || !effectiveEmployeeCode) {
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_PARAMS',
            error:
              'Thiếu challengeId, challenge, employeeId hoặc employeeCode khi đăng ký khuôn mặt.',
          },
          { status: 400 }
        );
      }

      if (hasFaceEmployeeIdOwnershipConflict(store, employeeId, effectiveEmployeeCode)) {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Mã định danh nhân sự không khớp tài khoản đăng nhập hiện tại.',
          },
          { status: 403 }
        );
      }

      const existingProfiles = readFaceProfiles(store);
      const effectiveCodeUpper = effectiveEmployeeCode.toUpperCase();
      const rlKey = `${effectiveCodeUpper}:${verification.verifiedIp || 'unknown'}`;
      const rlCheck = consumeFaceRateLimit('register', rlKey, effectiveEmployeeCode);
      if (!rlCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: 'RATE_LIMITED',
            error: 'Quá nhiều lần đăng ký mẫu khuôn mặt. Vui lòng thử lại sau ít phút.',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rlCheck.retryAfterSec) },
          }
        );
      }

      const chCheck = consumeFaceChallenge({
        challengeId,
        challenge,
        employeeId,
        employeeCode: effectiveEmployeeCode,
        rpId: requestedRpId,
        purpose: 'register',
      });
      if (!chCheck.ok) {
        return NextResponse.json(
          { success: false, code: 'INVALID_CHALLENGE', error: chCheck.error },
          { status: 403 }
        );
      }

      const existingForEmp = existingProfiles.find(
        (p) =>
          p.employee_code.toUpperCase() === effectiveCodeUpper ||
          p.employee_id === employeeId
      );
      if (existingForEmp && session.role !== 'SUPER_ADMIN') {
        appendBiometricAudit(store, {
          actorName,
          actorCode: session.employeeCode || effectiveEmployeeCode,
          actorRole: session.role,
          action: 'BIOMETRIC_REGISTER',
          target: `${effectiveEmployeeCode} · ${deviceLabel}`,
          detail: `[DENIED] Từ chối ghi đè dữ liệu khuôn mặt đã khóa bảo mật bởi ${session.employeeCode || effectiveEmployeeCode} (${session.role}).`,
          ipAddress: verification.verifiedIp,
          status: 'BLOCKED',
        });
        persistSyncStore();
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error:
              'Dữ liệu khuôn mặt đã được khóa bảo mật. Chỉ Admin mới có quyền xóa hoặc cấp lại.',
          },
          { status: 403 }
        );
      }

      const scanModality = body.scanModality === 'periocular' ? 'periocular' : 'full_face';
      const replaceExisting = body.replaceExisting === true;
      const upgradePeriocular = body.upgradePeriocular === true;
      const periocularFrameB64 =
        typeof body.periocularFrameB64 === 'string' && body.periocularFrameB64.trim()
          ? body.periocularFrameB64.trim()
          : undefined;
      const periocularAuxFrameB64 =
        typeof body.periocularAuxFrameB64 === 'string' && body.periocularAuxFrameB64.trim()
          ? body.periocularAuxFrameB64.trim()
          : undefined;

      const liveness = parseFiniteNumber(body.liveness);
      const antispoof = parseFiniteNumber(body.antispoof);
      const blinkCount = parseFiniteNumber(body.blinkCount);

      const failLivenessResponse = (
        effLiveness: number,
        effAntispoof: number,
        effBlinks: number,
        detailPrefix = ''
      ) => {
        appendBiometricAudit(store, {
          actorName,
          actorCode: session.employeeCode || effectiveEmployeeCode,
          actorRole: session.role,
          action: 'BIOMETRIC_REGISTER',
          target: `${effectiveEmployeeCode} · ${deviceLabel}`,
          detail: `[DENIED] ${detailPrefix}Từ chối đăng ký khuôn mặt do chưa đạt Liveness/Anti-spoof/Blink (liveness=${Number.isFinite(effLiveness) ? effLiveness.toFixed(2) : 'NaN'}, antispoof=${Number.isFinite(effAntispoof) ? effAntispoof.toFixed(2) : 'NaN'}, blinks=${Number.isFinite(effBlinks) ? Math.floor(effBlinks) : 'NaN'}).`,
          ipAddress: verification.verifiedIp,
          status: 'BLOCKED',
        });
        persistSyncStore();
        return NextResponse.json(
          {
            success: false,
            code: 'LIVENESS_FAILED',
            error:
              'Không đạt kiểm tra người thật (Liveness >= 0.5, Anti-spoof >= 0.5, Chớp mắt >= 1). Vui lòng thực hiện lại trước camera.',
          },
          { status: 403 }
        );
      };

      if (upgradePeriocular) {
        const existingProfile = existingProfiles.find(
          (p) => p.employee_code.toUpperCase() === effectiveCodeUpper
        );
        if (!existingProfile && !replaceExisting) {
          return NextResponse.json(
            {
              success: false,
              code: 'FACE_PROFILE_NOT_FOUND',
              error: 'Chưa có hồ sơ khuôn mặt gốc để bổ sung mẫu Khuôn mặt.',
            },
            { status: 404 }
          );
        }
        if (existingProfile) {
          if (existingProfile.employee_id !== employeeId) {
            return NextResponse.json(
              {
                success: false,
                code: 'FORBIDDEN',
                error: 'Mã định danh nhân sự không khớp hồ sơ khuôn mặt đã đăng ký.',
              },
              { status: 403 }
            );
          }
          if (
            !Number.isFinite(liveness) ||
            !Number.isFinite(antispoof) ||
            !Number.isFinite(blinkCount) ||
            liveness < FACE_MIN_LIVENESS ||
            antispoof < FACE_MIN_ANTISPOOF ||
            blinkCount < FACE_MIN_BLINKS
          ) {
            return failLivenessResponse(liveness, antispoof, blinkCount, '[PERIOCULAR_UPGRADE] ');
          }
          if (!periocularFrameB64) {
            return NextResponse.json(
              {
                success: false,
                code: 'INVALID_PERIOCULAR_FRAME',
                error: 'Thiếu khung hình khuôn mặt để nâng cấp hồ sơ.',
              },
              { status: 400 }
            );
          }

          const extractRes = await extractPeriocularFromService({
            frameB64: periocularFrameB64,
            auxFrameB64: periocularAuxFrameB64,
            mode: 'auto',
          });
          if (!extractRes.ok) {
            return NextResponse.json(
              { success: false, code: extractRes.code, error: extractRes.error },
              { status: extractRes.status }
            );
          }
          const effectiveLiveness = periocularAuxFrameB64
            ? Math.min(liveness, extractRes.livenessScore)
            : liveness;
          const effectiveAntispoof = Math.min(antispoof, extractRes.antispoofScore);
          if (
            effectiveLiveness < FACE_MIN_LIVENESS ||
            effectiveAntispoof < FACE_MIN_ANTISPOOF
          ) {
            return failLivenessResponse(
              effectiveLiveness,
              effectiveAntispoof,
              blinkCount,
              '[PERIOCULAR_UPGRADE_SERVER] '
            );
          }

          const encPeri = encryptFaceEmbedding(extractRes.embedding);
          const upgradedProfile: StoredFaceBiometricProfile = {
            ...existingProfile,
            periocular_ciphertext: encPeri.ciphertext,
            periocular_iv: encPeri.iv,
            periocular_auth_tag: encPeri.auth_tag,
            periocular_dim: extractRes.embedding.length,
            periocular_engine: extractRes.detectionMode,
          };
          const nextProfiles = existingProfiles.map((p) =>
            p.employee_code.toUpperCase() === effectiveCodeUpper ? upgradedProfile : p
          );
          writeFaceProfiles(store, nextProfiles);

          const faceRegCookie = issueVerifiedBiometricSessionCookie(
            req,
            employeeId,
            effectiveEmployeeCode
          );
          appendBiometricAudit(store, {
            actorName,
            actorCode: session.employeeCode || effectiveEmployeeCode,
            actorRole: session.role,
            action: 'BIOMETRIC_REGISTER',
            target: `${effectiveEmployeeCode} · ${upgradedProfile.device_label}`,
            detail: `Bổ sung mẫu Khuôn mặt (${extractRes.detectionMode}, dim=${extractRes.embedding.length}, Liveness=${effectiveLiveness.toFixed(2)}, AntiSpoof=${effectiveAntispoof.toFixed(2)}${replaceExisting ? ', +ReplaceExisting' : ''}) qua domain ${requestedRpId} từ WiFi IP ${verification.verifiedIp}.`,
            ipAddress: verification.verifiedIp,
            status: 'SUCCESS',
          });
          persistSyncStore();

          return NextResponse.json(
            {
              success: true,
              profile: toPublicFaceProfileDto(upgradedProfile),
              faceProfiles: filterVisibleFaceProfilesForSession(nextProfiles, session),
              wifi: isAdminOrHr ? verification : sanitizeWifiForNonAdmin(verification),
            },
            {
              status: 200,
              headers: { 'Set-Cookie': faceRegCookie },
            }
          );
        }
      }

      if (scanModality === 'periocular') {
        if (
          !Number.isFinite(liveness) ||
          !Number.isFinite(antispoof) ||
          !Number.isFinite(blinkCount) ||
          liveness < FACE_MIN_LIVENESS ||
          antispoof < FACE_MIN_ANTISPOOF ||
          blinkCount < FACE_MIN_BLINKS
        ) {
          return failLivenessResponse(liveness, antispoof, blinkCount, '[PERIOCULAR] ');
        }
        if (!periocularFrameB64) {
          return NextResponse.json(
            {
              success: false,
              code: 'INVALID_PERIOCULAR_FRAME',
              error: 'Thiếu khung hình khuôn mặt để đăng ký sinh trắc học.',
            },
            { status: 400 }
          );
        }

        const extractRes = await extractPeriocularFromService({
          frameB64: periocularFrameB64,
          auxFrameB64: periocularAuxFrameB64,
          mode: 'auto',
        });
        if (!extractRes.ok) {
          return NextResponse.json(
            { success: false, code: extractRes.code, error: extractRes.error },
            { status: extractRes.status }
          );
        }
        const effectiveLiveness = periocularAuxFrameB64
          ? Math.min(liveness, extractRes.livenessScore)
          : liveness;
        const effectiveAntispoof = Math.min(antispoof, extractRes.antispoofScore);
        if (
          effectiveLiveness < FACE_MIN_LIVENESS ||
          effectiveAntispoof < FACE_MIN_ANTISPOOF
        ) {
          return failLivenessResponse(
            effectiveLiveness,
            effectiveAntispoof,
            blinkCount,
            '[PERIOCULAR_SERVER] '
          );
        }

        const encryptedPrimary = encryptFaceEmbedding(extractRes.embedding);
        const encryptedPeriocular = encryptFaceEmbedding(extractRes.embedding);
        const nowIso = new Date().toISOString();
        const newProfile: StoredFaceBiometricProfile = {
          id: `fprof-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          employee_id: employeeId,
          employee_code: effectiveEmployeeCode,
          device_label: deviceLabel,
          embedding_dim: extractRes.embedding.length,
          registered_by_role: session.role,
          created_at: nowIso,
          last_used_at: null,
          ciphertext: encryptedPrimary.ciphertext,
          iv: encryptedPrimary.iv,
          auth_tag: encryptedPrimary.auth_tag,
          periocular_ciphertext: encryptedPeriocular.ciphertext,
          periocular_iv: encryptedPeriocular.iv,
          periocular_auth_tag: encryptedPeriocular.auth_tag,
          periocular_dim: extractRes.embedding.length,
          periocular_engine: extractRes.detectionMode,
        };

        const nextProfiles = [
          newProfile,
          ...existingProfiles.filter(
            (p) => p.employee_code.toUpperCase() !== effectiveCodeUpper
          ),
        ];
        writeFaceProfiles(store, nextProfiles);

        const faceRegCookie = issueVerifiedBiometricSessionCookie(
          req,
          employeeId,
          effectiveEmployeeCode
        );
        appendBiometricAudit(store, {
          actorName,
          actorCode: session.employeeCode || effectiveEmployeeCode,
          actorRole: session.role,
          action: 'BIOMETRIC_REGISTER',
          target: `${effectiveEmployeeCode} · ${deviceLabel}`,
          detail: `Đăng ký mẫu Khuôn mặt/Khẩu trang (${extractRes.detectionMode}, Liveness=${effectiveLiveness.toFixed(2)}, AntiSpoof=${effectiveAntispoof.toFixed(2)}, Blink=${Math.floor(blinkCount)}, dim=${extractRes.embedding.length}) qua domain ${requestedRpId} từ WiFi IP ${verification.verifiedIp}.`,
          ipAddress: verification.verifiedIp,
          status: 'SUCCESS',
        });
        persistSyncStore();

        return NextResponse.json(
          {
            success: true,
            profile: toPublicFaceProfileDto(newProfile),
            faceProfiles: filterVisibleFaceProfilesForSession(nextProfiles, session),
            wifi: isAdminOrHr ? verification : sanitizeWifiForNonAdmin(verification),
          },
          {
            status: 201,
            headers: { 'Set-Cookie': faceRegCookie },
          }
        );
      }

      const normalizedEmbedding = validateAndNormalizeFaceEmbedding(body.embedding);
      if (!normalizedEmbedding) {
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_EMBEDDING',
            error:
              'Vector sinh trắc khuôn mặt không hợp lệ (cần mảng 64–2048 số hữu hạn, chuẩn L2 > 0).',
          },
          { status: 400 }
        );
      }

      if (
        !Number.isFinite(liveness) ||
        !Number.isFinite(antispoof) ||
        !Number.isFinite(blinkCount) ||
        liveness < FACE_MIN_LIVENESS ||
        antispoof < FACE_MIN_ANTISPOOF ||
        blinkCount < FACE_MIN_BLINKS
      ) {
        return failLivenessResponse(liveness, antispoof, blinkCount);
      }

      const encrypted = encryptFaceEmbedding(normalizedEmbedding);
      let periocularFields: Partial<StoredFaceBiometricProfile> = {};
      if (periocularFrameB64 && validatePeriocularFrameBase64(periocularFrameB64).ok) {
        const health = await probePeriocularHealth();
        if (health.online) {
          const extractRes = await extractPeriocularFromService({
            frameB64: periocularFrameB64,
            auxFrameB64: periocularAuxFrameB64,
            mode: 'auto',
          });
          if (extractRes.ok && extractRes.antispoofScore >= 0.45) {
            const encPeri = encryptFaceEmbedding(extractRes.embedding);
            periocularFields = {
              periocular_ciphertext: encPeri.ciphertext,
              periocular_iv: encPeri.iv,
              periocular_auth_tag: encPeri.auth_tag,
              periocular_dim: extractRes.embedding.length,
              periocular_engine: extractRes.detectionMode,
            };
          }
        }
      }

      const nowIso = new Date().toISOString();
      const newProfile: StoredFaceBiometricProfile = {
        id: `fprof-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        employee_id: employeeId,
        employee_code: effectiveEmployeeCode,
        device_label: deviceLabel,
        embedding_dim: normalizedEmbedding.length,
        registered_by_role: session.role,
        created_at: nowIso,
        last_used_at: null,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.auth_tag,
        ...periocularFields,
      };

      const nextProfiles = [
        newProfile,
        ...existingProfiles.filter(
          (p) => p.employee_code.toUpperCase() !== effectiveCodeUpper
        ),
      ];
      writeFaceProfiles(store, nextProfiles);

      const faceRegCookie = issueVerifiedBiometricSessionCookie(
        req,
        employeeId,
        effectiveEmployeeCode
      );
      appendBiometricAudit(store, {
        actorName,
        actorCode: session.employeeCode || effectiveEmployeeCode,
        actorRole: session.role,
        action: 'BIOMETRIC_REGISTER',
        target: `${effectiveEmployeeCode} · ${deviceLabel}`,
        detail: `Đăng ký mẫu khuôn mặt (Liveness=${liveness.toFixed(2)}, AntiSpoof=${antispoof.toFixed(2)}, Blink=${Math.floor(blinkCount)}, dim=${normalizedEmbedding.length}${periocularFields.periocular_ciphertext ? ', +Periocular' : ''}) qua domain ${requestedRpId} từ WiFi IP ${verification.verifiedIp}.`,
        ipAddress: verification.verifiedIp,
        status: 'SUCCESS',
      });
      persistSyncStore();

      return NextResponse.json(
        {
          success: true,
          profile: toPublicFaceProfileDto(newProfile),
          faceProfiles: filterVisibleFaceProfilesForSession(nextProfiles, session),
          wifi: isAdminOrHr ? verification : sanitizeWifiForNonAdmin(verification),
        },
        {
          status: 201,
          headers: { 'Set-Cookie': faceRegCookie },
        }
      );
    }

    if (action === 'face_verify_punch') {
      if (verification.mode === 'HOST_LOCAL' && !isRealHostLocal(req)) {
        return NextResponse.json(
          {
            success: false,
            code: 'WIFI_MISMATCH',
            error: 'Host thực tế không phải localhost khi kết nối chế độ HOST_LOCAL.',
            wifi: sanitizeWifiForNonAdmin(verification),
          },
          { status: 403 }
        );
      }

      const session = verifyHrmSessionFromBiometricRequest(req);
      if (!session) {
        return NextResponse.json(
          {
            success: false,
            code: 'UNAUTHENTICATED',
            error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          },
          { status: 401 }
        );
      }
      if (session.role === 'CANDIDATE') {
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Vai trò hiện tại không được phép chấm công khuôn mặt.',
          },
          { status: 403 }
        );
      }

      const isAdminOrHr = isAdminOrHrRole(session.role);
      const challengeId = String(body.challengeId || '').trim();
      const challenge = String(body.challenge || '').trim();
      const employeeId = String(body.employeeId || '').trim();
      const rawEmployeeCode = String(body.employeeCode || '').trim();
      const actorName = (
        session.fullName ||
        String(body.employeeName || body.fullName || 'Nhân viên')
      )
        .trim()
        .slice(0, 120);

      if (!isAdminOrHr) {
        if (
          !session.employeeCode ||
          (rawEmployeeCode &&
            rawEmployeeCode.toUpperCase() !== session.employeeCode.toUpperCase())
        ) {
          return NextResponse.json(
            {
              success: false,
              code: 'FORBIDDEN',
              error:
                'Bạn chỉ được phép chấm công khuôn mặt cho chính tài khoản của mình.',
            },
            { status: 403 }
          );
        }
      }

      const effectiveEmployeeCode = isAdminOrHr
        ? (rawEmployeeCode || session.employeeCode).trim()
        : session.employeeCode.trim();

      if (!challengeId || !challenge || !employeeId || !effectiveEmployeeCode) {
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_PARAMS',
            error:
              'Thiếu challengeId, challenge, employeeId hoặc employeeCode khi xác thực chấm công khuôn mặt.',
          },
          { status: 400 }
        );
      }

      const effectiveCodeUpper = effectiveEmployeeCode.toUpperCase();
      const rlKey = `${effectiveCodeUpper}:${verification.verifiedIp || 'unknown'}`;
      const rlCheck = checkFacePunchRateLimit(rlKey, effectiveEmployeeCode);
      if (!rlCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            code: 'RATE_LIMITED',
            error:
              'Bạn đã xác thực khuôn mặt thất bại quá số lần quy định. Vui lòng thử lại sau.',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rlCheck.retryAfterSec) },
          }
        );
      }

      if (isVnNightAttendanceLocked()) {
        appendBiometricAudit(store, {
          actorName,
          actorCode: session.employeeCode || effectiveEmployeeCode,
          actorRole: session.role,
          action: 'BIOMETRIC_CHECK_IN_OUT',
          target: `${effectiveEmployeeCode} · NIGHT_LOCKED`,
          detail:
            '[DENIED] Chấm công khuôn mặt bị chặn do ngoài khung giờ cho phép (22:00–06:00 giờ Việt Nam).',
          ipAddress: verification.verifiedIp,
          status: 'BLOCKED',
        });
        persistSyncStore();
        return NextResponse.json(
          {
            success: false,
            code: 'NIGHT_LOCKED',
            error:
              'Ngoài khung giờ chấm công (Hệ thống tạm khóa chấm công từ 22:00 tối đến 06:00 sáng theo giờ Việt Nam).',
          },
          { status: 403 }
        );
      }

      const chCheck = consumeFaceChallenge({
        challengeId,
        challenge,
        employeeId,
        employeeCode: effectiveEmployeeCode,
        rpId: requestedRpId,
        purpose: 'punch',
      });
      if (!chCheck.ok) {
        recordFacePunchFailure(rlKey, effectiveEmployeeCode);
        return NextResponse.json(
          { success: false, code: 'INVALID_CHALLENGE', error: chCheck.error },
          { status: 403 }
        );
      }

      const profiles = readFaceProfiles(store);
      const matchedProfile = profiles.find(
        (p) => p.employee_code.toUpperCase() === effectiveCodeUpper
      );
      if (!matchedProfile) {
        return NextResponse.json(
          {
            success: false,
            code: 'FACE_PROFILE_NOT_FOUND',
            error:
              'Chưa có hồ sơ khuôn mặt cho nhân sự này. Vui lòng đăng ký mẫu khuôn mặt trước khi chấm công.',
          },
          { status: 404 }
        );
      }
      if (matchedProfile.employee_id !== employeeId) {
        recordFacePunchFailure(rlKey, effectiveEmployeeCode);
        return NextResponse.json(
          {
            success: false,
            code: 'FORBIDDEN',
            error: 'Mã định danh nhân sự không khớp hồ sơ khuôn mặt đã đăng ký.',
          },
          { status: 403 }
        );
      }

      const periocularFrameB64 =
        typeof body.periocularFrameB64 === 'string' && body.periocularFrameB64.trim()
          ? body.periocularFrameB64.trim()
          : undefined;
      const periocularAuxFrameB64 =
        typeof body.periocularAuxFrameB64 === 'string' && body.periocularAuxFrameB64.trim()
          ? body.periocularAuxFrameB64.trim()
          : undefined;
      const hasEmbeddingField =
        body.embedding !== undefined &&
        body.embedding !== null &&
        (!Array.isArray(body.embedding) || body.embedding.length > 0);
      const usePeriocular =
        body.scanModality === 'periocular' ||
        (!hasEmbeddingField && Boolean(periocularFrameB64));

      if (usePeriocular) {
        if (
          !matchedProfile.periocular_ciphertext ||
          !matchedProfile.periocular_iv ||
          !matchedProfile.periocular_auth_tag
        ) {
          return NextResponse.json(
            {
              success: false,
              code: 'PERIOCULAR_TEMPLATE_MISSING',
              error:
                'Hồ sơ hiện tại chưa có dữ liệu khuôn mặt khẩu trang. Vui lòng thiết lập lại dữ liệu khuôn mặt hoặc chuyển sang Khuôn mặt chuẩn.',
            },
            { status: 409 }
          );
        }
        if (!periocularFrameB64) {
          recordFacePunchFailure(rlKey, effectiveEmployeeCode);
          return NextResponse.json(
            {
              success: false,
              code: 'INVALID_PERIOCULAR_FRAME',
              error: 'Thiếu khung hình khuôn mặt để xác thực chấm công.',
            },
            { status: 400 }
          );
        }
        if (!periocularAuxFrameB64) {
          recordFacePunchFailure(rlKey, effectiveEmployeeCode);
          return NextResponse.json(
            {
              success: false,
              code: 'LIVENESS_FAILED',
              error:
                'Vui lòng chớp mắt tự nhiên trước camera để hoàn tất kiểm tra người thật.',
            },
            { status: 403 }
          );
        }

        const extractRes = await extractPeriocularFromService({
          frameB64: periocularFrameB64,
          auxFrameB64: periocularAuxFrameB64,
          mode: 'auto',
          requireBlink: true,
        });
        if (!extractRes.ok) {
          return NextResponse.json(
            { success: false, code: extractRes.code, error: extractRes.error },
            { status: extractRes.status }
          );
        }

        const clientLiveness = parseFiniteNumber(body.liveness);
        const blinkCount = parseFiniteNumber(body.blinkCount);
        const effectiveLiveness = Number.isFinite(clientLiveness)
          ? Math.min(clientLiveness, extractRes.livenessScore)
          : NaN;
        const effectiveAntispoof = extractRes.antispoofScore;

        if (
          !Number.isFinite(effectiveLiveness) ||
          !Number.isFinite(effectiveAntispoof) ||
          !Number.isFinite(blinkCount) ||
          effectiveLiveness < FACE_MIN_LIVENESS ||
          effectiveAntispoof < FACE_MIN_ANTISPOOF ||
          blinkCount < FACE_MIN_BLINKS
        ) {
          recordFacePunchFailure(rlKey, effectiveEmployeeCode);
          appendBiometricAudit(store, {
            actorName,
            actorCode: matchedProfile.employee_code,
            actorRole: session.role,
            action: 'BIOMETRIC_CHECK_IN_OUT',
            target: `${matchedProfile.employee_code} · ${matchedProfile.device_label}`,
            detail: `[DENIED] [PERIOCULAR] Xác thực chấm công khuôn mặt thất bại do không đạt Liveness/Anti-spoof/Blink (liveness=${Number.isFinite(effectiveLiveness) ? effectiveLiveness.toFixed(2) : 'NaN'}, antispoof=${Number.isFinite(effectiveAntispoof) ? effectiveAntispoof.toFixed(2) : 'NaN'}, blinks=${Number.isFinite(blinkCount) ? Math.floor(blinkCount) : 'NaN'}).`,
            ipAddress: verification.verifiedIp,
            status: 'BLOCKED',
          });
          persistSyncStore();
          return NextResponse.json(
            {
              success: false,
              code: 'LIVENESS_FAILED',
              error:
                'Không đạt kiểm tra người thật (Liveness >= 0.5, Anti-spoof >= 0.5, Chớp mắt >= 1). Vui lòng nhìn thẳng và chớp mắt rõ trước camera.',
            },
            { status: 403 }
          );
        }

        let storedPeriocularVector: number[];
        try {
          storedPeriocularVector = decryptFaceEmbedding({
            ciphertext: matchedProfile.periocular_ciphertext,
            iv: matchedProfile.periocular_iv,
            auth_tag: matchedProfile.periocular_auth_tag,
          });
        } catch {
          recordFacePunchFailure(rlKey, effectiveEmployeeCode);
          appendBiometricAudit(store, {
            actorName,
            actorCode: matchedProfile.employee_code,
            actorRole: session.role,
            action: 'BIOMETRIC_CHECK_IN_OUT',
            target: `${matchedProfile.employee_code} · ${matchedProfile.device_label}`,
            detail:
              '[DENIED] [PERIOCULAR] Không thể giải mã mẫu khuôn mặt đã lưu (khóa mã hóa máy chủ không khớp).',
            ipAddress: verification.verifiedIp,
            status: 'BLOCKED',
          });
          persistSyncStore();
          return NextResponse.json(
            {
              success: false,
              code: 'PROFILE_DECRYPT_FAILED',
              error:
                'Không thể giải mã mẫu khuôn mặt đã lưu. Vui lòng cập nhật lại mẫu khuôn mặt.',
            },
            { status: 403 }
          );
        }

        const similarity = computeCosineSimilarity(
          extractRes.embedding,
          storedPeriocularVector
        );
        const matchThreshold = Math.max(
          getPeriocularMatchThreshold(extractRes.detectionMode),
          getPeriocularMatchThreshold(matchedProfile.periocular_engine)
        );
        if (similarity < matchThreshold) {
          recordFacePunchFailure(rlKey, effectiveEmployeeCode);
          appendBiometricAudit(store, {
            actorName,
            actorCode: matchedProfile.employee_code,
            actorRole: session.role,
            action: 'BIOMETRIC_CHECK_IN_OUT',
            target: `${matchedProfile.employee_code} · ${matchedProfile.device_label}`,
            detail: `[DENIED] [PERIOCULAR:${extractRes.detectionMode}] Khuôn mặt không khớp hồ sơ đã đăng ký (similarity=${similarity.toFixed(4)} < ${matchThreshold}).`,
            ipAddress: verification.verifiedIp,
            status: 'BLOCKED',
          });
          persistSyncStore();
            return NextResponse.json(
              {
                success: false,
                code: 'FACE_MISMATCH',
                similarity: Number(similarity.toFixed(4)),
                error: `Khuôn mặt không khớp với hồ sơ đã lưu (độ tương đồng ${(similarity * 100).toFixed(1)}%).`,
              },
              { status: 403 }
            );
        }

        resetFacePunchRateLimit(rlKey, effectiveEmployeeCode);
        const verifiedAt = new Date().toISOString();
        const updatedProfile: StoredFaceBiometricProfile = {
          ...matchedProfile,
          last_used_at: verifiedAt,
        };
        writeFaceProfiles(
          store,
          profiles.map((p) =>
            p.employee_code.toUpperCase() === effectiveCodeUpper ? updatedProfile : p
          )
        );

        const facePunchCookie = issueVerifiedBiometricSessionCookie(
          req,
          updatedProfile.employee_id,
          effectiveEmployeeCode
        );
        const periCoverLabel = formatFaceCoverLabelVi(extractRes.faceCover);
        appendBiometricAudit(store, {
          actorName,
          actorCode: updatedProfile.employee_code,
          actorRole: session.role,
          action: 'BIOMETRIC_CHECK_IN_OUT',
          target: `${updatedProfile.employee_code} · ${updatedProfile.device_label}`,
          detail: `Xác thực chấm công Khuôn mặt/Khẩu trang [${extractRes.detectionMode}] thành công (${periCoverLabel}, similarity=${similarity.toFixed(4)}, Liveness=${effectiveLiveness.toFixed(2)}, AntiSpoof=${effectiveAntispoof.toFixed(2)}, Blink=${Math.floor(blinkCount)}) từ WiFi IP ${verification.verifiedIp}.`,
          ipAddress: verification.verifiedIp,
          status: 'SUCCESS',
        });
        persistSyncStore();

        return NextResponse.json(
          {
            success: true,
            profile: toPublicFaceProfileDto(updatedProfile),
            similarity: Number(similarity.toFixed(4)),
            liveness: Number(effectiveLiveness.toFixed(4)),
            antispoof: Number(effectiveAntispoof.toFixed(4)),
            blinkCount: Math.floor(blinkCount),
            scanModality: 'periocular',
            detectionMode: extractRes.detectionMode,
            faceCover: extractRes.faceCover,
            maskScore: Number(extractRes.maskScore.toFixed(4)),
            wifi: isAdminOrHr ? verification : sanitizeWifiForNonAdmin(verification),
            verifiedAt,
          },
          {
            headers: { 'Set-Cookie': facePunchCookie },
          }
        );
      }

      const normalizedEmbedding = validateAndNormalizeFaceEmbedding(body.embedding);
      if (!normalizedEmbedding) {
        recordFacePunchFailure(rlKey, effectiveEmployeeCode);
        return NextResponse.json(
          {
            success: false,
            code: 'INVALID_EMBEDDING',
            error:
              'Vector sinh trắc khuôn mặt không hợp lệ (cần mảng 64–2048 số hữu hạn, chuẩn L2 > 0).',
          },
          { status: 400 }
        );
      }

      const liveness = parseFiniteNumber(body.liveness);
      const antispoof = parseFiniteNumber(body.antispoof);
      const blinkCount = parseFiniteNumber(body.blinkCount);

      if (
        !Number.isFinite(liveness) ||
        !Number.isFinite(antispoof) ||
        !Number.isFinite(blinkCount) ||
        liveness < FACE_MIN_LIVENESS ||
        antispoof < FACE_MIN_ANTISPOOF ||
        blinkCount < FACE_MIN_BLINKS
      ) {
        recordFacePunchFailure(rlKey, effectiveEmployeeCode);
        appendBiometricAudit(store, {
          actorName,
          actorCode: matchedProfile.employee_code,
          actorRole: session.role,
          action: 'BIOMETRIC_CHECK_IN_OUT',
          target: `${matchedProfile.employee_code} · ${matchedProfile.device_label}`,
          detail: `[DENIED] Xác thực chấm công khuôn mặt thất bại do không đạt Liveness/Anti-spoof/Blink (liveness=${Number.isFinite(liveness) ? liveness.toFixed(2) : 'NaN'}, antispoof=${Number.isFinite(antispoof) ? antispoof.toFixed(2) : 'NaN'}, blinks=${Number.isFinite(blinkCount) ? Math.floor(blinkCount) : 'NaN'}).`,
          ipAddress: verification.verifiedIp,
          status: 'BLOCKED',
        });
        persistSyncStore();
        return NextResponse.json(
          {
            success: false,
            code: 'LIVENESS_FAILED',
            error:
              'Không đạt kiểm tra người thật (Liveness >= 0.5, Anti-spoof >= 0.5, Chớp mắt >= 1). Vui lòng chớp mắt rõ trước camera.',
          },
          { status: 403 }
        );
      }

      let storedVector: number[];
      try {
        storedVector = decryptFaceEmbedding({
          ciphertext: matchedProfile.ciphertext,
          iv: matchedProfile.iv,
          auth_tag: matchedProfile.auth_tag,
        });
      } catch {
        recordFacePunchFailure(rlKey, effectiveEmployeeCode);
        appendBiometricAudit(store, {
          actorName,
          actorCode: matchedProfile.employee_code,
          actorRole: session.role,
          action: 'BIOMETRIC_CHECK_IN_OUT',
          target: `${matchedProfile.employee_code} · ${matchedProfile.device_label}`,
          detail:
            '[DENIED] Không thể giải mã mẫu khuôn mặt đã lưu (khóa mã hóa máy chủ không khớp).',
          ipAddress: verification.verifiedIp,
          status: 'BLOCKED',
        });
        persistSyncStore();
        return NextResponse.json(
          {
            success: false,
            code: 'PROFILE_DECRYPT_FAILED',
            error:
              'Không thể giải mã hồ sơ khuôn mặt đã lưu. Vui lòng đăng ký lại mẫu khuôn mặt.',
          },
          { status: 403 }
        );
      }

      const similarity = computeCosineSimilarity(normalizedEmbedding, storedVector);
      if (similarity < FACE_MATCH_THRESHOLD) {
        if (
          matchedProfile.periocular_ciphertext &&
          matchedProfile.periocular_iv &&
          matchedProfile.periocular_auth_tag &&
          periocularFrameB64 &&
          periocularAuxFrameB64 &&
          validatePeriocularFrameBase64(periocularFrameB64).ok &&
          validatePeriocularFrameBase64(periocularAuxFrameB64).ok &&
          (await probePeriocularHealth()).online
        ) {
          const hybridExtract = await extractPeriocularFromService({
            frameB64: periocularFrameB64,
            auxFrameB64: periocularAuxFrameB64,
            mode: 'auto',
            requireBlink: true,
          });
          if (hybridExtract.ok) {
            const hybridLiveness = Math.min(liveness, hybridExtract.livenessScore);
            const hybridAntispoof = Math.min(antispoof, hybridExtract.antispoofScore);
            if (
              hybridLiveness >= FACE_MIN_LIVENESS &&
              hybridAntispoof >= FACE_MIN_ANTISPOOF
            ) {
              try {
                const storedPeriocularVec = decryptFaceEmbedding({
                  ciphertext: matchedProfile.periocular_ciphertext,
                  iv: matchedProfile.periocular_iv,
                  auth_tag: matchedProfile.periocular_auth_tag,
                });
                const hybridSim = computeCosineSimilarity(
                  hybridExtract.embedding,
                  storedPeriocularVec
                );
                const hybridThreshold = getPeriocularMatchThreshold(
                  hybridExtract.detectionMode
                );
                if (hybridSim >= hybridThreshold) {
                  resetFacePunchRateLimit(rlKey, effectiveEmployeeCode);
                  const verifiedAt = new Date().toISOString();
                  const updatedProfile: StoredFaceBiometricProfile = {
                    ...matchedProfile,
                    last_used_at: verifiedAt,
                  };
                  writeFaceProfiles(
                    store,
                    profiles.map((p) =>
                      p.employee_code.toUpperCase() === effectiveCodeUpper
                        ? updatedProfile
                        : p
                    )
                  );
                  const facePunchCookie = issueVerifiedBiometricSessionCookie(
                    req,
                    updatedProfile.employee_id,
                    effectiveEmployeeCode
                  );
                  const hybridCoverLabel = formatFaceCoverLabelVi(hybridExtract.faceCover);
                  appendBiometricAudit(store, {
                    actorName,
                    actorCode: updatedProfile.employee_code,
                    actorRole: session.role,
                    action: 'BIOMETRIC_CHECK_IN_OUT',
                    target: `${updatedProfile.employee_code} · ${updatedProfile.device_label}`,
                    detail: `Xác thực chấm công thành công [+HybridPeriocularMatch:${hybridExtract.detectionMode}] (${hybridCoverLabel}, faceSim=${similarity.toFixed(4)}, periocularSim=${hybridSim.toFixed(4)}, Liveness=${hybridLiveness.toFixed(2)}, AntiSpoof=${hybridAntispoof.toFixed(2)}, Blink=${Math.floor(blinkCount)}) từ WiFi IP ${verification.verifiedIp}.`,
                    ipAddress: verification.verifiedIp,
                    status: 'SUCCESS',
                  });
                  persistSyncStore();

                  return NextResponse.json(
                    {
                      success: true,
                      profile: toPublicFaceProfileDto(updatedProfile),
                      similarity: Number(hybridSim.toFixed(4)),
                      liveness: Number(hybridLiveness.toFixed(4)),
                      antispoof: Number(hybridAntispoof.toFixed(4)),
                      blinkCount: Math.floor(blinkCount),
                      scanModality: 'periocular',
                      detectionMode: hybridExtract.detectionMode,
                      faceCover: hybridExtract.faceCover,
                      maskScore: Number(hybridExtract.maskScore.toFixed(4)),
                      hybridMatch: true,
                      wifi: isAdminOrHr
                        ? verification
                        : sanitizeWifiForNonAdmin(verification),
                      verifiedAt,
                    },
                    {
                      headers: { 'Set-Cookie': facePunchCookie },
                    }
                  );
                }
              } catch {
                // fallback to standard FACE_MISMATCH if periocular decrypt fails
              }
            }
          }
        }

        recordFacePunchFailure(rlKey, effectiveEmployeeCode);
        appendBiometricAudit(store, {
          actorName,
          actorCode: matchedProfile.employee_code,
          actorRole: session.role,
          action: 'BIOMETRIC_CHECK_IN_OUT',
          target: `${matchedProfile.employee_code} · ${matchedProfile.device_label}`,
          detail: `[DENIED] Khuôn mặt không khớp hồ sơ đã đăng ký (similarity=${similarity.toFixed(4)} < ${FACE_MATCH_THRESHOLD}).`,
          ipAddress: verification.verifiedIp,
          status: 'BLOCKED',
        });
        persistSyncStore();
        return NextResponse.json(
          {
            success: false,
            code: 'FACE_MISMATCH',
            similarity: Number(similarity.toFixed(4)),
            error: `Khuôn mặt không khớp với hồ sơ đã lưu (độ tương đồng ${(similarity * 100).toFixed(1)}%).`,
          },
          { status: 403 }
        );
      }

      resetFacePunchRateLimit(rlKey, effectiveEmployeeCode);
      const verifiedAt = new Date().toISOString();
      let backfillFields: Partial<StoredFaceBiometricProfile> = {};
      let fullFaceCover: FaceCoverStatus = 'none';
      let fullFaceMaskScore = 0;

      if (periocularFrameB64 && validatePeriocularFrameBase64(periocularFrameB64).ok) {
        const health = await probePeriocularHealth();
        if (health.online) {
          if (!matchedProfile.periocular_ciphertext) {
            const extractRes = await extractPeriocularFromService({
              frameB64: periocularFrameB64,
              auxFrameB64: periocularAuxFrameB64,
              mode: 'auto',
            });
            if (extractRes.ok) {
              fullFaceCover = extractRes.faceCover;
              fullFaceMaskScore = extractRes.maskScore;
              if (extractRes.antispoofScore >= FACE_MIN_ANTISPOOF) {
                const encPeri = encryptFaceEmbedding(extractRes.embedding);
                backfillFields = {
                  periocular_ciphertext: encPeri.ciphertext,
                  periocular_iv: encPeri.iv,
                  periocular_auth_tag: encPeri.auth_tag,
                  periocular_dim: extractRes.embedding.length,
                  periocular_engine: extractRes.detectionMode,
                };
              }
            }
          } else {
            const maskRes = await checkMaskFromPeriocularService({
              frameB64: periocularFrameB64,
            });
            if (maskRes.ok) {
              fullFaceCover = maskRes.faceCover;
              fullFaceMaskScore = maskRes.maskScore;
            }
          }
        }
      }

      const updatedProfile: StoredFaceBiometricProfile = {
        ...matchedProfile,
        ...backfillFields,
        last_used_at: verifiedAt,
      };
      writeFaceProfiles(
        store,
        profiles.map((p) =>
          p.employee_code.toUpperCase() === effectiveCodeUpper ? updatedProfile : p
        )
      );

      const facePunchCookie = issueVerifiedBiometricSessionCookie(
        req,
        updatedProfile.employee_id,
        effectiveEmployeeCode
      );
      const fullFaceCoverLabel = formatFaceCoverLabelVi(fullFaceCover);
      appendBiometricAudit(store, {
        actorName,
        actorCode: updatedProfile.employee_code,
        actorRole: session.role,
        action: 'BIOMETRIC_CHECK_IN_OUT',
        target: `${updatedProfile.employee_code} · ${updatedProfile.device_label}`,
        detail: `Xác thực chấm công khuôn mặt thành công (${fullFaceCoverLabel}, similarity=${similarity.toFixed(4)}, Liveness=${liveness.toFixed(2)}, AntiSpoof=${antispoof.toFixed(2)}, Blink=${Math.floor(blinkCount)}${backfillFields.periocular_ciphertext ? ', +BackfillPeriocular' : ''}) từ WiFi IP ${verification.verifiedIp}.`,
        ipAddress: verification.verifiedIp,
        status: 'SUCCESS',
      });
      persistSyncStore();

      return NextResponse.json(
        {
          success: true,
          profile: toPublicFaceProfileDto(updatedProfile),
          similarity: Number(similarity.toFixed(4)),
          liveness: Number(liveness.toFixed(4)),
          antispoof: Number(antispoof.toFixed(4)),
          blinkCount: Math.floor(blinkCount),
          scanModality: 'full_face',
          faceCover: fullFaceCover,
          maskScore: Number(fullFaceMaskScore.toFixed(4)),
          wifi: isAdminOrHr ? verification : sanitizeWifiForNonAdmin(verification),
          verifiedAt,
        },
        {
          headers: { 'Set-Cookie': facePunchCookie },
        }
      );
    }

    return NextResponse.json(
      { success: false, error: `Action '${action}' không được hỗ trợ.` },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Lỗi máy chủ khi xử lý xác thực sinh trắc học.' },
      { status: 500 }
    );
  }
}
