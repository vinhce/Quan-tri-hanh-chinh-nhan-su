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

// ---------------------------------------------------------------------------
// Camera Face / Iris Liveness 1:1 Biometric Helpers (Additive — Post Line 1138)
// ---------------------------------------------------------------------------

export const FACE_MIN_LIVENESS = 0.5;
export const FACE_MIN_ANTISPOOF = 0.5;
export const FACE_MIN_BLINKS = 1;
export const FACE_MATCH_THRESHOLD = 0.65;

const FACE_CHALLENGE_TTL_MS = 120_000;
const FACE_CHALLENGE_MAX_BUCKETS = 1000;

export interface FaceChallengeRecord {
  challengeId: string;
  challenge: string;
  employeeId: string;
  employeeCode: string;
  purpose: 'register' | 'punch';
  rpId: string;
  createdAt: number;
  expiresAt: number;
}

export interface EncryptedFaceEmbedding {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

export type BiometricSessionRoleCode =
  | 'SUPER_ADMIN'
  | 'DIRECTOR'
  | 'HR_MANAGER'
  | 'DEPT_MANAGER'
  | 'EMPLOYEE'
  | 'CANDIDATE';

export interface VerifiedBiometricHrmSession {
  jti: string;
  role: BiometricSessionRoleCode;
  employeeCode: string;
  email: string;
  fullName: string;
}

interface FaceRateLimitBucket {
  count: number;
  resetAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var _hrmFaceChallenges: Map<string, FaceChallengeRecord> | undefined;
  // eslint-disable-next-line no-var
  var _hrmEphemeralFaceEncKey: Buffer | undefined;
  // eslint-disable-next-line no-var
  var _hrmSessionSecret: string | undefined;
  // eslint-disable-next-line no-var
  var _hrmRevokedSessionJtis: Map<string, number> | undefined;
  // eslint-disable-next-line no-var
  var _hrmFaceRateLimitsV2: Map<string, FaceRateLimitBucket> | undefined;
}

const FACE_SESSION_COOKIE_NAME = 'hrm_session';
const FACE_MIN_SECRET_LENGTH = 32;
const FACE_FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FACE_ALLOWED_SESSION_ROLES: ReadonlySet<BiometricSessionRoleCode> = new Set<BiometricSessionRoleCode>([
  'SUPER_ADMIN',
  'DIRECTOR',
  'HR_MANAGER',
  'DEPT_MANAGER',
  'EMPLOYEE',
  'CANDIDATE',
]);

const FACE_RL_MAX_BUCKETS = 5000;
const FACE_RL_ISSUE_MAX = 60;
const FACE_RL_ISSUE_WINDOW_MS = 5 * 60_000;
const FACE_RL_MASK_CHECK_MAX = 180;
const FACE_RL_MASK_CHECK_WINDOW_MS = 5 * 60_000;
const FACE_RL_REGISTER_MAX = 30;
const FACE_RL_REGISTER_WINDOW_MS = 15 * 60_000;
const FACE_RL_PUNCH_FAIL_MAX = 15;
const FACE_RL_PUNCH_FAIL_WINDOW_MS = 10 * 60_000;

function getBiometricHrmSessionSecret(): string | null {
  const envSecret = (process.env.HRM_SESSION_SECRET || '').trim();
  if (envSecret.length >= FACE_MIN_SECRET_LENGTH) {
    return envSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  if (
    typeof globalThis._hrmSessionSecret === 'string' &&
    globalThis._hrmSessionSecret.length >= FACE_MIN_SECRET_LENGTH
  ) {
    return globalThis._hrmSessionSecret;
  }
  return null;
}

function isPlainJsonRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasForbiddenJsonKey(obj: Record<string, unknown>): boolean {
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (FACE_FORBIDDEN_JSON_KEYS.has(key)) return true;
  }
  return false;
}

export function verifyHrmSessionFromBiometricRequest(
  req: Request
): VerifiedBiometricHrmSession | null {
  const secret = getBiometricHrmSessionSecret();
  if (!secret) {
    return null;
  }

  const cookieHeader = req.headers.get('cookie') || '';
  if (!cookieHeader) {
    return null;
  }
  const match = new RegExp(`(?:^|;\\s*)${FACE_SESSION_COOKIE_NAME}=([^;]+)`).exec(
    cookieHeader
  );
  if (!match) {
    return null;
  }

  let rawToken: string;
  try {
    rawToken = decodeURIComponent(match[1]).trim();
  } catch {
    rawToken = match[1].trim();
  }
  if (!rawToken || rawToken.length > 4096) {
    return null;
  }

  const parts = rawToken.split('.');
  if (parts.length !== 2) {
    return null;
  }
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

  if (!isPlainJsonRecord(parsed) || hasForbiddenJsonKey(parsed)) {
    return null;
  }

  const jti = typeof parsed.jti === 'string' ? parsed.jti.trim() : '';
  if (jti.length < 8 || jti.length > 128) {
    return null;
  }

  const role = parsed.role;
  if (
    typeof role !== 'string' ||
    !FACE_ALLOWED_SESSION_ROLES.has(role as BiometricSessionRoleCode)
  ) {
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

  const now = Date.now();
  if (!Number.isFinite(parsed.exp) || parsed.exp <= now) {
    return null;
  }

  const revokedStore = globalThis._hrmRevokedSessionJtis;
  if (revokedStore && revokedStore.has(jti)) {
    const revokedExp = revokedStore.get(jti);
    if (typeof revokedExp === 'number' && Number.isFinite(revokedExp) && revokedExp <= now) {
      revokedStore.delete(jti);
    } else {
      return null;
    }
  }

  return {
    jti,
    role: role as BiometricSessionRoleCode,
    employeeCode: parsed.employeeCode.trim().slice(0, 64),
    email: parsed.email.trim().toLowerCase().slice(0, 160),
    fullName: parsed.fullName.trim().slice(0, 120),
  };
}

function getFaceRateLimitStore(): Map<string, FaceRateLimitBucket> {
  if (!globalThis._hrmFaceRateLimitsV2) {
    globalThis._hrmFaceRateLimitsV2 = new Map<string, FaceRateLimitBucket>();
  }
  const store = globalThis._hrmFaceRateLimitsV2;
  const now = Date.now();
  for (const [k, v] of Array.from(store.entries())) {
    if (!Number.isFinite(v.resetAt) || v.resetAt <= now) {
      store.delete(k);
    }
  }
  while (store.size >= FACE_RL_MAX_BUCKETS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return store;
}

function resolveFaceRateLimitKeys(
  prefix: 'issue' | 'mask_check' | 'register' | 'punch',
  key: string,
  employeeCode?: string
): string[] {
  const trimmedKey = String(key || '').trim();
  const keys = [`${prefix}:${trimmedKey}`];
  const empFromArg = employeeCode ? employeeCode.trim() : '';
  const empFromKey =
    !empFromArg &&
    !trimmedKey.startsWith('emp:') &&
    trimmedKey.includes(':')
      ? trimmedKey.slice(0, trimmedKey.indexOf(':')).trim()
      : '';
  const effectiveEmp = empFromArg || empFromKey;
  if (effectiveEmp) {
    const empKey = `${prefix}:emp:${effectiveEmp.toUpperCase()}`;
    if (!keys.includes(empKey)) {
      keys.push(empKey);
    }
  }
  return keys;
}

export function consumeFaceRateLimit(
  bucket: 'issue' | 'mask_check' | 'register',
  key: string,
  employeeCode?: string
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const store = getFaceRateLimitStore();
  const now = Date.now();
  const maxAttempts =
    bucket === 'issue'
      ? FACE_RL_ISSUE_MAX
      : bucket === 'mask_check'
        ? FACE_RL_MASK_CHECK_MAX
        : FACE_RL_REGISTER_MAX;
  const windowMs =
    bucket === 'issue'
      ? FACE_RL_ISSUE_WINDOW_MS
      : bucket === 'mask_check'
        ? FACE_RL_MASK_CHECK_WINDOW_MS
        : FACE_RL_REGISTER_WINDOW_MS;
  const mapKeys = resolveFaceRateLimitKeys(bucket, key, employeeCode);

  let maxRetryAfterSec = 0;
  for (const mapKey of mapKeys) {
    const current = store.get(mapKey);
    if (current && current.resetAt > now && current.count >= maxAttempts) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      if (retryAfterSec > maxRetryAfterSec) {
        maxRetryAfterSec = retryAfterSec;
      }
    }
  }
  if (maxRetryAfterSec > 0) {
    return { allowed: false, retryAfterSec: maxRetryAfterSec };
  }

  for (const mapKey of mapKeys) {
    const current = store.get(mapKey);
    if (!current || current.resetAt <= now) {
      store.set(mapKey, { count: 1, resetAt: now + windowMs });
    } else {
      current.count += 1;
      store.set(mapKey, current);
    }
  }
  return { allowed: true };
}

export function checkFacePunchRateLimit(
  key: string,
  employeeCode?: string
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const store = getFaceRateLimitStore();
  const now = Date.now();
  const mapKeys = resolveFaceRateLimitKeys('punch', key, employeeCode);

  let maxRetryAfterSec = 0;
  for (const mapKey of mapKeys) {
    const current = store.get(mapKey);
    if (current && current.resetAt > now && current.count >= FACE_RL_PUNCH_FAIL_MAX) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      if (retryAfterSec > maxRetryAfterSec) {
        maxRetryAfterSec = retryAfterSec;
      }
    }
  }
  if (maxRetryAfterSec > 0) {
    return { allowed: false, retryAfterSec: maxRetryAfterSec };
  }
  return { allowed: true };
}

export function recordFacePunchFailure(
  key: string,
  employeeCode?: string
): { locked: boolean; retryAfterSec: number } {
  const store = getFaceRateLimitStore();
  const now = Date.now();
  const mapKeys = resolveFaceRateLimitKeys('punch', key, employeeCode);

  let locked = false;
  let maxRetryAfterSec = 1;
  for (const mapKey of mapKeys) {
    const current = store.get(mapKey);
    if (!current || current.resetAt <= now) {
      const nextResetAt = now + FACE_RL_PUNCH_FAIL_WINDOW_MS;
      store.set(mapKey, { count: 1, resetAt: nextResetAt });
      if (1 >= FACE_RL_PUNCH_FAIL_MAX) locked = true;
      const sec = Math.max(1, Math.ceil((nextResetAt - now) / 1000));
      if (sec > maxRetryAfterSec) maxRetryAfterSec = sec;
    } else {
      current.count += 1;
      store.set(mapKey, current);
      if (current.count >= FACE_RL_PUNCH_FAIL_MAX) locked = true;
      const sec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      if (sec > maxRetryAfterSec) maxRetryAfterSec = sec;
    }
  }
  return { locked, retryAfterSec: maxRetryAfterSec };
}

export function resetFacePunchRateLimit(key: string, employeeCode?: string): void {
  const store = globalThis._hrmFaceRateLimitsV2;
  if (!store) return;
  for (const mapKey of resolveFaceRateLimitKeys('punch', key, employeeCode)) {
    store.delete(mapKey);
  }
}

export function resetFaceEmployeeRateLimits(employeeCode: string): void {
  const store = globalThis._hrmFaceRateLimitsV2;
  if (!store) return;
  const codeUpper = String(employeeCode || '').trim().toUpperCase();
  if (!codeUpper) return;
  const prefixes = ['issue', 'register', 'punch', 'mask_check'] as const;
  for (const mapKey of Array.from(store.keys())) {
    for (const prefix of prefixes) {
      if (
        mapKey === `${prefix}:emp:${codeUpper}` ||
        mapKey.startsWith(`${prefix}:${codeUpper}:`)
      ) {
        store.delete(mapKey);
        break;
      }
    }
  }
}

function getFaceChallengeStore(): Map<string, FaceChallengeRecord> {
  if (!globalThis._hrmFaceChallenges) {
    globalThis._hrmFaceChallenges = new Map<string, FaceChallengeRecord>();
  }
  const store = globalThis._hrmFaceChallenges;
  const now = Date.now();
  for (const [k, v] of Array.from(store.entries())) {
    if (v.expiresAt <= now) {
      store.delete(k);
    }
  }
  while (store.size >= FACE_CHALLENGE_MAX_BUCKETS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
  return store;
}

export function issueFaceChallenge(params: {
  employeeId: string;
  employeeCode: string;
  rpId: string;
  purpose: 'register' | 'punch';
}): FaceChallengeRecord {
  const store = getFaceChallengeStore();
  const now = Date.now();
  const challengeId = `fch-${crypto.randomBytes(16).toString('hex')}`;
  const challenge = bufferToBase64Url(crypto.randomBytes(32));
  const record: FaceChallengeRecord = {
    challengeId,
    challenge,
    employeeId: params.employeeId.trim(),
    employeeCode: params.employeeCode.trim(),
    purpose: params.purpose,
    rpId: params.rpId.trim().toLowerCase(),
    createdAt: now,
    expiresAt: now + FACE_CHALLENGE_TTL_MS,
  };
  store.set(challengeId, record);
  return record;
}

export function consumeFaceChallenge(params: {
  challengeId: string;
  challenge: string;
  employeeId: string;
  employeeCode?: string;
  rpId: string;
  purpose: 'register' | 'punch';
}): { ok: true; challengeRecord: FaceChallengeRecord } | { ok: false; error: string } {
  const challengeId = String(params.challengeId || '').trim();
  const providedChallenge = String(params.challenge || '').trim();
  if (!challengeId || !providedChallenge) {
    return {
      ok: false,
      error: 'Thiếu mã phiên hoặc bằng chứng challenge xác thực khuôn mặt.',
    };
  }
  const store = getFaceChallengeStore();
  const record = store.get(challengeId);
  if (!record) {
    return {
      ok: false,
      error: 'Phiên xác thực khuôn mặt không tồn tại, đã hết hạn hoặc đã được sử dụng.',
    };
  }
  // Xóa ngay lập tức — dùng đúng 1 lần để chống replay attack
  store.delete(challengeId);

  if (record.expiresAt <= Date.now()) {
    return {
      ok: false,
      error: 'Phiên xác thực khuôn mặt đã hết hạn (quá 120 giây). Vui lòng thực hiện lại.',
    };
  }
  const expectedBuf = Buffer.from(record.challenge, 'utf8');
  const providedBuf = Buffer.from(providedChallenge, 'utf8');
  if (
    expectedBuf.length === 0 ||
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return {
      ok: false,
      error: 'Bằng chứng challenge xác thực khuôn mặt không hợp lệ.',
    };
  }
  if (record.purpose !== params.purpose) {
    return {
      ok: false,
      error: 'Mục đích phiên xác thực khuôn mặt không khớp yêu cầu.',
    };
  }
  if (record.rpId !== params.rpId.trim().toLowerCase()) {
    return {
      ok: false,
      error: 'Tên miền xác thực khuôn mặt không khớp với máy chủ.',
    };
  }
  if (record.employeeId !== params.employeeId.trim()) {
    return {
      ok: false,
      error: 'Mã định danh nhân sự không khớp phiên xác thực khuôn mặt.',
    };
  }
  if (
    params.employeeCode &&
    params.employeeCode.trim() &&
    record.employeeCode.toUpperCase() !== params.employeeCode.trim().toUpperCase()
  ) {
    return {
      ok: false,
      error: 'Mã nhân viên không khớp phiên xác thực khuôn mặt.',
    };
  }
  return { ok: true, challengeRecord: record };
}

export function validateAndNormalizeFaceEmbedding(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 64 || raw.length > 2048) return null;

  let sumSq = 0;
  const nums: number[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    const val = raw[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return null;
    }
    nums[i] = val;
    sumSq += val * val;
  }

  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm <= 0) {
    return null;
  }

