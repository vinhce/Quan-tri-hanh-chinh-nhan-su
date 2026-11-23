'use client';

import {
  checkInOutToday,
  getBiometricCredentials,
  getWifiAttendancePolicy,
  removeBiometricCredential,
  saveBiometricCredential,
  saveWifiAttendancePolicy,
} from '@/lib/runtime-store';
import type {
  BiometricCredentialRecord,
  BiometricDeviceKind,
  DailyAttendanceRecord,
  Employee,
  HostWifiHardwareInfo,
  RoleCode,
  WifiAttendancePolicy,
  WifiVerificationResult,
} from '@/mock/types';

export interface BiometricSupportInfo {
  isSecureContext: boolean;
  hasWebAuthn: boolean;
  hasPlatformAuthenticator: boolean;
  deviceKind: BiometricDeviceKind;
  suggestedDeviceLabel: string;
  hostname: string;
  insecureWarning: string | null;
}

export class BiometricFlowError extends Error {
  code:
    | 'NO_CREDENTIAL_ON_DEVICE'
    | 'WIFI_MISMATCH'
    | 'CELLULAR_BLOCKED'
    | 'INSECURE_CONTEXT'
    | 'NOT_SUPPORTED'
    | 'USER_CANCELLED'
    | 'VERIFICATION_FAILED';
  wifi?: WifiVerificationResult;

  constructor(
    code: BiometricFlowError['code'],
    message: string,
    wifi?: WifiVerificationResult
  ) {
    super(message);
    this.name = 'BiometricFlowError';
    this.code = code;
    this.wifi = wifi;
  }
}

function bufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function isLocalOrLanHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h.startsWith('10.') || h.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

export function detectDeviceKindAndLabel(): {
  deviceKind: BiometricDeviceKind;
  suggestedDeviceLabel: string;
} {
  if (typeof navigator === 'undefined') {
    return {
      deviceKind: 'LAPTOP',
      suggestedDeviceLabel: 'Vân tay Laptop (Windows Hello)',
    };
  }
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return {
      deviceKind: 'MOBILE',
      suggestedDeviceLabel: 'Face ID / Touch ID iPhone',
    };
  }
  if (/Android/i.test(ua)) {
    return {
      deviceKind: 'MOBILE',
      suggestedDeviceLabel: 'Vân tay Điện thoại Android',
    };
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return {
      deviceKind: 'LAPTOP',
      suggestedDeviceLabel: 'Touch ID MacBook',
    };
  }
  if (/Windows/i.test(ua)) {
    return {
      deviceKind: 'LAPTOP',
      suggestedDeviceLabel: 'Đầu đọc vân tay Laptop (Windows Hello)',
    };
  }
  return {
    deviceKind: 'LAPTOP',
    suggestedDeviceLabel: 'Sinh trắc học thiết bị',
  };
}

export async function getBiometricSupportInfo(): Promise<BiometricSupportInfo> {
  if (typeof window === 'undefined') {
    return {
      isSecureContext: false,
      hasWebAuthn: false,
      hasPlatformAuthenticator: false,
      deviceKind: 'LAPTOP',
      suggestedDeviceLabel: 'Đầu đọc vân tay Laptop',
      hostname: 'localhost',
      insecureWarning: null,
    };
  }

  const hostname = window.location.hostname || 'localhost';
  const { deviceKind, suggestedDeviceLabel } = detectDeviceKindAndLabel();
  const isSecureContext = Boolean(window.isSecureContext);
  const hasWebAuthn =
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function';

  let hasPlatformAuthenticator = false;
  if (isSecureContext && hasWebAuthn) {
    try {
      hasPlatformAuthenticator =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      hasPlatformAuthenticator = false;
    }
  }

  let insecureWarning: string | null = null;
  if (!isSecureContext) {
    insecureWarning = `Trình duyệt đang chạy qua HTTP thường (${window.location.origin}) nên khóa cảm biến vân tay WebAuthn. Trên Laptop hãy mở http://localhost:3000; trên Điện thoại bắt buộc mở link HTTPS (như VS Code DevTunnel) cùng mạng WiFi.`;
  } else if (!hasWebAuthn) {
    insecureWarning =
      'Trình duyệt hiện tại chưa hỗ trợ chuẩn WebAuthn / Sinh trắc học.';
  } else if (!hasPlatformAuthenticator) {
    insecureWarning =
      'Chưa phát hiện cảm biến vân tay / Windows Hello / Face ID hoạt động trên thiết bị này. Hãy bật Windows Hello (PIN/Vân tay) hoặc dùng điện thoại mở khóa sinh trắc học.';
  }

  return {
    isSecureContext,
    hasWebAuthn,
    hasPlatformAuthenticator,
    deviceKind,
    suggestedDeviceLabel,
    hostname,
    insecureWarning,
  };
}

