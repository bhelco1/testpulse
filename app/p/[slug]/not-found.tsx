import type { Metadata } from 'next';

import { NotFound } from '../../../components/NotFound/NotFound';
import { RequestedPath } from '../../../components/NotFound/RequestedPath';
import { PageFrame } from '../../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../../components/SiteHeader/SiteHeader';
import { now } from '../../../lib/clock';
import { SOURCE_URL, siteChromeView } from '../../../lib/pages/site';
import { loadSiteChrome } from '../../../lib/queries/site';

// An unknown project (design/components.md, "NotFound (page)", project kind), served with 404.
export const metadata: Metadata = { title: 'Not found · testpulse' };

export default async function ProjectNotFound() {
  const at = now();
  const site = siteChromeView(await loadSiteChrome(undefined, at), at);
  return (
    <PageFrame>
      <SiteHeader projects={site.projects} />
      <NotFound kind="project" path={<RequestedPath />} projects={site.projects} />
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
