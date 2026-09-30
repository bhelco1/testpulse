import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { Breadcrumbs } from '../../../../../components/Breadcrumbs/Breadcrumbs';
import { PageFrame } from '../../../../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../../../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../../../../components/SiteHeader/SiteHeader';
import { StatusTimeline } from '../../../../../components/StatusTimeline/StatusTimeline';
import { TestHeader } from '../../../../../components/TestHeader/TestHeader';
import { TrendChart } from '../../../../../components/TrendChart/TrendChart';
import { now } from '../../../../../lib/clock';
import { SOURCE_URL, siteChromeView } from '../../../../../lib/pages/site';
import { testHistoryView } from '../../../../../lib/pages/test-history';
import { loadSiteChrome } from '../../../../../lib/queries/site';
import { loadTestHistory } from '../../../../../lib/queries/test-history';
import styles from './page.module.css';

// /p/[slug]/tests/[testKey] (spec section 13): server-rendered as anon through lib/queries, so a
// private project's full SHAs and run URLs never reach this file (section 9); the page shows no
// failure text on any project. Time is read once per request. The design gives the page no live
// behaviour, so it has no realtime subscription and its header no live indicator (section 13.6).

interface RouteProps {
  params: Promise<{ slug: string; testKey: string }>;
}

// Metadata and the page ask for the same data; one request reads it once.
const load = cache(async (slug: string, testKey: string) => {
  const at = now();
  const [history, chrome] = await Promise.all([
    loadTestHistory(slug, testKey, undefined, at),
    loadSiteChrome(undefined, at),
  ]);
  return { at, history, chrome };
});

async function read({ params }: RouteProps) {
  const { slug, testKey } = await params;
  return { slug, ...(await load(slug, testKey)) };
}

export async function generateMetadata(props: RouteProps): Promise<Metadata> {
  const { history, at } = await read(props);
  return {
    title: history === null ? 'Not found · testpulse' : testHistoryView(history, at).title,
  };
}

export default async function TestHistoryPage(props: RouteProps) {
  const { slug, history, chrome, at } = await read(props);
  if (history === null) notFound();
  const view = testHistoryView(history, at);
  const site = siteChromeView(chrome, at);
  // The page's last section has more room below it before the footer.
  const timelineClass = [styles.section, view.duration === null && styles.last]
    .filter(Boolean)
    .join(' ');

  return (
    <PageFrame>
      <SiteHeader projects={site.projects} currentProject={`/p/${encodeURIComponent(slug)}`} />
      <Breadcrumbs items={view.crumbs.items} current={view.crumbs.current} currentMono />
      <main id="main">
        <TestHeader {...view.header} />
        {view.timeline !== null && (
          <section className={timelineClass} aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className={styles.title}>
              Status by run
            </h2>
            <div className={styles.card}>
              <StatusTimeline kind="results" {...view.timeline} />
            </div>
          </section>
        )}
        {view.duration !== null && (
          <section className={`${styles.section} ${styles.last}`}>
            <TrendChart {...view.duration} />
          </section>
        )}
      </main>
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
