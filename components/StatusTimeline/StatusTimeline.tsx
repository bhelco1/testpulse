'use client';

import { useEffect, useRef, useState } from 'react';

import type { RunStatus } from '../../lib/ingest/normalize';
import type { TestStatus } from '../../lib/parsers/types';
import styles from './StatusTimeline.module.css';

// A result cell: the test's status on that platform in that run, flaky per spec section 11, or
// not run when the run has no result for the test on that platform.
export type ResultCellStatus = TestStatus | 'flaky' | 'not_run';

export interface TimelineCell<S extends string> {
  status: S;
  // Names the run in the cell's accessible name, after its status.
  label: string;
  sha: string;
  // Already relative, such as "yesterday": components do not read the clock.
  when: string;
  branch: string;
}

export interface TimelineStrip<S extends string> {
  platform?: string;
  // Oldest first, so the latest run is drawn on the right.
  cells: readonly TimelineCell<S>[];
}

// results: one test's history (Test History). runs: the project's "Last 40 runs" strip.
export type StatusTimelineProps =
  | { kind: 'results'; strips: readonly TimelineStrip<ResultCellStatus>[] }
  | { kind: 'runs'; strips: readonly TimelineStrip<RunStatus>[] };

type CellStatus = ResultCellStatus | RunStatus;

export const MAX_CELLS = 40;
const MIN_CELL = 6;
const GAP = 3;

// How many cells fit a strip this wide at their 6px minimum with 3px gaps, up to 40.
export function timelineCapacity(width: number): number {
  return Math.min(MAX_CELLS, Math.max(1, Math.floor((width + GAP) / (MIN_CELL + GAP))));
}

const LOOK: Record<CellStatus, { word: string; className: string; glyph: string }> = {
  passed: { word: 'Passed', className: 'passed', glyph: '' },
  failed: { word: 'Failed', className: 'failed', glyph: '✕' },
  error: { word: 'Error', className: 'error', glyph: '!' },
  flaky: { word: 'Flaky', className: 'flaky', glyph: '' },
  skipped: { word: 'Skipped', className: 'skipped', glyph: '' },
  not_run: { word: 'Not run', className: 'notRun', glyph: '' },
  empty: { word: 'Empty', className: 'empty', glyph: '' },
};

const LEGEND_ORDER: Record<StatusTimelineProps['kind'], readonly CellStatus[]> = {
  results: ['passed', 'failed', 'error', 'flaky', 'skipped', 'not_run'],
  runs: ['passed', 'failed', 'empty'],
};

const plural = (n: number) => (n === 1 ? 'run' : 'runs');

export function StatusTimeline({ kind, strips }: StatusTimelineProps) {
  const measured = useRef<HTMLDivElement>(null);
  // Before the first measurement (and without JS) all 40 are drawn and the strip's overflow clips
  // the oldest, which sit on the left.
  const [capacity, setCapacity] = useState(MAX_CELLS);

  useEffect(() => {
    const strip = measured.current;
    if (!strip) return;
    const measure = () => setCapacity(timelineCapacity(strip.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  const withPlatforms = strips.length > 1;
  const shown = strips.map((strip) => ({
    platform: strip.platform,
    cells: (strip.cells as readonly TimelineCell<CellStatus>[]).slice(-capacity),
  }));
  const longest = Math.max(0, ...strips.map((strip) => strip.cells.length));
  const n = Math.min(capacity, longest);
  const present = new Set(shown.flatMap((strip) => strip.cells.map((cell) => cell.status)));

  return (
    <div
      className={withPlatforms ? styles.withPlatforms : undefined}
      data-kind={kind}
      data-platforms={withPlatforms}
    >
      <div className={styles.strips}>
        {shown.map((strip, index) => {
          const cells = (
            <div
              ref={index === 0 ? measured : undefined}
              className={styles.cells}
              role={withPlatforms ? 'group' : undefined}
              aria-label={withPlatforms ? `${strip.platform ?? ''} timeline` : undefined}
            >
              {strip.cells.map((cell, i) => {
                const look = LOOK[cell.status];
                return (
                  <span
                    key={i}
                    role="img"
                    aria-label={`${look.word}, ${cell.label}`}
                    className={`${styles.cell} ${styles[look.className]}`}
                    data-part="cell"
                    data-status={cell.status}
                  >
                    {look.glyph}
                  </span>
                );
              })}
            </div>
          );
          return (
            <div key={strip.platform ?? index} className={styles.strip} data-part="strip">
              {withPlatforms && (
                <span className={styles.platform} data-part="platform">
                  {strip.platform}
                </span>
              )}
              {cells}
            </div>
          );
        })}
      </div>
      <div className={styles.ends}>
        <span data-part="oldest">
          {longest > n ? `Last ${n} ${plural(n)}` : `${n} ${plural(n)} ago`}
        </span>
        <span data-part="latest">Latest</span>
      </div>
      <ul className={styles.legend} data-part="legend">
        {LEGEND_ORDER[kind]
          .filter((status) => present.has(status))
          .map((status) => (
            <li key={status} className={styles.legendItem}>
              <span
                className={`${styles.swatch} ${styles[LOOK[status].className]}`}
                data-part="swatch"
                data-status={status}
                aria-hidden="true"
              />
              {LOOK[status].word}
            </li>
          ))}
      </ul>
    </div>
  );
}
