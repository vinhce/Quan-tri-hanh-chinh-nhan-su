import { spawn } from 'child_process';
import crypto from 'crypto';
import dns from 'dns/promises';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8001/v1';
const LOCAL_MODEL_ALIAS = 'lacviet-hrm-qwen2.5-1.5b';
const MAX_ATTEMPTS = 6;
const RETRY_INTERVAL_MS = 8_000;
const LOCAL_HEALTH_TIMEOUT_MS = 1_000;
const REMOTE_HEALTH_TIMEOUT_MS = 5_000;
const MIN_SESSION_SECRET_LENGTH = 32;

function ensureLocalSessionSecretInEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      const generated = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(envPath, `HRM_SESSION_SECRET=${generated}\n`, 'utf-8');
      return;
    }

    const rawContent = fs.readFileSync(envPath, 'utf-8');
    const lines = rawContent.split(/\r?\n/);
    let foundIdx = -1;
    let hasValidSecret = false;

    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key !== 'HRM_SESSION_SECRET') continue;
      foundIdx = i;
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1).trim();
      }
      if (
        val.length >= MIN_SESSION_SECRET_LENGTH &&
        val !== 'YOUR_32_CHAR_RANDOM_SECRET_HERE'
      ) {
        hasValidSecret = true;
      }
      break;
    }

    if (hasValidSecret) {
      return;
    }

    const generated = crypto.randomBytes(32).toString('hex');
    if (foundIdx >= 0) {
      lines[foundIdx] = `HRM_SESSION_SECRET=${generated}`;
      const eol = rawContent.includes('\r\n') ? '\r\n' : '\n';
      fs.writeFileSync(envPath, lines.join(eol), 'utf-8');
    } else {
      const needsNewline = rawContent.length > 0 && !rawContent.endsWith('\n');
      const prefix = needsNewline ? '\n' : '';
      fs.appendFileSync(envPath, `${prefix}HRM_SESSION_SECRET=${generated}\n`, 'utf-8');
    }
  } catch {
    // Ignore .env write failure in read-only environments
  }
}

function readSettingFromEnvFile(targetKey) {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return '';
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key !== targetKey) continue;
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1).trim();
      }
      return val;
    }
  } catch {
    // ignore missing or unreadable .env
  }
  return '';
}

function readCopilotBaseUrlFromEnvFile() {
  return readSettingFromEnvFile('COPILOT_LLM_BASE_URL');
}

export function resolveLocalLoraConfig(env = process.env) {
  const rawNoLora = (
    (env?.NO_LORA || '').trim() || readSettingFromEnvFile('NO_LORA')
  ).toLowerCase();
  if (rawNoLora === '1' || rawNoLora === 'true' || rawNoLora === 'yes') {
    return { useLora: false, scale: 0 };
  }

  const rawScale =
    (env?.LORA_SCALE || '').trim() || readSettingFromEnvFile('LORA_SCALE') || '0.6';
  const parsed = Number(rawScale);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    return { useLora: true, scale: 0.6 };
  }
  if (parsed === 0) {
    return { useLora: false, scale: 0 };
  }
  return { useLora: true, scale: Number(parsed.toFixed(2)) };
}