  for (let i = 0; i < nums.length; i += 1) {
    nums[i] = nums[i] / norm;
  }
  return nums;
}

export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return -1;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i];
    const vb = b[i];
    if (!Number.isFinite(va) || !Number.isFinite(vb)) {
      return -1;
    }
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom) || denom <= 0) {
    return -1;
  }
  const sim = dot / denom;
  return Math.max(-1, Math.min(1, sim));
}

function deriveFaceEncryptionKeyHkdf(rawSecret: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(rawSecret, 'utf8'),
      Buffer.from('lacviet-hrm-biometric-salt-v1', 'utf8'),
      Buffer.from('face-iris-aes-256-gcm-key-v1', 'utf8'),
      32
    )
  );
}

function resolveFaceEncryptionKey(): Buffer {
  const encSecret = (process.env.HRM_BIOMETRIC_ENC_KEY || '').trim();
  const sessionSecret = (process.env.HRM_SESSION_SECRET || '').trim();
  if (process.env.NODE_ENV === 'production') {
    const validProdSecret =
      encSecret.length >= FACE_MIN_SECRET_LENGTH
        ? encSecret
        : sessionSecret.length >= FACE_MIN_SECRET_LENGTH
          ? sessionSecret
          : '';
    if (!validProdSecret) {
      throw new Error(
        'HRM_BIOMETRIC_ENC_KEY_OR_SESSION_SECRET_REQUIRED_IN_PRODUCTION'
      );
    }
    return deriveFaceEncryptionKeyHkdf(validProdSecret);
  }
  const envSecret = encSecret || sessionSecret;
  if (envSecret.length > 0) {
    return deriveFaceEncryptionKeyHkdf(envSecret);
  }
  // Khóa dev ổn định theo workspace + hostname để không hỏng mẫu sau khi restart dev server
  const devSeed = crypto
    .createHmac('sha256', 'lacviet-hrm-dev-face-enc-v1')
    .update(`${process.cwd()}|${os.hostname()}`)
    .digest('hex');
  return deriveFaceEncryptionKeyHkdf(devSeed);
}

