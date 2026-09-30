import Link from 'next/link';

import type { SelfReportView } from '../../lib/pages/how-its-tested';
import { ExternalLinkIcon } from '../icons/icons';
import { PyramidRows } from '../Pyramid/Pyramid';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './SelfReport.module.css';

export interface SelfReportProps {
  view: SelfReportView;
  // testpulse's CI runs on GitHub: the repository's Actions tab.
  actionsHref: string;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

// "testpulse’s own results" on /how-its-tested (design/pages/How Its Tested.dc.html, tweak
// selfReporting). Not reporting yet until testpulse's CI posts its first report (Phase 7), then its
// latest run as the other projects' cards show one. Drawn nothing rather than guessed (spec 13.7):
// "Build progress", whose rows are out of date; the note under the pyramid, which says contract
// tests count as Integration; the coverage card, whose data and floors testpulse lacks; and an
// empty run's figures, which the page does not draw.
export function SelfReport({ view, actionsHref }: SelfReportProps) {
  if (view.state === 'not_reporting') {
    return (
      <div className={cx(styles.card, styles.notReporting)} data-state="not_reporting">
        <div className={styles.intro}>
          <StatusBadge status="not_reporting" />
          <h3 className={styles.title}>Self-reporting starts in Phase 7.</h3>
          <p className={styles.body}>
            Until then this section stays empty rather than showing numbers nobody measured. The
            suites already run in CI on every pull request; you can see them in the repository’s
            Actions tab.
          </p>
          <a href={actionsHref} className={styles.link}>
            CI runs on GitHub
            <ExternalLinkIcon size={13} strokeWidth={2.4} />
          </a>
        </div>
      </div>
    );
  }

  const { run, layers, total, projectHref } = view;
  return (
    <div className={styles.reporting} data-state="reporting">
      <article className={cx(styles.card, styles.run)}>
        <div className={styles.top}>
          <StatusBadge status={run.status} />
          <span className={styles.meta} data-part="meta">
            <span data-part="when">
              <RelativeTime when={run.when} />
            </span>
            <span>·</span>
            <span>{run.branch}</span>
            <span>·</span>
            <span className={styles.sha} data-part="sha">
              {run.sha}
            </span>
          </span>
        </div>
        {run.status !== 'empty' && (
          <div className={styles.totals}>
            <span className={styles.total} data-part="total">
              {run.total}
            </span>
            <span className={styles.sub} data-part="sub">
              <span>{run.testsWord} ·</span>
              <span className={cx(run.failed > 0 && styles.failed)} data-part="failed-count">
                {run.failed} failed
              </span>
              <span>·</span>
              <span>{run.skipped} skipped ·</span>
              <span>{run.duration}</span>
            </span>
          </div>
        )}
        {layers.length > 0 && (
          <div className={styles.pyramid}>
            <PyramidRows layers={layers} declared={[]} total={total} />
          </div>
        )}
        <Link href={projectHref} className={styles.projectLink}>
          Full project page →
        </Link>
      </article>
    </div>
  );
}
