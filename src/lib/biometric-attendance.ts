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
  FaceBiometricProfileDto,
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
  faceProfiles?: FaceBiometricProfileDto[];
}> {
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  const clientHints = await collectClientNetworkHints(true);
  const policySnapshot = getWifiAttendancePolicy();

  const res = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    credentials: 'same-origin',
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
    faceProfiles: Array.isArray(data.faceProfiles)
      ? (data.faceProfiles as FaceBiometricProfileDto[])
      : [],
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

// ---------------------------------------------------------------------------
// Camera Face / Iris Liveness 1:1 Client Helpers (Additive — Post Line 691)
// ---------------------------------------------------------------------------

export class FaceBiometricFlowError extends Error {
  code: string;
  status?: number;
  wifi?: WifiVerificationResult;
  similarity?: number;

  constructor(
    code: string,
    message: string,
    options?: {
      status?: number;
      wifi?: WifiVerificationResult;
      similarity?: number;
    }
  ) {
    super(message);
    this.name = 'FaceBiometricFlowError';
    this.code = code;
    this.status = options?.status;
    this.wifi = options?.wifi;
    this.similarity = options?.similarity;
  }
}

export type FaceScanModality = 'full_face' | 'periocular';
export type FaceCoverStatus = 'none' | 'mask' | 'full_cover';

export interface RegisterFaceBiometricInput {
  employee: Employee;
  role?: RoleCode;
  embedding?: number[];
  liveness: number;
  antispoof: number;
  blinkCount: number;
  deviceLabel?: string;
  scanModality?: FaceScanModality;
  periocularFrameB64?: string;
  periocularAuxFrameB64?: string;
  upgradePeriocular?: boolean;
  replaceExisting?: boolean;
}

export interface VerifyFaceBiometricPunchInput {
  employee: Employee;
  role?: RoleCode;
  embedding?: number[];
  liveness: number;
  antispoof: number;
  blinkCount: number;
  scanModality?: FaceScanModality;
  periocularFrameB64?: string;
  periocularAuxFrameB64?: string;
}

export async function checkFaceMaskStatus(frameB64: string): Promise<{
  ok: boolean;
  online: boolean;
  faceCover: FaceCoverStatus;
  maskScore: number;
  eyeLandmarks?: { left: [number, number]; right: [number, number] };
  code?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/hrm/attendance/biometric', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'face_mask_check',
        frameB64,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      const code = String(data?.code || 'MASK_CHECK_FAILED');
      const online = res.status !== 503 && code !== 'PERIOCULAR_SERVICE_UNAVAILABLE';
      return {
        ok: false,
        online,
        faceCover: 'none',
        maskScore: 0,
        code,
        error: typeof data?.error === 'string' ? data.error : undefined,
      };
    }
    const rawCover = String(data.faceCover || 'none').trim();
    const faceCover: FaceCoverStatus =
      rawCover === 'mask' || rawCover === 'full_cover' ? rawCover : 'none';
    const maskScore =
      typeof data.maskScore === 'number' && Number.isFinite(data.maskScore)
        ? data.maskScore
        : 0;
    return {
      ok: true,
      online: true,
      faceCover,
      maskScore,
      eyeLandmarks:
        data.eyeLandmarks &&
        typeof data.eyeLandmarks === 'object' &&
        Array.isArray(data.eyeLandmarks.left) &&
        Array.isArray(data.eyeLandmarks.right)
          ? {
              left: [Number(data.eyeLandmarks.left[0]), Number(data.eyeLandmarks.left[1])],
              right: [Number(data.eyeLandmarks.right[0]), Number(data.eyeLandmarks.right[1])],
            }
          : undefined,
    };
  } catch {
    return {
      ok: false,
      online: false,
      faceCover: 'none',
      maskScore: 0,
      code: 'PERIOCULAR_SERVICE_UNAVAILABLE',
    };
  }
}