export function encryptFaceEmbedding(vec: number[]): EncryptedFaceEmbedding {
  const normalized = validateAndNormalizeFaceEmbedding(vec);
  if (!normalized) {
    throw new Error('Vector sinh trắc khuôn mặt không hợp lệ để mã hóa.');
  }
  const key = resolveFaceEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(normalized), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
  };
}

export function decryptFaceEmbedding(enc: {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}): number[] {
  if (
    !enc ||
    typeof enc.ciphertext !== 'string' ||
    typeof enc.iv !== 'string' ||
    typeof enc.auth_tag !== 'string'
  ) {
    throw new Error('Dữ liệu mã hóa sinh trắc khuôn mặt không hợp lệ.');
  }
  const key = resolveFaceEncryptionKey();
  const ivBuf = Buffer.from(enc.iv, 'base64');
  const authTagBuf = Buffer.from(enc.auth_tag, 'base64');
  if (ivBuf.length !== 12 || authTagBuf.length !== 16) {
    throw new Error('Tham số mã hóa AES-256-GCM (IV/AuthTag) không hợp lệ.');
  }
  const ciphertext = Buffer.from(enc.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf, {
    authTagLength: 16,
  });
  decipher.setAuthTag(authTagBuf);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed: unknown = JSON.parse(decrypted.toString('utf8'));
  const normalized = validateAndNormalizeFaceEmbedding(parsed);
  if (!normalized) {
    throw new Error('Dữ liệu giải mã vector khuôn mặt bị hỏng.');
  }
  return normalized;
}

