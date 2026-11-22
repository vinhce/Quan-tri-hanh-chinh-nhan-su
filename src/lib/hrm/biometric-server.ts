import crypto from 'crypto';
import { execFileSync } from 'child_process';
import os from 'os';
import type {
  BiometricCredentialRecord,
  HostWifiHardwareInfo,
  WifiAttendancePolicy,
  WifiVerificationResult,
} from '@/mock/types';

export interface HostLanInterface {
  name: string;
  ip: string;
  netmask: string;
  cidr: string;
  isVirtual: boolean;
  isWifi: boolean;
  mac?: string;
}

export interface WebAuthnChallengeRecord {
  challengeId: string;
  challenge: string;
  employeeId: string;
  employeeCode: string;
  purpose: 'register' | 'punch';
  rpId: string;
  createdAt: number;
  expiresAt: number;
}

interface CachedPublicIp {
  publicIpv4: string | null;
  publicIpv6Prefix64: string | null;
  fetchedAt: number;
}

interface CachedWifiDetails {
  data: HostWifiHardwareInfo;
  fetchedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var _hrmBiometricChallenges: Map<string, WebAuthnChallengeRecord> | undefined;
  // eslint-disable-next-line no-var
  var _hrmPublicIpCache: CachedPublicIp | undefined;
  // eslint-disable-next-line no-var
  var _hrmWifiDetailsCache: CachedWifiDetails | undefined;
}

const CHALLENGE_TTL_MS = 120_000;
const PUBLIC_IP_CACHE_TTL_MS = 60_000;
const WIFI_DETAILS_CACHE_TTL_MS = 10_000;

export const DEFAULT_SERVER_WIFI_POLICY: WifiAttendancePolicy = {
  id: 'wifi-policy-default',
  wifi_ssid_label: 'WiFi Nội bộ (Cùng mạng Máy chủ)',
  enforce_same_wifi: true,
  require_biometric_for_punch: true,
  allowed_public_ips: [],
  allowed_lan_cidrs: [],
  updated_by: 'Hệ thống HRM',
  updated_at: '2026-11-22T00:00:00Z',
};

function getChallengeStore(): Map<string, WebAuthnChallengeRecord> {
  if (!globalThis._hrmBiometricChallenges) {
    globalThis._hrmBiometricChallenges = new Map<string, WebAuthnChallengeRecord>();
  }
  const now = Date.now();
  for (const [k, v] of Array.from(globalThis._hrmBiometricChallenges.entries())) {
    if (v.expiresAt <= now) {
      globalThis._hrmBiometricChallenges.delete(k);
    }
  }
  return globalThis._hrmBiometricChallenges;
}

export function base64UrlToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function bufferToBase64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

export function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (
    (((parts[0] << 24) >>> 0) +
      ((parts[1] << 16) >>> 0) +
      ((parts[2] << 8) >>> 0) +
      (parts[3] >>> 0)) >>>
    0
  );
}

export function intToIpv4(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

export function netmaskToPrefixLength(netmask: string): number {
  if (!isValidIpv4(netmask)) return 24;
  const maskInt = ipv4ToInt(netmask);
  let bits = 0;
  for (let i = 31; i >= 0; i -= 1) {
    if (((maskInt >>> i) & 1) === 1) {
      bits += 1;
    } else {
      break;
    }
  }
  return bits;
}

export function isLoopbackIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const clean = normalizeIpString(ip);
  return (
    clean === '::1' ||
    clean === 'localhost' ||
    clean.startsWith('127.')
  );
}

export function isPrivateRfc1918Ipv4(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const clean = normalizeIpString(ip);
  if (!isValidIpv4(clean)) return false;
  if (clean.startsWith('10.')) return true;
  if (clean.startsWith('192.168.')) return true;
  if (clean.startsWith('169.254.')) return true;
  const second = Number(clean.split('.')[1]);
  if (clean.startsWith('172.') && second >= 16 && second <= 31) return true;
  return false;
}

export function isPublicIpv4(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const clean = normalizeIpString(ip);
  if (!isValidIpv4(clean)) return false;
  if (isLoopbackIp(clean)) return false;
  if (isPrivateRfc1918Ipv4(clean)) return false;
  if (clean.startsWith('0.') || clean.startsWith('100.64.')) return false;
  return true;
}

export function normalizeIpString(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.split(',')[0].trim();
  if (s.startsWith('::ffff:')) {
    s = s.slice(7);
  }
  if (s.startsWith('[') && s.includes(']')) {
    s = s.slice(1, s.indexOf(']'));
  }
  const colonCount = (s.match(/:/g) || []).length;
  if (colonCount === 1 && s.includes('.')) {
    s = s.split(':')[0];
  }
  return s.trim();
}