export async function fetchPeriocularEngineStatus(
  employeeId?: string
): Promise<{ online: boolean; hasPeriocularTemplate: boolean }> {
  try {
    const qs = employeeId ? `?employee_id=${encodeURIComponent(employeeId)}` : '';
    const res = await fetch(`/api/hrm/attendance/biometric${qs}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      return { online: false, hasPeriocularTemplate: false };
    }
    const online = Boolean(data?.periocularEngine?.online);
    const profiles = Array.isArray(data?.faceProfiles)
      ? (data.faceProfiles as FaceBiometricProfileDto[])
      : [];
    const targetProfile = employeeId
      ? profiles.find(
          (p) =>
            p.employee_id === employeeId ||
            p.employee_code.toUpperCase() === employeeId.toUpperCase()
        )
      : profiles[0];
    const hasPeriocularTemplate = Boolean(
      targetProfile
        ? targetProfile.has_periocular_template
        : profiles.some((p) => Boolean(p?.has_periocular_template))
    );
    return { online, hasPeriocularTemplate };
  } catch {
    return { online: false, hasPeriocularTemplate: false };
  }
}

export async function fetchFaceBiometricProfiles(
  employeeId?: string
): Promise<FaceBiometricProfileDto[]> {
  const qs = employeeId ? `?employee_id=${encodeURIComponent(employeeId)}` : '';
  const res = await fetch(`/api/hrm/attendance/biometric${qs}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new FaceBiometricFlowError(
      String(data?.code || 'FETCH_FAILED'),
      String(data?.error || 'Không tải được danh sách hồ sơ khuôn mặt/mống mắt.'),
      { status: res.status }
    );
  }
  return Array.isArray(data.faceProfiles)
    ? (data.faceProfiles as FaceBiometricProfileDto[])
    : [];
}

const DEMO_ROLE_EMAIL_PREFIXES: Partial<Record<RoleCode, string>> = {
  SUPER_ADMIN: 'an.nguyen@',
  DIRECTOR: 'viet.tran@',
  HR_MANAGER: 'ngoc.tran@',
  DEPT_MANAGER: 'nam.le@',
  EMPLOYEE: 'tuan.pham@',
};

async function trySyncStaleDemoSessionCookie(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const rawRole = (window.localStorage.getItem('lacviet_hrm_role') || '').trim() as RoleCode;
    const rawEmail = (window.localStorage.getItem('lacviet_hrm_email') || '')
      .trim()
      .toLowerCase();
    const expectedPrefix = DEMO_ROLE_EMAIL_PREFIXES[rawRole];
    if (!expectedPrefix || !rawEmail.startsWith(expectedPrefix)) {
      return false;
    }
    const syncRes = await fetch('/api/hrm/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'demo_switch', role: rawRole }),
    });
    if (!syncRes.ok) return false;
    const syncData = await syncRes.json();
    if (!syncData?.success) return false;
    window.dispatchEvent(new Event('hrm-session-synced'));
    return true;
  } catch {
    return false;
  }
}

async function issueFaceBiometricChallenge(params: {
  purpose: 'register' | 'punch';
  employee: Employee;
  actorRole: RoleCode;
  hostname: string;
  clientHints: Awaited<ReturnType<typeof collectClientNetworkHints>>;
  policySnapshot: WifiAttendancePolicy;
}): Promise<{ challengeId: string; challenge: string; rpId?: string }> {
  const sendChallengeRequest = async () => {
    const res = await fetch('/api/hrm/attendance/biometric', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'face_issue_challenge',
        purpose: params.purpose,
        employeeId: params.employee.id,
        employeeCode: params.employee.employee_code,
        employeeName: params.employee.full_name,
        actorRole: params.actorRole,
        rpId: params.hostname,
        clientHints: params.clientHints,
        policySnapshot: params.policySnapshot,
      }),
    });
    const data = await res.json();
    return { res, data };
  };

  let { res: chRes, data: chData } = await sendChallengeRequest();
  if ((chRes.status === 401 || chRes.status === 403) && (await trySyncStaleDemoSessionCookie())) {
    ({ res: chRes, data: chData } = await sendChallengeRequest());
  }

  if (!chRes.ok || !chData?.success || !chData?.challengeId || !chData?.challenge) {
    const fallbackMsg =
      params.purpose === 'register'
        ? 'Không thể khởi tạo phiên đăng ký khuôn mặt.'
        : 'Không thể khởi tạo phiên chấm công khuôn mặt.';
    throw new FaceBiometricFlowError(
      String(chData?.code || (chRes.status === 403 ? 'FORBIDDEN' : 'CHALLENGE_FAILED')),
      String(chData?.error || fallbackMsg),
      { status: chRes.status, wifi: chData?.wifi }
    );
  }

  return {
    challengeId: String(chData.challengeId),
    challenge: String(chData.challenge),
    rpId: typeof chData.rpId === 'string' ? chData.rpId : undefined,
  };
}

export async function registerFaceBiometricProfile(
  params: RegisterFaceBiometricInput
): Promise<{
  profile: FaceBiometricProfileDto;
  faceProfiles: FaceBiometricProfileDto[];
  wifi: WifiVerificationResult;
}> {
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  const clientHints = await collectClientNetworkHints(true);
  const policySnapshot = getWifiAttendancePolicy();
  const actorRole = params.role ?? params.employee.role_code;

  const chData = await issueFaceBiometricChallenge({
    purpose: 'register',
    employee: params.employee,
    actorRole,
    hostname,
    clientHints,
    policySnapshot,
  });

  const regRes = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'face_register',
      challengeId: chData.challengeId,
      challenge: chData.challenge,
      employeeId: params.employee.id,
      employeeCode: params.employee.employee_code,
      fullName: params.employee.full_name,
      employeeName: params.employee.full_name,
      actorRole,
      deviceLabel: params.deviceLabel?.trim() || 'Camera Khuôn mặt',
      embedding: params.embedding,
      liveness: params.liveness,
      antispoof: params.antispoof,
      blinkCount: params.blinkCount,
      scanModality: params.scanModality,
      periocularFrameB64: params.periocularFrameB64,
      periocularAuxFrameB64: params.periocularAuxFrameB64,
      upgradePeriocular: params.upgradePeriocular,
      replaceExisting: params.replaceExisting,
      rpId: chData.rpId || hostname,
      clientHints,
      policySnapshot,
    }),
  });
  const regData = await regRes.json();
  if (!regRes.ok || !regData?.success || !regData?.profile) {
    throw new FaceBiometricFlowError(
      String(regData?.code || 'REGISTER_FAILED'),
      String(regData?.error || 'Đăng ký mẫu khuôn mặt thất bại.'),
      { status: regRes.status, wifi: regData?.wifi }
    );
  }

  return {
    profile: regData.profile as FaceBiometricProfileDto,
    faceProfiles: Array.isArray(regData.faceProfiles)
      ? (regData.faceProfiles as FaceBiometricProfileDto[])
      : [],
    wifi: regData.wifi as WifiVerificationResult,
  };
}

