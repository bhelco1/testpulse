// The site's own origin, for a tracked link's `<site origin>/v/<token>` (design/data-map.md,
// Admin): never hard-coded, since the domain is not decided (spec open question 1). A server
// action's request carries Origin, which Next.js has already checked against the host; a page
// request does not, so the host and protocol it was forwarded with are used.

const first = (value: string | null): string | null => value?.split(',')[0]?.trim() || null;

function asOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === 'null' || `${url.origin}/` !== url.href ? null : url.origin;
  } catch {
    return null;
  }
}

export function siteOrigin(headers: Headers): string | null {
  const origin = headers.get('origin');
  if (origin !== null && asOrigin(origin) !== null) return asOrigin(origin);
  const host = first(headers.get('x-forwarded-host')) ?? first(headers.get('host'));
  if (host === null) return null;
  const proto = first(headers.get('x-forwarded-proto')) === 'https' ? 'https' : 'http';
  return asOrigin(`${proto}://${host}`);
}