export function isVnNightAttendanceLocked(now: Date = new Date()): boolean {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    hour12: false,
  }).format(now);
  const parsedHour = Number.parseInt(hourStr, 10);
  if (!Number.isFinite(parsedHour)) return false;
  const hour = parsedHour === 24 ? 0 : parsedHour;
  return hour >= 22 || hour < 6;
}

// ---------------------------------------------------------------------------
// Periocular / Masked Face ONNX Microservice Helpers (Additive — Post L1786)
// ---------------------------------------------------------------------------

export const PERIOCULAR_MATCH_THRESHOLD_SCRFD = 0.46;
export const PERIOCULAR_MATCH_THRESHOLD_EYEPAIR = 0.48;

const PERIOCULAR_HEALTH_TIMEOUT_MS = 800;
const PERIOCULAR_HEALTH_CACHE_TTL_MS = 5000;
const PERIOCULAR_EXTRACT_TIMEOUT_MS = 4500;
const PERIOCULAR_MASK_CHECK_TIMEOUT_MS = 1200;
const PERIOCULAR_MAX_IMAGE_BYTES = Math.floor(1.4 * 1024 * 1024);
const PERIOCULAR_MAX_B64_CHARS = 2_100_000;

export type PeriocularDetectionMode = 'scrfd_masked' | 'eyepair_periocular';
export type FaceCoverStatus = 'none' | 'mask' | 'full_cover';

