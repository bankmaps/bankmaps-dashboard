// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;

  // Protect these routes
  const isProtected = pathname.startsWith('/users') || pathname === '/create-account';

  if (!isProtected) {
    return NextResponse.next();
  }

  // Allow access if ?token= is present (coming from launch-ai.php)
  if (searchParams.has('token')) {
    return NextResponse.next();
  }

  // For repeat visits: check for a local cookie set after token validation
  // (We'll set this in the page after verifying token)
  const authCookie = request.cookies.get('bankmaps_auth');

  if (!authCookie?.value) {
    const loginUrl = new URL('https://bankmaps.com/login.php', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/users/:path*', '/create-account'],
};