export function isIpInNetmask(
  clientIp: string,
  ifaceIp: string,
  netmask: string
): boolean {
  if (!isValidIpv4(clientIp) || !isValidIpv4(ifaceIp) || !isValidIpv4(netmask)) {
    return false;
  }
  const maskInt = ipv4ToInt(netmask);
  return (ipv4ToInt(clientIp) & maskInt) === (ipv4ToInt(ifaceIp) & maskInt);
}

export function isIpInCidr(clientIp: string, cidr: string): boolean {
  const [netIp, prefixStr] = cidr.trim().split('/');
  if (!isValidIpv4(clientIp) || !isValidIpv4(netIp)) return false;
  const prefix = prefixStr ? Math.min(32, Math.max(0, Number(prefixStr))) : 32;
  if (!Number.isFinite(prefix)) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToInt(clientIp) & mask) === (ipv4ToInt(netIp) & mask);
}

export function getHostLanInterfaces(): HostLanInterface[] {
  const raw = os.networkInterfaces();
  const list: HostLanInterface[] = [];
  const virtualPattern = /vethernet|wsl|hyper-v|docker|vmware|virtualbox|vbox|tailscale|zerotier|loopback|isatap|teredo/i;
  const wifiPattern = /wi-?fi|wlan|wireless|802\.11/i;

  for (const [name, addrs] of Object.entries(raw)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal) continue;
      const isV4 = addr.family === 'IPv4' || (addr.family as unknown) === 4;
      if (!isV4 || !isValidIpv4(addr.address)) continue;
      if (addr.address.startsWith('127.') || addr.address.startsWith('169.254.')) continue;

      const netmask = isValidIpv4(addr.netmask || '') ? addr.netmask : '255.255.255.0';
      const prefix = netmaskToPrefixLength(netmask);
      const maskInt = ipv4ToInt(netmask);
      const netIp = intToIpv4((ipv4ToInt(addr.address) & maskInt) >>> 0);
      const isVirtual = virtualPattern.test(name);
      const isWifi = wifiPattern.test(name);
      const mac =
        typeof addr.mac === 'string' && addr.mac !== '00:00:00:00:00:00'
          ? addr.mac.toUpperCase()
          : undefined;

      list.push({
        name,
        ip: addr.address,
        netmask,
        cidr: `${netIp}/${prefix}`,
        isVirtual,
        isWifi,
        mac,
      });
    }
  }

  return list.sort((a, b) => {
    const scoreA = (a.isVirtual ? 10 : 0) + (a.isWifi ? 0 : 2);
    const scoreB = (b.isVirtual ? 10 : 0) + (b.isWifi ? 0 : 2);
    return scoreA - scoreB;
  });
}

async function fetchTextWithTimeout(url: string, timeoutMs = 3000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getHostPublicIpInfo(
  forceRefresh = false
): Promise<{ publicIpv4: string | null; publicIpv6Prefix64: string | null }> {
  const cached = globalThis._hrmPublicIpCache;
  if (
    !forceRefresh &&
    cached &&
    cached.publicIpv4 &&
    Date.now() - cached.fetchedAt < PUBLIC_IP_CACHE_TTL_MS
  ) {
    return {
      publicIpv4: cached.publicIpv4,
      publicIpv6Prefix64: cached.publicIpv6Prefix64,
    };
  }

  let publicIpv4: string | null = null;
  const jsonText = await fetchTextWithTimeout('https://api.ipify.org?format=json', 3000);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { ip?: string };
      if (parsed.ip && isPublicIpv4(parsed.ip)) {
        publicIpv4 = normalizeIpString(parsed.ip);
      }
    } catch {
      // fallback below
    }
  }

  if (!publicIpv4) {
    const fallbackText = await fetchTextWithTimeout('https://ipv4.icanhazip.com', 3000);
    if (fallbackText && isPublicIpv4(fallbackText)) {
      publicIpv4 = normalizeIpString(fallbackText);
    }
  }

  let publicIpv6Prefix64: string | null = null;
  const v6Text = await fetchTextWithTimeout('https://api64.ipify.org?format=json', 2000);
  if (v6Text) {
    try {
      const parsed = JSON.parse(v6Text) as { ip?: string };
      if (parsed.ip && parsed.ip.includes(':')) {
        publicIpv6Prefix64 = parsed.ip.split(':').slice(0, 4).join(':');
      }
    } catch {
      // ignore IPv6 probe failure
    }
  }

  globalThis._hrmPublicIpCache = {
    publicIpv4,
    publicIpv6Prefix64,
    fetchedAt: Date.now(),
  };

  return { publicIpv4, publicIpv6Prefix64 };
}

