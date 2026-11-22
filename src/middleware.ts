import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hrmRole = request.cookies.get('hrm_role')?.value;
  const hrmToken = request.cookies.get('hrm_token')?.value;
  const hrmActive = request.cookies.get('hrm_active')?.value;
  const isAuthenticated = Boolean(hrmRole && hrmToken);

  // Immediately revoke session if account was marked inactive/locked (hrm_active === '0')
  if (hrmActive === '0') {
    const lockedLoginUrl = new URL('/login', request.url);
    lockedLoginUrl.searchParams.set('locked', '1');
    const response = NextResponse.redirect(lockedLoginUrl);
    response.cookies.delete('hrm_role');
    response.cookies.delete('hrm_token');
    response.cookies.delete('hrm_active');
    return response;
  }

  // Protected /app route (internal management portal)
  if (pathname.startsWith('/app')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (hrmRole === 'CANDIDATE') {
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
