import type { NextRequest } from 'next/server';

import { refreshAdminSession } from './lib/admin/refresh';

// Next.js 16's request proxy (formerly middleware). It runs for /admin and nothing else, so public
// pages never wait on it: it refreshes the owner's admin session before an admin page reads it
// (lib/admin/refresh.ts). Access is decided by the guard in every admin page, action and route.

export async function proxy(request: NextRequest) {
  return refreshAdminSession(request);
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
