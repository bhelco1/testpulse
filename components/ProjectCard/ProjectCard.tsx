import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatCount, qty } from '../../lib/copy/count';
import type { TimeLabel } from '../../lib/copy/time';
import type { LayerSegment } from '../../lib/design/layers';
import type { RunStatus } from '../../lib/ingest/normalize';
import { declaredSummary } from '../../lib/projects/declared-summary';
import type { DeclaredSuite, Visibility } from '../../lib/projects/schema';
import { shortSuite } from '../../lib/results/short-suite';
import { platformSplit } from '../../lib/runs/platform-split';
import { CoverageBar, type CoverageBarProps } from '../CoverageBar/CoverageBar';
import { HealthMarker, type HealthState } from '../HealthMarker/HealthMarker';
import { EmptyIcon } from '../icons/icons';
import { LayerBar } from '../LayerBar/LayerBar';
import { PrivateTag } from '../PrivateTag/PrivateTag';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import { Skeleton } from '../Skeleton/Skeleton';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './ProjectCard.module.css';

export interface ProjectCardProject {
  name: string;
  tagline: string;
  visibility: Visibility;
  // The project page.
  href: string;
}

export interface ProjectCardRun {
  status: RunStatus;
  // Already relative, such as "4 min ago": components do not read the clock.
  when: TimeLabel;
  branch: string;
  sha: string;
  // The run page, which exists for private projects too.
  href: string;
  total: number;
  failed: number;
  skipped: number;
  // Already formatted, such as "27 s".
  duration: string;
}

export interface FailingTest {
  suite: string;
  name: string;
  platform: string;
}

export interface ReportCount {
  key: string;
  total: number;
}

// The page sets the level so the card fits its outline (v4 item 25e).
export type HeadingLevel = 2 | 3 | 4 | 5 | 6;

interface Common {
  project: ProjectCardProject;
  headingLevel?: HeadingLevel;
  // From layerSegments: section 8 order, fixed tones.
  layers: readonly LayerSegment[];
  coverage: readonly Omit<CoverageBarProps, 'variant'>[];
  health: HealthState;
  // The latest run's failing tests; the card names the first.
  failing?: readonly FailingTest[];
}

// latestRun is null until the project's CI posts its first report.
export type WebProjectCardProps = Common & {
  variant?: 'web';
  loading?: false;
  latestRun: ProjectCardRun | null;
  reports: readonly ReportCount[];
  // projects.declared_suites, summarised in the footer.
  declared: readonly DeclaredSuite[];
};

// v4 draws the kiosk card in every state. It has no per-report block, but an empty run still
// says how many reports arrived.
export type KioskProjectCardProps = Common & {
  variant: 'kiosk';
  latestRun: ProjectCardRun | null;
  reports: readonly ReportCount[];
};

export type ProjectCardProps =
  WebProjectCardProps | KioskProjectCardProps | { variant?: 'web'; loading: true };

const sha7 = (sha: string) => sha.slice(0, 7);
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

const EMPTY_NOTE =
  'Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn’t counted in any total.';

// The sub-line's unit follows the total it stands beside: "1 test", "142 tests".
const testsWord = (total: number) => (total === 1 ? 'test' : 'tests');

