import type { Metadata } from 'next';
import { connection } from 'next/server';
import { useId, type ReactNode } from 'react';

import { ClockIcon, ExternalLinkIcon, SlashCircleIcon } from '../../components/icons/icons';
import { PageFrame } from '../../components/PageFrame/PageFrame';
import { RelativeTime } from '../../components/RelativeTime/RelativeTime';
import { SelfReport } from '../../components/SelfReport/SelfReport';
import { SiteFooter } from '../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../components/SiteHeader/SiteHeader';
import { now } from '../../lib/clock';
import {
  ACTIONS_URL,
  howItsTestedView,
  INCIDENTS,
  PRINCIPLES,
  SPEC_URL,
  STRATEGY,
  TITLE,
} from '../../lib/pages/how-its-tested';
import { SOURCE_URL, siteChromeView } from '../../lib/pages/site';
import { loadHowItsTested } from '../../lib/queries/how-its-tested';
import { loadSiteChrome } from '../../lib/queries/site';
import styles from './page.module.css';

// /how-its-tested (spec section 13): testpulse's own strategy and live results, following
// design/pages/How Its Tested.dc.html. Server-rendered as anon through lib/queries, per request,
// with the time read once. A database without a testpulse project row, as production was before
// 2026-10-07, is answered by the loader as "not reporting yet", never as an error. The design
// gives the page no live behaviour, so it has no realtime subscription and its header no live
// indicator (section 13.7).

export const metadata: Metadata = { title: TITLE };

function Section({
  number,
  title,
  className,
  children,
}: {
  number: number;
  title: string;
  className?: string;
  children: (heading: ReactNode) => ReactNode;
}) {
  const headingId = useId();
  const heading = (
    <>
      <div className={styles.number} aria-hidden="true">
        {String(number).padStart(2, '0')}
      </div>
      <h2 id={headingId} className={styles.h2}>
        {title}
      </h2>
    </>
  );
  return (
    <section aria-labelledby={headingId} className={className ?? styles.section}>
      {children(heading)}
    </section>
  );
}

