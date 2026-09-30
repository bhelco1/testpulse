import type { Metadata } from 'next';

import { TestNotFound } from '../../../../../components/NotFound/TestNotFound';
import { PageFrame } from '../../../../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../../../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../../../../components/SiteHeader/SiteHeader';
import { now } from '../../../../../lib/clock';
import { SOURCE_URL, siteChromeView } from '../../../../../lib/pages/site';
import { loadSiteChrome } from '../../../../../lib/queries/site';

// A test key the project does not have, or a test URL naming an unknown project
// (design/components.md, "NotFound (page)", test and project kinds), served with 404.
export const metadata: Metadata = { title: 'Not found · testpulse' };

export default async function TestPageNotFound() {
  const at = now();
  const site = siteChromeView(await loadSiteChrome(undefined, at), at);
  return (
    <PageFrame>
      <SiteHeader projects={site.projects} />
      <TestNotFound projects={site.projects} latestRuns={site.latestRuns} />
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
