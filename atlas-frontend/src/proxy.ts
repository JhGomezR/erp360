import { NextResponse, NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths (no auth required)
  const publicPaths = ['/login', '/register', '/select-tenant', '/forgot-password', '/reset-password'];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  const tenantMatch = pathname.match(/^\/([^/]+)\//);
  if (tenantMatch) {
    const tenantSlug = tenantMatch[1];

    // Skip Next.js internals
    if (['_next', 'api', 'login', 'register', 'select-tenant', 'atlas-mandragora', 'favicon.ico'].includes(tenantSlug)) {
      return NextResponse.next();
    }

    // Attach tenant slug as header for dynamic routes
    const response = NextResponse.next();
    response.headers.set('x-tenant-slug', tenantSlug);
    return response;
  }

  // La raíz '/' es la landing page pública — no requiere auth
  if (pathname === '/' || isPublicPath) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
