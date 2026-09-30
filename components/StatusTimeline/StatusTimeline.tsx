'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { qty } from '../../lib/copy/count';
import type { TimeLabel } from '../../lib/copy/time';
import type { RunStatus } from '../../lib/ingest/normalize';
import type { TestStatus } from '../../lib/parsers/types';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  DashedCircleIcon,
  FlakyIcon,
  LockIcon,
  MinusCircleIcon,
  XCircleIcon,
  type IconProps,
} from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './StatusTimeline.module.css';

// A result a platform reported for the test, flaky per spec section 11.
export type ResultStatus = TestStatus | 'flaky';
// A cell also shows "not run" when the run has no result for the test on that platform.
export type ResultCellStatus = ResultStatus | 'not_run';

export interface TimelineRunBase {
  // From runTitle (lib/runs/title).
  title: string;
  branch: string;
  sha: string;
  // Already relative, such as "yesterday": components do not read the clock.
  when: TimeLabel;
  // The run page.
  href: string;
}

export interface PlatformResult {
  platform: string;
  status: ResultStatus;
  // Already formatted, such as "0.41 s".
  duration?: string;
}

export type ResultsTimelineRun = TimelineRunBase & { results: readonly PlatformResult[] };
export type RunsTimelineRun = TimelineRunBase & { status: RunStatus };

// results: one test's history (Test History), oldest run first; always interactive. runs: the
// project page's "Last 40 runs" strip of default-branch runs, oldest first; never interactive.
// There is no interactive prop (design v5 item 9).
export type StatusTimelineProps =
  | {
      kind: 'results';
      testName: string;
      runs: readonly ResultsTimelineRun[];
      // The run selected on first render, as an index into runs; the latest by default. Test
      // History passes the latest failing run.
      initialRun?: number;
      // A private project's runs are untitled: "Private repository" with a lock stands in for
      // each title, as on RunFeedRow (design/components.md, the panel's "Run").
      private?: boolean;
    }
  | {
      kind: 'runs';
      runs: readonly RunsTimelineRun[];
      // projects.default_branch, which the strip's name gives (design v7 item 10).
      defaultBranch: string;
    };

type CellStatus = ResultCellStatus | RunStatus;

export const MAX_CELLS = 40;
const MIN_CELL = 6;
const GAP = 3;

// How many cells fit a strip this wide at their 6px minimum with 3px gaps, up to 40.
export function timelineCapacity(width: number): number {
  return Math.min(MAX_CELLS, Math.max(1, Math.floor((width + GAP) / (MIN_CELL + GAP))));
}

type Tone = 'tonePass' | 'toneFail' | 'toneAttn' | 'toneNeutral' | 'toneMuted';

interface Look {
  word: string;
  className: string;
  glyph: string;
  tone: Tone;
  Icon: ComponentType<IconProps>;
}

const LOOK: Record<CellStatus, Look> = {
  passed: {
    word: 'Passed',
    className: 'passed',
    glyph: '',
    tone: 'tonePass',
    Icon: CheckCircleIcon,
  },
  failed: { word: 'Failed', className: 'failed', glyph: '✕', tone: 'toneFail', Icon: XCircleIcon },
  error: { word: 'Error', className: 'error', glyph: '!', tone: 'toneFail', Icon: AlertCircleIcon },
  flaky: { word: 'Flaky', className: 'flaky', glyph: '', tone: 'toneAttn', Icon: FlakyIcon },
  skipped: {
    word: 'Skipped',
    className: 'skipped',
    glyph: '',
    tone: 'toneNeutral',
    Icon: MinusCircleIcon,
  },
  not_run: {
    word: 'Not run',
    className: 'notRun',
    glyph: '',
    tone: 'toneMuted',
    Icon: DashedCircleIcon,
  },
  empty: { word: 'Empty', className: 'empty', glyph: '', tone: 'toneAttn', Icon: DashedCircleIcon },
};

const LEGEND_ORDER: Record<StatusTimelineProps['kind'], readonly CellStatus[]> = {
  results: ['passed', 'failed', 'error', 'flaky', 'skipped', 'not_run'],
  runs: ['passed', 'failed', 'empty'],
};

const sha7 = (sha: string) => sha.slice(0, 7);
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

