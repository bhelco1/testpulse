import { Button } from '../Button/Button';
import { ErrorState } from '../ErrorState/ErrorState';
import { AlertCircleIcon } from '../icons/icons';
import { LiveDot } from '../LiveIndicator/LiveIndicator';
import { RunFeedRow, type FeedRun, type KioskFeedRun } from '../RunFeedRow/RunFeedRow';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './RunFeed.module.css';

export type FeedEntry = FeedRun & { isNew?: boolean };

// The project page run list: default-branch runs (the default), or every branch (spec 18 Q4).
export type BranchScope = 'default' | 'all';

// asOf is when the shown runs were current, already formatted as HH:MM: components do not read
// the clock.
type Connection = { connected: true } | { connected: false; asOf: string };

// The project page run list's header: its branch filter, and the project named in its empty copy.
// The parent fetches; this only asks.
type ProjectList = {
  list: 'project';
  project: string;
  branches: BranchScope;
  onBranchesChange: (branches: BranchScope) => void;
} & Connection;

// recent: the landing feed. project: the project page run list, with paging.
type ReadyFeed =
  | ({ list: 'recent' } & Connection)
  | (ProjectList & {
      // Present while there are more runs to load.
      onLoadMore?: () => void;
    });

type KioskFeed = { variant: 'kiosk' } & Connection &
  (
    | { state: 'ready'; runs: readonly KioskFeedRun[] }
    | { state: 'loading' }
    | { state: 'empty' }
    | { state: 'error' }
  );

export type RunFeedProps =
  | ({ variant?: 'web'; state: 'ready'; runs: readonly FeedEntry[] } & ReadyFeed)
  | { variant?: 'web'; state: 'loading' }
  // The landing's empty feed is a card of its own; the project page keeps its header.
  | { variant?: 'web'; state: 'empty' }
  | ({ variant?: 'web'; state: 'empty' } & ProjectList)
  | { variant?: 'web'; state: 'error'; onRetry: () => void }
  | KioskFeed;

const BRANCH_OPTIONS = [
  { value: 'default', label: 'Default branch' },
  { value: 'all', label: 'All branches' },
] as const;

const EACH_PROJECT = 'Runs appear here as each project’s CI reports.';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

// Server-renderable: without JavaScript the rows are a plain list of links. Only the branch filter
// needs the client, and only on the project page.
export function RunFeed(props: RunFeedProps) {
  if (props.variant === 'kiosk') return <KioskFeedView {...props} />;
  switch (props.state) {
    case 'loading':
      return <LoadingFeed />;
    case 'empty':
      if ('list' in props) return <ProjectEmptyFeed {...props} />;
      return (
        <div className={styles.empty}>
          <EmptyText text={EACH_PROJECT} />
        </div>
      );
    case 'error':
      return (
        <ErrorState
          variant="inline"
          title="Runs couldn’t be loaded"
          message="The rest of the page is still current."
          onRetry={props.onRetry}
        />
      );
    case 'ready':
      return <ReadyWebFeed {...props} />;
  }
}

function EmptyText({ text }: { text: string }) {
  return (
    <>
      <div className={styles.emptyTitle} data-part="empty-title">
        No runs yet
      </div>
      <div className={styles.emptyText} data-part="empty-text">
        {text}
      </div>
    </>
  );
}

function LiveNote({ connection, project }: { connection: Connection; project: boolean }) {
  return (
    <span
      className={cx(
        styles.note,
        project && styles.projectNote,
        !connection.connected && styles.offline,
      )}
      data-part="live-note"
    >
      <LiveDot connected={connection.connected} />
      <span>
        {connection.connected
          ? 'Updates as reports arrive'
          : `Offline. Showing runs as of ${connection.asOf}; reconnecting`}
      </span>
    </span>
  );
}

// The header row holds "Runs" and the filter; the live note sits on its own line below (v4 36).
function ProjectHeader(props: ProjectList) {
  return (
    <>
      <div className={cx(styles.header, styles.projectHeader)}>
        <h2 className={styles.heading}>Runs</h2>
        <SegmentedControl
          label="Branches"
          options={BRANCH_OPTIONS}
          value={props.branches}
          onChange={props.onBranchesChange}
        />
      </div>
      <LiveNote connection={props} project />
    </>
  );
}