export function formatFaceCoverLabelVi(faceCover: FaceCoverStatus): string {
  if (faceCover === 'mask') return 'Đeo khẩu trang';
  if (faceCover === 'full_cover') return 'Che kín mặt (chỉ hở mắt)';
  return 'Không khẩu trang';
}

function normalizeFaceCoverStatus(
  rawCover: unknown,
  maskOccludedFallback?: boolean
): FaceCoverStatus {
  const s = typeof rawCover === 'string' ? rawCover.trim().toLowerCase() : '';
  if (s === 'mask' || s === 'full_cover' || s === 'none') {
    return s;
  }
  return maskOccludedFallback ? 'mask' : 'none';
}

export interface PeriocularHealthStatus {
  online: boolean;
  service?: string;
  model?: string;
  embeddingDim?: number;
}

export type PeriocularMaskCheckResult =
  | {
      ok: true;
      faceCover: FaceCoverStatus;
      maskScore: number;
      eyeLandmarks?: { left: [number, number]; right: [number, number] };
    }
  | {
      ok: false;
      status: 400 | 422 | 502 | 503;
      code: string;
      error: string;
    };

export type PeriocularExtractResult =
  | {
      ok: true;
      detectionMode: PeriocularDetectionMode;
      maskOccluded: boolean;
      faceCover: FaceCoverStatus;
      maskScore: number;
      embedding: number[];
      embeddingDim: number;
      detScore: number;
      livenessScore: number;
      antispoofScore: number;
      eyeLandmarks?: { left: [number, number]; right: [number, number] };
    }
  | {
      ok: false;
      status: 400 | 422 | 502 | 503;
      code: string;
      error: string;
    };

type PeriocularHealthCacheEntry = {
  online: boolean;
  checkedAt: number;
  url: string;
  service?: string;
  model?: string;
  embeddingDim?: number;
};

function getPeriocularHealthCacheStore(): PeriocularHealthCacheEntry | undefined {
  return (
    globalThis as typeof globalThis & {
      _hrmPeriocularHealthCache?: PeriocularHealthCacheEntry;
    }
  )._hrmPeriocularHealthCache;
}

function setPeriocularHealthCacheStore(entry: PeriocularHealthCacheEntry): void {
  (
    globalThis as typeof globalThis & {
      _hrmPeriocularHealthCache?: PeriocularHealthCacheEntry;
    }
  )._hrmPeriocularHealthCache = entry;
}

export function resolvePeriocularServiceUrl(): string {
  const raw = (process.env.HRM_PERIOCULAR_URL || 'http://127.0.0.1:8002').trim();
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    // fallback to local loopback default
  }
  return 'http://127.0.0.1:8002';
}

export function getPeriocularMatchThreshold(engineOrMode?: string | null): number {
  if (engineOrMode === 'eyepair_periocular') {
    return PERIOCULAR_MATCH_THRESHOLD_EYEPAIR;
  }
  return PERIOCULAR_MATCH_THRESHOLD_SCRFD;
}

