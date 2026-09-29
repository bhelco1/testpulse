import Link from 'next/link';

import type { TimeLabel } from '../../lib/copy/time';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './SiteFooter.module.css';

export interface SiteFooterProps {
  // Already relative, such as "4 min ago": components do not read the clock. Left out before
  // any project has reported.
  lastReport?: TimeLabel;
  sourceHref: string;
}

export function SiteFooter({ lastReport, sourceHref }: SiteFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.links}>
        <Link href="/privacy" className={`${styles.link} ${styles.privacy}`}>
          Privacy
        </Link>
        <a href={sourceHref} className={styles.link}>
          Source on GitHub
        </a>
      </div>
      {lastReport !== undefined && (
        <span>
          Last report received <RelativeTime when={lastReport} />
        </span>
      )}
    </footer>
  );
}
