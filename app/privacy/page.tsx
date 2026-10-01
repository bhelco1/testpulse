import type { Metadata } from 'next';
import { connection } from 'next/server';

import { PageFrame } from '../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../components/SiteHeader/SiteHeader';
import { RelativeTime } from '../../components/RelativeTime/RelativeTime';
import { now } from '../../lib/clock';
import { PRIVACY, privacyView } from '../../lib/pages/privacy';
import { SOURCE_URL, siteChromeView } from '../../lib/pages/site';
import { loadSiteChrome } from '../../lib/queries/site';
import styles from './page.module.css';

// /privacy (spec section 13.8), following design/pages/Privacy.dc.html in its "today" phase (v9
// item 3): what the site does now, from lib/pages/privacy.ts. The Phase 6 version, which
// describes visit logging, ships with tracked links. The design gives the page no live
// behaviour, so it has no realtime subscription and its header no live indicator.

export const metadata: Metadata = { title: 'Privacy · testpulse' };

export default async function PrivacyPage() {
  // Rendered per request: the project switcher and the footer move with the data and the clock.
  await connection();
  const at = now();
  const site = siteChromeView(await loadSiteChrome(undefined, at), at);
  const view = privacyView(at);
  const cards = [
    { title: 'What your browser does here', items: PRIVACY.browserDoes },
    { title: 'What this site doesn’t do', items: PRIVACY.siteDoesNot },
  ];

  return (
    <PageFrame>
      <SiteHeader projects={site.projects} />
      <main id="main" className={styles.main}>
        <div className={styles.eyebrow} data-part="eyebrow">
          Privacy
        </div>
        <h1 className={styles.h1}>What this site records about you</h1>
        <p className={styles.lede} data-part="lede">
          {PRIVACY.lede}
        </p>
        <div className={styles.updated} data-part="updated">
          <span>Updated</span> <RelativeTime when={view.updated} />
        </div>
        <div className={styles.cards}>
          {cards.map((card) => (
            <section key={card.title} className={styles.card} data-part="summary">
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <ul className={styles.list}>
                {card.items.map((item) => (
                  <li key={item} className={styles.item}>
                    <span className={styles.dash} aria-hidden="true">
                      —
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {PRIVACY.sections.map((section, index) => (
          <section
            key={section.title}
            className={index === 0 ? `${styles.section} ${styles.first}` : styles.section}
          >
            <h2 className={styles.h2}>{section.title}</h2>
            <div className={styles.prose}>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className={styles.paragraph}>
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} current="privacy" />
    </PageFrame>
  );
}