function ProjectEmptyFeed(props: ProjectList) {
  return (
    <section className={styles.feed}>
      <ProjectHeader {...props} />
      <div className={styles.projectEmpty} data-part="project-empty">
        <EmptyText text={`Runs appear here when ${props.project}’s CI reports.`} />
      </div>
    </section>
  );
}

function ReadyWebFeed(props: { runs: readonly FeedEntry[] } & ReadyFeed) {
  const project = props.list === 'project';
  return (
    <section className={styles.feed}>
      {props.list === 'project' ? (
        <ProjectHeader {...props} />
      ) : (
        <div className={styles.header}>
          <h2 className={styles.heading}>Recent runs</h2>
          <LiveNote connection={props} project={false} />
        </div>
      )}
      <div role="log" aria-live="polite">
        <ul className={styles.list}>
          {props.runs.map(({ isNew, ...run }) => (
            <li key={run.id}>
              <RunFeedRow run={run} showProject={!project} isNew={isNew} />
            </li>
          ))}
        </ul>
      </div>
      {props.list === 'project' && props.onLoadMore && (
        <div className={styles.more}>
          <Button variant="secondary" onClick={props.onLoadMore}>
            Load 20 more
          </Button>
        </div>
      )}
    </section>
  );
}

function LoadingFeed() {
  return (
    <div className={styles.feed} aria-busy="true" aria-label="Loading runs">
      {[0, 1, 2].map((row) => (
        <div key={row} className={styles.skeletonRow} data-part="skeleton-row">
          <Skeleton width="104px" height={14} />
          <div className={styles.skeletonText}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="45%" height={10} className={styles.skeletonMeta} />
          </div>
          <Skeleton width="90px" height={14} />
        </div>
      ))}
    </div>
  );
}

function KioskNote({ connection }: { connection: Connection }) {
  if (connection.connected) {
    return (
      <span className={styles.kioskNote} data-part="kiosk-note">
        Updates as reports arrive
      </span>
    );
  }
  return (
    <span className={cx(styles.kioskNote, styles.kioskOffline)} data-part="kiosk-note">
      <span className={styles.kioskRing} data-part="kiosk-ring" aria-hidden="true" />
      <span>Offline. As of {connection.asOf}</span>
    </span>
  );
}

// The kiosk is not interactive: an error shows no button (the kiosk retries on its own) and no
// stale rows.
function KioskBody(props: KioskFeed) {
  switch (props.state) {
    case 'ready':
      return (
        <div role="log" aria-live="polite" className={styles.kioskLog}>
          {props.runs.map((run) => (
            <RunFeedRow key={run.id} variant="kiosk" run={run} />
          ))}
        </div>
      );
    case 'loading':
      return (
        <div className={styles.kioskLog} aria-busy="true" aria-label="Loading runs">
          {[0, 1, 2].map((tile) => (
            <div key={tile} className={styles.kioskSkeleton} data-part="skeleton-tile">
              <div className={styles.kioskSkeletonTop}>
                <Skeleton width="130px" height={24} />
                <Skeleton width="90px" height={22} />
              </div>
              <Skeleton width="75%" height={24} />
            </div>
          ))}
        </div>
      );
    case 'empty':
      return (
        <div className={styles.kioskLog}>
          <div className={styles.kioskTile} data-part="kiosk-empty">
            <span className={styles.kioskStateTitle} data-part="empty-title">
              No runs yet
            </span>
            <span className={styles.kioskStateText} data-part="empty-text">
              {EACH_PROJECT}
            </span>
          </div>
        </div>
      );
    case 'error':
      return (
        <div className={styles.kioskLog}>
          <div className={styles.kioskTile} data-part="kiosk-error">
            <span
              className={cx(styles.kioskStateTitle, styles.kioskErrorTitle)}
              data-part="error-title"
            >
              <AlertCircleIcon size={24} strokeWidth={2.6} className={styles.kioskErrorIcon} />
              Runs couldn’t be loaded
            </span>
            <span className={styles.kioskStateText} data-part="error-text">
              Retrying every minute.
            </span>
          </div>
        </div>
      );
  }
}

function KioskFeedView(props: KioskFeed) {
  return (
    <section className={styles.kiosk}>
      <div className={styles.kioskHeader}>
        <h2 className={styles.kioskHeading}>Recent runs</h2>
        <KioskNote connection={props} />
      </div>
      <KioskBody {...props} />
    </section>
  );
}