function deriveWifiBandFromChannel(channel: number | null): string | null {
  if (channel === null || !Number.isFinite(channel)) return null;
  if (channel >= 1 && channel <= 14) return '2.4 GHz';
  if (channel >= 32 && channel <= 177) return '5 GHz';
  if (channel > 177) return '6 GHz';
  return null;
}

export function parseNetshWlanInterfacesOutput(
  stdout: string
): Partial<HostWifiHardwareInfo> {
  if (!stdout || !stdout.trim()) return {};

  const blocks: Array<Partial<HostWifiHardwareInfo>> = [];
  let current: Partial<HostWifiHardwareInfo> | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === 'name' || key === 'tên') {
      if (current) blocks.push(current);
      current = { interfaceName: val || null };
      continue;
    }

    if (!current) continue;

    if (key === 'description' || key === 'mô tả') {
      current.adapterDescription = val || null;
    } else if (key === 'physical address' || key === 'địa chỉ vật lý') {
      current.macAddress = val ? val.toUpperCase() : null;
    } else if (key === 'state' || key === 'trạng thái') {
      current.connected =
        /connected|kết nối/i.test(val) && !/disconnected|ngắt/i.test(val);
    } else if (key === 'ssid') {
      current.ssid = val || null;
    } else if (key === 'bssid' || key === 'ap bssid') {
      current.bssid = val ? val.toUpperCase() : null;
    } else if (key === 'network type' || key === 'loại mạng') {
      current.networkType = val || null;
    } else if (key === 'radio type' || key === 'loại sóng radio') {
      current.radioType = val || null;
    } else if (key === 'band' || key === 'băng tần') {
      current.band = val || null;
    } else if (key === 'channel' || key === 'kênh') {
      const ch = parseInt(val, 10);
      current.channel = Number.isFinite(ch) ? ch : null;
    } else if (key === 'authentication' || key === 'xác thực') {
      current.authentication = val || null;
    } else if (key === 'cipher' || key === 'mã hóa') {
      current.cipher = val || null;
    } else if (key.startsWith('receive rate')) {
      const rx = parseFloat(val);
      current.rxRateMbps = Number.isFinite(rx) ? rx : null;
    } else if (key.startsWith('transmit rate')) {
      const tx = parseFloat(val);
      current.txRateMbps = Number.isFinite(tx) ? tx : null;
    } else if (key === 'signal' || key === 'tín hiệu') {
      const sig = parseInt(val.replace('%', '').trim(), 10);
      current.signalPercent = Number.isFinite(sig)
        ? Math.min(100, Math.max(0, sig))
        : null;
    }
  }

  if (current) blocks.push(current);
  if (blocks.length === 0) return {};

  const chosen = blocks.find((b) => b.connected) ?? blocks[0];
  if (!chosen.band && chosen.channel != null) {
    chosen.band = deriveWifiBandFromChannel(chosen.channel);
  }
  return chosen;
}

export function parseNetshIpv4ConfigOutput(stdout: string): {
  dhcpEnabled: boolean | null;
  defaultGateway: string | null;
  dnsServers: string[];
} {
  let dhcpEnabled: boolean | null = null;
  let defaultGateway: string | null = null;
  const dnsSet = new Set<string>();
  let section: 'none' | 'gateway' | 'dns' = 'none';

  for (const rawLine of stdout.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (key.includes('dhcp enabled')) {
        dhcpEnabled = /yes|có|true/i.test(val);
        section = 'none';
      } else if (key.includes('default gateway')) {
        section = 'gateway';
        const candidate = val.split(/\s+/)[0] || '';
        if (isValidIpv4(candidate) && !defaultGateway) {
          defaultGateway = candidate;
        }
      } else if (key.includes('dns servers')) {
        section = 'dns';
        for (const tok of val.split(/[\s,]+/)) {
          if (isValidIpv4(tok)) dnsSet.add(tok);
        }
      } else {
        section = 'none';
      }
      continue;
    }

    if (section === 'dns') {
      for (const tok of trimmed.split(/[\s,]+/)) {
        if (isValidIpv4(tok)) dnsSet.add(tok);
      }
    } else if (section === 'gateway' && !defaultGateway) {
      const candidate = trimmed.split(/\s+/)[0] || '';
      if (isValidIpv4(candidate)) {
        defaultGateway = candidate;
      }
    }
  }

  return {
    dhcpEnabled,
    defaultGateway,
    dnsServers: Array.from(dnsSet),
  };
}

