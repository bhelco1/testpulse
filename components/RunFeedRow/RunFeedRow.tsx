import Link from 'next/link';

import { formatCount, qty } from '../../lib/copy/count';
import type { RunStatus } from '../../lib/ingest/normalize';
import type { Visibility } from '../../lib/projects/schema';
import { LockIcon } from '../icons/icons';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './RunFeedRow.module.css';

interface RunBase {
  // The run's id, unique within a feed.
  id: string;
  // The run page, which exists for private projects too.
  href: string;
  project: string;
  // runs.branch, for every event (design v4 item 28).
  branch: string;
  sha: string;
  // Already relative, such as "4 minutes ago": components do not read the clock.
  when: string;
}

type RunCounts =
  | { status: Extract<RunStatus, 'passed'>; total: number; duration: string }
  | { status: Extract<RunStatus, 'failed'>; failed: number; passed: number; total: number }
  | { status: Extract<RunStatus, 'empty'>; reports: number };

// The caller titles the run with runTitle (lib/runs/title) from runs.event and runs.branch. A
// private project's row shows no title.
type RunTitle = { visibility: 'public'; title: string } | { visibility: 'private' };

export type FeedRun = RunBase & RunCounts & RunTitle;

export type KioskFeedRun = {
  id: string;
  project: string;
  visibility: Visibility;
  branch: string;
  when: string;
} & (
  | { status: Extract<RunStatus, 'passed'>; total: number }
  | { status: Extract<RunStatus, 'failed'>; failed: number }
  | { status: Extract<RunStatus, 'empty'> }
);

export type RunFeedRowProps =
  | {
      variant?: 'web';
      run: FeedRun;
      // False on the project page, where every row is that project's.
      showProject?: boolean;
      // Arrived over realtime since the feed was loaded.
      isNew?: boolean;
    }
  | { variant: 'kiosk'; run: KioskFeedRun };

const sha7 = (sha: string) => sha.slice(0, 7);
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function RunFeedRow(props: RunFeedRowProps) {
  if (props.variant === 'kiosk') return <KioskTile run={props.run} />;
  return <WebRow run={props.run} showProject={props.showProject} isNew={props.isNew} />;
}

function Count({ run }: { run: RunCounts }) {
  const [lead, rest, tone] =
    run.status === 'passed'
      ? [qty(run.total, 'test'), `· ${run.duration}`, styles.countPassed]
      : run.status === 'failed'
        ? [
            `${formatCount(run.failed)} failed`,
            `· ${formatCount(run.passed)} of ${formatCount(run.total)}`,
            styles.countFailed,
          ]
        : ['0 tests', `· ${qty(run.reports, 'report')}`, styles.countEmpty];
  return (
    <span className={styles.count}>
      <span className={tone} data-part="count-lead">
        {lead}
      </span>
      <span className={styles.countRest} data-part="count-rest">
        {rest}
      </span>
    </span>
  );
}

function WebRow({
  run,
  showProject = true,
  isNew = false,
}: {
  run: FeedRun;
  showProject?: boolean;
  isNew?: boolean;
}) {
  return (
    <Link href={run.href} className={cx(styles.row, isNew && styles.new)} data-variant="web">
      <span className={styles.status} data-part="status">
        <StatusBadge status={run.status} variant="inline" />
      </span>
      <span className={styles.content}>
        <span className={styles.titleLine}>
          {isNew && (
            <span className={styles.chip} data-part="new">
              New
            </span>
          )}
          {run.visibility === 'private' ? (
            <span className={styles.private} data-part="private">
              <LockIcon size={12} strokeWidth={2.4} />
              Private repository
            </span>
          ) : (
            <span className={styles.title} data-part="title">
              {run.title}
            </span>
          )}
        </span>
        <span className={styles.meta} data-part="meta">
          {showProject && (
            <>
              <span>{run.project}</span>
              <span>·</span>
            </>
          )}
          <span>{run.branch}</span>
          <span>·</span>
          <span className={styles.sha} data-part="sha">
            {sha7(run.sha)}
          </span>
        </span>
      </span>
      <Count run={run} />
      <span className={styles.when} data-part="when">
        {run.when}
      </span>
    </Link>
  );
}

function kioskCount(run: KioskFeedRun): [string, string | undefined] {
  switch (run.status) {
    case 'passed':
      return [qty(run.total, 'test'), undefined];
    case 'failed':
      return [`${formatCount(run.failed)} failed`, styles.tileCountFailed];
    case 'empty':
      return ['0 tests', styles.tileCountEmpty];
  }
}

// Not a link: the kiosk is not interactive.
function KioskTile({ run }: { run: KioskFeedRun }) {
  const [count, tone] = kioskCount(run);
  return (
    <div className={styles.tile} data-variant="kiosk">
      <div className={styles.tileTop}>
        <span data-part="status">
          <StatusBadge status={run.status} variant="inline-kiosk" />
        </span>
        <span className={styles.tileWhen} data-part="when">
          {run.when}
        </span>
      </div>
      <div className={styles.tileBottom}>
        <span className={styles.tileProject} data-part="project">
          {run.project}
        </span>
        {run.visibility === 'private' && (
          <span
            role="img"
            aria-label="Private repository"
            className={styles.tileLock}
            data-part="private"
          >
            <LockIcon size={22} strokeWidth={2.2} />
          </span>
        )}
        <span className={styles.tileBranch} data-part="branch">
          {run.branch}
        </span>
        <span className={cx(styles.tileCount, tone)} data-part="count">
          {count}
        </span>
      </div>
    </div>
  );
}
