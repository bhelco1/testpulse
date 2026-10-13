import type { Metadata } from 'next';
import { connection } from 'next/server';

import { PageFrame } from '../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../components/SiteHeader/SiteHeader';
import { RelativeTime } from '../../components/RelativeTime/RelativeTime';
import { now } from '../../lib/clock';
import { PRIVACY, privacyView, type PrivacySection } from '../../lib/pages/privacy';
import { SOURCE_URL, siteChromeView } from '../../lib/pages/site';
import { loadSiteChrome } from '../../lib/queries/site';
import styles from './page.module.css';

// /privacy (spec section 13.8), following design/pages/Privacy.dc.html in its "after Phase 6"
// phase: what a visit records, the cookie and tracked links, then the sections the page has
// always had, from lib/pages/privacy.ts. The design gives the page no live behaviour, so it has no
// realtime subscription and its header no live indicator.

export const metadata: Metadata = { title: 'Privacy · testpulse' };

export default async function PrivacyPage() {
  // Rendered per request: the project switcher and the footer move with the data and the clock.
  await connection();
  const at = now();
  const site = siteChromeView(await loadSiteChrome(undefined, at), at);
  const view = privacyView(at);

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
          {PRIVACY.cards.map((card) => (
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
        {/* Each group opens 48 px below what precedes it and the rest 40, as the mock spaces them. */}
        {[PRIVACY.tracking, PRIVACY.standing].map((group) =>
          group.map((section: PrivacySection, index) => (
            <Section key={section.title} section={section} first={index === 0} />
          )),
        )}
      </main>
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} current="privacy" />
    </PageFrame>
  );
}

function Section({ section, first }: { section: PrivacySection; first: boolean }) {
  return (
    <section className={first ? `${styles.section} ${styles.first}` : styles.section}>
      <h2 className={styles.h2}>{section.title}</h2>
      <div className={styles.prose}>
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph} className={styles.paragraph}>
            {paragraph}
          </p>
        ))}
        {section.list === undefined ? null : (
          <ul className={styles.proseList}>
            {section.list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