export function getHostWifiDetails(params?: {
  hostLanInterfaces?: HostLanInterface[];
  publicIpv4?: string | null;
  publicIpv6Prefix64?: string | null;
  forceRefresh?: boolean;
}): HostWifiHardwareInfo {
  const cached = globalThis._hrmWifiDetailsCache;
  if (
    !params?.forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < WIFI_DETAILS_CACHE_TTL_MS
  ) {
    return {
      ...cached.data,
      publicIpv4:
        params?.publicIpv4 !== undefined
          ? params.publicIpv4
          : cached.data.publicIpv4,
      publicIpv6Prefix64:
        params?.publicIpv6Prefix64 !== undefined
          ? params.publicIpv6Prefix64
          : cached.data.publicIpv6Prefix64,
    };
  }

  let parsedWlan: Partial<HostWifiHardwareInfo> = {};
  if (process.platform === 'win32') {
    try {
      const wlanOut = execFileSync('netsh', ['wlan', 'show', 'interfaces'], {
        encoding: 'utf8',
        timeout: 2500,
        windowsHide: true,
      });
      parsedWlan = parseNetshWlanInterfacesOutput(wlanOut);
    } catch {
      // Ignore if host has no WLAN service / adapter
    }
  }

  const lanList = params?.hostLanInterfaces ?? getHostLanInterfaces();
  const wlanNameLower = parsedWlan.interfaceName?.toLowerCase();
  const matchedLan =
    (wlanNameLower
      ? lanList.find(
          (i) => !i.isVirtual && i.name.toLowerCase() === wlanNameLower
        ) || lanList.find((i) => i.name.toLowerCase() === wlanNameLower)
      : undefined) ||
    lanList.find((i) => !i.isVirtual && i.isWifi) ||
    lanList.find((i) => !i.isVirtual) ||
    lanList[0];

  const targetIfaceName = parsedWlan.interfaceName || matchedLan?.name || null;
  let ipv4Cfg: {
    dhcpEnabled: boolean | null;
    defaultGateway: string | null;
    dnsServers: string[];
  } = {
    dhcpEnabled: null,
    defaultGateway: null,
    dnsServers: [],
  };

  if (
    process.platform === 'win32' &&
    targetIfaceName &&
    /^[a-zA-Z0-9 _().-]+$/.test(targetIfaceName)
  ) {
    try {
      const cfgOut = execFileSync(
        'netsh',
        ['interface', 'ipv4', 'show', 'config', `name=${targetIfaceName}`],
        {
          encoding: 'utf8',
          timeout: 2000,
          windowsHide: true,
        }
      );
      ipv4Cfg = parseNetshIpv4ConfigOutput(cfgOut);
    } catch {
      // Ignore if netsh IPv4 probe fails
    }
  }

  const details: HostWifiHardwareInfo = {
    connected: Boolean(parsedWlan.connected || matchedLan?.ip),
    interfaceName: targetIfaceName,
    adapterDescription: parsedWlan.adapterDescription ?? null,
    macAddress: parsedWlan.macAddress || matchedLan?.mac || null,
    ssid: parsedWlan.ssid ?? null,
    bssid: parsedWlan.bssid ?? null,
    networkType: parsedWlan.networkType ?? null,
    radioType: parsedWlan.radioType ?? null,
    band: parsedWlan.band ?? deriveWifiBandFromChannel(parsedWlan.channel ?? null),
    channel: parsedWlan.channel ?? null,
    authentication: parsedWlan.authentication ?? null,
    cipher: parsedWlan.cipher ?? null,
    signalPercent: parsedWlan.signalPercent ?? null,
    rxRateMbps: parsedWlan.rxRateMbps ?? null,
    txRateMbps: parsedWlan.txRateMbps ?? null,
    ipv4Address: matchedLan?.ip ?? null,
    subnetMask: matchedLan?.netmask ?? null,
    cidr: matchedLan?.cidr ?? null,
    defaultGateway: ipv4Cfg.defaultGateway,
    dnsServers: ipv4Cfg.dnsServers,
    dhcpEnabled: ipv4Cfg.dhcpEnabled,
    publicIpv4: params?.publicIpv4 ?? null,
    publicIpv6Prefix64: params?.publicIpv6Prefix64 ?? null,
    probedAt: new Date().toISOString(),
  };

  globalThis._hrmWifiDetailsCache = {
    data: details,
    fetchedAt: Date.now(),
  };

  return details;
}

export function extractHostnameFromHeaders(
  hostHeader: string | null | undefined,
  originHeader: string | null | undefined
): string {
  if (originHeader) {
    try {
      return new URL(originHeader).hostname.toLowerCase();
    } catch {
      // fallback to hostHeader
    }
  }
  if (!hostHeader) return '';
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const endIdx = trimmed.indexOf(']');
    return endIdx > 0 ? trimmed.slice(1, endIdx) : trimmed;
  }
  return trimmed.split(':')[0];
}

