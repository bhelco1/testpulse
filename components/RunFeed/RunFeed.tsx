import { Button } from '../Button/Button';
import { ErrorState } from '../ErrorState/ErrorState';
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

// recent: the landing feed, which says whether it is live. project: the project page run list,
// with its branch filter and paging; the parent fetches, this only asks.
type ReadyFeed =
  | ({ list: 'recent' } & Connection)
  | {
      list: 'project';
      branches: BranchScope;
      onBranchesChange: (branches: BranchScope) => void;
      // Present while there are more runs to load.
      onLoadMore?: () => void;
    };

export type RunFeedProps =
  | ({ variant?: 'web'; state: 'ready'; runs: readonly FeedEntry[] } & ReadyFeed)
  | { variant?: 'web'; state: 'loading' }
  | { variant?: 'web'; state: 'empty' }
  | { variant?: 'web'; state: 'error'; onRetry: () => void }
  | ({ variant: 'kiosk'; runs: readonly KioskFeedRun[] } & Connection);

const BRANCH_OPTIONS = [
  { value: 'default', label: 'Default branch' },
  { value: 'all', label: 'All branches' },
] as const;

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

// Server-renderable: without JavaScript the rows are a plain list of links. Only the branch filter
// needs the client, and only on the project page.
export function RunFeed(props: RunFeedProps) {
  if (props.variant === 'kiosk') return <KioskFeed {...props} />;
  switch (props.state) {
    case 'loading':
      return <LoadingFeed />;
    case 'empty':
      return (
        <div className={styles.empty}>
          <div className={styles.emptyTitle} data-part="empty-title">
            No runs yet
          </div>
          <div className={styles.emptyText} data-part="empty-text">
            Runs appear here as each project&apos;s CI reports.
          </div>
        </div>
      );
    case 'error':
      return (
        <ErrorState
          variant="inline"
          title="Runs couldn't be loaded"
          message="The rest of the page is still current."
          onRetry={props.onRetry}
        />
      );
    case 'ready':
      return <ReadyWebFeed {...props} />;
  }
}

function ReadyWebFeed(props: { runs: readonly FeedEntry[] } & ReadyFeed) {
  const project = props.list === 'project';
  return (
    <section className={styles.feed}>
      <div className={cx(styles.header, project && styles.projectHeader)}>
        <h2 className={styles.heading}>{project ? 'Runs' : 'Recent runs'}</h2>
        {props.list === 'project' ? (
          <SegmentedControl
            label="Branches"
            options={BRANCH_OPTIONS}
            value={props.branches}
            onChange={props.onBranchesChange}
          />
        ) : (
          <span
            className={cx(styles.note, !props.connected && styles.offline)}
            data-part="live-note"
          >
            <LiveDot connected={props.connected} />
            <span>
              {props.connected
                ? 'Updates as reports arrive'
                : `Offline. Showing runs as of ${props.asOf}; reconnecting`}
            </span>
          </span>
        )}
      </div>
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

function KioskFeed(props: { runs: readonly KioskFeedRun[] } & Connection) {
  return (
    <section className={styles.kiosk}>
      <div className={styles.kioskHeader}>
        <h2 className={styles.kioskHeading}>Recent runs</h2>
        <span className={styles.kioskNote} data-part="kiosk-note">
          {props.connected ? 'Updates as reports arrive' : `As of ${props.asOf}`}
        </span>
      </div>
      <div role="log" aria-live="polite" className={styles.kioskLog}>
        {props.runs.map((run) => (
          <RunFeedRow key={run.id} variant="kiosk" run={run} />
        ))}
      </div>
    </section>
  );
}
