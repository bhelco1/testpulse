import { useId, type ReactNode } from 'react';
import Link from 'next/link';

import type { BuildProgressView, PhaseStatus } from '../../lib/pages/build-progress';
import {
  PYRAMID_NOTE,
  type SelfCoverage,
  type SelfReportView,
} from '../../lib/pages/how-its-tested';
import { CoverageBar } from '../CoverageBar/CoverageBar';
import {
  CheckCircleIcon,
  ClockIcon,
  DashedCircleIcon,
  ExternalLinkIcon,
  type IconProps,
} from '../icons/icons';
import { PyramidRows } from '../Pyramid/Pyramid';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './SelfReport.module.css';

export interface SelfReportProps {
  view: SelfReportView;
  // testpulse's CI runs on GitHub: the repository's Actions tab.
  actionsHref: string;
  // "Build progress", section 04's last card in either state.
  progress: BuildProgressView;
}

const PHASE: Readonly<
  Record<PhaseStatus, { word: string; className: string; Icon: (props: IconProps) => ReactNode }>
> = {
  done: { word: 'Done', className: 'done', Icon: CheckCircleIcon },
  in_progress: { word: 'In progress', className: 'inProgress', Icon: ClockIcon },
  planned: { word: 'Planned', className: 'planned', Icon: DashedCircleIcon },
};

function BuildProgress({ progress }: { progress: BuildProgressView }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cx(styles.panel, styles.progress)}
      data-part="progress"
    >
      <div className={styles.progressHead}>
        <h3 id={headingId} className={styles.progressTitle} data-part="progress-title">
          Build progress
        </h3>
        <span className={styles.asOf} data-part="as-of">
          <span>As of</span> <RelativeTime when={progress.asOf} />
        </span>
      </div>
      <ol className={styles.phases}>
        {progress.phases.map(({ n, label, status }) => {
          const { word, className, Icon } = PHASE[status];
          return (
            <li key={n} className={styles.phase} data-part="phase">
              <span className={styles.phaseN}>{n}</span>
              <span>{label}</span>
              <span className={cx(styles.phaseStatus, styles[className])} data-status={status}>
                <Icon size={14} strokeWidth={2.6} />
                <span>{word}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// "Coverage against the floor" (design v12 item 10): canonical CoverageBar rows, then a line per
// module with its counts. A module stored as a recorded percentage has no counts and no line.
function Coverage({ coverage }: { coverage: readonly SelfCoverage[] }) {
  const headingId = useId();
  const notes = coverage.flatMap(({ module, note }) => (note === null ? [] : [{ module, note }]));
  return (
    <section aria-labelledby={headingId} className={styles.panel} data-part="coverage">
      <h3 id={headingId} className={styles.coverageTitle}>
        Coverage against the floor
      </h3>
      <div className={styles.coverageScope} data-part="coverage-scope">
        Lines, latest default-branch run
      </div>
      <div className={styles.coverageRows}>
        {coverage.map(({ module, pct, floor }) => (
          <CoverageBar key={module} module={module} pct={pct} floor={floor} />
        ))}
      </div>
      {notes.length > 0 && (
        <p className={styles.coverageNotes}>
          {notes.map(({ module, note }) => (
            <span key={module} className={styles.coverageNote} data-part="coverage-note">
              {note}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

// "testpulse’s own results" on /how-its-tested (design/pages/How Its Tested.dc.html, tweak
// selfReporting; design v12). Reporting: testpulse's latest run as the other projects' cards
// show one, with the note on how the pyramid counts, then its coverage against the floor. Not
// reporting yet, for a reset or an outage: no figures. Either way "Build progress" from
// docs/build-progress.json ends the section. Drawn nothing rather than guessed (spec 13.7): the
// coverage card when testpulse reported no coverage, and an empty run's figures.
export function SelfReport({ view, actionsHref, progress }: SelfReportProps) {
  return (
    <>
      {view.state === 'not_reporting' ? (
        <NotReporting actionsHref={actionsHref} />
      ) : (
        <Reporting view={view} />
      )}
      <BuildProgress progress={progress} />
    </>
  );
}

function NotReporting({ actionsHref }: { actionsHref: string }) {
  return (
    <div className={cx(styles.card, styles.notReporting)} data-state="not_reporting">
      <div className={styles.intro}>
        <StatusBadge status="not_reporting" />
        <h3 className={styles.title}>No results received yet.</h3>
        <p className={styles.body}>
          This section stays empty rather than showing numbers nobody measured. The suites run in CI
          on every pull request; you can see them in the repository’s Actions tab.
        </p>
        <a href={actionsHref} className={styles.link}>
          CI runs on GitHub
          <ExternalLinkIcon size={13} strokeWidth={2.4} />
        </a>
      </div>
    </div>
  );
}

function Reporting({ view }: { view: Extract<SelfReportView, { state: 'reporting' }> }) {
  const { run, layers, total, coverage, projectHref } = view;
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
        <p className={styles.pyramidNote} data-part="pyramid-note">
          {PYRAMID_NOTE}
        </p>
        <Link href={projectHref} className={styles.projectLink}>
          Full project page →
        </Link>
      </article>
      {coverage.length > 0 && <Coverage coverage={coverage} />}
    </div>
  );
}
