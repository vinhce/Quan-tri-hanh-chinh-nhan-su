import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOWED_ROLES = new Set([
  'SUPER_ADMIN',
  'DIRECTOR',
  'HR_MANAGER',
  'DEPT_MANAGER',
  'EMPLOYEE',
  'CANDIDATE',
]);

const MIN_SECRET_LENGTH = 32;

interface MiddlewareSessionPayload {
  jti: string;
  role: string;
  exp: number;
}

function decodeBase64UrlToBytes(b64url: string): Uint8Array | null {
  try {
    const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const binary = atob(base64 + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function verifyHmacSha256Edge(
  encodedPayload: string,
  sigBytes: Uint8Array,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
    const expectedBytes = new Uint8Array(sigBuffer);
    if (expectedBytes.length !== sigBytes.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < expectedBytes.length; i += 1) {
      diff |= expectedBytes[i] ^ sigBytes[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

async function verifyMiddlewareSession(
  request: NextRequest
): Promise<MiddlewareSessionPayload | null> {
  const rawSession = request.cookies.get('hrm_session')?.value?.trim();
  if (!rawSession || rawSession.length > 4096) {
    return null;
  }

  const parts = rawSession.split('.');
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

  const payloadBytes = decodeBase64UrlToBytes(encodedPayload);
  const sigBytes = decodeBase64UrlToBytes(sigB64Url);
  if (!payloadBytes || !sigBytes) {
    return null;
  }

  const envSecret = (process.env.HRM_SESSION_SECRET || '').trim();
  if (envSecret.length < MIN_SECRET_LENGTH) {
    return null;
  }
  const validSig = await verifyHmacSha256Edge(encodedPayload, sigBytes, envSecret);
  if (!validSig) {
    return null;
  }

  let parsed: unknown;
  try {
    const jsonStr = new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes);
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const rec = parsed as Record<string, unknown>;
  const jti = typeof rec.jti === 'string' ? rec.jti.trim() : '';
  const role = typeof rec.role === 'string' ? rec.role.trim() : '';
  const exp = typeof rec.exp === 'number' ? rec.exp : Number.NaN;

  if (!jti || jti.length < 8 || jti.length > 128) {
    return null;
  }
  if (!ALLOWED_ROLES.has(role)) {
    return null;
  }
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    return null;
  }

  return { jti, role, exp };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hrmActive = request.cookies.get('hrm_active')?.value;

  // Immediately revoke session if account was marked inactive/locked (hrm_active === '0')
  if (hrmActive === '0') {
    const lockedLoginUrl = new URL('/login', request.url);
    lockedLoginUrl.searchParams.set('locked', '1');
    const response = NextResponse.redirect(lockedLoginUrl);
    response.cookies.delete('hrm_session');
    response.cookies.delete('hrm_role');
    response.cookies.delete('hrm_token');
    response.cookies.delete('hrm_active');
    return response;
  }

  const session = await verifyMiddlewareSession(request);
  const isAuthenticated = Boolean(session);

  // Protected /app route (internal management portal)
  if (pathname.startsWith('/app')) {
    if (!isAuthenticated || !session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (session.role === 'CANDIDATE') {
      // 403 Forbidden for candidate attempting to access internal administration portal
      return new NextResponse(
        `<!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="utf-8" />
          <title>403 - Không có quyền truy cập</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #EFF5F3; color: #11221E; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
            .box { max-width: 480px; background: #FCFEFD; border: 1px solid #C6D9D3; border-radius: 1rem; padding: 2.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            h1 { font-size: 1.75rem; margin: 0 0 0.5rem; color: #0F766E; }
            p { color: #415A54; line-height: 1.5; margin: 0 0 1.5rem; font-size: 0.9375rem; }
            a { display: inline-block; background: #0F766E; color: #FCFEFD; text-decoration: none; padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; margin: 0.25rem; }
            a.secondary { background: #E4EEEB; color: #11221E; border: 1px solid #C6D9D3; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>403 - Cấm truy cập</h1>
            <p>Tài khoản của bạn mang vai trò Ứng viên (CANDIDATE), không được phép truy cập Cổng Quản trị Doanh nghiệp Lạc Việt HRM. Vui lòng chuyển sang Cổng Ứng viên để theo dõi tiến độ ứng tuyển.</p>
            <div>
              <a href="/candidate">Đến Cổng Ứng viên</a>
              <a href="/login" class="secondary">Đổi tài khoản</a>
            </div>
          </div>
        </body>
        </html>`,
        {
          status: 403,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }
      );
    }
  }

  // Protected /candidate route (candidate portal)
  if (pathname.startsWith('/candidate')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/candidate/:path*'],
};
