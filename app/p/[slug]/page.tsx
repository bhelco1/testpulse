import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '../../../components/Breadcrumbs/Breadcrumbs';
import { CoverageFloors } from '../../../components/CoverageFloors/CoverageFloors';
import { DeclaredSuiteNote } from '../../../components/DeclaredSuiteNote/DeclaredSuiteNote';
import { FlakyList } from '../../../components/FlakyList/FlakyList';
import { LatestRunCard } from '../../../components/LatestRunCard/LatestRunCard';
import { LiveSiteHeader, LiveUpdates } from '../../../components/LiveUpdates/LiveUpdates';
import { PageFrame } from '../../../components/PageFrame/PageFrame';
import { PageSection } from '../../../components/PageSection/PageSection';
import { ProjectHero } from '../../../components/ProjectHero/ProjectHero';
import { ProjectRuns } from '../../../components/ProjectRuns/ProjectRuns';
import { Pyramid } from '../../../components/Pyramid/Pyramid';
import { RunReports } from '../../../components/RunReports/RunReports';
import { RunStrip } from '../../../components/RunStrip/RunStrip';
import { SiteFooter } from '../../../components/SiteFooter/SiteFooter';
import { StackTagGroup } from '../../../components/StackTagGroup/StackTagGroup';
import { TrendChart } from '../../../components/TrendChart/TrendChart';
import { now } from '../../../lib/clock';
import { projectPageOptions, projectPageTitle, projectPageView } from '../../../lib/pages/project';
import { SOURCE_URL, siteChromeView } from '../../../lib/pages/site';
import { loadProjectHead } from '../../../lib/queries/heads';
import { loadProjectPage } from '../../../lib/queries/project';
import { loadSiteChrome } from '../../../lib/queries/site';
import styles from './page.module.css';

// /p/[slug] (spec section 13): server-rendered as anon through lib/queries, so a private
// project's hidden fields never reach this file. Time is read once per request. LiveUpdates
// re-renders the page when any report arrives: the realtime payload names a run, not its
// project, so a report of another project cannot be told apart (section 13.2).

interface RouteProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The head reads only what the title needs (lib/queries/heads.ts): Next.js prefetches it for every
// link to this page in view, so it must not cost a page load.
export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await loadProjectHead(slug);
  return { title: project === null ? 'Not found · testpulse' : projectPageTitle(project) };
}

export default async function ProjectPage({ params, searchParams }: RouteProps) {
  const { slug } = await params;
  const { branches, runLimit } = projectPageOptions(await searchParams);
  const at = now();
  const [page, chrome] = await Promise.all([
    loadProjectPage(slug, { branches, runLimit }, undefined, at),
    loadSiteChrome(undefined, at),
  ]);
  if (page === null) notFound();
  const view = projectPageView(page, at);
  const site = siteChromeView(chrome, at);

  return (
    <PageFrame>
      <LiveUpdates>
        <LiveSiteHeader
          projects={site.projects}
          currentProject={`/p/${encodeURIComponent(slug)}`}
        />
        <Breadcrumbs items={[{ label: 'Overview', href: '/' }]} current={view.hero.name} />
        <main id="main">
          <ProjectHero hero={view.hero}>
            {view.latestRun !== null && <LatestRunCard run={view.latestRun} />}
          </ProjectHero>
          <PageSection number={1} title="What it’s built with">
            <div className={styles.stack}>
              <StackTagGroup variant="built" groups={view.built} />
              <StackTagGroup variant="tested" groups={view.tested} />
            </div>
          </PageSection>
          <PageSection number={2} title="How it’s tested">
            <Pyramid {...view.pyramid} />
            <div className={styles.declared}>
              <DeclaredSuiteNote suites={view.declared} />
            </div>
          </PageSection>
          <PageSection number={3} title="Coverage and reports">
            <div className={styles.pair}>
              <CoverageFloors modules={view.coverage} />
              <RunReports reports={view.reports} />
            </div>
          </PageSection>
          <PageSection number={4} title="History">
            <div className={styles.charts}>
              {view.history.charts.map((chart) => (
                <TrendChart key={chart.title} {...chart} />
              ))}
            </div>
            <div className={styles.strip}>
              <RunStrip {...view.history.strip} />
            </div>
          </PageSection>
          <PageSection number={5} title="Runs and flaky tests" last>
            <div className={styles.pair}>
              <ProjectRuns project={view.hero.name} runs={view.runs} asOf={site.asOf} />
              <FlakyList tests={view.flaky} />
            </div>
          </PageSection>
        </main>
        <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
      </LiveUpdates>
    </PageFrame>
  );
}
