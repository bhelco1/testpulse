import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '../../../../../components/Breadcrumbs/Breadcrumbs';
import { PageFrame } from '../../../../../components/PageFrame/PageFrame';
import { RunHeader } from '../../../../../components/RunHeader/RunHeader';
import { RunReportTable } from '../../../../../components/RunReportTable/RunReportTable';
import { RunResults } from '../../../../../components/RunResults/RunResults';
import { SiteFooter } from '../../../../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../../../../components/SiteHeader/SiteHeader';
import { now } from '../../../../../lib/clock';
import { runPageTitle, runPageView } from '../../../../../lib/pages/run';
import { SOURCE_URL, siteChromeView } from '../../../../../lib/pages/site';
import { loadRunHead } from '../../../../../lib/queries/heads';
import { loadRunDetail } from '../../../../../lib/queries/run';
import { loadSiteChrome } from '../../../../../lib/queries/site';
import styles from './page.module.css';

// /p/[slug]/runs/[id] (spec section 13): server-rendered as anon through lib/queries, so a
// private project's failure text, full SHAs and run URLs never reach this file (section 9). Time
// is read once per request. The design gives the run page no live behaviour, so it has no
// realtime subscription and its header no live indicator (section 13.5).

interface RouteProps {
  params: Promise<{ slug: string; id: string }>;
}

// The head reads only what the title needs (lib/queries/heads.ts): Next.js prefetches it for every
// link to this page in view, so it must not cost a page load.
export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug, id } = await params;
  const head = await loadRunHead(slug, id);
  return { title: head === null ? 'Not found · testpulse' : runPageTitle(head.project, head.run) };
}

export default async function RunPage({ params }: RouteProps) {
  const { slug, id } = await params;
  const at = now();
  const [detail, chrome] = await Promise.all([
    loadRunDetail(slug, id, undefined, at),
    loadSiteChrome(undefined, at),
  ]);
  if (detail === null) notFound();
  const view = runPageView(detail, at);
  const site = siteChromeView(chrome, at);

  return (
    <PageFrame>
      <SiteHeader projects={site.projects} currentProject={`/p/${encodeURIComponent(slug)}`} />
      <Breadcrumbs items={view.crumbs.items} current={view.crumbs.current} />
      <main id="main">
        <RunHeader
          status={view.status}
          when={view.when}
          heading={view.heading}
          meta={view.meta}
          tiles={view.tiles}
        />
        <section className={styles.section} aria-labelledby="reports-heading">
          <h2 id="reports-heading" className={styles.title}>
            Reports in this run
          </h2>
          <RunReportTable reports={view.reports} />
        </section>
        {view.results !== null && (
          <section
            id="results"
            className={`${styles.section} ${styles.last}`}
            aria-labelledby="results-heading"
          >
            <h2 id="results-heading" className={styles.title}>
              Results
            </h2>
            <RunResults results={view.results} />
          </section>
        )}
      </main>
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
