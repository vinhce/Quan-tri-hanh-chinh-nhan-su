// ==============================================================================
// LẠC VIỆT HRM — BIOMETRIC FINGERPRINT & SAME-WIFI ATTENDANCE TEST SUITE
// Kiểm thử toàn bộ nghiệp vụ Chấm công Vân tay (Laptop/Mobile) + Bắt buộc chung WiFi:
//   1. SQL Schema Migration (002_employee_lifecycle.sql) & Audit Module Mapping
//   2. Same-WiFi Network Gate (Host Local, Same LAN /24, Cross-Subnet Block,
//      DevTunnel Same Public IPv4/IPv6, 4G/5G Cellular Block, Different WiFi Block,
//      Admin Whitelist & Policy Toggle)
//   3. Real ECDSA P-256 WebAuthn Flow qua Route /api/hrm/attendance/biometric:
//      Challenge -> Registration (201) -> Signed Assertion (200, signCount++) ->
//      Replay / UV=0 / Bad Signature / SignCount Rollback / Wrong RP / RBAC Block (403)
//   4. Runtime Store Integration: Credential CRUD, WiFi Policy, Biometric Check-in/out
//      cập nhật Bảng công & Ghi nhận Audit Log 'BIOMETRIC_CHECK_IN_OUT'
// ==============================================================================

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
    failed += 1;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
    failed += 1;
  }
}

function buildAuthenticatorData(rpId, flags, signCount) {
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const meta = Buffer.alloc(5);
  meta.writeUInt8(flags, 0);
  meta.writeUInt32BE(signCount >>> 0, 1);
  return Buffer.concat([rpIdHash, meta]);
}

function toBase64Url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encodeClientData(payload) {
  return toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
}

function signWebAuthnAssertion(authDataBuf, clientDataB64Url, privateKey) {
  const padded = clientDataB64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const clientDataBuf = Buffer.from(padded + '='.repeat(padLen), 'base64');
  const clientDataHash = crypto.createHash('sha256').update(clientDataBuf).digest();
  const signedPayload = Buffer.concat([authDataBuf, clientDataHash]);
  const derSignature = crypto.sign('sha256', signedPayload, privateKey);
  return toBase64Url(derSignature);
}

console.log('======================================================================');
console.log(' LẠC VIỆT HRM — BIOMETRIC FINGERPRINT & SAME-WIFI VERIFICATION SUITE');
console.log('======================================================================\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrm-biometric-test-'));
const sandboxDataDir = path.join(tempDir, 'sandbox-data');
fs.mkdirSync(sandboxDataDir, { recursive: true });

