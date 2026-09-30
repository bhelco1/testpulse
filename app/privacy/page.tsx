import type { Metadata } from 'next';
import { connection } from 'next/server';

import { PageFrame } from '../../components/PageFrame/PageFrame';
import { SiteFooter } from '../../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../../components/SiteHeader/SiteHeader';
import { now } from '../../lib/clock';
import { SOURCE_URL, siteChromeView } from '../../lib/pages/site';
import { loadSiteChrome } from '../../lib/queries/site';
import styles from './page.module.css';

// /privacy (spec section 13.8), following design/pages/Privacy.dc.html. Everything the mock says
// below its heading describes the visit logging of section 14 (page-view records, the session
// cookie, tracked links), which is Phase 6 and not built, so today it would be false and is held
// back until it is true or the design gives copy for the site as it is. The design gives the page
// no live behaviour, so it has no realtime subscription and its header no live indicator.

export const metadata: Metadata = { title: 'Privacy · testpulse' };

export default async function PrivacyPage() {
  // Rendered per request: the project switcher and the footer move with the data and the clock.
  await connection();
  const at = now();
  const site = siteChromeView(await loadSiteChrome(undefined, at), at);

  return (
    <PageFrame>
      <SiteHeader projects={site.projects} />
      <main id="main" className={styles.main}>
        <div className={styles.eyebrow} data-part="eyebrow">
          Privacy
        </div>
        <h1 className={styles.h1}>What this site records about you</h1>
      </main>
      <SiteFooter lastReport={site.lastReport} sourceHref={SOURCE_URL} current="privacy" />
    </PageFrame>
  );
}
