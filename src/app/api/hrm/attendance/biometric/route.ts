import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_SERVER_WIFI_POLICY,
  evaluateSameWifiGate,
  extractForwardedClientIp,
  extractHostnameFromHeaders,
  getHostLanInterfaces,
  getHostPublicIpInfo,
  getHostWifiDetails,
  issueWebAuthnChallenge,
  verifyWebAuthnAssertion,
  verifyWebAuthnRegistration,
} from '@/lib/hrm/biometric-server';
import { formatEventId } from '@/lib/hrm/ids';
import type {
  BiometricCredentialRecord,
  BiometricDeviceKind,
  WifiAttendancePolicy,
} from '@/mock/types';

declare global {
  // eslint-disable-next-line no-var
  var _hrmSyncStore: Record<string, unknown> | undefined;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'runtime-sync.json');

const STORE_CREDS_KEY = 'hrm_runtime_biometric_creds_v1';
const STORE_POLICY_KEY = 'hrm_runtime_wifi_policy_v1';
const STORE_AUDIT_KEY = 'hrm_runtime_audit_logs';

function getSyncStore(): Record<string, unknown> {
  if (globalThis._hrmSyncStore && Object.keys(globalThis._hrmSyncStore).length > 0) {
    return globalThis._hrmSyncStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      globalThis._hrmSyncStore = JSON.parse(content);
      return globalThis._hrmSyncStore || {};
    }
  } catch {
    // ignore read error
  }
  if (!globalThis._hrmSyncStore) {
    globalThis._hrmSyncStore = {};
  }
  return globalThis._hrmSyncStore;
}

function persistSyncStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(globalThis._hrmSyncStore || {}, null, 2),
      'utf-8'
    );
  } catch {
    // ignore write error in read-only environments
  }
}

