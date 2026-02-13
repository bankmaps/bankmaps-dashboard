// middleware.ts - SIMPLIFIED
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
  // This sets a cookie for future requests
  if (searchParams.has('token')) {
    const response = NextResponse.next();
    response.cookies.set('bankmaps_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
    return response;
  }

  // Check for auth cookie
  const authCookie = request.cookies.get('bankmaps_auth');

  if (authCookie?.value === 'authenticated') {
    return NextResponse.next();
  }

  // No auth found - redirect to login
  const loginUrl = new URL('https://bankmaps.com/login.php', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/users/:path*', '/create-account'],
};
