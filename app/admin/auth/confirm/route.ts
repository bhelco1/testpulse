import { handleConfirm } from '../../../../lib/admin/handlers';

// Where the emailed sign-in link lands (spec section 15, "Admin" as built): it spends the token,
// checks the address again (lib/admin/confirm.ts) and sends the browser to /admin. It runs before
// there is a session, so it is the one admin route that does not start with requireAdmin
// (lib/admin/guarded.test.ts).

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const location = await handleConfirm(new URL(request.url).searchParams);
  // A relative Location, so the Host header never chooses where the browser goes. The link's
  // token is spent either way; no-referrer keeps its address out of the next page's Referer.
  return new Response(null, {
    status: 303,
    headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}