export async function collectClientNetworkHints(
  includeExternalIpProbe = true
): Promise<{
  connectionType?: string;
  effectiveType?: string;
  publicIpv4: string | null;
}> {
  let connectionType: string | undefined;
  let effectiveType: string | undefined;

  if (typeof navigator !== 'undefined') {
    const navConn = (
      navigator as Navigator & {
        connection?: { type?: string; effectiveType?: string };
      }
    ).connection;
    if (navConn?.type) connectionType = String(navConn.type);
    if (navConn?.effectiveType) effectiveType = String(navConn.effectiveType);
  }

  let publicIpv4: string | null = null;
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname || '' : '';
  const needsProbe =
    includeExternalIpProbe && (!hostname || !isLocalOrLanHostname(hostname));

  if (needsProbe && typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    try {
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as { ip?: string };
        if (data?.ip) publicIpv4 = String(data.ip).trim();
      }
    } catch {
      // Fallback second IPv4 endpoint in case first is blocked
      try {
        const res2 = await fetch('https://ipv4.icanhazip.com', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (res2.ok) {
          publicIpv4 = (await res2.text()).trim() || null;
        }
      } catch {
        publicIpv4 = null;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return { connectionType, effectiveType, publicIpv4 };
}

export async function fetchSameWifiStatus(params?: {
  employeeId?: string;
  forceRefreshIp?: boolean;
}): Promise<{
  wifi: WifiVerificationResult;
  hostPublicIpv4: string | null;
  hostWifiDetails: HostWifiHardwareInfo | null;
  hostLanInterfaces: Array<{
    name: string;
    ip: string;
    netmask: string;
    cidr: string;
    isVirtual: boolean;
    isWifi: boolean;
  }>;
  rpId: string;
}> {
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  const clientHints = await collectClientNetworkHints(true);
  const policySnapshot = getWifiAttendancePolicy();

  const res = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'network_status',
      employeeId: params?.employeeId,
      rpId: hostname,
      forceRefreshIp: params?.forceRefreshIp === true,
      clientHints,
      policySnapshot,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Không kiểm tra được trạng thái mạng WiFi.');
  }

  if (data.wifi?.policy) {
    // Merge remote server policy down to local cache if needed
    const serverPolicy = data.wifi.policy as WifiAttendancePolicy;
    if (
      serverPolicy.allowed_public_ips.length > 0 &&
      policySnapshot.allowed_public_ips.length === 0
    ) {
      saveWifiAttendancePolicy(serverPolicy, serverPolicy.updated_by);
    }
  }

  return {
    wifi: data.wifi as WifiVerificationResult,
    hostPublicIpv4: (data.hostPublicIpv4 as string | null) ?? null,
    hostWifiDetails: (data.hostWifiDetails as HostWifiHardwareInfo | null) ?? null,
    hostLanInterfaces: Array.isArray(data.hostLanInterfaces)
      ? data.hostLanInterfaces
      : [],
    rpId: String(data.rpId || hostname),
  };
}

export async function enrollCurrentDeviceBiometric(params: {
  employee: Employee;
  deviceLabel?: string;
}): Promise<{
  credential: BiometricCredentialRecord;
  wifi: WifiVerificationResult;
}> {
  const support = await getBiometricSupportInfo();
  if (!support.isSecureContext) {
    throw new BiometricFlowError(
      'INSECURE_CONTEXT',
      support.insecureWarning || 'Cần kết nối HTTPS hoặc localhost để quét vân tay.'
    );
  }
  if (!support.hasWebAuthn) {
    throw new BiometricFlowError(
      'NOT_SUPPORTED',
      'Trình duyệt không hỗ trợ WebAuthn / Sinh trắc học.'
    );
  }

  const clientHints = await collectClientNetworkHints(true);
  const policySnapshot = getWifiAttendancePolicy();

  const chRes = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'issue_challenge',
      purpose: 'register',
      employeeId: params.employee.id,
      employeeCode: params.employee.employee_code,
      employeeName: params.employee.full_name,
      actorRole: params.employee.role_code,
      rpId: support.hostname,
      clientHints,
      policySnapshot,
    }),
  });
  const chData = await chRes.json();
  if (!chRes.ok || !chData?.success) {
    throw new BiometricFlowError(
      chData?.code === 'CELLULAR_BLOCKED' ? 'CELLULAR_BLOCKED' : 'WIFI_MISMATCH',
      chData?.error || 'Thiết bị không chung mạng WiFi với hệ thống.',
      chData?.wifi
    );
  }

  const encoder = new TextEncoder();
  const userIdBytes = encoder.encode(params.employee.employee_code);

  let rawCred: Credential | null = null;
  try {
    const publicKey: PublicKeyCredentialCreationOptions & {
      hints?: string[];
    } = {
      challenge: base64UrlToUint8Array(chData.challenge),
      rp: {
        name: 'Lạc Việt HRM — Chấm công Sinh trắc học',
        id: chData.rpId || support.hostname,
      },
      user: {
        id: userIdBytes,
        name: params.employee.email || params.employee.employee_code,
        displayName: `${params.employee.full_name} (${params.employee.employee_code})`,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
        requireResidentKey: false,
      },
      hints: ['client-device'],
      timeout: 60000,
      attestation: 'none',
    };
    rawCred = await navigator.credentials.create({
      publicKey,
    });
  } catch (err) {
    const errName = err instanceof Error ? err.name : '';
    if (errName === 'NotAllowedError' || errName === 'AbortError') {
      throw new BiometricFlowError(
        'USER_CANCELLED',
        'Bạn đã hủy quét vân tay hoặc hết thời gian chờ cảm biến.'
      );
    }
    throw new BiometricFlowError(
      'NOT_SUPPORTED',
      err instanceof Error
        ? `Không kích hoạt được đầu đọc vân tay thiết bị: ${err.message}`
        : 'Không thể khởi tạo đầu đọc vân tay trên thiết bị này.'
    );
  }

  if (!rawCred || rawCred.type !== 'public-key') {
    throw new BiometricFlowError(
      'NOT_SUPPORTED',
      'Không nhận được khóa sinh trắc học từ thiết bị.'
    );
  }

  const pkCred = rawCred as PublicKeyCredential;
  const attResp = pkCred.response as AuthenticatorAttestationResponse & {
    getPublicKey?: () => ArrayBuffer | null;
    getPublicKeyAlgorithm?: () => number;
    getAuthenticatorData?: () => ArrayBuffer;
  };

  const publicKeyBuf =
    typeof attResp.getPublicKey === 'function' ? attResp.getPublicKey() : null;
  if (!publicKeyBuf) {
    throw new BiometricFlowError(
      'NOT_SUPPORTED',
      'Trình duyệt chưa hỗ trợ trích xuất Public Key SPKI (hãy cập nhật Chrome/Edge/Safari bản mới nhất).'
    );
  }

  const publicKeyAlg =
    typeof attResp.getPublicKeyAlgorithm === 'function'
      ? attResp.getPublicKeyAlgorithm()
      : -7;
  const authDataBuf =
    typeof attResp.getAuthenticatorData === 'function'
      ? attResp.getAuthenticatorData()
      : null;

  const verifyRes = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'verify_register',
      challengeId: chData.challengeId,
      credentialId: pkCred.id,
      clientDataJSON: bufferToBase64Url(attResp.clientDataJSON),
      publicKeySpki: bufferToBase64(publicKeyBuf),
      publicKeyAlg,
      authenticatorData: authDataBuf ? bufferToBase64Url(authDataBuf) : null,
      employeeId: params.employee.id,
      employeeCode: params.employee.employee_code,
      fullName: params.employee.full_name,
      actorRole: params.employee.role_code,
      deviceLabel: params.deviceLabel?.trim() || support.suggestedDeviceLabel,
      deviceKind: support.deviceKind,
      rpId: chData.rpId || support.hostname,
      clientHints,
      policySnapshot,
    }),
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData?.success || !verifyData?.credential) {
    throw new BiometricFlowError(
      verifyData?.code === 'WIFI_MISMATCH' ? 'WIFI_MISMATCH' : 'VERIFICATION_FAILED',
      verifyData?.error || 'Xác minh đăng ký vân tay thất bại.',
      verifyData?.wifi
    );
  }

  const saved = saveBiometricCredential(
    verifyData.credential as BiometricCredentialRecord
  );
  return {
    credential: saved,
    wifi: verifyData.wifi as WifiVerificationResult,
  };
}

