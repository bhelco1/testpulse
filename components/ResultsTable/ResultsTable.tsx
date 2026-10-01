'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { formatCount, qty } from '../../lib/copy/count';
import type { TimeLabel } from '../../lib/copy/time';
import { LAYER_LABEL } from '../../lib/design/layers';
import type { TestStatus } from '../../lib/parsers/types';
import type { Visibility } from '../../lib/projects/schema';
import {
  filterResults,
  isFailing,
  layersPresent,
  mismatchSentence,
  orderResults,
  platformMismatch,
  statusCounts,
  type LayerFilter,
  type PlatformResult,
  type StatusFilter,
  type TableResult,
} from '../../lib/results/table';
import { Button } from '../Button/Button';
import {
  AlertCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  FlakyIcon,
  XCircleIcon,
} from '../icons/icons';
import { PrivateDetailsNotice } from '../PrivateDetailsNotice/PrivateDetailsNotice';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import { SegmentedControl, type SegmentedOption } from '../SegmentedControl/SegmentedControl';
import { Skeleton } from '../Skeleton/Skeleton';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './ResultsTable.module.css';

// One test in the run: its results across the run's report platforms, as one row.
export interface ResultRow extends TableResult {
  // The test's key, unique within the run.
  key: string;
  // Section 11 flaky, decided by the caller over its 30-day window.
  flaky: boolean;
  platforms: readonly PlatformResult[];
  // Already formatted, such as "0.41 s", or "—" when the test did not run.
  time: string;
  historyHref: string;
  // Each failed or error result, in platform data order (design v7 item 3, `ResultRow.failures`),
  // with result_failures' text where RLS returned it; never for a private project.
  failures: readonly FailureDetail[];
}

export interface FailureDetail {
  platform: string;
  status: 'failed' | 'error';
  // Already formatted, such as "0.88 s".
  duration: string;
  // Null where there is no text to show: always for a private project (section 9).
  message: string | null;
  detail: string | null;
}

/**
 * A request from outside the table to set its status filter, as the run page's failed-run banner
 * makes ("Show failures"): each new `seq` sets the filter again and focuses the first failing row.
 */
export interface FilterRequest {
  status: StatusFilter;
  seq: number;
}

export interface PrunedTotals {
  total: number;
  passed: number;
  failed: number;
}

// The parent loads the run's results and owns how many are shown: it raises `limit` (by 50) when
// "Load 50 more" asks. Filters, order and which rows are open are this table's own state.
export type ResultsTableProps =
  | { loading: true }
  | { pruned: PrunedTotals; prunedOn?: TimeLabel }
  | {
      results: readonly ResultRow[];
      visibility: Visibility;
      limit: number;
      onLoadMore: () => void;
      request?: FilterRequest | null;
    };

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function ResultsTable(props: ResultsTableProps) {
  if ('loading' in props) return <LoadingTable />;
  if ('pruned' in props) return <PrunedNote {...props.pruned} prunedOn={props.prunedOn} />;
  return <Table {...props} />;
}

const STATUS_LABELS: readonly [StatusFilter, string][] = [
  ['all', 'All'],
  ['passed', 'Passed'],
  ['failed', 'Failed'],
  ['error', 'Error'],
  ['skipped', 'Skipped'],
];