function detectImageMagicMime(buf: Buffer): 'image/jpeg' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function validatePeriocularFrameBase64(
  raw: unknown
):
  | {
      ok: true;
      frameB64: string;
      mime: 'image/jpeg' | 'image/webp';
      byteLength: number;
    }
  | { ok: false; code: string; error: string } {
  if (typeof raw !== 'string') {
    return {
      ok: false,
      code: 'INVALID_PERIOCULAR_FRAME',
      error: 'Thiếu dữ liệu khung hình khuôn mặt (base64 JPEG/WebP).',
    };
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > PERIOCULAR_MAX_B64_CHARS) {
    return {
      ok: false,
      code: 'INVALID_PERIOCULAR_FRAME',
      error: 'Khung hình khuôn mặt rỗng hoặc vượt quá giới hạn dung lượng cho phép (≤ 1.4 MB).',
    };
  }

  let declaredMime: 'image/jpeg' | 'image/webp' | null = null;
  let b64Body = trimmed;
  const dataUrlMatch = /^data:(image\/(?:jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    trimmed
  );
  if (dataUrlMatch) {
    const rawMime = dataUrlMatch[1].toLowerCase();
    declaredMime = rawMime === 'image/webp' ? 'image/webp' : 'image/jpeg';
    b64Body = dataUrlMatch[2].replace(/\s+/g, '');
  } else if (trimmed.startsWith('data:')) {
    return {
      ok: false,
      code: 'INVALID_PERIOCULAR_FRAME',
      error: 'Chỉ chấp nhận khung hình định dạng JPEG hoặc WebP.',
    };
  } else {
    b64Body = trimmed.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64Body)) {
      return {
        ok: false,
        code: 'INVALID_PERIOCULAR_FRAME',
        error: 'Chuỗi base64 khung hình khuôn mặt không hợp lệ.',
      };
    }
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b64Body, 'base64');
  } catch {
    return {
      ok: false,
      code: 'INVALID_PERIOCULAR_FRAME',
      error: 'Không thể giải mã khung hình khuôn mặt từ base64.',
    };
  }

  if (buf.byteLength === 0 || buf.byteLength > PERIOCULAR_MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'INVALID_PERIOCULAR_FRAME',
      error: 'Dung lượng ảnh khuôn mặt vượt quá 1.4 MB hoặc không hợp lệ.',
    };
  }

  const magicMime = detectImageMagicMime(buf);
  if (!magicMime || (declaredMime && declaredMime !== magicMime)) {
    return {
      ok: false,
      code: 'INVALID_PERIOCULAR_FRAME',
      error: 'Nội dung ảnh khuôn mặt không phải định dạng JPEG hoặc WebP hợp lệ.',
    };
  }

  return {
    ok: true,
    frameB64: `data:${magicMime};base64,${b64Body}`,
    mime: magicMime,
    byteLength: buf.byteLength,
  };
}

