import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';

import { Button } from '../components/Button/Button';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LiveRunFeed, LiveSiteHeader, LiveUpdates } from '../components/LiveUpdates/LiveUpdates';
import { PageFrame } from '../components/PageFrame/PageFrame';
import { ProjectCard } from '../components/ProjectCard/ProjectCard';
import { TimedText } from '../components/RelativeTime/RelativeTime';
import { SiteFooter } from '../components/SiteFooter/SiteFooter';
import { StatTile } from '../components/StatTile/StatTile';
import { now } from '../lib/clock';
import { LANDING_ERROR, landingView, type ReadyLandingView } from '../lib/pages/landing';
import { SOURCE_URL, siteChromeView } from '../lib/pages/site';
import { loadLanding } from '../lib/queries/landing';
import { loadSiteChrome } from '../lib/queries/site';
import styles from './page.module.css';

// / (spec section 13): server-rendered as anon through lib/queries, so a private project's hidden
// fields never reach this file. Time is read once per request. LiveUpdates re-renders the page
// when a report arrives; without JavaScript the recent runs are the server-rendered list and
// neither "Live" nor "Offline" is shown (section 13.3).

const LEDE = 'Live test results for every project I build.';

export default async function LandingPage() {
  // Rendered per request: the numbers are live data and the relative times move with the clock.
  await connection();
  const at = now();
  let loaded;
  try {
    loaded = await Promise.all([loadLanding(undefined, at), loadSiteChrome(undefined, at)]);
  } catch (error) {
    // Next.js signals such as a dynamic-rendering bailout travel as errors; they are not ours.
    unstable_rethrow(error);
    // The loaders' messages name the query and Postgres's code, never a key or a row.
    console.error(error instanceof Error ? error.message : error);
    return <Unavailable />;
  }
  const [landing, chrome] = loaded;
  const view = landingView(landing, at);
  const site = siteChromeView(chrome, at);

  return (
    <PageFrame>
      <LiveUpdates>
        <LiveSiteHeader projects={site.projects} current="home" />
        <main id="main" className={styles.main}>
          {view.kind === 'none' ? <NoProjects /> : <Portfolio view={view} site={site} />}
        </main>
        <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
      </LiveUpdates>
    </PageFrame>
  );
}

function Portfolio({
  view,
  site,
}: {
  view: ReadyLandingView;
  site: ReturnType<typeof siteChromeView>;
}) {
  return (
    <>
      <h1 className={styles.lede}>{LEDE}</h1>
      {/* One paragraph, the figure then the note, so it is read as one sentence (v8 item 7). */}
      <p className={styles.hero}>
        <span className={styles.total} data-part="hero-total">
          {view.heroTotal}
        </span>{' '}
        <span className={styles.note} data-part="hero-note">
          <TimedText parts={view.heroNote} />
        </span>
      </p>
      <div className={styles.tiles} data-part="tiles">
        {view.tiles.map(({ label, value, sub, attention, fail }) =>
          attention === undefined ? (
            <StatTile key={label} label={label} value={value} sub={sub} fail={fail} />
          ) : (
            <StatTile key={label} label={label} value={value} attention={attention} />
          ),
        )}
      </div>
      <div className={styles.projectsHead}>
        <h2 className={styles.projectsTitle}>Projects</h2>
        <span className={styles.projectsNote}>Latest default-branch run</span>
      </div>
      <div className={styles.cards}>
        {view.cards.map((card) => (
          <ProjectCard key={card.project.href} {...card} headingLevel={3} />
        ))}
      </div>
      <div className={styles.lower}>
        <LiveRunFeed runs={view.recentRuns} asOf={site.asOf} />
        <section className={styles.about} aria-labelledby="about-title">
          <h2 id="about-title" className={styles.aboutTitle}>
            About this site
          </h2>
          <p className={styles.aboutText}>
            I’m Bobby Helco, a quality engineering leader. Every project here reports its test
            results after each CI run. Nothing on this page is mocked or hand-entered. The dashboard
            is tested the same way, and reports on itself.
          </p>
          <Button href="/how-its-tested">How testpulse is tested →</Button>
        </section>
      </div>
    </>
  );
}

// Landing scenario "no projects" (design v8 item 10): the h1 stays and one card replaces the
// rest, About this site included, as the drawing has it.
function NoProjects() {
  return (
    <>
      <h1 className={`${styles.lede} ${styles.ledeAlone}`}>{LEDE}</h1>
      <section className={styles.none} aria-labelledby="none-title">
        <h2 id="none-title" className={styles.noneTitle}>
          No projects yet
        </h2>
        <p className={styles.noneText}>
          Projects appear here once they’re registered and send their first report.
        </p>
        <Link href="/how-its-tested" className={styles.noneLink}>
          How testpulse is tested
        </Link>
      </section>
    </>
  );
}

// Landing scenario "error" (design v9 item 7): nothing from the database is shown, so the header
// lists no projects and the footer no last report. "Try again" is a link to this URL, so it
// works without JavaScript. Next.js gives a page no way to set its status, so this is served
// with 200 rather than the design's 503 (section 13.3).
function Unavailable() {
  return (
    <PageFrame>
      <LiveUpdates>
        <LiveSiteHeader projects={[]} current="home" />
        <main id="main" className={styles.main}>
          <ErrorState variant="page" retryHref="/" {...LANDING_ERROR} />
        </main>
        <SiteFooter sourceHref={SOURCE_URL} />
      </LiveUpdates>
    </PageFrame>
  );
}
