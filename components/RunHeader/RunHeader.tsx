import type { RunPageView } from '../../lib/pages/run';
import { ExternalLinkIcon, LockIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './RunHeader.module.css';

export type RunHeaderProps = Pick<RunPageView, 'status' | 'when' | 'heading' | 'meta' | 'tiles'>;

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

// The run page's summary (design/pages/Run Detail.dc.html): status and when, the run's title (a
// private project's run is "Run {id}" with a lock), its branch, commit, event, start and CI run,
// and the five count tiles. A private project's commit arrives cut to 7 characters and its run
// URL null (section 9), so neither is linked. The mock's "Reports {n} of {m}" entry and failed-run
// summary are held back (docs/spec.md section 13.5).
export function RunHeader({ status, when, heading, meta, tiles }: RunHeaderProps) {
  const tileList: [string, string, boolean][] = [
    ['Tests', tiles.tests, false],
    ['Passed', tiles.passed, false],
    ['Failed', tiles.failed, tiles.failTone],
    ['Skipped', tiles.skipped, false],
    ['Duration', tiles.duration, false],
  ];
  return (
    <section className={styles.header} aria-labelledby="run-heading">
      <div className={styles.lead} data-part="lead">
        <StatusBadge status={status} variant="pill" />
        <span className={styles.when}>
          <RelativeTime when={when} />
        </span>
      </div>
      <h1 id="run-heading" className={styles.heading}>
        {heading.text}
        {heading.private && (
          <span role="img" aria-label="Private repository" className={styles.lock}>
            <LockIcon size={24} strokeWidth={2.2} />
          </span>
        )}
      </h1>
      <dl className={styles.meta} data-part="meta">
        <div>
          <dt className={styles.term}>Branch</dt>
          <dd className={styles.value}>{meta.branch}</dd>
        </div>
        <div>
          <dt className={styles.term}>Commit</dt>
          <dd className={cx(styles.value, styles.sha)}>
            {meta.commit.href === null ? (
              meta.commit.text
            ) : (
              <a href={meta.commit.href}>{meta.commit.text}</a>
            )}
          </dd>
        </div>
        <div>
          <dt className={styles.term}>Event</dt>
          <dd className={styles.value}>{meta.event}</dd>
        </div>
        <div>
          <dt className={styles.term}>Started</dt>
          <dd className={styles.value}>
            <RelativeTime when={meta.started} />
          </dd>
        </div>
        {meta.ciHref !== null && (
          <div>
            <dt className={styles.term}>CI</dt>
            <dd className={styles.value}>
              <a href={meta.ciHref} className={styles.ci}>
                GitHub Actions
                <ExternalLinkIcon size={12} strokeWidth={2.4} />
              </a>
            </dd>
          </div>
        )}
      </dl>
      <div className={styles.tiles}>
        {tileList.map(([label, value, fail]) => (
          <div
            key={label}
            className={cx(styles.tile, fail && styles.tileFail)}
            data-part="tile"
            data-tone={fail ? 'fail' : undefined}
          >
            <div className={styles.tileLabel}>{label}</div>
            <div className={styles.tileValue}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