export function extractForwardedClientIp(headers: {
  cfConnectingIp?: string | null;
  xRealIp?: string | null;
  xForwardedFor?: string | null;
}): string | null {
  const candidates = [
    headers.cfConnectingIp,
    headers.xRealIp,
    ...(headers.xForwardedFor ? headers.xForwardedFor.split(',') : []),
  ];
  for (const raw of candidates) {
    const clean = normalizeIpString(raw);
    if (clean && !isLoopbackIp(clean)) {
      return clean;
    }
  }
  return null;
}

export function evaluateSameWifiGate(params: {
  hostHeader?: string | null;
  originHeader?: string | null;
  forwardedIp?: string | null;
  clientHints?: {
    connectionType?: string | null;
    effectiveType?: string | null;
    publicIpv4?: string | null;
    publicIpv6Prefix64?: string | null;
  };
  hostLanInterfaces: HostLanInterface[];
  hostPublicIpv4: string | null;
  hostPublicIpv6Prefix64?: string | null;
  policy?: WifiAttendancePolicy;
}): WifiVerificationResult {
  const policy = params.policy ?? DEFAULT_SERVER_WIFI_POLICY;
  const physicalLan = params.hostLanInterfaces.filter((i) => !i.isVirtual);
  const effectiveLanList = physicalLan.length > 0 ? physicalLan : params.hostLanInterfaces;
  const hostLanIps = effectiveLanList.map((i) => i.ip);

  const hostname = extractHostnameFromHeaders(params.hostHeader, params.originHeader);
  const isLocalHostDomain =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isPrivateLanDomain = isPrivateRfc1918Ipv4(hostname);
  const forwardedClean = normalizeIpString(params.forwardedIp);
  const clientProbePublic = normalizeIpString(params.clientHints?.publicIpv4);

  const isRemoteTunnel =
    Boolean(hostname) && !isLocalHostDomain && !isPrivateLanDomain;

  const observedIp =
    (forwardedClean && !isLoopbackIp(forwardedClean) ? forwardedClean : '') ||
    (isPublicIpv4(clientProbePublic) ? clientProbePublic : '') ||
    (isPrivateLanDomain ? hostname : '') ||
    hostLanIps[0] ||
    null;

  if (!policy.enforce_same_wifi) {
    return {
      allowed: true,
      mode: 'POLICY_DISABLED',
      reason: 'Chính sách bắt buộc chung mạng WiFi đang được Quản trị viên tắt.',
      verifiedIp: observedIp || 'policy-off',
      hostPublicIpv4: params.hostPublicIpv4,
      hostLanIps,
      clientObservedIp: observedIp,
      isRemoteTunnel,
      policy,
    };
  }

  if (params.clientHints?.connectionType?.toLowerCase() === 'cellular') {
    return {
      allowed: false,
      code: 'CELLULAR_BLOCKED',
      mode: 'CELLULAR_BLOCKED',
      reason:
        'Phát hiện thiết bị đang dùng mạng di động 4G/5G (Cellular). Vui lòng tắt dữ liệu di động và kết nối đúng mạng WiFi nội bộ với máy chủ để chấm công.',
      verifiedIp: clientProbePublic || forwardedClean || 'cellular',
      hostPublicIpv4: params.hostPublicIpv4,
      hostLanIps,
      clientObservedIp: clientProbePublic || forwardedClean || 'cellular',
      isRemoteTunnel,
      policy,
    };
  }

  // Case A: Truy cập qua remote tunnel (DevTunnel, ngrok, cloud...)
  if (isRemoteTunnel) {
    const clientPublicIp = isPublicIpv4(forwardedClean)
      ? forwardedClean
      : isPublicIpv4(clientProbePublic)
        ? clientProbePublic
        : '';

    const whitelistMatched =
      Boolean(clientPublicIp) &&
      policy.allowed_public_ips.some(
        (ip) => normalizeIpString(ip) === clientPublicIp
      );
    if (whitelistMatched) {
      return {
        allowed: true,
        mode: 'ADMIN_WHITELIST',
        reason: `Xác thực chung mạng WiFi văn phòng thành công qua IP được phê duyệt (${clientPublicIp}).`,
        verifiedIp: clientPublicIp,
        hostPublicIpv4: params.hostPublicIpv4,
        hostLanIps,
        clientObservedIp: clientPublicIp,
        isRemoteTunnel: true,
        policy,
      };
    }

    if (
      clientPublicIp &&
      params.hostPublicIpv4 &&
      clientPublicIp === normalizeIpString(params.hostPublicIpv4)
    ) {
      return {
        allowed: true,
        mode: 'SAME_WIFI_NAT_IP',
        reason: `Xác thực chung mạng WiFi thành công (Điện thoại & Máy chủ dùng chung NAT Public IPv4: ${clientPublicIp}).`,
        verifiedIp: clientPublicIp,
        hostPublicIpv4: params.hostPublicIpv4,
        hostLanIps,
        clientObservedIp: clientPublicIp,
        isRemoteTunnel: true,
        policy,
      };
    }

    if (
      params.clientHints?.publicIpv6Prefix64 &&
      params.hostPublicIpv6Prefix64 &&
      params.clientHints.publicIpv6Prefix64 === params.hostPublicIpv6Prefix64
    ) {
      return {
        allowed: true,
        mode: 'SAME_WIFI_NAT_IP',
        reason: `Xác thực chung mạng WiFi thành công (trùng tiền tố IPv6 /64 của bộ phát WiFi).`,
        verifiedIp: params.clientHints.publicIpv6Prefix64,
        hostPublicIpv4: params.hostPublicIpv4,
        hostLanIps,
        clientObservedIp: params.clientHints.publicIpv6Prefix64,
        isRemoteTunnel: true,
        policy,
      };
    }

    return {
      allowed: false,
      code: 'WIFI_MISMATCH',
      mode: 'WIFI_MISMATCH',
      reason: clientPublicIp
        ? `Thiết bị đang truy cập từ mạng khác (${clientPublicIp}), không khớp mạng WiFi của máy chủ (${params.hostPublicIpv4 || policy.allowed_public_ips[0] || 'chưa xác định'}). Hãy chuyển sang đúng mạng WiFi nội bộ rồi thử lại.`
        : `Không xác minh được IP mạng WiFi của thiết bị qua kết nối từ xa (máy chủ đang ở WiFi IP ${params.hostPublicIpv4 || 'chưa rõ'}). Hãy tắt 4G/VPN, kết nối chung WiFi với Laptop rồi bấm Kiểm tra lại mạng.`,
      verifiedIp: clientPublicIp || 'unknown-remote',
      hostPublicIpv4: params.hostPublicIpv4,
      hostLanIps,
      clientObservedIp: clientPublicIp || null,
      isRemoteTunnel: true,
      policy,
    };
  }

  // Case B: Truy cập không qua remote tunnel (localhost hoặc IP LAN)
  if (isPublicIpv4(forwardedClean)) {
    const matchedPublic =
      forwardedClean === normalizeIpString(params.hostPublicIpv4) ||
      policy.allowed_public_ips.some(
        (ip) => normalizeIpString(ip) === forwardedClean
      );
    if (matchedPublic) {
      return {
        allowed: true,
        mode: 'SAME_WIFI_NAT_IP',
        reason: `Xác thực chung mạng WiFi thành công (${forwardedClean}).`,
        verifiedIp: forwardedClean,
        hostPublicIpv4: params.hostPublicIpv4,
        hostLanIps,
        clientObservedIp: forwardedClean,
        isRemoteTunnel: false,
        policy,
      };
    }
    return {
      allowed: false,
      code: 'WIFI_MISMATCH',
      mode: 'WIFI_MISMATCH',
      reason: `IP nguồn ${forwardedClean} không khớp mạng WiFi máy chủ (${params.hostPublicIpv4 || 'chưa xác định'}).`,
      verifiedIp: forwardedClean,
      hostPublicIpv4: params.hostPublicIpv4,
      hostLanIps,
      clientObservedIp: forwardedClean,
      isRemoteTunnel: false,
      policy,
    };
  }

  if (isPrivateRfc1918Ipv4(forwardedClean)) {
    const matchesLan =
      effectiveLanList.some((iface) =>
        isIpInNetmask(forwardedClean, iface.ip, iface.netmask)
      ) ||
      policy.allowed_lan_cidrs.some((cidr) => isIpInCidr(forwardedClean, cidr));

    if (matchesLan) {
      return {
        allowed: true,
        mode: 'SAME_LAN_SUBNET',
        reason: `Thiết bị nằm cùng dải mạng WiFi/LAN nội bộ (${forwardedClean}).`,
        verifiedIp: forwardedClean,
        hostPublicIpv4: params.hostPublicIpv4,
        hostLanIps,
        clientObservedIp: forwardedClean,
        isRemoteTunnel: false,
        policy,
      };
    }

    return {
      allowed: false,
      code: 'WIFI_MISMATCH',
      mode: 'WIFI_MISMATCH',
      reason: `IP nội bộ ${forwardedClean} nằm khác dải mạng WiFi với máy chủ (${effectiveLanList.map((i) => i.cidr).join(', ') || 'không có'}).`,
      verifiedIp: forwardedClean,
      hostPublicIpv4: params.hostPublicIpv4,
      hostLanIps,
      clientObservedIp: forwardedClean,
      isRemoteTunnel: false,
      policy,
    };
  }

  if (isPrivateLanDomain) {
    const matchesHostLan =
      effectiveLanList.some((iface) =>
        isIpInNetmask(hostname, iface.ip, iface.netmask)
      ) || policy.allowed_lan_cidrs.some((cidr) => isIpInCidr(hostname, cidr));
    if (matchesHostLan) {
      return {
        allowed: true,
        mode: 'SAME_LAN_SUBNET',
        reason: `Kết nối trực tiếp qua mạng WiFi/LAN nội bộ (${hostname}).`,
        verifiedIp: hostname,
        hostPublicIpv4: params.hostPublicIpv4,
        hostLanIps,
        clientObservedIp: hostname,
        isRemoteTunnel: false,
        policy,
      };
    }
    return {
      allowed: false,
      code: 'WIFI_MISMATCH',
      mode: 'WIFI_MISMATCH',
      reason: `Địa chỉ ${hostname} không nằm cùng dải WiFi/LAN máy chủ.`,
      verifiedIp: hostname,
      hostPublicIpv4: params.hostPublicIpv4,
      hostLanIps,
      clientObservedIp: hostname,
      isRemoteTunnel: false,
      policy,
    };
  }

  // Localhost trên Laptop: kiểm tra máy chủ đang có card WiFi/LAN hoặc mạng hoạt động
  if (effectiveLanList.length === 0 && !params.hostPublicIpv4) {
    return {
      allowed: false,
      code: 'WIFI_MISMATCH',
      mode: 'WIFI_MISMATCH',
      reason:
        'Máy chủ Laptop hiện chưa kết nối vào mạng WiFi hoặc LAN nào để đối chiếu.',
      verifiedIp: 'offline',
      hostPublicIpv4: null,
      hostLanIps: [],
      clientObservedIp: '127.0.0.1',
      isRemoteTunnel: false,
      policy,
    };
  }

  const primaryIp = effectiveLanList[0]?.ip || params.hostPublicIpv4 || '127.0.0.1';
  return {
    allowed: true,
    mode: 'HOST_LOCAL',
    reason: `Đang chấm công trực tiếp trên Laptop máy chủ (${effectiveLanList[0]?.name || 'WiFi'}: ${primaryIp}).`,
    verifiedIp: primaryIp,
    hostPublicIpv4: params.hostPublicIpv4,
    hostLanIps,
    clientObservedIp: primaryIp,
    isRemoteTunnel: false,
    policy,
  };
}

