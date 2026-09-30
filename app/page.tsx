import { connection } from 'next/server';

import { Button } from '../components/Button/Button';
import { LiveRunFeed, LiveSiteHeader, LiveUpdates } from '../components/LiveUpdates/LiveUpdates';
import { PageFrame } from '../components/PageFrame/PageFrame';
import { ProjectCard } from '../components/ProjectCard/ProjectCard';
import { SiteFooter } from '../components/SiteFooter/SiteFooter';
import { StatTile } from '../components/StatTile/StatTile';
import { now } from '../lib/clock';
import { landingView } from '../lib/pages/landing';
import { SOURCE_URL, siteChromeView } from '../lib/pages/site';
import { loadLanding } from '../lib/queries/landing';
import { loadSiteChrome } from '../lib/queries/site';
import styles from './page.module.css';

// / (spec section 13): server-rendered as anon through lib/queries, so a private project's hidden
// fields never reach this file. Time is read once per request. LiveUpdates re-renders the page
// when a report arrives; without JavaScript the recent runs are the server-rendered list and
// neither "Live" nor "Offline" is shown (section 13.3).

export default async function LandingPage() {
  // Rendered per request: the numbers are live data and the relative times move with the clock.
  await connection();
  const at = now();
  const [landing, chrome] = await Promise.all([
    loadLanding(undefined, at),
    loadSiteChrome(undefined, at),
  ]);
  const view = landingView(landing, at);
  const site = siteChromeView(chrome, at);

  return (
    <PageFrame>
      <LiveUpdates>
        <LiveSiteHeader projects={site.projects} current="home" />
        <main id="main" className={styles.main}>
          <p className={styles.lede}>Live test results for every project I build.</p>
          <div className={styles.hero}>
            <span className={styles.total} data-part="hero-total">
              {view.heroTotal}
            </span>
          </div>
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
                results after each CI run. Nothing on this page is mocked or hand-entered. The
                dashboard is tested the same way, and reports on itself.
              </p>
              <Button href="/how-its-tested">How testpulse is tested →</Button>
            </section>
          </div>
        </main>
        <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
      </LiveUpdates>
    </PageFrame>
  );
}
