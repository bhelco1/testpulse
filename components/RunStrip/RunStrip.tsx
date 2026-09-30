import { useId } from 'react';

import { StatusTimeline, type RunsTimelineRun } from '../StatusTimeline/StatusTimeline';
import styles from './RunStrip.module.css';

export interface RunStripProps {
  // The last 40 default-branch CI runs, oldest first (design v7 item 7).
  runs: readonly RunsTimelineRun[];
  // projects.default_branch, which the strip's accessible name gives.
  defaultBranch: string;
  // "All {n} passed.", the one note the design draws; null for any other strip.
  note: string | null;
}

// The project page's "Last 40 runs" card (design/pages/Project Page.dc.html, History): the
// runs-kind StatusTimeline under its title, scope line and note.
export function RunStrip({ runs, defaultBranch, note }: RunStripProps) {
  const titleId = useId();
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.head}>
        <div>
          <h3 id={titleId} className={styles.title}>
            Last 40 runs
          </h3>
          <p className={styles.scope} data-part="scope">
            Default branch · run status
          </p>
        </div>
        {note !== null && (
          <span className={styles.note} data-part="note">
            {note}
          </span>
        )}
      </div>
      <StatusTimeline kind="runs" runs={runs} defaultBranch={defaultBranch} />
    </section>
  );
}