export function issueWebAuthnChallenge(params: {
  employeeId: string;
  employeeCode: string;
  purpose: 'register' | 'punch';
  rpId: string;
}): WebAuthnChallengeRecord {
  const challengeId = `chl-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const challenge = bufferToBase64Url(crypto.randomBytes(32));
  const now = Date.now();
  const record: WebAuthnChallengeRecord = {
    challengeId,
    challenge,
    employeeId: params.employeeId,
    employeeCode: params.employeeCode,
    purpose: params.purpose,
    rpId: params.rpId.toLowerCase(),
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  };
  getChallengeStore().set(challengeId, record);
  return record;
}

export function consumeWebAuthnChallenge(
  challengeId: string,
  purpose: 'register' | 'punch',
  rpId: string
): WebAuthnChallengeRecord | null {
  const store = getChallengeStore();
  const rec = store.get(challengeId);
  if (!rec) return null;
  store.delete(challengeId);
  if (rec.expiresAt <= Date.now()) return null;
  if (rec.purpose !== purpose) return null;
  if (rec.rpId !== rpId.toLowerCase()) return null;
  return rec;
}

export function parseAuthenticatorDataFlags(authData: Buffer): {
  rpIdHash: Buffer;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
} {
  if (authData.length < 37) {
    throw new Error('Dữ liệu authenticatorData WebAuthn không hợp lệ (< 37 bytes).');
  }
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const signCount = authData.readUInt32BE(33);
  return { rpIdHash, userPresent, userVerified, signCount };
}

export function verifyWebAuthnRegistration(params: {
  challengeId: string;
  rpId: string;
  clientDataJSON: string;
  publicKeySpki: string;
  publicKeyAlg?: number;
  authenticatorData?: string | null;
}):
  | { ok: true; challengeRecord: WebAuthnChallengeRecord; initialSignCount: number }
  | { ok: false; error: string } {
  const challengeRecord = consumeWebAuthnChallenge(
    params.challengeId,
    'register',
    params.rpId
  );
  if (!challengeRecord) {
    return {
      ok: false,
      error: 'Phiên đăng ký vân tay đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.',
    };
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(
      base64UrlToBuffer(params.clientDataJSON).toString('utf8')
    );
  } catch {
    return { ok: false, error: 'clientDataJSON đăng ký WebAuthn không hợp lệ.' };
  }

  if (clientData.type !== 'webauthn.create') {
    return { ok: false, error: 'Loại thao tác WebAuthn không phải đăng ký khóa mới.' };
  }
  if (clientData.challenge !== challengeRecord.challenge) {
    return { ok: false, error: 'Challenge đăng ký sinh trắc học không trùng khớp.' };
  }

  try {
    crypto.createPublicKey({
      key: Buffer.from(params.publicKeySpki, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return {
      ok: false,
      error: 'Public key SPKI từ cảm biến vân tay không hợp lệ.',
    };
  }

  let initialSignCount = 0;
  if (params.authenticatorData) {
    try {
      const authBuf = base64UrlToBuffer(params.authenticatorData);
      const parsed = parseAuthenticatorDataFlags(authBuf);
      initialSignCount = parsed.signCount;
      const expectedHash = crypto.createHash('sha256').update(params.rpId).digest();
      if (!parsed.rpIdHash.equals(expectedHash)) {
        return { ok: false, error: 'RP ID hash không khớp tên miền hiện tại.' };
      }
      if (!parsed.userPresent || !parsed.userVerified) {
        return {
          ok: false,
          error: 'Thiết bị chưa hoàn tất bước xác thực vân tay / khuôn mặt.',
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'AuthenticatorData không hợp lệ.',
      };
    }
  }

  return { ok: true, challengeRecord, initialSignCount };
}

export function verifyWebAuthnAssertion(params: {
  challengeId: string;
  rpId: string;
  credential: BiometricCredentialRecord;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}):
  | { ok: true; nextSignCount: number; challengeRecord: WebAuthnChallengeRecord }
  | { ok: false; error: string } {
  const challengeRecord = consumeWebAuthnChallenge(
    params.challengeId,
    'punch',
    params.rpId
  );
  if (!challengeRecord) {
    return {
      ok: false,
      error: 'Phiên thử thách vân tay đã hết hạn hoặc đã được sử dụng. Vui lòng quét lại.',
    };
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  let clientDataBuf: Buffer;
  try {
    clientDataBuf = base64UrlToBuffer(params.clientDataJSON);
    clientData = JSON.parse(clientDataBuf.toString('utf8'));
  } catch {
    return { ok: false, error: 'clientDataJSON xác thực vân tay không hợp lệ.' };
  }

  if (clientData.type !== 'webauthn.get') {
    return { ok: false, error: 'Loại thao tác WebAuthn không phải xác thực chấm công.' };
  }
  if (clientData.challenge !== challengeRecord.challenge) {
    return { ok: false, error: 'Challenge xác thực vân tay không khớp.' };
  }

  let authDataBuf: Buffer;
  let parsedFlags: ReturnType<typeof parseAuthenticatorDataFlags>;
  try {
    authDataBuf = base64UrlToBuffer(params.authenticatorData);
    parsedFlags = parseAuthenticatorDataFlags(authDataBuf);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'authenticatorData không hợp lệ.',
    };
  }

  const expectedRpHash = crypto.createHash('sha256').update(params.rpId).digest();
  if (!parsedFlags.rpIdHash.equals(expectedRpHash)) {
    return {
      ok: false,
      error: `Chữ ký vân tay không thuộc tên miền hiện tại (${params.rpId}).`,
    };
  }

  if (!parsedFlags.userPresent || !parsedFlags.userVerified) {
    return {
      ok: false,
      error: 'Cảm biến chưa xác nhận xác thực sinh trắc học người dùng (UV=0).',
    };
  }

  if (
    params.credential.sign_count > 0 &&
    parsedFlags.signCount > 0 &&
    parsedFlags.signCount < params.credential.sign_count
  ) {
    return {
      ok: false,
      error: 'Cảnh báo bảo mật: Bộ đếm signCount WebAuthn không hợp lệ (nghi ngờ khóa bị sao chép).',
    };
  }

  try {
    const signatureBuf = base64UrlToBuffer(params.signature);
    const clientDataHash = crypto.createHash('sha256').update(clientDataBuf).digest();
    const signedData = Buffer.concat([authDataBuf, clientDataHash]);
    const publicKeyObj = crypto.createPublicKey({
      key: Buffer.from(params.credential.public_key_spki, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const isValid = crypto.verify('sha256', signedData, publicKeyObj, signatureBuf);
    if (!isValid) {
      return {
        ok: false,
        error: 'Chữ ký số sinh trắc học không hợp lệ (khóa công khai không khớp).',
      };
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Lỗi kiểm tra chữ ký WebAuthn: ${err.message}`
          : 'Không thể xác minh chữ ký số WebAuthn.',
    };
  }

  return {
    ok: true,
    nextSignCount: Math.max(params.credential.sign_count, parsedFlags.signCount),
    challengeRecord,
  };
}