function readCreds(store: Record<string, unknown>): BiometricCredentialRecord[] {
  const raw = store[STORE_CREDS_KEY];
  return Array.isArray(raw) ? (raw as BiometricCredentialRecord[]) : [];
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
  req: Request,
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

  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get('employee_id')?.trim();
    const { verification, hostLanInterfaces, hostPublicIpv4, hostWifiDetails } =
      await evaluateRequestWifi(req, {}, policy);

    const filteredCreds = employeeId
      ? creds.filter(
          (c) => c.employee_id === employeeId || c.employee_code === employeeId
        )
      : creds;

    return NextResponse.json({
      success: true,
      wifi: verification,
      hostLanInterfaces,
      hostPublicIpv4,
      hostWifiDetails,
      policy,
      credentials: filteredCreds,
    });
  } catch {
    return NextResponse.json({
      success: true,
      policy,
      credentials: creds,
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || 'network_status').trim();
    const store = getSyncStore();

    if (action === 'save_wifi_policy') {
      const actorRole = String(body.actorRole || '').trim();
      const actorName = String(body.actorName || 'Quản trị hệ thống').trim();
      if (
        actorRole &&
        actorRole !== 'SUPER_ADMIN' &&
        actorRole !== 'HR_MANAGER' &&
        actorRole !== 'DIRECTOR'
      ) {
        return NextResponse.json(
          { success: false, error: 'Bạn không có quyền thay đổi chính sách WiFi chấm công.' },
          { status: 403 }
        );
      }
      const rawPolicy =
        body.policy && typeof body.policy === 'object'
          ? (body.policy as Partial<WifiAttendancePolicy>)
          : {};
      const current = readPolicy(store);
      const nextPolicy: WifiAttendancePolicy = {
        ...current,
        ...rawPolicy,
        id: 'wifi-policy-default',
        allowed_public_ips: Array.isArray(rawPolicy.allowed_public_ips)
          ? rawPolicy.allowed_public_ips
          : current.allowed_public_ips,
        allowed_lan_cidrs: Array.isArray(rawPolicy.allowed_lan_cidrs)
          ? rawPolicy.allowed_lan_cidrs
          : current.allowed_lan_cidrs,
        updated_by: actorName,
        updated_at: new Date().toISOString(),
      };
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
      const next = creds.filter(
        (c) => c.id !== idOrCredId && c.credential_id !== idOrCredId
      );
      store[STORE_CREDS_KEY] = next;
      persistSyncStore();
      return NextResponse.json({ success: true, credentials: next });
    }

    // Read optional policy snapshot synced from client if server cache didn't have it yet
    const incomingPolicy =
      body.policySnapshot && typeof body.policySnapshot === 'object'
        ? (body.policySnapshot as WifiAttendancePolicy)
        : undefined;
    if (incomingPolicy && (!store[STORE_POLICY_KEY] || (Array.isArray(store[STORE_POLICY_KEY]) && (store[STORE_POLICY_KEY] as unknown[]).length === 0))) {
      store[STORE_POLICY_KEY] = [incomingPolicy];
      persistSyncStore();
    }

    const { verification, hostLanInterfaces, hostPublicIpv4, hostWifiDetails, rpId: serverRpId } =
      await evaluateRequestWifi(req, body);

    const requestedRpId = body.rpId ? String(body.rpId).toLowerCase() : serverRpId;

    if (action === 'network_status') {
      const employeeId = body.employeeId ? String(body.employeeId) : undefined;
      const creds = readCreds(store);
      const filteredCreds = employeeId
        ? creds.filter(
            (c) => c.employee_id === employeeId || c.employee_code === employeeId
          )
        : creds;
      return NextResponse.json({
        success: true,
        wifi: verification,
        hostLanInterfaces,
        hostPublicIpv4,
        hostWifiDetails,
        rpId: requestedRpId,
        credentials: filteredCreds,
      });
    }

    if (!verification.allowed) {
      appendBiometricAudit(store, {
        actorName: String(body.employeeName || 'Nhân viên'),
        actorCode: String(body.employeeCode || 'EMP'),
        actorRole: String(body.actorRole || 'EMPLOYEE'),
        action: 'WIFI_CHECK_BLOCKED',
        target: `${body.employeeCode || 'NV'} · ${verification.verifiedIp}`,
        detail: verification.reason,
        ipAddress: verification.verifiedIp,
        status: 'BLOCKED',
      });
      persistSyncStore();
      return NextResponse.json(
        {
          success: false,
          code: verification.code || 'WIFI_MISMATCH',
          error: verification.reason,
          wifi: verification,
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

      const nextCreds = [
        newRecord,
        ...creds.filter((c) => c.credential_id !== credentialId),
      ];
      store[STORE_CREDS_KEY] = nextCreds;
      appendBiometricAudit(store, {
        actorName: fullName,
        actorCode: employeeCode,
        actorRole: String(body.actorRole || 'EMPLOYEE'),
        action: 'BIOMETRIC_REGISTER',
        target: `${employeeCode} · ${deviceLabel}`,
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
        { status: 201 }
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

      const creds = readCreds(store);
      const fallbackSnapshot =
        body.credentialSnapshot && typeof body.credentialSnapshot === 'object'
          ? (body.credentialSnapshot as BiometricCredentialRecord)
          : undefined;

      const matchedCredential =
        creds.find(
          (c) =>
            c.credential_id === credentialId &&
            (!employeeId || c.employee_id === employeeId || c.employee_code === employeeCode)
        ) ??
        (fallbackSnapshot && fallbackSnapshot.credential_id === credentialId
          ? fallbackSnapshot
          : undefined);

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
      const existsInServer = creds.some(
        (c) => c.credential_id === updatedCred.credential_id
      );
      store[STORE_CREDS_KEY] = existsInServer
        ? creds.map((c) =>
            c.credential_id === updatedCred.credential_id ? updatedCred : c
          )
        : [updatedCred, ...creds];
      persistSyncStore();

      return NextResponse.json({
        success: true,
        credential: updatedCred,
        wifi: verification,
      });
    }

    return NextResponse.json(
      { success: false, error: `Action '${action}' không được hỗ trợ.` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lỗi máy chủ chấm công sinh trắc học.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
