'use client';

import { usePathname } from 'next/navigation';

// A not-found boundary is given no props, so the requested path is read from the router, which
// also knows it while the page is rendered on the server.
export function RequestedPath() {
  return <>{usePathname()}</>;
}
