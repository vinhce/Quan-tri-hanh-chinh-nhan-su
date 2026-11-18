import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const hasEnvPort = Boolean(process.env.PORT?.trim());
const PORT = Number(process.env.PORT) || 3001;
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

const send = (res, status, body, type = 'text/plain; charset=utf-8', len) => {
  res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    ...(len !== undefined ? { 'Content-Length': len } : {}),
  });
  res.end(body);
};

function resolveSafePath(rawUrl) {
  const rawPath = (rawUrl || '/').split('?')[0];
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return { status: 400, msg: 'Bad Request' }; }
  if (decoded.includes('\0')) return { status: 400, msg: 'Bad Request' };
  const rel = decoded.replace(/\\/g, '/').replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(webRoot, rel);
  if (resolved !== webRoot && !resolved.startsWith(webRoot + path.sep)) return { status: 403, msg: 'Forbidden' };
  return { resolved };
}

const server = http.createServer(async (req, res) => {
  const headOnly = req.method === 'HEAD';
  if (req.method !== 'GET' && !headOnly) return send(res, 405, 'Method Not Allowed');
  const { status, msg, resolved } = resolveSafePath(req.url);
  if (status) return send(res, status, headOnly ? undefined : msg);
  try {
    let target = resolved;
    let stat = await fs.stat(target);
    if (stat.isDirectory()) {
      target = path.join(target, 'index.html');
      if (!target.startsWith(webRoot + path.sep)) return send(res, 403, headOnly ? undefined : 'Forbidden');
      stat = await fs.stat(target);
    }
    if (!stat.isFile()) return send(res, 404, headOnly ? undefined : 'Not Found');
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    send(res, 200, headOnly ? undefined : await fs.readFile(target), type, stat.size);
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return send(res, 404, headOnly ? undefined : 'Not Found');
    console.error('[serve-web] Request error:', err);
    if (!res.headersSent) send(res, 500, headOnly ? undefined : 'Internal Server Error');
  }
});

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[serve-web] Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

let offset = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !hasEnvPort && offset < 5 && PORT + offset < 65535) {
    return server.listen(PORT + ++offset, HOST);
  }
  console.error(`[serve-web] Failed on ${HOST}:${PORT + offset}:`, err.message);
  process.exit(1);
});

server.once('listening', () => {
  const { port } = server.address();
  server.removeAllListeners('error').on('error', (err) => console.error('[serve-web] Error:', err));
  console.log(`[serve-web] http://localhost:${port}/\n[serve-web] http://localhost:${port}/login.html`);
});

server.listen(PORT, HOST);
