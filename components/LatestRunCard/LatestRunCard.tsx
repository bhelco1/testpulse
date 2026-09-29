import Link from 'next/link';

import type { LatestRunView } from '../../lib/pages/project';
import { RecoveryStats } from '../RecoveryStats/RecoveryStats';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './LatestRunCard.module.css';

export interface LatestRunCardProps {
  run: LatestRunView;
}

// The project page's latest default-branch run beside its introduction
// (design/pages/Project Page.dc.html): its figures, then the stat row of the 30-day pass rate and
// the project's RecoveryStats. Parts the view leaves null are not drawn.
export function LatestRunCard({ run }: LatestRunCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <StatusBadge status={run.status} variant="pill" />
        <span className={styles.meta} data-part="meta">
          Latest run · <RelativeTime when={run.when} /> · {run.branch} ·{' '}
          <span className={styles.sha} data-part="sha">
            {run.sha}
          </span>
        </span>
      </div>
      {run.figure !== null && (
        <div className={styles.figureRow}>
          <span
            className={[styles.figure, run.figureTone === 'fail' && styles.fail]
              .filter(Boolean)
              .join(' ')}
            data-part="figure"
            data-tone={run.figureTone}
          >
            {run.figure}
          </span>
          <span className={styles.line} data-part="line">
            {run.line}
          </span>
        </div>
      )}
      {run.failing !== null && (
        <Link
          href={run.failing.href}
          className={styles.failing}
          title={run.failing.full}
          data-part="failing"
        >
          <span className={styles.failName}>{run.failing.short}</span>
          <span className={styles.failPlatform}>{run.failing.platform}</span>
        </Link>
      )}
      <div className={styles.stats} data-part="stats">
        {run.passRate30 !== null && (
          <div className={styles.passRateCell} data-part="cell">
            <div className={styles.statLabel}>Pass rate, 30 days</div>
            <div className={styles.statValue} data-part="pass-rate">
              {run.passRate30}
            </div>
          </div>
        )}
        <RecoveryStats
          greenStreak={run.recovery.greenStreak}
          timeToGreen={run.recovery.timeToGreen}
        />
      </div>
      <Link href={run.href} className={styles.view}>
        View this run →
      </Link>
    </article>
  );
}
