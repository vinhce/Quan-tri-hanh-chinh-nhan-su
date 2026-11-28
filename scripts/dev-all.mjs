import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const HEALTH_TIMEOUT_MS = 1_000;
const PORT_CHECK_TIMEOUT_MS = 500;

function needsMockExport() {
  const targetJson = path.join(repoRoot, 'public', 'mock', 'employees.json');
  let targetStat;
  try {
    targetStat = fs.statSync(targetJson);
  } catch {
    return true;
  }

  const mockSrcDir = path.join(repoRoot, 'src', 'mock');
  let entries;
  try {
    entries = fs.readdirSync(mockSrcDir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const srcStat = fs.statSync(path.join(mockSrcDir, entry.name));
    if (srcStat.mtimeMs > targetStat.mtimeMs) {
      return true;
    }
  }

  return false;
}

function runNodeScriptSync(relPath) {
  const scriptPath = path.join(repoRoot, relPath);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function checkTcpConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(PORT_CHECK_TIMEOUT_MS);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

async function isPortListening(port) {
  const results = await Promise.all([
    checkTcpConnect('127.0.0.1', port),
    checkTcpConnect('::1', port),
  ]);
  return results.some(Boolean);
}

async function isServiceHealthy(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function spawnDetached(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', () => {});
  child.unref();
}

async function ensurePeriocularService() {
  if (await isServiceHealthy('http://127.0.0.1:8002/health')) {
    return;
  }
  const serviceDir = path.join(repoRoot, 'services', 'periocular-onnx');
  const venvPython = path.join(serviceDir, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(venvPython)) {
    return;
  }
  spawnDetached(venvPython, [
    '-m',
    'uvicorn',
    'server:app',
    '--app-dir',
    serviceDir,
    '--host',
    '127.0.0.1',
    '--port',
    '8002',
    '--log-level',
    'warning',
  ]);
}

function launchBackgroundAiServices() {
  void Promise.allSettled([ensurePeriocularService()]);
}

function collectApiRoutes(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectApiRoutes(fullPath, out);
    } else if (entry.isFile() && /^route\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function syncMissingApiRoutes() {
  const apiSrcRoot = path.join(repoRoot, 'src', 'app', 'api');
  const apiCompiledRoot = path.join(repoRoot, '.next', 'server', 'app', 'api');
  const routeFiles = collectApiRoutes(apiSrcRoot);
  const now = new Date();

  for (const routeFile of routeFiles) {
    const relDir = path.relative(apiSrcRoot, path.dirname(routeFile));
    const compiledRoute = path.join(apiCompiledRoot, relDir, 'route.js');
    if (!fs.existsSync(compiledRoute)) {
      try {
        fs.utimesSync(routeFile, now, now);
      } catch {
        // Ignore utimes errors on individual routes
      }
    }
  }
}

function startNextDev() {
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const extraArgs = process.argv.slice(2);
  const nextChild = spawn(process.execPath, [nextBin, 'dev', ...extraArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const forwardSignal = (signal) => {
    if (!nextChild.killed) {
      try {
        nextChild.kill(signal);
      } catch {
        // Ignore if child already exited
      }
    }
  };

  const onSigInt = () => forwardSignal('SIGINT');
  const onSigTerm = () => forwardSignal('SIGTERM');

  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  nextChild.on('error', (err) => {
    process.off('SIGINT', onSigInt);
    process.off('SIGTERM', onSigTerm);
    console.error('[dev-all] Failed to start Next.js dev server:', err);
    process.exit(1);
  });

  nextChild.on('exit', (code, signal) => {
    process.off('SIGINT', onSigInt);
    process.off('SIGTERM', onSigTerm);
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  const port = Number(process.env.PORT || 3000);
  if (await isPortListening(port)) {
    await Promise.allSettled([ensurePeriocularService()]);
    syncMissingApiRoutes();
    console.log(`[dev-all] Next.js đang chạy sẵn tại :${port} — đã bật AI (:8002) và đồng bộ route.`);
    process.exit(0);
    return;
  }

  if (needsMockExport()) {
    runNodeScriptSync('scripts/export-mock-json.mjs');
  }
  runNodeScriptSync('scripts/reset-demo-data.mjs');
  launchBackgroundAiServices();
  startNextDev();
}

main();
