import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '../../../../../components/Breadcrumbs/Breadcrumbs';
import { HistoryTiles } from '../../../../../components/HistoryTiles/HistoryTiles';
import { PageFrame } from '../../../../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../../../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../../../../components/SiteHeader/SiteHeader';
import { StatusTimeline } from '../../../../../components/StatusTimeline/StatusTimeline';
import { TestHeader } from '../../../../../components/TestHeader/TestHeader';
import { TrendChart } from '../../../../../components/TrendChart/TrendChart';
import { now } from '../../../../../lib/clock';
import { SOURCE_URL, siteChromeView } from '../../../../../lib/pages/site';
import { testHistoryTitle, testHistoryView } from '../../../../../lib/pages/test-history';
import { loadTestHead } from '../../../../../lib/queries/heads';
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

// The head reads only what the title needs (lib/queries/heads.ts): Next.js prefetches it for every
// link to this page in view, so it must not cost a page load.
export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug, testKey } = await params;
  const head = await loadTestHead(slug, testKey);
  return {
    title: head === null ? 'Not found · testpulse' : testHistoryTitle(head.project, head.test),
  };
}

export default async function TestHistoryPage({ params }: RouteProps) {
  const { slug, testKey } = await params;
  const at = now();
  const [history, chrome] = await Promise.all([
    loadTestHistory(slug, testKey, undefined, at),
    loadSiteChrome(undefined, at),
  ]);
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
        <TestHeader {...view.header}>
          {view.tiles !== null && <HistoryTiles tiles={view.tiles} />}
        </TestHeader>
        {view.timeline !== null && (
          <section className={timelineClass} aria-labelledby="timeline-heading">
            <div className={styles.head}>
              <h2 id="timeline-heading" className={styles.title}>
                Status by run
              </h2>
              {view.stripNote !== null && (
                <span className={styles.note} data-part="strip-note">
                  {view.stripNote}
                </span>
              )}
            </div>
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