export async function probePeriocularHealth(
  forceRefresh = false
): Promise<PeriocularHealthStatus> {
  const baseUrl = resolvePeriocularServiceUrl();
  const cached = getPeriocularHealthCacheStore();
  const now = Date.now();
  if (
    !forceRefresh &&
    cached &&
    cached.url === baseUrl &&
    now - cached.checkedAt < PERIOCULAR_HEALTH_CACHE_TTL_MS
  ) {
    return {
      online: cached.online,
      service: cached.service,
      model: cached.model,
      embeddingDim: cached.embeddingDim,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERIOCULAR_HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      setPeriocularHealthCacheStore({ online: false, checkedAt: Date.now(), url: baseUrl });
      return { online: false };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const online = Boolean(data?.ok) && data?.ready !== false;
    const entry: PeriocularHealthCacheEntry = {
      online,
      checkedAt: Date.now(),
      url: baseUrl,
      service: typeof data?.service === 'string' ? data.service : undefined,
      model: typeof data?.model === 'string' ? data.model : undefined,
      embeddingDim:
        typeof data?.embedding_dim === 'number' && Number.isFinite(data.embedding_dim)
          ? data.embedding_dim
          : undefined,
    };
    setPeriocularHealthCacheStore(entry);
    return {
      online: entry.online,
      service: entry.service,
      model: entry.model,
      embeddingDim: entry.embeddingDim,
    };
  } catch {
    setPeriocularHealthCacheStore({ online: false, checkedAt: Date.now(), url: baseUrl });
    return { online: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function extractPeriocularFromService(params: {
  frameB64: unknown;
  auxFrameB64?: unknown;
  mode?: string;
  guideBox?: { x: number; y: number; w: number; h: number };
  requireBlink?: boolean;
}): Promise<PeriocularExtractResult> {
  const primaryCheck = validatePeriocularFrameBase64(params.frameB64);
  if (!primaryCheck.ok) {
    return {
      ok: false,
      status: 400,
      code: primaryCheck.code,
      error: primaryCheck.error,
    };
  }

  let auxFrameValidated: string | undefined;
  if (
    params.auxFrameB64 !== undefined &&
    params.auxFrameB64 !== null &&
    String(params.auxFrameB64).trim().length > 0
  ) {
    const auxCheck = validatePeriocularFrameBase64(params.auxFrameB64);
    if (!auxCheck.ok) {
      return {
        ok: false,
        status: 400,
        code: auxCheck.code,
        error: auxCheck.error,
      };
    }
    auxFrameValidated = auxCheck.frameB64;
  }

  const baseUrl = resolvePeriocularServiceUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERIOCULAR_EXTRACT_TIMEOUT_MS);

  try {
    const payload: Record<string, unknown> = {
      frame_b64: primaryCheck.frameB64,
      mode: params.mode || 'auto',
      require_blink: Boolean(params.requireBlink),
    };
    if (auxFrameValidated) {
      payload.aux_frame_b64 = auxFrameValidated;
    }
    if (params.guideBox) {
      payload.guide_box = params.guideBox;
    }

    const res = await fetch(`${baseUrl}/v1/periocular/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    let data: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      if (isPlainJsonRecord(parsed)) {
        data = parsed;
      }
    } catch {
      data = null;
    }

    if (res.status === 422 || data?.code === 'NO_PERIOCULAR_DETECTED') {
      setPeriocularHealthCacheStore({ online: true, checkedAt: Date.now(), url: baseUrl });
      return {
        ok: false,
        status: 422,
        code: 'NO_PERIOCULAR_DETECTED',
        error:
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Không nhận diện rõ khuôn mặt. Vui lòng nhìn thẳng vào camera và đảm bảo đủ sáng.',
      };
    }

    if (res.status === 400 || res.status === 413) {
      return {
        ok: false,
        status: 400,
        code:
          typeof data?.code === 'string' && data.code.trim()
            ? data.code.trim()
            : 'INVALID_PERIOCULAR_FRAME',
        error:
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Ảnh gửi tới dịch vụ nhận diện khuôn mặt không hợp lệ.',
      };
    }

    if (res.status >= 500) {
      setPeriocularHealthCacheStore({ online: false, checkedAt: Date.now(), url: baseUrl });
      return {
        ok: false,
        status: 503,
        code: 'PERIOCULAR_SERVICE_UNAVAILABLE',
        error: 'Dịch vụ AI nhận diện khuôn mặt (:8002) tạm thời không khả dụng.',
      };
    }

    if (!res.ok || !data || data.ok !== true) {
      return {
        ok: false,
        status: 502,
        code: 'PERIOCULAR_INVALID_RESPONSE',
        error: 'Phản hồi từ dịch vụ AI nhận diện khuôn mặt không hợp lệ.',
      };
    }

    const normalizedVec = validateAndNormalizeFaceEmbedding(data.embedding);
    if (!normalizedVec || normalizedVec.length !== 512) {
      return {
        ok: false,
        status: 502,
        code: 'PERIOCULAR_INVALID_RESPONSE',
        error: 'Vector đặc trưng khuôn mặt trả về từ dịch vụ AI không hợp lệ (cần 512-dim).',
      };
    }

    const rawDetMode = String(data.detection_mode || 'scrfd_masked').trim();
    const detectionMode: PeriocularDetectionMode =
      rawDetMode === 'eyepair_periocular' ? 'eyepair_periocular' : 'scrfd_masked';
    const detScore =
      typeof data.det_score === 'number' && Number.isFinite(data.det_score)
        ? data.det_score
        : 0;
    const livenessScore =
      typeof data.liveness_score === 'number' && Number.isFinite(data.liveness_score)
        ? data.liveness_score
        : 0;
    const antispoofScore =
      typeof data.antispoof_score === 'number' && Number.isFinite(data.antispoof_score)
        ? data.antispoof_score
        : 0;

    let eyeLandmarks: { left: [number, number]; right: [number, number] } | undefined;
    if (isPlainJsonRecord(data.eye_landmarks)) {
      const l = data.eye_landmarks.left;
      const r = data.eye_landmarks.right;
      if (
        Array.isArray(l) &&
        l.length === 2 &&
        typeof l[0] === 'number' &&
        typeof l[1] === 'number' &&
        Array.isArray(r) &&
        r.length === 2 &&
        typeof r[0] === 'number' &&
        typeof r[1] === 'number'
      ) {
        eyeLandmarks = { left: [l[0], l[1]], right: [r[0], r[1]] };
      }
    }

    const faceCover = normalizeFaceCoverStatus(
      data.face_cover,
      Boolean(data.mask_occluded)
    );
    const maskScore =
      typeof data.mask_score === 'number' && Number.isFinite(data.mask_score)
        ? Math.max(0, Math.min(1, data.mask_score))
        : faceCover === 'none'
          ? 0
          : 0.85;

    setPeriocularHealthCacheStore({ online: true, checkedAt: Date.now(), url: baseUrl });
    return {
      ok: true,
      detectionMode,
      maskOccluded: Boolean(data.mask_occluded) || faceCover !== 'none',
      faceCover,
      maskScore,
      embedding: normalizedVec,
      embeddingDim: normalizedVec.length,
      detScore,
      livenessScore,
      antispoofScore,
      eyeLandmarks,
    };
  } catch {
    setPeriocularHealthCacheStore({ online: false, checkedAt: Date.now(), url: baseUrl });
    return {
      ok: false,
      status: 503,
      code: 'PERIOCULAR_SERVICE_UNAVAILABLE',
      error:
        'Dịch vụ AI nhận diện khuôn mặt (127.0.0.1:8002) hiện đang tắt hoặc quá thời gian phản hồi.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkMaskFromPeriocularService(params: {
  frameB64: unknown;
  guideBox?: { x: number; y: number; w: number; h: number };
}): Promise<PeriocularMaskCheckResult> {
  const primaryCheck = validatePeriocularFrameBase64(params.frameB64);
  if (!primaryCheck.ok) {
    return {
      ok: false,
      status: 400,
      code: primaryCheck.code,
      error: primaryCheck.error,
    };
  }

  const baseUrl = resolvePeriocularServiceUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERIOCULAR_MASK_CHECK_TIMEOUT_MS);
  try {
    const payload: Record<string, unknown> = {
      frame_b64: primaryCheck.frameB64,
    };
    if (params.guideBox) {
      payload.guide_box = params.guideBox;
    }

    const res = await fetch(`${baseUrl}/v1/periocular/mask-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    let data: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      if (isPlainJsonRecord(parsed)) {
        data = parsed;
      }
    } catch {
      data = null;
    }

    if (res.status === 422 || data?.code === 'NO_PERIOCULAR_DETECTED') {
      setPeriocularHealthCacheStore({ online: true, checkedAt: Date.now(), url: baseUrl });
      return {
        ok: false,
        status: 422,
        code: 'NO_PERIOCULAR_DETECTED',
        error:
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Không nhận diện rõ khuôn mặt để kiểm tra khẩu trang.',
      };
    }

    if (res.status === 400 || res.status === 413) {
      return {
        ok: false,
        status: 400,
        code:
          typeof data?.code === 'string' && data.code.trim()
            ? data.code.trim()
            : 'INVALID_PERIOCULAR_FRAME',
        error:
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Khung hình kiểm tra khẩu trang không hợp lệ.',
      };
    }

    if (res.status >= 500) {
      setPeriocularHealthCacheStore({ online: false, checkedAt: Date.now(), url: baseUrl });
      return {
        ok: false,
        status: 503,
        code: 'PERIOCULAR_SERVICE_UNAVAILABLE',
        error: 'Dịch vụ AI nhận diện khuôn mặt (:8002) tạm thời không khả dụng.',
      };
    }

    if (!res.ok || !data || data.ok !== true) {
      return {
        ok: false,
        status: 502,
        code: 'PERIOCULAR_INVALID_RESPONSE',
        error: 'Phản hồi kiểm tra khẩu trang từ dịch vụ AI không hợp lệ.',
      };
    }

    const faceCover = normalizeFaceCoverStatus(data.face_cover, false);
    const maskScore =
      typeof data.mask_score === 'number' && Number.isFinite(data.mask_score)
        ? Math.max(0, Math.min(1, data.mask_score))
        : 0;

    let eyeLandmarks: { left: [number, number]; right: [number, number] } | undefined;
    if (isPlainJsonRecord(data.eye_landmarks)) {
      const l = data.eye_landmarks.left;
      const r = data.eye_landmarks.right;
      if (
        Array.isArray(l) &&
        l.length === 2 &&
        typeof l[0] === 'number' &&
        typeof l[1] === 'number' &&
        Array.isArray(r) &&
        r.length === 2 &&
        typeof r[0] === 'number' &&
        typeof r[1] === 'number'
      ) {
        eyeLandmarks = { left: [l[0], l[1]], right: [r[0], r[1]] };
      }
    }

    setPeriocularHealthCacheStore({ online: true, checkedAt: Date.now(), url: baseUrl });
    return {
      ok: true,
      faceCover,
      maskScore,
      eyeLandmarks,
    };
  } catch {
    setPeriocularHealthCacheStore({ online: false, checkedAt: Date.now(), url: baseUrl });
    return {
      ok: false,
      status: 503,
      code: 'PERIOCULAR_SERVICE_UNAVAILABLE',
      error: 'Dịch vụ AI nhận diện khuôn mặt (127.0.0.1:8002) hiện đang tắt.',
    };
  } finally {
    clearTimeout(timer);
  }
}