function isBlockedIpv4Octets(octets) {
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function expandIpv6ToWords(rawIp) {
  let work = rawIp.toLowerCase();
  const lastColon = work.lastIndexOf(':');
  if (lastColon >= 0 && work.slice(lastColon + 1).includes('.')) {
    const v4Part = work.slice(lastColon + 1);
    if (!net.isIPv4(v4Part)) return null;
    const octets = v4Part.split('.').map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    work = `${work.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = work.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part) => {
    if (!part) return [];
    const tokens = part.split(':');
    const out = [];
    for (const tok of tokens) {
      if (!/^[0-9a-f]{1,4}$/i.test(tok)) return null;
      out.push(parseInt(tok, 16));
    }
    return out;
  };

  if (halves.length === 1) {
    const words = parseGroups(halves[0]);
    return words && words.length === 8 ? words : null;
  }

  const left = parseGroups(halves[0]);
  const right = parseGroups(halves[1]);
  if (!left || !right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

function isBlockedPrivateOrMetadataIp(ipRaw) {
  const clean = String(ipRaw || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('%')[0]
    .toLowerCase();
  if (!clean) return true;

  if (net.isIPv4(clean)) {
    return isBlockedIpv4Octets(clean.split('.').map(Number));
  }

  if (net.isIPv6(clean)) {
    const words = expandIpv6ToWords(clean);
    if (!words) return true;

    const isAllZeroPrefix6 =
      words[0] === 0 &&
      words[1] === 0 &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0 &&
      words[5] === 0;
    if (isAllZeroPrefix6 && words[6] === 0 && (words[7] === 0 || words[7] === 1)) {
      return true;
    }

    const isIpv4Compatible = isAllZeroPrefix6;
    const isIpv4Mapped =
      words[0] === 0 &&
      words[1] === 0 &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0 &&
      words[5] === 0xffff;
    const isIpv4Translated =
      words[0] === 0 &&
      words[1] === 0 &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0xffff &&
      words[5] === 0;
    const isNat64 =
      words[0] === 0x0064 &&
      words[1] === 0xff9b &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0 &&
      words[5] === 0;

    if (isIpv4Compatible || isIpv4Mapped || isIpv4Translated || isNat64) {
      const octets = [
        (words[6] >> 8) & 0xff,
        words[6] & 0xff,
        (words[7] >> 8) & 0xff,
        words[7] & 0xff,
      ];
      return isBlockedIpv4Octets(octets);
    }

    if ((words[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((words[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((words[0] & 0xffc0) === 0xfec0) return true; // fec0::/10
    if ((words[0] & 0xff00) === 0xff00) return true; // ff00::/8
    if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return true;
    if (words[0] === 0x2001 && words[1] === 0x0db8) return true;
    return false;
  }

  return true;
}

function resolveSafeTarget(rawUrl) {
  let parsed;
  try {
    parsed = new URL((rawUrl || DEFAULT_BASE_URL).trim());
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname.endsWith('.')) {
    return null;
  }

  const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocalDevHost) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
  } else {
    if (parsed.protocol !== 'https:') {
      return null;
    }
    if (net.isIP(hostname) && isBlockedPrivateOrMetadataIp(hostname)) {
      return null;
    }
    if (hostname === '::1' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return null;
    }
  }

  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return {
    origin: parsed.origin,
    healthUrl: `${parsed.origin}/health`,
    hostname,
    port,
    isLocalDevHost,
  };
}

export function getLocalModelPaths() {
  const modelsDir = path.join(process.cwd(), 'models');
  const binDir = path.join(modelsDir, 'llama-bin');
  const serverExePath = path.join(binDir, 'llama-server.exe');
  const basePath = path.join(modelsDir, 'qwen2.5-1.5b-instruct-q4_k_m.gguf');
  const loraPath = path.join(modelsDir, 'lacviet-copilot-lora.gguf');
  return { binDir, serverExePath, basePath, loraPath };
}

export function hasAllLocalModelFiles(paths, useLora = true) {
  return (
    fs.existsSync(paths.serverExePath) &&
    fs.existsSync(paths.basePath) &&
    (!useLora || fs.existsSync(paths.loraPath))
  );
}

export function formatLoraScaledArg(loraPath, scale, cwd = process.cwd()) {
  const normalizedRaw = String(loraPath || '').replace(/\\/g, '/');
  if (normalizedRaw.includes(':')) {
    const rel = path.relative(cwd, loraPath).replace(/\\/g, '/');
    if (rel && !rel.includes(':')) {
      return `${rel}:${scale}`;
    }
  }
  return `${normalizedRaw}:${scale}`;
}

export function buildLocalLlamaServerArgs(
  paths,
  port,
  loraConfig = resolveLocalLoraConfig(),
  cwd = process.cwd()
) {
  return [
    '-m',
    paths.basePath,
    ...(loraConfig.useLora
      ? ['--lora-scaled', formatLoraScaledArg(paths.loraPath, loraConfig.scale, cwd)]
      : []),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '-c',
    '4096',
    '--jinja',
    '--temp',
    '0.2',
    '--repeat-penalty',
    '1.1',
    '-np',
    '1',
    '-t',
    '10',
    '--alias',
    LOCAL_MODEL_ALIAS,
  ];
}

async function isSafeDnsTarget(target) {
  if (target.isLocalDevHost || net.isIP(target.hostname)) {
    return true;
  }
  const records = await dns.lookup(target.hostname, { all: true });
  return !records.some((r) => isBlockedPrivateOrMetadataIp(r.address));
}

async function runRemoteWorker(target) {
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const safeDns = await isSafeDnsTarget(target);
        if (!safeDns) {
          return;
        }
        const res = await fetch(target.healthUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(REMOTE_HEALTH_TIMEOUT_MS),
        });
        if (res.ok) {
          return;
        }
      } catch {
        // Remote endpoint may be waking or offline; retry quietly
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      }
    }
  } catch {
    // Silent worker exit
  }
}

async function ensureLoopbackTargetServer(target, options = {}) {
  const silent = Boolean(options.silent);
  const logsDir = path.join(process.cwd(), 'logs');
  const logPath = path.join(logsDir, 'llama-server.log');

  try {
    const res = await fetch(target.healthUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(LOCAL_HEALTH_TIMEOUT_MS),
    });
    if (res.status === 200) {
      const message = `[AI Copilot] Local llama-server sẵn sàng tại ${target.origin}`;
      if (!silent) console.log(message);
      return { status: 'ready', origin: target.origin, logPath, message };
    }
  } catch {
    // Server not yet running; fall through to spawn check
  }

  const loraConfig = resolveLocalLoraConfig(options.env || process.env);
  const paths = getLocalModelPaths();
  if (!hasAllLocalModelFiles(paths, loraConfig.useLora)) {
    const message =
      '[AI Copilot] Chưa có đủ file model trong models/ — tạm dùng chế độ dự phòng nội bộ';
    if (!silent) console.log(message);
    return { status: 'unavailable', origin: target.origin, logPath, message };
  }

  let logFd = null;
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    logFd = fs.openSync(logPath, 'a');
    const args = buildLocalLlamaServerArgs(paths, target.port, loraConfig);
    const child = spawn(paths.serverExePath, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
      cwd: process.cwd(),
    });
    child.unref();
    const loraText = loraConfig.useLora ? `LORA_SCALE=${loraConfig.scale}` : 'NO_LORA=1';
    const message = `[AI Copilot] Đã khởi động Local llama-server (${loraText}, -c 4096) tại ${target.origin}, log: logs/llama-server.log`;
    if (!silent) console.log(message);
    return { status: 'warming_up', origin: target.origin, logPath, message };
  } catch {
    const message =
      '[AI Copilot] Không thể khởi chạy Local llama-server — tạm dùng chế độ dự phòng nội bộ';
    if (!silent) console.log(message);
    return { status: 'unavailable', origin: target.origin, logPath, message };
  } finally {
    if (logFd !== null) {
      try {
        fs.closeSync(logFd);
      } catch {
        // ignore close failure
      }
    }
  }
}

export async function ensureLocalLlamaServer(options = {}) {
  const rawBaseUrl =
    (options.baseUrl || '').trim() ||
    (process.env.COPILOT_LOCAL_BASE_URL || '').trim() ||
    readSettingFromEnvFile('COPILOT_LOCAL_BASE_URL') ||
    (process.env.COPILOT_LLM_BASE_URL || '').trim() ||
    readCopilotBaseUrlFromEnvFile() ||
    DEFAULT_BASE_URL;

  const target = resolveSafeTarget(rawBaseUrl);
  if (!target || !target.isLocalDevHost) {
    return {
      status: 'unavailable',
      origin: rawBaseUrl,
      logPath: path.join(process.cwd(), 'logs', 'llama-server.log'),
      message: '[AI Copilot] Chỉ hỗ trợ khởi động tự động Local llama-server trên loopback.',
    };
  }
  return ensureLoopbackTargetServer(target, options);
}

async function handleLoopbackTarget(target) {
  await ensureLoopbackTargetServer(target);
  process.exit(0);
}

async function main() {
  const isWorker = process.argv.includes('--worker');
  if (!isWorker) {
    ensureLocalSessionSecretInEnv();
  }

  const rawBaseUrl =
    (process.env.COPILOT_LOCAL_BASE_URL || '').trim() ||
    readSettingFromEnvFile('COPILOT_LOCAL_BASE_URL') ||
    (process.env.COPILOT_LLM_BASE_URL || '').trim() ||
    readCopilotBaseUrlFromEnvFile() ||
    DEFAULT_BASE_URL;

  const target = resolveSafeTarget(rawBaseUrl);

  if (!target) {
    process.exit(0);
    return;
  }

  if (isWorker) {
    if (!target.isLocalDevHost) {
      await runRemoteWorker(target);
    }
    process.exit(0);
    return;
  }

  if (target.isLocalDevHost) {
    await handleLoopbackTarget(target);
    return;
  }

  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, [scriptPath, '--worker'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
    });
    child.unref();
  } catch {
    // Never block npm run dev on spawn error
  }

  console.log(`[AI Copilot] Auto-wake ping sent to external endpoint (${target.healthUrl})...`);
  process.exit(0);
}

const isDirectCliExecution =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCliExecution) {
  main();
}