try {
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2),
    'utf8'
  );

  // NextResponse & ServerRuntimeConfig shim
  fs.writeFileSync(
    path.join(tempDir, 'next-server-shim.js'),
    `
class MockNextResponse extends Response {
  static json(body, init) {
    const status = init && init.status ? init.status : 200;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...(init && init.headers ? init.headers : {}) },
    });
  }
}
module.exports = { NextResponse: MockNextResponse };
`,
    'utf8'
  );

  const filesToTranspile = [
    ['src/mock/types.ts', 'types.js'],
    ['src/mock/ats.ts', 'ats.js'],
    ['src/mock/employees.ts', 'employees.js'],
    ['src/mock/onboarding.ts', 'onboarding.js'],
    ['src/mock/attendance.ts', 'attendance.js'],
    ['src/mock/payroll.ts', 'payroll.js'],
    ['src/mock/admin.ts', 'admin.js'],
    ['src/mock/copilot.ts', 'copilot.js'],
    ['src/lib/hrm/config.ts', 'config.js'],
    ['src/lib/hrm/ids.ts', 'hrm-ids.js'],
    ['src/lib/hrm/format.ts', 'hrm-format.js'],
    ['src/lib/hrm/permissions.ts', 'hrm-permissions.js'],
    ['src/lib/hrm/types.ts', 'hrm-types.js'],
    ['src/lib/hrm/biometric-server.ts', 'biometric-server.js'],
    ['src/lib/audit-logger.ts', 'audit-logger.js'],
    ['src/lib/runtime-store.ts', 'runtime-store.js'],
    ['src/app/api/hrm/attendance/biometric/route.ts', 'biometric-route.js'],
  ];

  for (const [src, dest] of filesToTranspile) {
    let code = fs.readFileSync(path.join(projectRoot, src), 'utf8');

    code = code.replace(/next\/server/g, './next-server-shim');
    code = code.replace(/@\/mock\/types/g, './types');
    code = code.replace(/@\/mock\/ats/g, './ats');
    code = code.replace(/@\/mock\/employees/g, './employees');
    code = code.replace(/@\/mock\/onboarding/g, './onboarding');
    code = code.replace(/@\/mock\/attendance/g, './attendance');
    code = code.replace(/@\/mock\/payroll/g, './payroll');
    code = code.replace(/@\/mock\/admin/g, './admin');
    code = code.replace(/@\/mock\/copilot/g, './copilot');
    code = code.replace(/@\/lib\/hrm\/config/g, './config');
    code = code.replace(/@\/lib\/hrm\/ids/g, './hrm-ids');
    code = code.replace(/@\/lib\/hrm\/format/g, './hrm-format');
    code = code.replace(/@\/lib\/hrm\/permissions/g, './hrm-permissions');
    code = code.replace(/@\/lib\/hrm\/types/g, './hrm-types');
    code = code.replace(/@\/lib\/hrm\/biometric-server/g, './biometric-server');
    code = code.replace(/@\/lib\/audit-logger/g, './audit-logger');
    code = code.replace(/@\/lib\/runtime-store/g, './runtime-store');
    code = code.replace(/\.\/config/g, './config');
    code = code.replace(/\.\/ids/g, './hrm-ids');
    code = code.replace(/\.\/format/g, './hrm-format');
    code = code.replace(/\.\/permissions/g, './hrm-permissions');
    code = code.replace(/\.\/audit-logger/g, './audit-logger');

    if (src.endsWith('biometric/route.ts')) {
      code = code.replace(
        /path\.join\(process\.cwd\(\),\s*'\.data'\)/g,
        JSON.stringify(sandboxDataDir)
      );
    }

    const transpiled = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: path.basename(src),
    });
    fs.writeFileSync(path.join(tempDir, dest), transpiled.outputText, 'utf8');
  }

  // Global browser storage + event shims
  const memoryStorage = {};
  global.window = {
    localStorage: {
      getItem: (key) => (key in memoryStorage ? memoryStorage[key] : null),
      setItem: (key, val) => {
        memoryStorage[key] = String(val);
      },
      removeItem: (key) => {
        delete memoryStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(memoryStorage)) delete memoryStorage[k];
      },
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  global.CustomEvent = class {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };

  // Deterministic offline fetch mock for /api/* sync calls and ipify public-IP probes
  const HOST_PUBLIC_IPV4 = '203.113.152.10';
  const HOST_PUBLIC_IPV6_FULL = '2402:800:6105:1234::a1';
  const HOST_PUBLIC_IPV6_PREFIX64 = '2402:800:6105:1234';

  const realFetch = global.fetch;
  global.fetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : String(input?.url || '');
    if (urlStr.startsWith('/api/')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (urlStr.includes('api.ipify.org')) {
      return new Response(JSON.stringify({ ip: HOST_PUBLIC_IPV4 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (urlStr.includes('ipv4.icanhazip.com')) {
      return new Response(`${HOST_PUBLIC_IPV4}\n`, { status: 200 });
    }
    if (urlStr.includes('api64.ipify.org')) {
      return new Response(JSON.stringify({ ip: HOST_PUBLIC_IPV6_FULL }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return realFetch(input, init);
  };

  // Ensure isolated clean global state inside sandbox
  globalThis._hrmSyncStore = {};
  globalThis._hrmBiometricChallenges = new Map();
  globalThis._hrmPublicIpCache = undefined;

  const sandboxRequire = createRequire(import.meta.url);
  const biometricServer = sandboxRequire(path.join(tempDir, 'biometric-server.js'));
  const biometricRoute = sandboxRequire(path.join(tempDir, 'biometric-route.js'));
  const auditLogger = sandboxRequire(path.join(tempDir, 'audit-logger.js'));
  const runtimeStore = sandboxRequire(path.join(tempDir, 'runtime-store.js'));
  const employeesMock = sandboxRequire(path.join(tempDir, 'employees.js'));

  // =========================================================================
  // PHẦN 1: SQL MIGRATION SCHEMA, CLIENT MODULE & AUDIT MAPPING
  // =========================================================================
  console.log('--- PHẦN 1: SQL MIGRATION, CLIENT MODULE & AUDIT MODULE MAPPING ---');

  test('1.1 Schema 002_employee_lifecycle.sql định nghĩa đầy đủ bảng biometric_credentials, wifi_attendance_policies & cột attendances', () => {
    const sqlPath = path.join(projectRoot, 'db', 'migrations', '002_employee_lifecycle.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS biometric_credentials'), 'Thiếu bảng biometric_credentials');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS wifi_attendance_policies'), 'Thiếu bảng wifi_attendance_policies');
    assert.ok(sql.includes('biometric_credential_id'), 'Thiếu cột attendances.biometric_credential_id');
    assert.ok(sql.includes('verified_ip'), 'Thiếu cột attendances.verified_ip');
    assert.ok(sql.includes('wifi_match_mode'), 'Thiếu cột attendances.wifi_match_mode');
    assert.ok(sql.includes("'BIOMETRIC_FINGERPRINT'"), 'Thiếu enum BIOMETRIC_FINGERPRINT ở attendances.source');
  });

  test('1.2 Client WebAuthn module (src/lib/biometric-attendance.ts) export đủ API đăng ký & chấm công vân tay', () => {
    const clientTs = fs.readFileSync(
      path.join(projectRoot, 'src', 'lib', 'biometric-attendance.ts'),
      'utf8'
    );
    assert.ok(clientTs.includes('navigator.credentials.create'), 'Thiếu WebAuthn registration');
    assert.ok(clientTs.includes('navigator.credentials.get'), 'Thiếu WebAuthn assertion');
    assert.ok(clientTs.includes("userVerification: 'required'"), 'Chưa bắt buộc userVerification=required (vân tay/khuôn mặt)');
    assert.ok(clientTs.includes('export async function enrollCurrentDeviceBiometric'), 'Thiếu enrollCurrentDeviceBiometric');
    assert.ok(clientTs.includes('export async function punchWithBiometricWifi'), 'Thiếu punchWithBiometricWifi');
  });

  test('1.3 Audit logger ánh xạ 3 action sinh trắc học & WiFi vào module TIME_ATTENDANCE', () => {
    for (const action of ['BIOMETRIC_REGISTER', 'BIOMETRIC_CHECK_IN_OUT', 'WIFI_CHECK_BLOCKED']) {
      const created = auditLogger.recordAuditLog({
        actor_name: 'Audit Test',
        actor_code: 'NV-TEST-01',
        actor_role: 'EMPLOYEE',
        action,
        target: `Target-${action}`,
        detail: `Detail-${action}`,
      });
      assert.ok(created, `Phải tạo được audit log cho ${action}`);
      assert.strictEqual(created.module, 'TIME_ATTENDANCE');
    }
    const logs = auditLogger.getRuntimeAuditLogs();
    for (const action of ['BIOMETRIC_REGISTER', 'BIOMETRIC_CHECK_IN_OUT', 'WIFI_CHECK_BLOCKED']) {
      const found = logs.find((l) => l.action === action);
      assert.ok(found, `Thiếu audit log cho ${action}`);
      assert.strictEqual(found.module, 'TIME_ATTENDANCE');
    }
  });

  // =========================================================================
  // PHẦN 2: KIỂM THỬ BỘ LỌC MẠNG CHUNG WIFI (SAME-WIFI GATE ENGINE)
  // =========================================================================
  console.log('\n--- PHẦN 2: KIỂM THỬ SAME-WIFI GATE (LAPTOP / LAN / DEVTUNNEL / 4G) ---');

  const sampleLanInterfaces = [
    {
      name: 'Wi-Fi',
      ip: '192.168.1.50',
      netmask: '255.255.255.0',
      cidr: '192.168.1.0/24',
      isVirtual: false,
      isWifi: true,
    },
    {
      name: 'vEthernet (WSL)',
      ip: '172.25.0.1',
      netmask: '255.255.240.0',
      cidr: '172.25.0.0/20',
      isVirtual: true,
      isWifi: false,
    },
  ];

  test('2.1 Laptop máy chủ truy cập localhost:3000 khi đang kết nối WiFi -> HOST_LOCAL PASS', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'localhost:3000',
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'HOST_LOCAL');
    assert.strictEqual(res.verifiedIp, '192.168.1.50');
    assert.strictEqual(res.isRemoteTunnel, false);
  });

  test('2.2 Điện thoại cùng mạng LAN WiFi (/24: 192.168.1.88) -> SAME_LAN_SUBNET PASS', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: '192.168.1.50:3000',
      forwardedIp: '192.168.1.88',
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'SAME_LAN_SUBNET');
    assert.strictEqual(res.verifiedIp, '192.168.1.88');
  });

  test('2.3 Thiết bị LAN khác subnet (192.168.99.22 != 192.168.1.0/24) -> WIFI_MISMATCH BLOCK', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: '192.168.1.50:3000',
      forwardedIp: '192.168.99.22',
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'WIFI_MISMATCH');
  });

  test('2.4 Điện thoại qua DevTunnel cùng Public IPv4 bộ phát WiFi -> SAME_WIFI_NAT_IP PASS', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
      originHeader: 'https://vkvhkqb6-3000.jpe1.devtunnels.ms',
      clientHints: {
        connectionType: 'wifi',
        publicIpv4: HOST_PUBLIC_IPV4,
      },
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'SAME_WIFI_NAT_IP');
    assert.strictEqual(res.isRemoteTunnel, true);
    assert.strictEqual(res.verifiedIp, HOST_PUBLIC_IPV4);
  });

  test('2.5 Điện thoại qua DevTunnel trùng IPv6 /64 prefix WiFi -> SAME_WIFI_NAT_IP PASS', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
      clientHints: {
        connectionType: 'wifi',
        publicIpv6Prefix64: HOST_PUBLIC_IPV6_PREFIX64,
      },
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: null,
      hostPublicIpv6Prefix64: HOST_PUBLIC_IPV6_PREFIX64,
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'SAME_WIFI_NAT_IP');
  });

  test('2.6 Điện thoại bật 4G/5G Cellular -> CELLULAR_BLOCKED ngay cả khi gửi kèm hint IP', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
      clientHints: {
        connectionType: 'cellular',
        effectiveType: '4g',
        publicIpv4: HOST_PUBLIC_IPV4,
      },
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'CELLULAR_BLOCKED');
    assert.strictEqual(res.mode, 'CELLULAR_BLOCKED');
  });

  test('2.7 Điện thoại dùng WiFi quán cafe (14.161.22.99 != 203.113.152.10) -> WIFI_MISMATCH BLOCK', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
      forwardedIp: '14.161.22.99',
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'WIFI_MISMATCH');
    assert.strictEqual(res.verifiedIp, '14.161.22.99');
  });

  test('2.8 IP văn phòng phụ trong danh sách Admin Whitelist -> ADMIN_WHITELIST PASS', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
      forwardedIp: '14.161.22.99',
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
      policy: {
        ...biometricServer.DEFAULT_SERVER_WIFI_POLICY,
        allowed_public_ips: ['14.161.22.99'],
      },
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'ADMIN_WHITELIST');
  });

  test('2.9 Khi Admin tắt enforce_same_wifi=false -> POLICY_DISABLED PASS', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
      clientHints: { connectionType: 'cellular' },
      hostLanInterfaces: sampleLanInterfaces,
      hostPublicIpv4: HOST_PUBLIC_IPV4,
      policy: {
        ...biometricServer.DEFAULT_SERVER_WIFI_POLICY,
        enforce_same_wifi: false,
      },
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.mode, 'POLICY_DISABLED');
  });

  test('2.10 Laptop mất toàn bộ kết nối mạng (không LAN/WiFi, không Public IP) -> WIFI_MISMATCH BLOCK', () => {
    const res = biometricServer.evaluateSameWifiGate({
      hostHeader: 'localhost:3000',
      hostLanInterfaces: [],
      hostPublicIpv4: null,
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'WIFI_MISMATCH');
  });

  test('2.11 parseNetshWlanInterfacesOutput trích xuất đủ SSID, BSSID MAC, Band 2.4GHz, Signal % & Tốc độ PHY', () => {
    const sampleWlan = `
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : MediaTek Wi-Fi 6E MT7902 Wireless LAN Card
    GUID                   : 811e7d9b-ad7c-4111-9421-d94e854d3540
    Physical address       : a8:41:f4:19:60:70
    State                  : connected
    SSID                   : P 204
    BSSID                  : 00:5f:67:99:c4:f3
    Network type           : Infrastructure
    Radio type             : 802.11n
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Channel                : 11
    Receive rate (Mbps)    : 150
    Transmit rate (Mbps)   : 150
    Signal                 : 80%
`;
    const parsed = biometricServer.parseNetshWlanInterfacesOutput(sampleWlan);
    assert.strictEqual(parsed.interfaceName, 'Wi-Fi');
    assert.strictEqual(parsed.adapterDescription, 'MediaTek Wi-Fi 6E MT7902 Wireless LAN Card');
    assert.strictEqual(parsed.macAddress, 'A8:41:F4:19:60:70');
    assert.strictEqual(parsed.connected, true);
    assert.strictEqual(parsed.ssid, 'P 204');
    assert.strictEqual(parsed.bssid, '00:5F:67:99:C4:F3');
    assert.strictEqual(parsed.radioType, '802.11n');
    assert.strictEqual(parsed.channel, 11);
    assert.strictEqual(parsed.band, '2.4 GHz');
    assert.strictEqual(parsed.authentication, 'WPA2-Personal');
    assert.strictEqual(parsed.cipher, 'CCMP');
    assert.strictEqual(parsed.rxRateMbps, 150);
    assert.strictEqual(parsed.txRateMbps, 150);
    assert.strictEqual(parsed.signalPercent, 80);
  });

  test('2.12 parseNetshIpv4ConfigOutput trích xuất đúng DHCP, Default Gateway & nhiều máy chủ DNS', () => {
    const sampleIpCfg = `
Configuration for interface "Wi-Fi"
    DHCP enabled:                         Yes
    IP Address:                           192.168.24.100
    Subnet Prefix:                        192.168.24.0/24 (mask 255.255.255.0)
    Default Gateway:                      192.168.24.1
    Gateway Metric:                       0
    DNS servers configured through DHCP:  1.1.1.1
                                          8.8.8.8
    Register with which suffix:           Primary only
`;
    const parsed = biometricServer.parseNetshIpv4ConfigOutput(sampleIpCfg);
    assert.strictEqual(parsed.dhcpEnabled, true);
    assert.strictEqual(parsed.defaultGateway, '192.168.24.1');
    assert.deepStrictEqual(parsed.dnsServers, ['1.1.1.1', '8.8.8.8']);
  });

  // =========================================================================
  // PHẦN 3: WEBAUTHN ECDSA P-256 CRYPTOGRAPHY & API ROUTE TESTS
  // =========================================================================
  console.log('\n--- PHẦN 3: WEBAUTHN ECDSA P-256 & API /api/hrm/attendance/biometric ---');

  const laptopKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const laptopPubSpki = laptopKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  const laptopCredId = toBase64Url(crypto.randomBytes(24));

  const mobileKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const mobilePubSpki = mobileKeyPair.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  const mobileCredId = toBase64Url(crypto.randomBytes(24));

  const attackerKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  async function callBiometricPost(payload, headers = {}) {
    const req = new Request('https://localhost:3000/api/hrm/attendance/biometric', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        ...headers,
      },
      body: JSON.stringify(payload),
    });
    const res = await biometricRoute.POST(req);
    const json = await res.json();
    return { status: res.status, json };
  }

  await testAsync('3.1 GET /api/hrm/attendance/biometric trả trạng thái mạng, hostWifiDetails & danh sách thiết bị (200)', async () => {
    const req = new Request('http://localhost:3000/api/hrm/attendance/biometric?employee_id=emp-001', {
      headers: { host: 'localhost:3000' },
    });
    const res = await biometricRoute.GET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.wifi.allowed, true);
    assert.ok(Array.isArray(data.credentials));
    assert.ok(data.hostWifiDetails && typeof data.hostWifiDetails === 'object', 'Thiếu hostWifiDetails trong GET');
    assert.strictEqual(typeof data.hostWifiDetails.probedAt, 'string');
    assert.ok(Array.isArray(data.hostWifiDetails.dnsServers));
  });

  await testAsync('3.1b POST action=network_status trả đầy đủ hostWifiDetails telemetry (200)', async () => {
    const { status, json } = await callBiometricPost({
      action: 'network_status',
      employeeId: 'emp-001',
      rpId: 'localhost',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.success, true);
    assert.ok(json.hostWifiDetails && typeof json.hostWifiDetails === 'object');
    assert.strictEqual(typeof json.hostWifiDetails.probedAt, 'string');
    assert.ok(Array.isArray(json.hostWifiDetails.dnsServers));
  });

  await testAsync('3.2 RBAC: EMPLOYEE thường không được sửa chính sách WiFi công ty (403)', async () => {
    const { status, json } = await callBiometricPost({
      action: 'save_wifi_policy',
      actorRole: 'EMPLOYEE',
      policy: { enforce_same_wifi: false },
    });
    assert.strictEqual(status, 403);
    assert.strictEqual(json.success, false);
  });

  await testAsync('3.3 RBAC: HR_MANAGER cập nhật chính sách WiFi công ty thành công (200)', async () => {
    const { status, json } = await callBiometricPost({
      action: 'save_wifi_policy',
      actorRole: 'HR_MANAGER',
      actorName: 'Trưởng phòng Nhân sự',
      policy: {
        wifi_ssid_label: 'LacViet-HQ-WiFi',
        enforce_same_wifi: true,
        require_biometric_for_punch: true,
        allowed_public_ips: ['203.113.152.10'],
      },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.policy.wifi_ssid_label, 'LacViet-HQ-WiFi');
  });

  await testAsync('3.4 Điện thoại qua DevTunnel dùng 4G bị chặn cấp challenge chấm công (403 CELLULAR_BLOCKED) & ghi Audit', async () => {
    const { status, json } = await callBiometricPost(
      {
        action: 'issue_challenge',
        purpose: 'punch',
        employeeId: 'emp-001',
        employeeCode: 'NV-2026-001',
        employeeName: 'Nguyễn Minh Hoàng',
        rpId: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
        clientHints: { connectionType: 'cellular', effectiveType: '4g' },
      },
      {
        host: 'vkvhkqb6-3000.jpe1.devtunnels.ms',
        origin: 'https://vkvhkqb6-3000.jpe1.devtunnels.ms',
      }
    );
    assert.strictEqual(status, 403);
    assert.strictEqual(json.code, 'CELLULAR_BLOCKED');
    const audits = globalThis._hrmSyncStore.hrm_runtime_audit_logs;
    assert.ok(Array.isArray(audits) && audits.some((a) => a.action === 'WIFI_CHECK_BLOCKED'));
  });

  await testAsync('3.5 Đăng ký vân tay Laptop Windows Hello trên localhost (ECDSA P-256 -> HTTP 201)', async () => {
    const ch = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'register',
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(ch.status, 200);

    const clientDataJSON = encodeClientData({
      type: 'webauthn.create',
      challenge: ch.json.challenge,
      origin: 'http://localhost:3000',
    });
    const authDataBuf = buildAuthenticatorData('localhost', 0x05, 0); // UP=1, UV=1

    const reg = await callBiometricPost({
      action: 'verify_register',
      challengeId: ch.json.challengeId,
      credentialId: laptopCredId,
      clientDataJSON,
      publicKeySpki: laptopPubSpki,
      publicKeyAlg: -7,
      authenticatorData: toBase64Url(authDataBuf),
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      fullName: 'Nguyễn Minh Hoàng',
      deviceLabel: 'Windows Hello · Laptop HP EliteBook',
      deviceKind: 'LAPTOP',
      rpId: 'localhost',
    });
    assert.strictEqual(reg.status, 201);
    assert.strictEqual(reg.json.success, true);
    assert.strictEqual(reg.json.credential.device_kind, 'LAPTOP');
    assert.strictEqual(reg.json.credential.rp_id, 'localhost');
  });

  await testAsync('3.6 Đăng ký vân tay Điện thoại qua DevTunnel chung WiFi (MOBILE -> HTTP 201)', async () => {
    const mobileOrigin = 'https://vkvhkqb6-3000.jpe1.devtunnels.ms';
    const mobileHost = 'vkvhkqb6-3000.jpe1.devtunnels.ms';
    const ch = await callBiometricPost(
      {
        action: 'issue_challenge',
        purpose: 'register',
        employeeId: 'emp-001',
        employeeCode: 'NV-2026-001',
        rpId: mobileHost,
        clientHints: { connectionType: 'wifi', publicIpv4: HOST_PUBLIC_IPV4 },
      },
      { host: mobileHost, origin: mobileOrigin }
    );
    assert.strictEqual(ch.status, 200);

    const clientDataJSON = encodeClientData({
      type: 'webauthn.create',
      challenge: ch.json.challenge,
      origin: mobileOrigin,
    });
    const authDataBuf = buildAuthenticatorData(mobileHost, 0x05, 0);

    const reg = await callBiometricPost(
      {
        action: 'verify_register',
        challengeId: ch.json.challengeId,
        credentialId: mobileCredId,
        clientDataJSON,
        publicKeySpki: mobilePubSpki,
        publicKeyAlg: -7,
        authenticatorData: toBase64Url(authDataBuf),
        employeeId: 'emp-001',
        employeeCode: 'NV-2026-001',
        fullName: 'Nguyễn Minh Hoàng',
        deviceLabel: 'Cảm biến vân tay Điện thoại (Android)',
        deviceKind: 'MOBILE',
        rpId: mobileHost,
        clientHints: { connectionType: 'wifi', publicIpv4: HOST_PUBLIC_IPV4 },
      },
      { host: mobileHost, origin: mobileOrigin }
    );
    assert.strictEqual(reg.status, 201);
    assert.strictEqual(reg.json.credential.device_kind, 'MOBILE');
  });

  await testAsync('3.6b Đăng ký & chấm công Windows Hello TPM RSA-2048 (alg -257) thành công (201 -> 200)', async () => {
    const rsaKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rsaPubSpki = rsaKeyPair.publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('base64');
    const rsaCredId = toBase64Url(crypto.randomBytes(24));

    const chReg = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'register',
      employeeId: 'emp-003',
      employeeCode: 'NV-2024-003',
      rpId: 'localhost',
    });
    assert.strictEqual(chReg.status, 200);

    const regClientData = encodeClientData({
      type: 'webauthn.create',
      challenge: chReg.json.challenge,
      origin: 'http://localhost:3000',
    });
    const regAuthData = buildAuthenticatorData('localhost', 0x05, 0);

    const regRes = await callBiometricPost({
      action: 'verify_register',
      challengeId: chReg.json.challengeId,
      credentialId: rsaCredId,
      clientDataJSON: regClientData,
      publicKeySpki: rsaPubSpki,
      publicKeyAlg: -257,
      authenticatorData: toBase64Url(regAuthData),
      employeeId: 'emp-003',
      employeeCode: 'NV-2024-003',
      fullName: 'Lê Hoàng Nam',
      deviceLabel: 'Đầu đọc vân tay Laptop (Windows Hello)',
      deviceKind: 'LAPTOP',
      rpId: 'localhost',
    });
    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.json.credential.public_key_alg, -257);

    const chPunch = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'punch',
      employeeId: 'emp-003',
      employeeCode: 'NV-2024-003',
      rpId: 'localhost',
    });
    assert.strictEqual(chPunch.status, 200);

    const punchClientData = encodeClientData({
      type: 'webauthn.get',
      challenge: chPunch.json.challenge,
      origin: 'http://localhost:3000',
    });
    const punchAuthData = buildAuthenticatorData('localhost', 0x05, 9);
    const rsaSignature = signWebAuthnAssertion(punchAuthData, punchClientData, rsaKeyPair.privateKey);

    const punchRes = await callBiometricPost({
      action: 'verify_punch',
      challengeId: chPunch.json.challengeId,
      credentialId: rsaCredId,
      clientDataJSON: punchClientData,
      authenticatorData: toBase64Url(punchAuthData),
      signature: rsaSignature,
      employeeId: 'emp-003',
      employeeCode: 'NV-2024-003',
      rpId: 'localhost',
    });
    assert.strictEqual(punchRes.status, 200);
    assert.strictEqual(punchRes.json.success, true);
    assert.strictEqual(punchRes.json.credential.sign_count, 9);
  });

  let lastUsedChallengeId = '';
  let lastValidClientData = '';
  let lastValidAuthData = '';
  let lastValidSignature = '';

  await testAsync('3.7 Chấm công bằng chữ ký vân tay thật trên Laptop (verify_punch -> 200, sign_count=5)', async () => {
    const ch = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'punch',
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(ch.status, 200);

    const clientDataJSON = encodeClientData({
      type: 'webauthn.get',
      challenge: ch.json.challenge,
      origin: 'http://localhost:3000',
    });
    const authDataBuf = buildAuthenticatorData('localhost', 0x05, 5);
    const signature = signWebAuthnAssertion(authDataBuf, clientDataJSON, laptopKeyPair.privateKey);

    lastUsedChallengeId = ch.json.challengeId;
    lastValidClientData = clientDataJSON;
    lastValidAuthData = toBase64Url(authDataBuf);
    lastValidSignature = signature;

    const punch = await callBiometricPost({
      action: 'verify_punch',
      challengeId: lastUsedChallengeId,
      credentialId: laptopCredId,
      clientDataJSON: lastValidClientData,
      authenticatorData: lastValidAuthData,
      signature: lastValidSignature,
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(punch.status, 200);
    assert.strictEqual(punch.json.success, true);
    assert.strictEqual(punch.json.credential.sign_count, 5);
  });

  await testAsync('3.8 Chống tấn công phát lại (Replay Attack): Dùng lại challengeId đã tiêu -> 403 BLOCK', async () => {
    const replay = await callBiometricPost({
      action: 'verify_punch',
      challengeId: lastUsedChallengeId,
      credentialId: laptopCredId,
      clientDataJSON: lastValidClientData,
      authenticatorData: lastValidAuthData,
      signature: lastValidSignature,
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(replay.status, 403);
    assert.strictEqual(replay.json.success, false);
  });

  await testAsync('3.9 Chặn assertion thiếu cờ User Verification (UV=0, chỉ UP=1 flags=0x01) -> 403 BLOCK', async () => {
    const ch = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'punch',
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    const clientDataJSON = encodeClientData({
      type: 'webauthn.get',
      challenge: ch.json.challenge,
      origin: 'http://localhost:3000',
    });
    const authDataBuf = buildAuthenticatorData('localhost', 0x01, 6); // UV=0!
    const signature = signWebAuthnAssertion(authDataBuf, clientDataJSON, laptopKeyPair.privateKey);

    const punch = await callBiometricPost({
      action: 'verify_punch',
      challengeId: ch.json.challengeId,
      credentialId: laptopCredId,
      clientDataJSON,
      authenticatorData: toBase64Url(authDataBuf),
      signature,
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(punch.status, 403);
    assert.ok(punch.json.error.includes('UV=0'));
  });

  await testAsync('3.10 Chặn chữ ký giả mạo ký bằng Private Key khác -> 403 BLOCK', async () => {
    const ch = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'punch',
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    const clientDataJSON = encodeClientData({
      type: 'webauthn.get',
      challenge: ch.json.challenge,
      origin: 'http://localhost:3000',
    });
    const authDataBuf = buildAuthenticatorData('localhost', 0x05, 6);
    const badSignature = signWebAuthnAssertion(authDataBuf, clientDataJSON, attackerKeyPair.privateKey);

    const punch = await callBiometricPost({
      action: 'verify_punch',
      challengeId: ch.json.challengeId,
      credentialId: laptopCredId,
      clientDataJSON,
      authenticatorData: toBase64Url(authDataBuf),
      signature: badSignature,
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(punch.status, 403);
  });

  await testAsync('3.11 Chặn khóa bị nhân bản có signCount quay lùi (3 < 5) -> 403 BLOCK', async () => {
    const ch = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'punch',
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    const clientDataJSON = encodeClientData({
      type: 'webauthn.get',
      challenge: ch.json.challenge,
      origin: 'http://localhost:3000',
    });
    const authDataBuf = buildAuthenticatorData('localhost', 0x05, 3); // signCount=3 < saved 5
    const signature = signWebAuthnAssertion(authDataBuf, clientDataJSON, laptopKeyPair.privateKey);

    const punch = await callBiometricPost({
      action: 'verify_punch',
      challengeId: ch.json.challengeId,
      credentialId: laptopCredId,
      clientDataJSON,
      authenticatorData: toBase64Url(authDataBuf),
      signature,
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(punch.status, 403);
    assert.ok(punch.json.error.includes('signCount'));
  });

  await testAsync('3.11b Cảm biến giữ nguyên signCount (5 === 5) khi Check-out liên tiếp -> 200 PASS', async () => {
    const ch = await callBiometricPost({
      action: 'issue_challenge',
      purpose: 'punch',
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    const clientDataJSON = encodeClientData({
      type: 'webauthn.get',
      challenge: ch.json.challenge,
      origin: 'http://localhost:3000',
    });
    const authDataBuf = buildAuthenticatorData('localhost', 0x05, 5); // unchanged signCount=5
    const signature = signWebAuthnAssertion(authDataBuf, clientDataJSON, laptopKeyPair.privateKey);

    const punch = await callBiometricPost({
      action: 'verify_punch',
      challengeId: ch.json.challengeId,
      credentialId: laptopCredId,
      clientDataJSON,
      authenticatorData: toBase64Url(authDataBuf),
      signature,
      employeeId: 'emp-001',
      employeeCode: 'NV-2026-001',
      rpId: 'localhost',
    });
    assert.strictEqual(punch.status, 200);
    assert.strictEqual(punch.json.success, true);
    assert.strictEqual(punch.json.credential.sign_count, 5);
  });

  await testAsync('3.12 Gỡ bỏ khóa vân tay thiết bị qua API (delete_credential -> 200)', async () => {
    const del = await callBiometricPost({
      action: 'delete_credential',
      credentialId: mobileCredId,
    });
    assert.strictEqual(del.status, 200);
    assert.strictEqual(del.json.credentials.some((c) => c.credential_id === mobileCredId), false);
  });

  // =========================================================================
  // PHẦN 4: RUNTIME STORE BIOMETRIC + CHẤM CÔNG + BẢNG CÔNG THÁNG + AUDIT
  // =========================================================================
  console.log('\n--- PHẦN 4: RUNTIME STORE CHẤM CÔNG VÂN TAY & AUDIT LOG ---');

  test('4.1 saveBiometricCredential & getBiometricCredentials lọc theo employee & rpId', () => {
    const cred = runtimeStore.saveBiometricCredential({
      id: 'bio-test-laptop-1',
      employee_id: 'emp-002',
      employee_code: 'NV-2026-002',
      full_name: 'Trần Thị Thu Hà',
      credential_id: 'cred-store-laptop-01',
      public_key_spki: laptopPubSpki,
      public_key_alg: -7,
      rp_id: 'localhost',
      device_label: 'Laptop ThinkPad X1 Touch',
      device_kind: 'LAPTOP',
      sign_count: 1,
      registered_ip: '192.168.1.50',
      last_used_at: '2026-11-22T01:00:00Z',
      created_at: '2026-11-22T01:00:00Z',
    });
    assert.strictEqual(cred.credential_id, 'cred-store-laptop-01');
    const found = runtimeStore.getBiometricCredentials('emp-002', 'localhost');
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].device_label, 'Laptop ThinkPad X1 Touch');
  });

  test('4.2 saveWifiAttendancePolicy & getWifiAttendancePolicy lưu cấu hình WiFi và ghi audit', () => {
    const updated = runtimeStore.saveWifiAttendancePolicy(
      {
        wifi_ssid_label: 'LacViet-HQ-Floor3',
        enforce_same_wifi: true,
        require_biometric_for_punch: true,
        allowed_public_ips: ['203.113.152.10'],
      },
      'Giám đốc Vận hành'
    );
    assert.strictEqual(updated.wifi_ssid_label, 'LacViet-HQ-Floor3');
    const fetched = runtimeStore.getWifiAttendancePolicy();
    assert.strictEqual(fetched.wifi_ssid_label, 'LacViet-HQ-Floor3');
    assert.deepStrictEqual(fetched.allowed_public_ips, ['203.113.152.10']);
  });

  test('4.3 checkInOutToday với source BIOMETRIC_FINGERPRINT ghi nhận metadata vân tay/WiFi & audit BIOMETRIC_CHECK_IN_OUT', () => {
    const activeEmp =
      employeesMock.MOCK_EMPLOYEES.find((e) => e.id === 'emp-001') ||
      employeesMock.MOCK_EMPLOYEES[0];

    const checkInRec = runtimeStore.checkInOutToday({
      employeeId: activeEmp.id,
      date: '2026-11-20',
      action: 'CHECK_IN',
      timeHHmm: '09:15',
      source: 'BIOMETRIC_FINGERPRINT',
      authMethod: 'WEBAUTHN_FINGERPRINT',
      biometricDeviceLabel: 'Windows Hello · Laptop Công ty',
      verifiedNetworkIp: '192.168.1.50',
      wifiMatchMode: 'HOST_LOCAL',
    });

    assert.strictEqual(checkInRec.source, 'BIOMETRIC_FINGERPRINT');
    assert.strictEqual(checkInRec.auth_method, 'WEBAUTHN_FINGERPRINT');
    assert.strictEqual(checkInRec.biometric_device_label, 'Windows Hello · Laptop Công ty');
    assert.strictEqual(checkInRec.verified_network_ip, '192.168.1.50');
    assert.strictEqual(checkInRec.wifi_match_mode, 'HOST_LOCAL');
    assert.strictEqual(checkInRec.status, 'MISSING_PUNCH');
    assert.strictEqual(checkInRec.late_minutes, 0);
    assert.strictEqual(checkInRec.workday_value, 0);

    const checkOutRec = runtimeStore.checkInOutToday({
      employeeId: activeEmp.id,
      date: '2026-11-20',
      action: 'CHECK_OUT',
      timeHHmm: '17:35',
      source: 'BIOMETRIC_FINGERPRINT',
      authMethod: 'WEBAUTHN_FINGERPRINT',
      biometricDeviceLabel: 'Vân tay Điện thoại (Android)',
      verifiedNetworkIp: '203.113.152.10',
      wifiMatchMode: 'SAME_WIFI_NAT_IP',
    });

    assert.strictEqual(checkOutRec.check_in, '09:15');
    assert.strictEqual(checkOutRec.check_out, '17:35');
    assert.strictEqual(checkOutRec.status, 'LATE');
    assert.strictEqual(checkOutRec.late_minutes, 75);
    assert.strictEqual(checkOutRec.workday_value, 1);
    assert.strictEqual(checkOutRec.wifi_match_mode, 'SAME_WIFI_NAT_IP');

    const logs = auditLogger.getRuntimeAuditLogs();
    const bioLogs = logs.filter((l) => l.action === 'BIOMETRIC_CHECK_IN_OUT');
    assert.ok(bioLogs.length >= 2, 'Phải ghi đủ audit log BIOMETRIC_CHECK_IN_OUT cho check-in & check-out');
  });

  test('4.3b Check-in ngày hôm nay (getTodayDateVN) -> WORKING (không báo MISSING_PUNCH) & Check-out chuẩn 1.0 công', () => {
    const todayVN = runtimeStore.getTodayDateVN();
    const activeEmp =
      employeesMock.MOCK_EMPLOYEES.find((e) => e.id === 'emp-002') ||
      employeesMock.MOCK_EMPLOYEES[0];

    const morningIn = runtimeStore.checkInOutToday({
      employeeId: activeEmp.id,
      date: todayVN,
      action: 'CHECK_IN',
      timeHHmm: '07:23',
      source: 'BIOMETRIC_FINGERPRINT',
      authMethod: 'WEBAUTHN_FINGERPRINT',
      biometricDeviceLabel: 'Windows Hello · Laptop Công ty',
      verifiedNetworkIp: '192.168.24.100',
      wifiMatchMode: 'HOST_LOCAL',
    });
    assert.strictEqual(morningIn.status, 'WORKING', 'Check-in trong ngày chưa check-out phải là WORKING');
    assert.strictEqual(morningIn.workday_value, 0);

    const standardOut = runtimeStore.checkInOutToday({
      employeeId: activeEmp.id,
      date: todayVN,
      action: 'CHECK_OUT',
      timeHHmm: '17:00',
      checkInTimeOverride: '08:00',
      source: 'BIOMETRIC_FINGERPRINT',
      authMethod: 'WEBAUTHN_FINGERPRINT',
      biometricDeviceLabel: 'Windows Hello · Laptop Công ty',
      verifiedNetworkIp: '192.168.24.100',
      wifiMatchMode: 'HOST_LOCAL',
    });
    assert.strictEqual(standardOut.check_in, '08:00');
    assert.strictEqual(standardOut.check_out, '17:00');
    assert.strictEqual(standardOut.status, 'PRESENT');
    assert.strictEqual(standardOut.workday_value, 1);

    // Kiểm tra evaluateDailyPunch tự chuyển ca hôm qua chưa check-out thành MISSING_PUNCH
    const pastUnclosed = runtimeStore.evaluateDailyPunch({
      shiftCode: 'HC-08:00',
      checkIn: '08:00',
      checkOut: null,
      date: '2026-11-19',
      todayDate: todayVN,
    });
    assert.strictEqual(pastUnclosed.status, 'MISSING_PUNCH');
  });

  test('4.3c Chặn chấm công ngoài khung giờ 22:00 – 06:00 sáng (22:15 & 01:36)', () => {
    const todayVN = runtimeStore.getTodayDateVN();
    const activeEmp =
      employeesMock.MOCK_EMPLOYEES.find((e) => e.id === 'emp-002') ||
      employeesMock.MOCK_EMPLOYEES[0];

    assert.strictEqual(runtimeStore.isAttendanceNightLockWindow('22:15'), true);
    assert.strictEqual(runtimeStore.isAttendanceNightLockWindow('01:36'), true);
    assert.strictEqual(runtimeStore.isAttendanceNightLockWindow('06:00'), false);
    assert.strictEqual(runtimeStore.isAttendanceNightLockWindow('21:59'), false);

    assert.throws(
      () =>
        runtimeStore.checkInOutToday({
          employeeId: activeEmp.id,
          date: todayVN,
          action: 'CHECK_IN',
          timeHHmm: '22:15',
          source: 'BIOMETRIC_FINGERPRINT',
        }),
      /Ngoài khung giờ chấm công/
    );

    assert.throws(
      () =>
        runtimeStore.checkInOutToday({
          employeeId: activeEmp.id,
          date: todayVN,
          action: 'CHECK_OUT',
          timeHHmm: '01:36',
          source: 'BIOMETRIC_FINGERPRINT',
        }),
      /Ngoài khung giờ chấm công/
    );
  });

  test('4.4 checkInOutToday mặc định vẫn giữ WEB_CLOCK để tương thích ngược toàn bộ test cũ', () => {
    const activeEmp = employeesMock.MOCK_EMPLOYEES[0];
    const rec = runtimeStore.checkInOutToday({
      employeeId: activeEmp.id,
      date: '2026-11-21',
      action: 'CHECK_IN',
      timeHHmm: '07:55',
    });
    assert.strictEqual(rec.source, 'WEB_CLOCK');
    assert.strictEqual(rec.auth_method, 'MANUAL_WEB');
  });

  test('4.5 removeBiometricCredential xóa thiết bị khỏi LocalStorage', () => {
    runtimeStore.removeBiometricCredential('cred-store-laptop-01', 'HR Admin');
    const remaining = runtimeStore.getBiometricCredentials('emp-002');
    assert.strictEqual(remaining.some((c) => c.credential_id === 'cred-store-laptop-01'), false);
  });
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('\n======================================================================');
console.log(` KẾT QUẢ BIOMETRIC + SAME-WIFI SUITE: ${passed} ĐẠT / ${failed} LỖI`);
console.log('======================================================================');
if (failed > 0) process.exit(1);