function Heading({
  level = 3,
  className,
  children,
}: {
  level?: HeadingLevel;
  className: string | undefined;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return <Tag className={className}>{children}</Tag>;
}

function FailingName({ test }: { test: FailingTest }) {
  return (
    <span
      className={styles.failingName}
      title={`${test.suite} › ${test.name}`}
      data-part="failing-name"
    >
      {shortSuite(test.suite)} › {test.name}
    </span>
  );
}

export function ProjectCard(props: ProjectCardProps) {
  if ('loading' in props && props.loading) return <LoadingCard />;
  if (props.variant === 'kiosk') return <KioskCard {...props} />;
  return <WebCard {...props} />;
}

function FailedCount({ failed }: { failed: number }) {
  return (
    <span className={cx(failed > 0 && styles.failedCount)} data-part="failed-count">
      {failed} failed
    </span>
  );
}

function WebCard({
  project,
  headingLevel,
  latestRun: run,
  layers,
  coverage,
  reports,
  declared,
  health,
  failing = [],
}: WebProjectCardProps) {
  const isPrivate = project.visibility === 'private';
  const stale = health.health === 'stale';
  const empty = run?.status === 'empty';
  const measured = run !== null && !empty;
  const [firstFailing] = failing;

  return (
    <article className={cx(styles.card, styles.web)} data-variant="web">
      <div className={styles.top}>
        <StatusBadge status={run ? run.status : 'not_reporting'} />
        {run && (
          <span className={styles.meta} data-part="meta">
            <span className={cx(stale && styles.stale)} data-part="when">
              <RelativeTime when={run.when} />
            </span>
            <span>·</span>
            <span>{run.branch}</span>
            <span>·</span>
            {isPrivate ? (
              <span className={styles.sha} data-part="sha">
                {sha7(run.sha)}
              </span>
            ) : (
              <Link href={run.href} className={cx(styles.sha, styles.shaLink)} data-part="sha">
                {sha7(run.sha)}
              </Link>
            )}
          </span>
        )}
      </div>
      <Heading level={headingLevel} className={styles.name}>
        <Link href={project.href} className={styles.nameLink}>
          {project.name}
        </Link>
        {isPrivate && <PrivateTag />}
      </Heading>
      <p className={styles.tagline} data-part="tagline">
        {project.tagline}
      </p>

      {run ? (
        <div className={styles.totals}>
          <span className={cx(styles.total, empty && styles.totalEmpty)} data-part="total">
            {empty ? '0' : formatCount(run.total)}
          </span>
          <span className={styles.sub} data-part="sub">
            {empty ? (
              <>
                <span>tests executed ·</span>
                <span>{qty(reports.length, 'report')} received</span>
              </>
            ) : (
              <>
                <span>{testsWord(run.total)} ·</span>
                <FailedCount failed={run.failed} />
                <span>·</span>
                <span>{run.skipped} skipped ·</span>
                <span>{run.duration}</span>
              </>
            )}
          </span>
        </div>
      ) : (
        <p className={styles.notReporting} data-part="not-reporting">
          Registered. Results appear here after its CI posts the first report.
        </p>
      )}

      {run?.status === 'failed' && firstFailing && (
        <Link href={run.href} className={styles.failing} data-part="failing">
          <FailingName test={firstFailing} />
          <span className={styles.failingSide}>
            <span>{firstFailing.platform}</span>
            {failing.length > 1 && <span>+{failing.length - 1} more</span>}
          </span>
        </Link>
      )}

      {measured && layers.length > 0 && (
        <div className={styles.layers} data-part="layers">
          <LayerBar layers={layers} />
        </div>
      )}

      {empty && (
        <div className={styles.emptyNote} data-part="empty-note">
          <EmptyIcon size={16} strokeWidth={2.6} className={styles.emptyIcon} />
          <span>{EMPTY_NOTE}</span>
        </div>
      )}

      {measured &&
        (coverage.length > 0 ? (
          <div className={styles.coverage}>
            {coverage.map((row) => (
              <CoverageBar key={row.module} {...row} />
            ))}
          </div>
        ) : (
          <div className={styles.noCoverage} data-part="no-coverage">
            No coverage reported
          </div>
        ))}

      {run && reports.length > 0 && (
        <div className={styles.reports} data-part="reports">
          <div className={styles.reportsHead}>
            <span data-part="reports-head">{qty(reports.length, 'report')} in this run</span>
            <span data-part="reports-side">
              {platformSplit(empty ? reports.map((r) => ({ ...r, total: 0 })) : reports)}
            </span>
          </div>
          <ul className={styles.reportsGrid}>
            {reports.map((report) => (
              <li key={report.key} className={styles.report} data-part="report">
                <span className={styles.reportKey}>{report.key}</span>
                <span
                  className={cx(styles.reportCount, empty && styles.reportEmpty)}
                  data-part="report-count"
                >
                  {formatCount(empty ? 0 : report.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.footer} data-part="footer">
        <span data-part="declared">{declaredSummary(declared)}</span>
        <span className={styles.health}>
          <HealthMarker {...health} />
        </span>
      </div>
    </article>
  );
}

function KioskCard({
  project,
  headingLevel,
  latestRun: run,
  layers,
  coverage,
  reports,
  health,
  failing = [],
}: KioskProjectCardProps) {
  const failed = run?.status === 'failed';
  const empty = run?.status === 'empty';
  const stale = health.health === 'stale';
  const frame = failed ? 'fail' : stale || empty ? 'attn' : 'line';
  const measured = run !== null && !empty;
  const [firstFailing] = failing;

  return (
    <article
      className={cx(
        styles.card,
        styles.kiosk,
        frame === 'fail' && styles.frameFail,
        frame === 'attn' && styles.frameAttn,
      )}
      data-variant="kiosk"
      data-frame={frame}
    >
      <div className={styles.top}>
        <StatusBadge status={run ? run.status : 'not_reporting'} variant="kiosk" />
        {run && (
          <span className={cx(styles.meta, stale && styles.stale)} data-part="meta">
            <span>
              <RelativeTime when={run.when} />
            </span>
            <span>·</span>
            <span className={styles.sha}>{sha7(run.sha)}</span>
          </span>
        )}
      </div>
      <Heading level={headingLevel} className={styles.name}>
        <span>{project.name}</span>
        {project.visibility === 'private' && <PrivateTag variant="kiosk" />}
      </Heading>

      {run ? (
        <>
          <div className={styles.totals} data-part="totals">
            <span className={cx(styles.total, empty && styles.totalEmpty)} data-part="total">
              {empty ? '0' : formatCount(run.total)}
            </span>
            <span className={styles.kioskUnit}>
              {empty ? 'tests executed' : testsWord(run.total)}
            </span>
          </div>
          <div className={styles.sub} data-part="sub">
            {empty ? (
              <span>{qty(reports.length, 'report')} received</span>
            ) : (
              <>
                <FailedCount failed={run.failed} />
                <span>·</span>
                <span>{run.skipped} skipped ·</span>
                <span>{run.duration}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <p className={styles.notReporting} data-part="not-reporting">
          Registered. Results appear here after its CI posts the first report.
        </p>
      )}

      {failed && firstFailing && (
        <div className={styles.failing} data-part="failing">
          <span className={styles.failingName}>
            {shortSuite(firstFailing.suite)} › {firstFailing.name}
          </span>
          <span className={styles.failingSide}>
            <span>{firstFailing.platform}</span>
            {failing.length > 1 && <span>+{failing.length - 1} more</span>}
          </span>
        </div>
      )}

      {measured && !failed && layers.length > 0 && (
        <div className={styles.layers} data-part="layers">
          <LayerBar layers={layers} variant="kiosk" />
        </div>
      )}

      {empty && (
        <div className={styles.emptyNote} data-part="empty-note">
          <EmptyIcon size={24} strokeWidth={2.6} className={styles.emptyIcon} />
          <span>{EMPTY_NOTE}</span>
        </div>
      )}

      {measured && coverage.length > 0 && (
        <div className={styles.coverage}>
          <span className={styles.coverageLegend} data-part="coverage-legend">
            <span>Line coverage</span>
            <span className={styles.floorKey} aria-hidden="true" />
            <span>floor</span>
          </span>
          {coverage.map((row) => (
            <CoverageBar key={row.module} {...row} variant="kiosk" />
          ))}
        </div>
      )}

      <div className={styles.footer}>
        <HealthMarker {...health} size="kiosk" />
      </div>
    </article>
  );
}

function LoadingCard() {
  return (
    <article
      className={cx(styles.card, styles.web, styles.loading)}
      aria-busy="true"
      aria-label="Loading project"
    >
      <div className={styles.skeletonTop}>
        <Skeleton width="92px" height={26} radius={99} />
        <Skeleton width="180px" height={14} className={styles.skeletonMeta} />
      </div>
      <Skeleton width="55%" height={38} radius={6} className={styles.gap18} />
      <Skeleton width="85%" height={14} className={styles.gap12} />
      <Skeleton width="40%" height={48} radius={6} className={styles.gap22} />
      <Skeleton width="100%" height={8} radius={99} className={styles.gap20} />
      <Skeleton width="100%" height={6} radius={99} className={styles.gap30} />
      <Skeleton width="100%" height={6} radius={99} className={styles.gap18} />
      <Skeleton width="100%" height={78} radius={12} tone="inset" className={styles.gap22} />
      <Skeleton width="60%" height={14} className={styles.gap30} />
    </article>
  );
}