export default async function HowItsTestedPage() {
  // Rendered per request: the live section and the footer move with the data and the clock.
  await connection();
  const at = now();
  const [data, chrome] = await Promise.all([
    loadHowItsTested(undefined, at),
    loadSiteChrome(undefined, at),
  ]);
  const view = howItsTestedView(data, at);
  const site = siteChromeView(chrome, at);

  return (
    <PageFrame>
      <SiteHeader projects={site.projects} current="how-its-tested" />
      <main id="main">
        <section className={styles.hero}>
          <div className={styles.eyebrow}>How it’s tested</div>
          <h1 className={styles.h1}>
            This dashboard is tested the same way as the projects it reports on.
          </h1>
          <p className={styles.lede} data-part="lede">
            {view.lede.join(' ')}
          </p>
          <div className={styles.heroLinks}>
            <a href={SOURCE_URL} className={styles.sourceLink}>
              Source on GitHub
              <ExternalLinkIcon size={13} strokeWidth={2.4} />
            </a>
            <a href={SPEC_URL} className={styles.specLink}>
              Read the specification
              <ExternalLinkIcon size={13} strokeWidth={2.4} />
            </a>
          </div>
        </section>

        <Section number={1} title="Principles">
          {(heading) => (
            <div className={styles.principlesGrid}>
              <div className={styles.principlesIntro}>
                {heading}
                <p className={styles.intro}>
                  Five rules from the specification. Each one exists because breaking it has cost
                  real time on a real project.
                </p>
              </div>
              <ol className={styles.principles}>
                {PRINCIPLES.map(({ n, title, body }) => (
                  <li key={n} className={styles.principle}>
                    <span className={styles.principleN} aria-hidden="true">
                      {n}
                    </span>
                    <div>
                      <h3 className={styles.principleTitle}>{title}</h3>
                      <p className={styles.principleBody}>{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>

        <Section number={2} title="What runs, and what it covers">
          {(heading) => (
            <>
              <div className={styles.strategyHead}>
                {heading}
                <p className={styles.intro}>
                  Parsers are tested against result files captured from Ostomate2 and RouteServe,
                  not hand-written samples. Integration tests run against a local Supabase,
                  including the row-level security that hides private projects from the public.
                </p>
              </div>
              {/* Scrolls sideways at the mock's 760 px minimum, so the keyboard can reach it. */}
              <div
                role="region"
                aria-label="What runs, by layer"
                tabIndex={0}
                className={styles.strategyBox}
              >
                <table role="table" aria-label="What runs, by layer" className={styles.strategy}>
                  <thead role="rowgroup" className={styles.strategyGroup}>
                    <tr role="row" className={`${styles.strategyRow} ${styles.strategyHeadRow}`}>
                      {['Layer', 'Tool', 'Scope'].map((header) => (
                        <th key={header} role="columnheader" scope="col" className={styles.cell}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody role="rowgroup" className={styles.strategyGroup}>
                    {STRATEGY.map(({ name, tools, scope, tone }) => (
                      <tr key={name} role="row" className={styles.strategyRow} data-part="layer">
                        <td role="cell" className={`${styles.cell} ${styles.layerName}`}>
                          <span
                            className={styles.swatch}
                            data-tone={tone ?? undefined}
                            style={
                              tone === null ? undefined : { background: `var(--layer-${tone})` }
                            }
                            aria-hidden="true"
                          />
                          {name}
                        </td>
                        <td role="cell" className={`${styles.cell} ${styles.tools}`}>
                          {tools.map((tool) => (
                            <span key={tool} className={styles.tool}>
                              {tool}
                            </span>
                          ))}
                        </td>
                        <td role="cell" className={`${styles.cell} ${styles.scope}`}>
                          {scope}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.facts}>
                <div className={styles.fact} data-part="fact">
                  <div className={styles.factLabel}>Coverage floor</div>
                  <div className={styles.factFigure}>
                    90% <span className={styles.factUnit}>lines</span>
                  </div>
                  <div className={styles.factSub}>
                    Enforced by Vitest thresholds in the unit job. Below it, CI fails.
                  </div>
                </div>
                <div className={styles.fact} data-part="fact">
                  <div className={styles.factLabel}>On every pull request</div>
                  <div className={styles.factText}>Lint, typecheck, unit, integration, E2E</div>
                </div>
                <div className={styles.fact} data-part="fact">
                  <div className={styles.factLabel}>Failure masking</div>
                  <div className={styles.factFigure}>None</div>
                  <div className={styles.factSub}>
                    No <code className={styles.code}>|| true</code>, no{' '}
                    <code className={styles.code}>continue-on-error</code> on test steps.
                  </div>
                </div>
              </div>
            </>
          )}
        </Section>

        <Section number={3} title="Why it watches for silence">
          {(heading) => (
            <div className={styles.silenceGrid}>
              <div>
                {heading}
                <p className={`${styles.intro} ${styles.silenceIntro}`}>
                  Two incidents from Ostomate2’s post-mortems shaped how results are shown. A green
                  dashboard means nothing if the pipeline behind it has stopped running, or if a
                  suite passes without executing anything.
                </p>
              </div>
              <div className={styles.incidents}>
                {INCIDENTS.map(({ icon, title, now: nowLine }) => {
                  const Icon = icon === 'clock' ? ClockIcon : SlashCircleIcon;
                  return (
                    <div key={title} className={styles.incident}>
                      <div className={styles.incidentLabel}>Incident</div>
                      <h3 className={styles.incidentTitle}>{title}</h3>
                      <div className={styles.incidentNow}>
                        <Icon size={15} strokeWidth={2.6} className={styles.incidentIcon} />
                        <span data-part="now">{nowLine}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        <Section
          number={4}
          title="testpulse’s own results"
          className={`${styles.section} ${styles.last}`}
        >
          {(heading) => (
            <>
              <div className={styles.selfHead}>
                {heading}
                <p className={styles.intro}>
                  Since <RelativeTime when={view.since} />, testpulse’s CI posts its results to this
                  site as the project <code className={styles.selfCode}>testpulse</code>, through
                  the same shared GitHub Action Ostomate2 and RouteServe use.
                </p>
              </div>
              <SelfReport view={view.self} actionsHref={ACTIONS_URL} progress={view.progress} />
            </>
          )}
        </Section>
      </main>
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} />
    </PageFrame>
  );
}