function Table({
  results,
  visibility,
  limit,
  onLoadMore,
  request = null,
}: Extract<ResultsTableProps, { results: readonly ResultRow[] }>) {
  const [status, setStatus] = useState<StatusFilter>(request?.status ?? 'all');
  const [layer, setLayer] = useState<LayerFilter>('all');
  // Failed and error rows start open, so this records the ones the reader closed.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const baseId = useId();
  const root = useRef<HTMLDivElement>(null);

  // A new request sets the filter while rendering, so the rows it selects are what commits.
  const [seenSeq, setSeenSeq] = useState(request?.seq ?? null);
  if (request !== null && request.seq !== seenSeq) {
    setSeenSeq(request.seq);
    setStatus(request.status);
  }
  const requestSeq = request?.seq ?? null;
  useEffect(() => {
    if (requestSeq === null) return;
    // The first failing row's toggle, which spans the row; the page has already scrolled.
    root.current
      ?.querySelector<HTMLButtonElement>('button[data-part="name"]')
      ?.focus({ preventScroll: true });
  }, [requestSeq]);

  const counts = statusCounts(results);
  const options: SegmentedOption<StatusFilter>[] = STATUS_LABELS.map(([value, label]) => ({
    value,
    label,
    count: counts[value],
    tone: (value === 'failed' || value === 'error') && counts[value] > 0 ? 'fail' : undefined,
  }));
  const layers = layersPresent(results);
  const matching = orderResults(filterResults(results, { status, layer }));
  const shown = matching.slice(0, limit);

  function toggle(key: string) {
    setClosed((before) => {
      const after = new Set(before);
      if (!after.delete(key)) after.add(key);
      return after;
    });
  }

  return (
    <div className={styles.root} ref={root}>
      <div className={styles.toolbar}>
        <SegmentedControl
          label="Status"
          options={options}
          value={status}
          onChange={setStatus}
          wrap
        />
        <label className={styles.layer}>
          Layer
          <select
            className={styles.select}
            value={layer}
            onChange={(event) =>
              setLayer(layers.find((value) => value === event.target.value) ?? 'all')
            }
          >
            <option value="all">All layers</option>
            {layers.map((value) => (
              <option key={value} value={value}>
                {LAYER_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.note}>Failures first, then by suite</span>
      </div>

      {matching.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No tests match</div>
          <div className={styles.emptyText}>Nothing in this run matches the current filters.</div>
          <Button
            variant="secondary"
            className={styles.clear}
            onClick={() => {
              setStatus('all');
              setLayer('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className={styles.box}>
          {/* The rows are grids and flex rows, which can drop a table's implicit roles in some
              browsers, so each element states its role. */}
          <table role="table" className={styles.table}>
            <thead role="rowgroup" className={styles.head}>
              <tr role="row" className={styles.headRow}>
                <th role="columnheader" className={styles.cell}>
                  <span className={styles.srOnly}>Details</span>
                </th>
                <th role="columnheader" className={styles.cell}>
                  Status
                </th>
                <th role="columnheader" className={styles.cell}>
                  Test
                </th>
                <th role="columnheader" className={styles.cell}>
                  Layer
                </th>
                <th role="columnheader" className={styles.cell}>
                  Platform
                </th>
                <th role="columnheader" className={cx(styles.cell, styles.timeHead)}>
                  Time
                </th>
              </tr>
            </thead>
            {shown.map((result, index) => (
              <TestRows
                key={result.key}
                result={result}
                isPrivate={visibility === 'private'}
                open={!closed.has(result.key)}
                onToggle={() => toggle(result.key)}
                detailId={`${baseId}-detail-${index}`}
              />
            ))}
          </table>
          <div className={styles.footer}>
            <span className={styles.showing} data-part="showing">
              <span>Showing</span>
              <span>{formatCount(shown.length)}</span>
              <span>of</span>
              <span>{formatCount(matching.length)}</span>
            </span>
            {shown.length < matching.length && (
              <Button variant="secondary" onClick={onLoadMore}>
                Load 50 more
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Each platform's mark: a glyph for the eye and a word for assistive technology. An errored
// platform shows its word as well, "! Error", as design v7 item 4 draws it.
const MARK: Readonly<Record<TestStatus, { glyph: string; word: string; visible: boolean }>> = {
  failed: { glyph: '✕', word: 'failed', visible: false },
  error: { glyph: '!', word: 'Error', visible: true },
  passed: { glyph: '✓', word: 'passed', visible: false },
  skipped: { glyph: '–', word: 'skipped', visible: false },
};

// components.md marks each platform of a test run on several; the Run Detail mock and the Design
// System draw one that passed everywhere without marks, and a single platform is its name only.
const marked = (platforms: readonly PlatformResult[]): boolean =>
  platforms.length > 1 && platforms.some(({ status }) => status !== 'passed');

function Platforms({ platforms, layer }: { platforms: readonly PlatformResult[]; layer: string }) {
  const mismatch = platformMismatch(platforms);
  const marks = marked(platforms);
  // In a mismatch the list follows the sentence: failing platforms first.
  const listed: readonly PlatformResult[] = mismatch
    ? mismatch.flatMap(({ status, platforms: names }) =>
        names.map((platform) => ({ platform, status })),
      )
    : platforms;
  return (
    <td role="cell" className={cx(styles.cell, styles.platformCell)}>
      {/* The narrow layout drops the layer column and reads "{layer} · {platforms}" here. */}
      <span className={styles.narrowLayer}>{layer}</span>
      <span className={styles.narrowLayer} aria-hidden="true">
        ·
      </span>
      {listed.map(({ platform, status }) => {
        const mark = marks ? MARK[status] : null;
        return (
          <span
            key={platform}
            className={cx(
              styles.platform,
              mark !== null && isFailing(status) && styles.platformFail,
            )}
            data-part="platform"
          >
            {platform}
            {mark && (
              <>
                {' '}
                <span aria-hidden="true">{mark.glyph}</span>
                {mark.visible ? (
                  <> {mark.word}</>
                ) : (
                  <span className={styles.srOnly}> {mark.word}</span>
                )}
              </>
            )}
          </span>
        );
      })}
    </td>
  );
}

function TestRows({
  result,
  isPrivate,
  open,
  onToggle,
  detailId,
}: {
  result: ResultRow;
  isPrivate: boolean;
  open: boolean;
  onToggle: () => void;
  detailId: string;
}) {
  const expandable = isFailing(result.status);
  const layer = LAYER_LABEL[result.layer];
  const mismatch = platformMismatch(result.platforms);

  return (
    <tbody
      role="rowgroup"
      className={cx(styles.test, expandable ? styles.failing : styles.linked)}
      data-part="test"
    >
      <tr role="row" className={styles.row} data-part="row">
        <td role="cell" className={cx(styles.cell, styles.chevronCell)}>
          {expandable && (
            <ChevronRightIcon
              size={14}
              strokeWidth={2.4}
              className={cx(styles.chevron, open && styles.open)}
            />
          )}
        </td>
        <td role="cell" className={cx(styles.cell, styles.statusCell)}>
          <StatusBadge status={result.status} variant="inline" />
          {result.flaky && (
            <span className={styles.flakyNarrow} data-part="flaky-narrow">
              Flaky
            </span>
          )}
        </td>
        <td role="cell" className={cx(styles.cell, styles.testCell)}>
          <span className={styles.testText}>
            {expandable ? (
              <button
                type="button"
                className={cx(styles.name, styles.toggle)}
                aria-expanded={open}
                aria-controls={detailId}
                onClick={onToggle}
                data-part="name"
              >
                {result.name}
              </button>
            ) : (
              <Link
                href={result.historyHref}
                className={cx(styles.name, styles.rowLink)}
                data-part="name"
              >
                {result.name}
              </Link>
            )}
            <span className={styles.suite} data-part="suite">
              {result.suite}
            </span>
          </span>
          {result.flaky && (
            <span className={styles.flakyWide} data-part="flaky-wide">
              <FlakyIcon size={12} strokeWidth={2.6} />
              Flaky
            </span>
          )}
        </td>
        <td role="cell" className={cx(styles.cell, styles.layerCell)}>
          {layer}
        </td>
        <Platforms platforms={result.platforms} layer={layer} />
        <td role="cell" className={cx(styles.cell, styles.timeCell)}>
          {result.time}
        </td>
      </tr>
      {expandable && (
        <tr role="row" className={styles.detailRow}>
          <td role="cell" colSpan={6} className={styles.cell}>
            <div
              id={detailId}
              className={cx(styles.collapse, open && styles.expanded)}
              data-part="detail"
            >
              <div className={styles.collapseInner}>
                <div className={styles.detail}>
                  {mismatch && (
                    <div className={styles.mismatch} data-part="mismatch">
                      <span className={styles.mismatchTitle}>Platform mismatch</span>
                      <span className={styles.mismatchText}>{mismatchSentence(mismatch)}</span>
                    </div>
                  )}
                  {/* RLS already withholds failure text for private projects; the table never
                      prints it for them either. Their heads show, then the notice once (design
                      v8 item 18). */}
                  {result.failures.length > 0 && (
                    <Failures failures={result.failures} withText={!isPrivate} />
                  )}
                  {isPrivate && <PrivateDetailsNotice />}
                  <Link href={result.historyHref} className={styles.history}>
                    Test history
                  </Link>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}

const HEAD_ICON = { failed: XCircleIcon, error: AlertCircleIcon } as const;
const HEAD_WORD = { failed: 'Failed', error: 'Error' } as const;

// One block per failed or error result (design v7 item 3). With one, the head is left out, for a
// private project too, whose blocks are heads only (no text: `withText` false).
function Failures({
  failures,
  withText,
}: {
  failures: readonly FailureDetail[];
  withText: boolean;
}) {
  const heads = failures.length > 1;
  if (!heads && !withText) return null;
  return (
    <div className={styles.failures}>
      {failures.map((failure, index) => {
        const Icon = HEAD_ICON[failure.status];
        return (
          <div key={`${failure.platform}-${index}`} data-part="failure">
            {heads && (
              <div className={styles.failureHead} data-part="failure-head">
                <Icon size={14} strokeWidth={2.6} className={styles.failureIcon} />
                <span>
                  {failure.platform} · {HEAD_WORD[failure.status]} · {failure.duration}
                </span>
              </div>
            )}
            {withText && failure.message !== null && (
              <div className={styles.message} data-part="message">
                {failure.message}
              </div>
            )}
            {/* Scrolls sideways in its own box, so it takes focus for the keyboard. */}
            {withText && failure.detail !== null && (
              <pre className={styles.trace} tabIndex={0}>
                {failure.detail}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingTable() {
  return (
    <div className={styles.box} aria-busy="true" aria-label="Loading results">
      <div className={styles.skeletonHead} data-part="skeleton-head" />
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className={styles.skeletonRow} data-part="skeleton-row">
          <Skeleton width="90px" height={14} />
          <Skeleton width="auto" height={14} className={styles.skeletonGrow} />
          <Skeleton width="60px" height={14} />
        </div>
      ))}
    </div>
  );
}

function PrunedNote({
  total,
  passed,
  failed,
  prunedOn,
}: PrunedTotals & { prunedOn?: TimeLabel | undefined }) {
  return (
    <div className={styles.pruned}>
      <ClockIcon size={22} strokeWidth={2.2} className={styles.prunedIcon} />
      <div>
        <div className={styles.prunedTitle} data-part="pruned-title">
          Per-test results retained for 180 days
        </div>
        <p className={styles.prunedText} data-part="pruned-text">
          This run is older than that, so its individual results were removed to keep the database
          small. Summary totals are permanent: {qty(total, 'test')}, {formatCount(passed)} passed,{' '}
          {formatCount(failed)} failed.
        </p>
        {/* components.md, Run page: "Pruned on {date}" (design v8 item 31). */}
        {prunedOn !== undefined && (
          <div className={styles.prunedOn} data-part="pruned-on">
            Pruned on <RelativeTime when={prunedOn} />
          </div>
        )}
      </div>
    </div>
  );
}
