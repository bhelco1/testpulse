import Link from 'next/link';

import type { RunStatus } from '../../lib/ingest/normalize';
import { LockIcon } from '../icons/icons';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './RunFeedRow.module.css';

interface RunBase {
  // The run's id, unique within a feed.
  id: string;
  // The run page, which exists for private projects too.
  href: string;
  project: string;
  // The branch slot: runs.branch, or the pull request label such as "PR #52", formatted by the
  // caller.
  branch: string;
  sha: string;
  // Already relative, such as "4 minutes ago": components do not read the clock.
  when: string;
}

type RunCounts =
  | { status: Extract<RunStatus, 'passed'>; total: number; duration: string }
  | { status: Extract<RunStatus, 'failed'>; failed: number; passed: number; total: number }
  | { status: Extract<RunStatus, 'empty'>; reports: number };

// The title is chosen from runs.event by the caller; the mapping waits on a design answer (spec
// decision log, 2026-09-26). A private project's row shows no title.
type RunTitle = { visibility: 'public'; title: string } | { visibility: 'private' };

export type FeedRun = RunBase & RunCounts & RunTitle;

// The kiosk draws its feed tiles only for passed and failed runs.
export type KioskFeedRun = {
  id: string;
  project: string;
  branch: string;
  when: string;
} & ({ status: 'passed'; total: number } | { status: 'failed'; failed: number });

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

const formatCount = new Intl.NumberFormat('en-US');
const sha7 = (sha: string) => sha.slice(0, 7);
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function RunFeedRow(props: RunFeedRowProps) {
  if (props.variant === 'kiosk') return <KioskTile run={props.run} />;
  return <WebRow run={props.run} showProject={props.showProject} isNew={props.isNew} />;
}

function Count({ run }: { run: RunCounts }) {
  const [lead, rest, tone] =
    run.status === 'passed'
      ? [`${formatCount.format(run.total)} tests`, `· ${run.duration}`, styles.countPassed]
      : run.status === 'failed'
        ? [
            `${formatCount.format(run.failed)} failed`,
            `· ${formatCount.format(run.passed)} of ${formatCount.format(run.total)}`,
            styles.countFailed,
          ]
        : ['0 tests', `· ${run.reports} reports`, styles.countEmpty];
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

function KioskTile({ run }: { run: KioskFeedRun }) {
  const failed = run.status === 'failed';
  return (
    <div className={styles.tile} data-variant="kiosk">
      <div className={styles.tileTop}>
        <span data-part="status">
          <StatusBadge status={run.status} variant="kioskInline" />
        </span>
        <span className={styles.tileWhen} data-part="when">
          {run.when}
        </span>
      </div>
      <div className={styles.tileBottom}>
        <span className={styles.tileProject} data-part="project">
          {run.project}
        </span>
        <span className={styles.tileBranch} data-part="branch">
          {run.branch}
        </span>
        <span className={cx(styles.tileCount, failed && styles.tileCountFailed)} data-part="count">
          {failed
            ? `${formatCount.format(run.failed)} failed`
            : `${formatCount.format(run.total)} tests`}
        </span>
      </div>
    </div>
  );
}
