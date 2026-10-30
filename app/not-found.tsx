import type { Metadata } from 'next';
import { connection } from 'next/server';

import { NotFound } from '../components/NotFound/NotFound';
import { RequestedPath } from '../components/NotFound/RequestedPath';
import { PageFrame } from '../components/PageFrame/PageFrame';
import { SiteFooter } from '../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../components/SiteHeader/SiteHeader';
import { now } from '../lib/clock';
import { SOURCE_URL, siteChromeView } from '../lib/pages/site';
import { loadSiteChrome } from '../lib/queries/site';

// Any address no route answers (design/components.md, "NotFound (page)", page kind), served with
// 404 and the site's header and footer rather than Next.js's default page.
export const metadata: Metadata = { title: 'Not found · Testament' };

export default async function SiteNotFound() {
  // Rendered per request, never prerendered: the project switcher and the footer move with the
  // data and the clock.
  await connection();
  const at = now();
  const site = siteChromeView(await loadSiteChrome(undefined, at), at);
  return (
    <PageFrame>
      <SiteHeader projects={site.projects} />
      <NotFound kind="page" path={<RequestedPath />} />
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
