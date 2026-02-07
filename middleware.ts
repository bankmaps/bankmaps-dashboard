// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only protect these routes (add others if needed)
  if (!pathname.startsWith('/users') && pathname !== '/create-account') {
    return NextResponse.next();
  }

  // Check for the session cookie set by login.php / launch-ai.php
  // Replace 'PHPSESSID' or 'bankmaps_session' with your ACTUAL cookie name
  // (After logging in, check browser dev tools > Application > Cookies to see the name)
  const sessionCookie = request.cookies.get('PHPSESSID') || request.cookies.get('bankmaps_session');

  if (!sessionCookie?.value) {
    // No valid session → force back to login
    const loginUrl = new URL('https://bankmaps.com/login.php');
    loginUrl.searchParams.set('redirect', pathname); // optional: come back here after login
    return NextResponse.redirect(loginUrl);
  }

  // If cookie exists → let launch-ai.php (or whatever) handle subscription check
  return NextResponse.next();
}

export const config = {
  matcher: ['/users/:path*', '/create-account'],
};
