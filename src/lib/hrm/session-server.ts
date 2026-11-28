import crypto from 'crypto';
import type { RoleCode } from '@/lib/hrm/types';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSessionSecret: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmRevokedSessionJtis: Map<string, number> | undefined;
}

export const HRM_SESSION_COOKIE_NAME = 'hrm_session';
const SESSION_MAX_AGE_SEC = 43_200; // 12 hours
const SESSION_TTL_MS = SESSION_MAX_AGE_SEC * 1000;
const MIN_SECRET_LENGTH = 32;
const MAX_REVOKED_JTIS = 10_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const ALLOWED_SESSION_ROLES: ReadonlySet<RoleCode> = new Set<RoleCode>([
  'SUPER_ADMIN',
  'DIRECTOR',
  'HR_MANAGER',
  'DEPT_MANAGER',
  'EMPLOYEE',
  'CANDIDATE',
]);

export interface HrmSessionPayload {
  jti: string;
  role: RoleCode;
  employeeCode: string;
  email: string;
  fullName: string;
  iat: number;
  exp: number;
}

export interface HrmSessionInput {
  jti?: string;
  role: RoleCode;
  employeeCode: string;
  email: string;
  fullName: string;
  iat?: number;
  exp?: number;
}

function getSessionSecret(): string | null {
  const envSecret = (process.env.HRM_SESSION_SECRET || '').trim();
  if (envSecret.length >= MIN_SECRET_LENGTH) {
    return envSecret;
  }

  // Fail closed in production when HRM_SESSION_SECRET is missing or < 32 chars
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  // Non-production fallback: ephemeral 32-byte CSPRNG secret on globalThis
  if (!globalThis._hrmSessionSecret || globalThis._hrmSessionSecret.length < MIN_SECRET_LENGTH) {
    globalThis._hrmSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis._hrmSessionSecret;
}

function getRevokedJtiStore(): Map<string, number> {
  if (!globalThis._hrmRevokedSessionJtis) {
    globalThis._hrmRevokedSessionJtis = new Map<string, number>();
  }
  const map = globalThis._hrmRevokedSessionJtis;
  const now = Date.now();
  map.forEach((expMs, jti) => {
    if (!Number.isFinite(expMs) || expMs <= now) {
      map.delete(jti);
    }
  });
  while (map.size > MAX_REVOKED_JTIS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  return map;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasForbiddenKey(obj: Record<string, unknown>): boolean {
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
  }
  return false;
}

export function extractSessionCookieToken(req: Request): string {
  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader) return '';
  const escaped = HRM_SESSION_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`).exec(cookieHeader);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

function isHttpsRequest(req: Request): boolean {
  if (req.url.startsWith('https://')) {
    return true;
  }
  if (process.env.TRUST_PROXY === 'true') {
    const proto = (req.headers.get('x-forwarded-proto') || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    if (proto === 'https') {
      return true;
    }
  }
  return false;
}

export function signSessionToken(input: HrmSessionInput): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('HRM_SESSION_SECRET_MISSING');
  }

  const now = Date.now();
  const iat = typeof input.iat === 'number' && Number.isFinite(input.iat) ? input.iat : now;
  const exp =
    typeof input.exp === 'number' && Number.isFinite(input.exp)
      ? input.exp
      : iat + SESSION_TTL_MS;
  const jti =
    typeof input.jti === 'string' && input.jti.trim().length >= 8
      ? input.jti.trim().slice(0, 128)
      : crypto.randomUUID();

  const payload: HrmSessionPayload = {
    jti,
    role: input.role,
    employeeCode: String(input.employeeCode || '').trim().slice(0, 64),
    email: String(input.email || '').trim().toLowerCase().slice(0, 160),
    fullName: String(input.fullName || '').trim().slice(0, 120),
    iat,
    exp,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): HrmSessionPayload | null {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const cleanToken = String(token || '').trim();
  if (!cleanToken || cleanToken.length > 4096) return null;

  const parts = cleanToken.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sigB64Url] = parts;
  if (
    !encodedPayload ||
    !sigB64Url ||
    !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
    !/^[A-Za-z0-9_-]+$/.test(sigB64Url)
  ) {
    return null;
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest();

  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(sigB64Url, 'base64url');
  } catch {
    return null;
  }

  if (expectedSig.length !== actualSig.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }

  let parsed: unknown;
  try {
    const jsonText = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed) || hasForbiddenKey(parsed)) {
    return null;
  }

  const jti = typeof parsed.jti === 'string' ? parsed.jti.trim() : '';
  if (jti.length < 8 || jti.length > 128) {
    return null;
  }

  const role = parsed.role;
  if (typeof role !== 'string' || !ALLOWED_SESSION_ROLES.has(role as RoleCode)) {
    return null;
  }
  if (
    typeof parsed.employeeCode !== 'string' ||
    typeof parsed.email !== 'string' ||
    typeof parsed.fullName !== 'string' ||
    typeof parsed.iat !== 'number' ||
    typeof parsed.exp !== 'number'
  ) {
    return null;
  }
  if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) {
    return null;
  }

  const revokedStore = getRevokedJtiStore();
  if (revokedStore.has(jti)) {
    return null;
  }

  return {
    jti,
    role: role as RoleCode,
    employeeCode: parsed.employeeCode.trim().slice(0, 64),
    email: parsed.email.trim().toLowerCase().slice(0, 160),
    fullName: parsed.fullName.trim().slice(0, 120),
    iat: parsed.iat,
    exp: parsed.exp,
  };
}

export function revokeSessionToken(token: string): boolean {
  const verified = verifySessionToken(token);
  if (!verified) {
    return false;
  }
  const revokedStore = getRevokedJtiStore();
  revokedStore.set(verified.jti, verified.exp);
  return true;
}

export function verifySessionFromRequest(req: Request): HrmSessionPayload | null {
  const token = extractSessionCookieToken(req);
  if (!token) return null;
  return verifySessionToken(token);
}

export function buildSessionCookieHeader(req: Request, payload: HrmSessionInput): string {
  const token = signSessionToken(payload);
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  return `${HRM_SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}${secureFlag}`;
}

export function buildClearSessionCookieHeader(req: Request): string {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  return `${HRM_SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`;
}

export function isStrictSameOriginRequest(req: Request): boolean {
  const secFetchSite = (req.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return false;
  }

  const rawOrigin = req.headers.get('origin');
  if (rawOrigin === null) {
    return false;
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

  const trustProxy = process.env.TRUST_PROXY === 'true';
  const rawHostHeader =
    (trustProxy ? req.headers.get('x-forwarded-host') : '') ||
    req.headers.get('host') ||
    '';

  let requestHost = rawHostHeader.split(',')[0].trim().toLowerCase();
  let requestProtocol = '';

  try {
    const parsedReqUrl = new URL(req.url);
    if (!requestHost) {
      requestHost = parsedReqUrl.host.toLowerCase();
    }
    requestProtocol = parsedReqUrl.protocol.toLowerCase();
  } catch {
    // ignore unparseable req.url
  }

  if (trustProxy) {
    const forwardedProto = (req.headers.get('x-forwarded-proto') || '')
      .split(',')[0]
      .trim()
      .toLowerCase();
    if (forwardedProto) {
      if (forwardedProto !== 'http' && forwardedProto !== 'https') {
        return false;
      }
      requestProtocol = `${forwardedProto}:`;
    }
  }

  if (!requestHost || (requestProtocol !== 'http:' && requestProtocol !== 'https:')) {
    return false;
  }

  return (
    parsedOrigin.host.toLowerCase() === requestHost &&
    parsedOrigin.protocol.toLowerCase() === requestProtocol
  );
}

export function isJsonContentType(req: Request): boolean {
  const contentType = req.headers.get('content-type') || '';
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return mediaType === 'application/json';
}

export function extractTrustedClientIp(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const candidates = [
      req.headers.get('cf-connecting-ip'),
      req.headers.get('x-real-ip'),
      ...(req.headers.get('x-forwarded-for')?.split(',') ?? []),
    ];
    for (const raw of candidates) {
      const clean = (raw || '').trim();
      if (clean) return clean.slice(0, 64);
    }
  }
  return 'local-or-unknown';
}
