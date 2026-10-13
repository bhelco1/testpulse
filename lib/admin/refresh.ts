import { type NextRequest, NextResponse } from 'next/server';

import { createAdminSessionClient, isAdminSessionCookie } from './session.ts';

// Run by proxy.ts for /admin requests (spec section 15, "Admin" as built). A Server Component
// cannot write cookies, so an admin session whose access token has expired is refreshed here,
// before the page renders: the new tokens go onto the request the page reads and onto the
// response the browser keeps. Who may use admin is decided by the guard (lib/admin/guard.ts), not
// here: this only keeps a session Supabase still accepts from lapsing between pages.

export async function refreshAdminSession(request: NextRequest): Promise<NextResponse> {
  if (!request.cookies.getAll().some(({ name }) => isAdminSessionCookie(name))) {
    return NextResponse.next();
  }
  let response = NextResponse.next({ request });
  try {
    const client = createAdminSessionClient({
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        // Responses that carry a session must never be cached and served to someone else.
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    });
    await client.auth.getUser();
  } catch {
    // Not configured or unreachable: the page's guard finds the same and shows the error state.
  }
  return response;
}