export async function punchWithBiometricWifi(params: {
  employee: Employee;
  action: 'CHECK_IN' | 'CHECK_OUT';
  date?: string;
  timeHHmm?: string;
  checkInTimeOverride?: string;
  note?: string;
}): Promise<{
  record: DailyAttendanceRecord;
  credential: BiometricCredentialRecord;
  wifi: WifiVerificationResult;
}> {
  const support = await getBiometricSupportInfo();
  if (!support.isSecureContext) {
    throw new BiometricFlowError(
      'INSECURE_CONTEXT',
      support.insecureWarning || 'Cần kết nối HTTPS hoặc localhost để quét vân tay.'
    );
  }
  if (!support.hasWebAuthn) {
    throw new BiometricFlowError(
      'NOT_SUPPORTED',
      'Trình duyệt không hỗ trợ xác thực sinh trắc học WebAuthn.'
    );
  }

  const matchingCreds = getBiometricCredentials(
    params.employee.id,
    support.hostname
  ).filter((c) => c.employee_id === params.employee.id || c.employee_code === params.employee.employee_code);

  let byCodeIfEmpty =
    matchingCreds.length > 0
      ? matchingCreds
      : getBiometricCredentials(params.employee.employee_code, support.hostname);

  const clientHints = await collectClientNetworkHints(true);
  const policySnapshot = getWifiAttendancePolicy();

  if (byCodeIfEmpty.length === 0) {
    try {
      const statusRes = await fetch('/api/hrm/attendance/biometric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'network_status',
          employeeId: params.employee.id,
          rpId: support.hostname,
          clientHints,
          policySnapshot,
        }),
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const serverCreds = Array.isArray(statusData?.credentials)
          ? (statusData.credentials as BiometricCredentialRecord[])
          : [];
        const matchedServerCreds = serverCreds.filter(
          (c) =>
            c.rp_id === support.hostname &&
            (c.employee_id === params.employee.id ||
              c.employee_code === params.employee.employee_code)
        );
        for (const sc of matchedServerCreds) {
          saveBiometricCredential(sc);
        }
        if (matchedServerCreds.length > 0) {
          byCodeIfEmpty = matchedServerCreds;
        }
      }
    } catch {
      // Ignore network fallback error and fall through to enrollment prompt
    }
  }

  if (byCodeIfEmpty.length === 0) {
    throw new BiometricFlowError(
      'NO_CREDENTIAL_ON_DEVICE',
      `Thiết bị (${support.suggestedDeviceLabel}) trên tên miền ${support.hostname} chưa đăng ký vân tay cho ${params.employee.full_name}.`
    );
  }

  const chRes = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'issue_challenge',
      purpose: 'punch',
      employeeId: params.employee.id,
      employeeCode: params.employee.employee_code,
      employeeName: params.employee.full_name,
      actorRole: params.employee.role_code,
      rpId: support.hostname,
      clientHints,
      policySnapshot,
    }),
  });
  const chData = await chRes.json();
  if (!chRes.ok || !chData?.success) {
    throw new BiometricFlowError(
      chData?.code === 'CELLULAR_BLOCKED' ? 'CELLULAR_BLOCKED' : 'WIFI_MISMATCH',
      chData?.error || 'Không chung mạng WiFi với hệ thống văn phòng.',
      chData?.wifi
    );
  }

  let assertion: Credential | null = null;
  try {
    const publicKey: PublicKeyCredentialRequestOptions & {
      hints?: string[];
    } = {
      challenge: base64UrlToUint8Array(chData.challenge),
      rpId: chData.rpId || support.hostname,
      allowCredentials: byCodeIfEmpty.map((cred) => ({
        type: 'public-key',
        id: base64UrlToUint8Array(cred.credential_id),
        transports: ['internal'],
      })),
      userVerification: 'required',
      hints: ['client-device'],
      timeout: 60000,
    };
    assertion = await navigator.credentials.get({
      publicKey,
    });
  } catch (err) {
    const errName = err instanceof Error ? err.name : '';
    if (errName === 'NotAllowedError' || errName === 'AbortError') {
      throw new BiometricFlowError(
        'USER_CANCELLED',
        'Bạn đã hủy quét vân tay hoặc cảm biến sinh trắc học không nhận diện được.'
      );
    }
    throw new BiometricFlowError(
      'VERIFICATION_FAILED',
      err instanceof Error ? err.message : 'Lỗi đọc cảm biến vân tay thiết bị.'
    );
  }

  if (!assertion || assertion.type !== 'public-key') {
    throw new BiometricFlowError(
      'VERIFICATION_FAILED',
      'Không nhận được chữ ký xác thực vân tay từ thiết bị.'
    );
  }

  const pkAssertion = assertion as PublicKeyCredential;
  const authResp = pkAssertion.response as AuthenticatorAssertionResponse;
  const usedCredential = byCodeIfEmpty.find(
    (c) => c.credential_id === pkAssertion.id
  ) ?? byCodeIfEmpty[0];

  const verifyRes = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'verify_punch',
      challengeId: chData.challengeId,
      credentialId: pkAssertion.id,
      clientDataJSON: bufferToBase64Url(authResp.clientDataJSON),
      authenticatorData: bufferToBase64Url(authResp.authenticatorData),
      signature: bufferToBase64Url(authResp.signature),
      employeeId: params.employee.id,
      employeeCode: params.employee.employee_code,
      employeeName: params.employee.full_name,
      actorRole: params.employee.role_code,
      rpId: chData.rpId || support.hostname,
      credentialSnapshot: usedCredential,
      clientHints,
      policySnapshot,
    }),
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData?.success) {
    throw new BiometricFlowError(
      verifyData?.code === 'CELLULAR_BLOCKED'
        ? 'CELLULAR_BLOCKED'
        : verifyData?.code === 'WIFI_MISMATCH'
          ? 'WIFI_MISMATCH'
          : 'VERIFICATION_FAILED',
      verifyData?.error || 'Xác thực chữ ký vân tay & mạng WiFi thất bại.',
      verifyData?.wifi
    );
  }

  const updatedCred = verifyData.credential as BiometricCredentialRecord;
  const verifiedWifi = verifyData.wifi as WifiVerificationResult;
  saveBiometricCredential(updatedCred);

  const savedAttendance = checkInOutToday({
    employeeId: params.employee.id,
    date: params.date,
    action: params.action,
    timeHHmm: params.timeHHmm,
    checkInTimeOverride: params.checkInTimeOverride,
    note: params.note,
    source: 'BIOMETRIC_FINGERPRINT',
    authMethod: 'WEBAUTHN_FINGERPRINT',
    biometricDeviceLabel: updatedCred.device_label,
    verifiedNetworkIp: verifiedWifi.verifiedIp,
    wifiMatchMode:
      verifiedWifi.mode === 'CELLULAR_BLOCKED' ||
      verifiedWifi.mode === 'WIFI_MISMATCH'
        ? undefined
        : verifiedWifi.mode,
  });

  return {
    record: savedAttendance,
    credential: updatedCred,
    wifi: verifiedWifi,
  };
}

export async function removeDeviceBiometricEverywhere(
  idOrCredId: string,
  actorName?: string
): Promise<void> {
  removeBiometricCredential(idOrCredId, actorName);
  try {
    await fetch('/api/hrm/attendance/biometric', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_credential',
        id: idOrCredId,
      }),
    });
  } catch {
    // ignore background sync error
  }
}

export async function syncWifiPolicyEverywhere(params: {
  patch: Partial<WifiAttendancePolicy>;
  actorName: string;
  actorRole: RoleCode;
}): Promise<WifiAttendancePolicy> {
  const saved = saveWifiAttendancePolicy(params.patch, params.actorName);
  try {
    await fetch('/api/hrm/attendance/biometric', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_wifi_policy',
        actorName: params.actorName,
        actorRole: params.actorRole,
        policy: saved,
      }),
    });
  } catch {
    // ignore background sync error
  }
  return saved;
}