export async function verifyFaceBiometricPunch(
  params: VerifyFaceBiometricPunchInput
): Promise<{
  profile: FaceBiometricProfileDto;
  similarity: number;
  liveness: number;
  antispoof: number;
  blinkCount: number;
  wifi: WifiVerificationResult;
  verifiedAt: string;
  scanModality?: FaceScanModality;
  detectionMode?: string;
  faceCover?: FaceCoverStatus;
  maskScore?: number;
}> {
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
  const clientHints = await collectClientNetworkHints(true);
  const policySnapshot = getWifiAttendancePolicy();
  const actorRole = params.role ?? params.employee.role_code;

  const chData = await issueFaceBiometricChallenge({
    purpose: 'punch',
    employee: params.employee,
    actorRole,
    hostname,
    clientHints,
    policySnapshot,
  });

  const verifyRes = await fetch('/api/hrm/attendance/biometric', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'face_verify_punch',
      challengeId: chData.challengeId,
      challenge: chData.challenge,
      employeeId: params.employee.id,
      employeeCode: params.employee.employee_code,
      employeeName: params.employee.full_name,
      actorRole,
      embedding: params.embedding,
      liveness: params.liveness,
      antispoof: params.antispoof,
      blinkCount: params.blinkCount,
      scanModality: params.scanModality,
      periocularFrameB64: params.periocularFrameB64,
      periocularAuxFrameB64: params.periocularAuxFrameB64,
      rpId: chData.rpId || hostname,
      clientHints,
      policySnapshot,
    }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData?.success || !verifyData?.profile) {
    throw new FaceBiometricFlowError(
      String(verifyData?.code || 'VERIFICATION_FAILED'),
      String(verifyData?.error || 'Xác thực chấm công khuôn mặt thất bại.'),
      {
        status: verifyRes.status,
        wifi: verifyData?.wifi,
        similarity:
          typeof verifyData?.similarity === 'number' ? verifyData.similarity : undefined,
      }
    );
  }

  const rawCover = String(verifyData.faceCover || '').trim();
  const faceCover: FaceCoverStatus | undefined =
    rawCover === 'none' || rawCover === 'mask' || rawCover === 'full_cover'
      ? rawCover
      : undefined;

  return {
    profile: verifyData.profile as FaceBiometricProfileDto,
    similarity: Number(verifyData.similarity),
    liveness: Number(verifyData.liveness),
    antispoof: Number(verifyData.antispoof),
    blinkCount: Number(verifyData.blinkCount),
    wifi: verifyData.wifi as WifiVerificationResult,
    verifiedAt: String(verifyData.verifiedAt || new Date().toISOString()),
    scanModality:
      verifyData.scanModality === 'periocular' ? 'periocular' : 'full_face',
    detectionMode:
      typeof verifyData.detectionMode === 'string'
        ? verifyData.detectionMode
        : undefined,
    faceCover,
    maskScore:
      typeof verifyData.maskScore === 'number' && Number.isFinite(verifyData.maskScore)
        ? verifyData.maskScore
        : undefined,
  };
}

export async function deleteFaceBiometricProfile(params: {
  employee?: Pick<Employee, 'id' | 'employee_code' | 'full_name' | 'role_code'>;
  role?: RoleCode;
  profileId?: string;
  employeeId?: string;
}): Promise<{
  faceProfiles: FaceBiometricProfileDto[];
}> {
  const actorRole = params.role ?? params.employee?.role_code;
  const sendDeleteRequest = async () => {
    const res = await fetch('/api/hrm/attendance/biometric', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'face_delete_profile',
        profileId: params.profileId,
        employeeId: params.employeeId ?? params.employee?.id,
        actorRole,
        actorName: params.employee?.full_name,
        actorCode: params.employee?.employee_code,
      }),
    });
    const data = await res.json();
    return { res, data };
  };

  let { res, data } = await sendDeleteRequest();
  if ((res.status === 401 || res.status === 403) && (await trySyncStaleDemoSessionCookie())) {
    ({ res, data } = await sendDeleteRequest());
  }

  if (!res.ok || !data?.success) {
    throw new FaceBiometricFlowError(
      String(data?.code || 'DELETE_FAILED'),
      String(data?.error || 'Không thể gỡ hồ sơ khuôn mặt.'),
      { status: res.status }
    );
  }
  return {
    faceProfiles: Array.isArray(data.faceProfiles)
      ? (data.faceProfiles as FaceBiometricProfileDto[])
      : [],
  };
}
