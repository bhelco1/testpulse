'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { LAYER_LABEL } from '../../lib/design/layers';
import type { Visibility } from '../../lib/projects/schema';
import {
  filterResults,
  isFailing,
  layersPresent,
  orderResults,
  platformMismatch,
  statusCounts,
  type LayerFilter,
  type PlatformResult,
  type StatusFilter,
  type TableResult,
} from '../../lib/results/table';
import { Button } from '../Button/Button';
import { ChevronRightIcon, ClockIcon, FlakyIcon } from '../icons/icons';
import { PrivateDetailsNotice } from '../PrivateDetailsNotice/PrivateDetailsNotice';
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
  // result_failures for a failed or error result. RLS returns none for private projects.
  failure?: { message: string; detail: string };
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
  | { pruned: PrunedTotals }
  | {
      results: readonly ResultRow[];
      visibility: Visibility;
      limit: number;
      onLoadMore: () => void;
    };

const formatCount = new Intl.NumberFormat('en-US');
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function ResultsTable(props: ResultsTableProps) {
  if ('loading' in props) return <LoadingTable />;
  if ('pruned' in props) return <PrunedNote {...props.pruned} />;
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
}: Extract<ResultsTableProps, { results: readonly ResultRow[] }>) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [layer, setLayer] = useState<LayerFilter>('all');
  // Failed and error rows start open, so this records the ones the reader closed.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const baseId = useId();

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
    <div className={styles.root}>
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
              <span>{formatCount.format(shown.length)}</span>
              <span>of</span>
              <span>{formatCount.format(matching.length)}</span>
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

function Platforms({ platforms, layer }: { platforms: readonly PlatformResult[]; layer: string }) {
  const mismatch = platformMismatch(platforms);
  return (
    <td role="cell" className={cx(styles.cell, styles.platformCell)}>
      {/* The narrow layout drops the layer column and reads "{layer} · {platforms}" here. */}
      <span className={styles.narrowLayer}>{layer}</span>
      <span className={styles.narrowLayer} aria-hidden="true">
        ·
      </span>
      {platforms.map(({ platform, status }) => {
        const mark = !mismatch
          ? null
          : isFailing(status)
            ? { glyph: '✕', word: 'failed' }
            : status === 'passed'
              ? { glyph: '✓', word: 'passed' }
              : null;
        return (
          <span
            key={platform}
            className={cx(styles.platform, mark?.word === 'failed' && styles.platformFail)}
            data-part="platform"
          >
            {platform}
            {mark && (
              <>
                {' '}
                <span aria-hidden="true">{mark.glyph}</span>
                <span className={styles.srOnly}> {mark.word}</span>
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
      className={cx(styles.test, expandable && styles.failing)}
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
              <span className={styles.name} data-part="name">
                {result.name}
              </span>
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
                      <span className={styles.mismatchText}>
                        Passed on {mismatch.passed.join(', ')}, failed on{' '}
                        {mismatch.failed.join(', ')} in the same run.
                      </span>
                    </div>
                  )}
                  {/* RLS already withholds failure text for private projects; the table never
                      prints it for them either. */}
                  {isPrivate ? (
                    <PrivateDetailsNotice />
                  ) : (
                    result.failure && (
                      <>
                        <div className={styles.message} data-part="message">
                          {result.failure.message}
                        </div>
                        {/* Scrolls sideways in its own box, so it takes focus for the keyboard. */}
                        <pre className={styles.trace} tabIndex={0}>
                          {result.failure.detail}
                        </pre>
                      </>
                    )
                  )}
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

function PrunedNote({ total, passed, failed }: PrunedTotals) {
  return (
    <div className={styles.pruned}>
      <ClockIcon size={22} strokeWidth={2.2} className={styles.prunedIcon} />
      <div>
        <div className={styles.prunedTitle} data-part="pruned-title">
          Per-test results retained for 180 days
        </div>
        <p className={styles.prunedText} data-part="pruned-text">
          This run is older than that, so its individual results were removed to keep the database
          small. Summary totals are permanent: {formatCount.format(total)} tests,{' '}
          {formatCount.format(passed)} passed, {formatCount.format(failed)} failed.
        </p>
      </div>
    </div>
  );
}
