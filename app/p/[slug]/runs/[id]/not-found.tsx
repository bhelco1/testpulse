import type { Metadata } from 'next';

import { RunNotFound } from '../../../../../components/NotFound/RunNotFound';
import { PageFrame } from '../../../../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../../../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../../../../components/SiteHeader/SiteHeader';
import { now } from '../../../../../lib/clock';
import { SOURCE_URL, siteChromeView } from '../../../../../lib/pages/site';
import { loadSiteChrome } from '../../../../../lib/queries/site';

// A run the project does not have, or a run URL naming an unknown project (design/components.md,
// "NotFound (page)", run and project kinds), served with 404.
export const metadata: Metadata = { title: 'Not found · testpulse' };

export default async function RunPageNotFound() {
  const at = now();
  const site = siteChromeView(await loadSiteChrome(undefined, at), at);
  return (
    <PageFrame>
      <SiteHeader projects={site.projects} />
      <RunNotFound projects={site.projects} />
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