// Measures the first strip's cell area and returns how many cells fit, or null before the first measurement
// (and without JS), when up to 40 are drawn and the strip's overflow clips the oldest.
function useCapacity() {
  const measured = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState<number | null>(null);

  useEffect(() => {
    const cells = measured.current;
    if (!cells) return;
    const measure = () => setCapacity(timelineCapacity(cells.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cells);
    return () => observer.disconnect();
  }, []);

  return [measured, capacity] as const;
}

// The label under the oldest cell: none before measurement or with one cell shown. It counts as
// TrendChart does (design v5 item 17): the oldest of n shown is n - 1 runs back.
function oldestLabel(capacity: number | null, shown: number, total: number): string {
  if (capacity === null || shown <= 1) return '';
  return shown < total ? `Last ${qty(shown, 'run')}` : `${qty(shown - 1, 'run')} ago`;
}

function Ends({ oldest }: { oldest: string }) {
  return (
    <div className={styles.ends}>
      <span data-part="oldest">{oldest}</span>
      <span data-part="latest">Latest</span>
    </div>
  );
}

function Legend({
  kind,
  present,
}: {
  kind: StatusTimelineProps['kind'];
  present: Set<CellStatus>;
}) {
  return (
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
  );
}

export function StatusTimeline(props: StatusTimelineProps) {
  return props.kind === 'runs' ? <RunsTimeline {...props} /> : <ResultsTimeline {...props} />;
}

function RunsTimeline({ runs, defaultBranch }: Extract<StatusTimelineProps, { kind: 'runs' }>) {
  const [measured, capacity] = useCapacity();
  const shown = runs.slice(-(capacity ?? MAX_CELLS));
  const count = (status: RunStatus) => shown.filter((run) => run.status === status).length;
  const counts = (['passed', 'failed', 'empty'] as const)
    .map((status) => [count(status), status] as const)
    .filter(([n]) => n > 0)
    .map(([n, status]) => `${n} ${status}`);
  const name = `Last ${qty(shown.length, 'run')} on ${defaultBranch}: ${counts.join(', ')}.`;

  return (
    <div data-kind="runs" data-platforms="false">
      <div className={styles.strips}>
        <div className={styles.strip} data-part="strip">
          <div ref={measured} className={styles.cells} role="img" aria-label={name}>
            {shown.map((run, i) => (
              <span
                key={i}
                className={`${styles.cell} ${styles[LOOK[run.status].className]}`}
                data-part="cell"
                data-status={run.status}
              >
                {LOOK[run.status].glyph}
              </span>
            ))}
          </div>
        </div>
      </div>
      <Ends oldest={oldestLabel(capacity, shown.length, runs.length)} />
      <Legend kind="runs" present={new Set(shown.map((run) => run.status))} />
    </div>
  );
}

interface Strip {
  platform: string;
  // One per shown run, oldest first.
  cells: ResultCellStatus[];
}

const PRIVATE_TITLE = 'Private repository';

function ResultsTimeline({
  testName,
  runs,
  initialRun,
  private: isPrivate = false,
}: Extract<StatusTimelineProps, { kind: 'results' }>) {
  const id = useId();
  const [measured, capacity] = useCapacity();
  const [selected, setSelected] = useState(initialRun ?? runs.length - 1);
  const boxes = useRef<(HTMLDivElement | null)[]>([]);

  const shownRuns = runs.slice(-(capacity ?? MAX_CELLS));
  // Selection is an index into all runs; it stays within the runs shown.
  const first = runs.length - shownRuns.length;
  const current = Math.min(Math.max(selected, first), runs.length - 1);
  const select = (index: number) => setSelected(Math.min(Math.max(index, first), runs.length - 1));

  const platforms = [
    ...new Set(runs.flatMap((run) => run.results.map((result) => result.platform))),
  ];
  const statusOn = (run: ResultsTimelineRun, platform: string): ResultCellStatus =>
    run.results.find((result) => result.platform === platform)?.status ?? 'not_run';
  const strips: Strip[] = platforms.map((platform) => ({
    platform,
    cells: shownRuns.map((run) => statusOn(run, platform)),
  }));
  const withPlatforms = strips.length > 1;
  const cellId = (strip: number, index: number) => `${id}-${strip}-${index}`;

  const onKeyDown = (strip: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: first,
      End: runs.length - 1,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      select(move);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const other = boxes.current[strip + (event.key === 'ArrowDown' ? 1 : -1)];
      if (other) {
        event.preventDefault();
        other.focus();
      }
    }
  };

  // Press, mouse hover, or a drag selects the cell nearest the pointer's x. A touch passing over
  // without pressing is a scroll, which touch-action: pan-y leaves to the browser.
  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointermove' && event.pointerType !== 'mouse' && event.buttons === 0) {
      return;
    }
    let nearest = 0;
    let distance = Infinity;
    [...event.currentTarget.children].forEach((cell, index) => {
      const box = cell.getBoundingClientRect();
      const d = Math.abs(box.left + box.width / 2 - event.clientX);
      if (d < distance) {
        distance = d;
        nearest = index;
      }
    });
    select(first + nearest);
  };

  const run = runs[current];
  const present = new Set(strips.flatMap((strip) => strip.cells));

  return (
    <div
      className={withPlatforms ? styles.withPlatforms : undefined}
      data-kind="results"
      data-platforms={withPlatforms}
    >
      <div className={styles.strips}>
        {strips.map((strip, s) => (
          <div key={strip.platform} className={styles.strip} data-part="strip">
            {withPlatforms && (
              <span className={styles.platform} data-part="platform">
                {strip.platform}
              </span>
            )}
            <div
              ref={(node) => {
                boxes.current[s] = node;
                if (s === 0) measured.current = node;
              }}
              className={cx(styles.cells, styles.listbox)}
              role="listbox"
              aria-orientation="horizontal"
              tabIndex={0}
              aria-label={`${testName}${withPlatforms ? ` on ${strip.platform}` : ''}, last ${qty(strip.cells.length, 'run')}`}
              aria-activedescendant={cellId(s, current - first)}
              onKeyDown={onKeyDown(s)}
              onPointerDown={onPointer}
              onPointerMove={onPointer}
            >
              {strip.cells.map((status, i) => {
                const look = LOOK[status];
                const cellRun = shownRuns[i];
                const isSelected = first + i === current;
                return (
                  <span
                    key={i}
                    id={cellId(s, i)}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={
                      cellRun &&
                      `${look.word}, ${cellRun.when.text}, ${isPrivate ? PRIVATE_TITLE : cellRun.title}, ${sha7(cellRun.sha)}`
                    }
                    className={cx(
                      styles.cell,
                      styles[look.className],
                      isSelected && styles.selected,
                    )}
                    data-part="cell"
                    data-status={status}
                  >
                    {look.glyph}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Ends oldest={oldestLabel(capacity, shownRuns.length, runs.length)} />
      <Legend kind="results" present={present} />
      {run && (
        <div className={styles.panel} aria-live="polite" data-part="panel">
          <div>
            <div className={styles.fieldLabel}>Run</div>
            <div className={styles.runValue}>
              {isPrivate ? (
                <span className={styles.private} data-part="run-title">
                  <LockIcon size={12} strokeWidth={2.4} />
                  {PRIVATE_TITLE}
                </span>
              ) : (
                <span data-part="run-title">{run.title}</span>
              )}
              <span>·</span>
              <span className={styles.sha} data-part="run-sha">
                {sha7(run.sha)}
              </span>
            </div>
          </div>
          <div>
            <div className={styles.fieldLabel}>When</div>
            <div className={styles.whenValue} data-part="when">
              <RelativeTime when={run.when} />
            </div>
          </div>
          {platforms.map((platform) => {
            const status = statusOn(run, platform);
            const look = LOOK[status];
            const duration =
              status === 'skipped' || status === 'not_run'
                ? undefined
                : run.results.find((result) => result.platform === platform)?.duration;
            return (
              <div key={platform} data-part="field">
                <div className={styles.fieldLabel} data-part="field-label">
                  {withPlatforms ? platform : 'Result'}
                </div>
                <div className={styles.resultValue} data-part="field-value">
                  <span
                    className={cx(styles.status, styles[look.tone])}
                    data-part="field-status"
                    data-status={status}
                  >
                    <look.Icon size={14} strokeWidth={2.6} />
                    <span>{look.word}</span>
                  </span>
                  {duration !== undefined && (
                    <>
                      <span className={styles.duration}>·</span>
                      <span className={styles.duration}>{duration}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <Link href={run.href} className={styles.openRun} data-part="open-run">
            Open run →
          </Link>
        </div>
      )}
    </div>
  );
}
