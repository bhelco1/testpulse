'use client';

import { usePathname } from 'next/navigation';

import { Breaks } from '../Breaks/Breaks';

// A not-found boundary is given no props, so the requested path is read from the router, which
// also knows it while the page is rendered on the server. It may break after "/" and "." (design
// v21 item 8).
export function RequestedPath() {
  return <Breaks text={usePathname()} rule="path" />;
}
