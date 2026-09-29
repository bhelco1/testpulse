'use client';

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  DefaultZIndexes,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
  type DotItemDotProps,
} from 'recharts';

import { formatTrendValue, type TrendFormat } from '../../lib/charts/format';
import {
  barWidth,
  chartHeight,
  chartLayout,
  nearestIndex,
  nextIndex,
  pointLabel,
  showsIntermediateDots,
  startLabelDy,
  tooltipLeft,
  xTickIndices,
  yAt,
  type ChartLayout,
  type TrendKind,
  type TrendUnit,
} from '../../lib/charts/layout';
import { trendYScale } from '../../lib/charts/scale';
import { Button } from '../Button/Button';
import { AlertCircleIcon } from '../icons/icons';
import styles from './TrendChart.module.css';

export interface TrendSeries {
  name: string;
  // Oldest first, one value per point; every series has the same number of points. Null where
  // the series has no value, such as a platform that did not run: the line breaks there and the
  // tooltip and table read "Not run" (design v7 item 9).
  values: readonly (number | null)[];
  // The second series is always dashed; this dashes the first as well.
  dashed?: boolean;
}

export interface TrendMark {
  index: number;
  status: 'fail' | 'empty';
}

export interface TrendData {
  kind?: TrendKind;
  series: readonly TrendSeries[];
  // Preformatted x labels, one per point, such as "Jul 2". Without them the axis counts back.
  labels?: readonly string[];
  floor?: number;
  marks?: readonly TrendMark[];
  format: TrendFormat;
  // Start the y axis at zero: counts that must read as amounts. Bars always start at zero.
  zero?: boolean;
  unit: TrendUnit;
  // From lib/charts/captions. Not shown with fewer than two points.
  caption?: string | null;
}

export type TrendChartProps = {
  title: string;
  // Which runs the chart reads: one of TREND_SCOPE in lib/charts/captions.
  scope: string;
} & ({ loading: true } | { error: true; onRetry: () => void } | TrendData);

// tp-shimmer is a global keyframes in tokens.css, named here because a CSS module would rename it.
const SHIMMER = 'tp-shimmer 1.6s ease-in-out infinite';
const NO_LABELS: readonly string[] = [];
const NO_MARKS: readonly TrendMark[] = [];

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

const isValue = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined;

// The width the chart is drawn at, measured the way tp-charts.js measures it: whole pixels, and
// only a change of 2 px or more redraws, so a scrollbar appearing cannot make it oscillate.
function useMeasuredWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let last = -1;
    let frame = 0;
    const read = () => {
      const next = Math.floor(element.getBoundingClientRect().width);
      if (Math.abs(next - last) >= 2) {
        last = next;
        setWidth(next);
      }
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    });
    observer.observe(element);
    read();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

// The widest of the given labels as the value labels draw them, 13 px at 600 (design v5 item 6),
// measured with a canvas as tp-charts.js does. Until the web font has loaded the fallback font is
// what gets measured, so it measures again once fonts are ready.
function useLabelWidth(ref: RefObject<HTMLDivElement | null>, labels: readonly string[]): number {
  const key = labels.join('\n');
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || key === '') return;
    let live = true;
    const measure = () => {
      const context = document.createElement('canvas').getContext('2d');
      if (!live || !context) return;
      context.font = `600 13px ${getComputedStyle(element).fontFamily}`;
      setWidth(Math.max(...key.split('\n').map((label) => context.measureText(label).width)));
    };
    measure();
    if ('fonts' in document) void document.fonts.ready.then(measure);
    return () => {
      live = false;
    };
  }, [ref, key]);
  return key === '' ? 0 : width;
}

export function TrendChart(props: TrendChartProps) {
  const loading = 'loading' in props;
  const data = 'series' in props ? props : undefined;
  const points = data?.series[0]?.values.length ?? 0;
  const caption = data && points >= 2 ? data.caption : null;

  return (
    <figure
      className={styles.figure}
      aria-busy={loading || undefined}
      aria-label={loading ? 'Loading chart' : undefined}
    >
      <figcaption>
        <h3 className={styles.title}>{props.title}</h3>
        <p className={styles.scope} data-part="scope">
          {props.scope}
        </p>
        {caption && (
          <p className={styles.caption} data-part="caption">
            {caption}
          </p>
        )}
      </figcaption>
      <ChartBody
        data={data}
        onRetry={'error' in props ? props.onRetry : undefined}
        title={props.title}
        label={caption ? `${props.title}. ${caption}` : props.title}
      />
    </figure>
  );
}

function ChartBody({
  data,
  onRetry,
  title,
  label,
}: {
  // Undefined while loading and in the error state.
  data: TrendData | undefined;
  // Set in the error state only.
  onRetry: (() => void) | undefined;
  title: string;
  label: string;
}) {
  const measured = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(measured);
  const height = chartHeight(width);
  const series = data?.series ?? [];
  const points = series[0]?.values.length ?? 0;
  const kind = data?.kind ?? 'line';
  // A series with no latest value has no end label, so it takes no margin.
  const endLabels =
    data && kind === 'line' && points >= 2
      ? series
          .map((s) => s.values[points - 1])
          .filter(isValue)
          .map((value) => formatTrendValue(value, data.format, true))
      : [];
  const endLabelWidth = useLabelWidth(measured, endLabels);

  let body;
  if (onRetry) {
    body = <ErrorPanel height={height} onRetry={onRetry} />;
  } else if (!data) {
    body = (
      <div
        className={cx(styles.frame, styles.loading)}
        style={{ height, animation: SHIMMER }}
        data-part="loading"
      >
        Loading chart…
      </div>
    );
  } else if (points === 0) {
    body = (
      <div className={styles.frame} style={{ height }} data-part="empty">
        No runs yet
      </div>
    );
  } else if (points === 1) {
    body = (
      <div className={styles.single} style={{ height }} data-part="one-point">
        <span className={styles.singleValue}>
          {formatTrendValue(series[0]?.values[0] ?? 0, data.format, true)}
        </span>
        <span className={styles.singleDot} aria-hidden="true" />
        <span className={styles.singleText}>
          One run so far. The trend appears after the next run.
        </span>
      </div>
    );
  } else if (width > 0) {
    body = (
      <Plot data={data} layout={chartLayout(width, points, kind, endLabelWidth)} label={label} />
    );
  } else {
    // The server and the first client render do not know the width yet: hold the space.
    body = <div style={{ height }} data-part="placeholder" />;
  }

  return (
    <div ref={measured} className={styles.body}>
      {series.length > 1 && <Legend series={series} />}
      {body}
      {data && points >= 2 && <TableToggle data={data} title={title} />}
    </div>
  );
}

// Design v5 item 3: the plot area, at its own height, becomes an inset panel inside the chart card;
// the title and scope stay above it.
function ErrorPanel({ height, onRetry }: { height: number; onRetry: () => void }) {
  return (
    <div role="alert" className={styles.errorPanel} style={{ height }} data-part="error">
      <AlertCircleIcon size={18} strokeWidth={2.6} className={styles.errorIcon} />
      <span className={styles.errorTitle} data-part="error-title">
        Chart couldn’t be loaded
      </span>
      <span className={styles.errorText} data-part="error-text">
        The rest of the page is still current.
      </span>
      <Button variant="secondary" className={styles.errorRetry} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function Legend({ series }: { series: readonly TrendSeries[] }) {
  return (
    <ul className={styles.legend} data-part="legend">
      {series.map((s, i) => (
        <li key={s.name} className={styles.legendItem}>
          <span
            className={i === 0 ? styles.keySolid : styles.keyDashed}
            data-part="legend-key"
            aria-hidden="true"
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

const strokeOf = (seriesIndex: number) => (seriesIndex === 0 ? 'var(--ink)' : 'var(--ink-3)');

function Plot({ data, layout, label }: { data: TrendData; layout: ChartLayout; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { series, format, unit } = data;
  const labels = data.labels ?? NO_LABELS;
  const marks = data.marks ?? NO_MARKS;
  const bar = layout.kind === 'bar';
  const count = layout.count;
  // A shorter series arriving while a point is shown must not leave the index past the end.
  const active = hover !== null && hover < count ? hover : null;

  const scale = trendYScale({
    values: series.flatMap((s) => s.values).filter(isValue),
    floor: data.floor,
    zero: bar || (data.zero ?? false),
    percent: format === 'pct',
    integer: format === 'int' || format === 'dur',
    steps: layout.phone ? 2 : 3,
  });
  const rows = Array.from({ length: count }, (_, i) =>
    Object.fromEntries([['i', i], ...series.map((s, si) => [`s${si}`, s.values[i]])]),
  );
  const ticks = xTickIndices(count, layout.phone, labels.length > 0);

  const axes = [
    <CartesianGrid
      key="grid"
      vertical={false}
      stroke="var(--line)"
      horizontalPoints={scale.ticks.map((tick) => yAt(layout, scale, tick))}
    />,
    <XAxis
      key="x"
      dataKey="i"
      type={bar ? 'category' : 'number'}
      domain={bar ? undefined : [0, count - 1]}
      ticks={ticks}
      interval={0}
      height={layout.bottom}
      tickLine={false}
      axisLine={false}
      tick={(tick: { x: number | string; index: number; payload: { value: unknown } }) => {
        const index = Number(tick.payload.value);
        const position =
          tick.index === 0 ? 'first' : tick.index === ticks.length - 1 ? 'last' : 'middle';
        return (
          <text
            x={Number(tick.x)}
            y={layout.height - 8}
            textAnchor={position === 'first' ? 'start' : position === 'last' ? 'end' : 'middle'}
            className={styles.axisText}
            data-part="x-label"
          >
            {pointLabel(index, count, labels, unit)}
          </text>
        );
      }}
    />,
    <YAxis
      key="y"
      type="number"
      domain={[scale.min, scale.max]}
      ticks={scale.ticks}
      interval={0}
      width={layout.left}
      tickLine={false}
      axisLine={false}
      tick={(tick: { y: number | string; payload: { value: unknown } }) => (
        <text
          x={layout.left - 8}
          y={Number(tick.y) + 4}
          textAnchor="end"
          className={styles.axisText}
          data-part="y-label"
        >
          {formatTrendValue(Number(tick.payload.value), format)}
        </text>
      )}
    />,
  ];

  // The rule is drawn from 6 px above the plot, as tp-charts.js draws it.
  const hoverRule =
    active === null ? null : (
      <ReferenceLine
        key="hover-rule"
        x={active}
        zIndex={DefaultZIndexes.cursorLine}
        shape={(line: { x1?: number; y1?: number; y2?: number }) => (
          <line
            x1={line.x1}
            x2={line.x1}
            y1={Math.min(line.y1 ?? 0, line.y2 ?? 0) - 6}
            y2={Math.max(line.y1 ?? 0, line.y2 ?? 0)}
            stroke="var(--line-strong)"
            data-part="hover-rule"
          />
        )}
      />
    );

  const margin = { top: layout.top, right: layout.right, bottom: 0, left: 0 };
  const chart = bar ? (
    <BarChart
      width={layout.width}
      height={layout.height}
      data={rows}
      margin={margin}
      accessibilityLayer={false}
    >
      {axes}
      <Bar dataKey="s0" barSize={barWidth(layout)} radius={2} isAnimationActive={false}>
        {rows.map((_, i) => (
          <Cell key={i} fill={i === active ? 'var(--ink)' : 'var(--layer-2)'} />
        ))}
      </Bar>
      {hoverRule}
    </BarChart>
  ) : (
    <LineChart
      width={layout.width}
      height={layout.height}
      data={rows}
      margin={margin}
      accessibilityLayer={false}
    >
      {axes}
      {data.floor !== undefined && (
        <ReferenceLine
          y={data.floor}
          shape={(line: { x1?: number; x2?: number; y1?: number }) => (
            <g>
              <line
                x1={line.x1}
                x2={line.x2}
                y1={line.y1}
                y2={line.y1}
                stroke="var(--attn)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                data-part="floor"
              />
              <text
                x={(line.x1 ?? 0) + 6}
                y={(line.y1 ?? 0) - 6}
                className={styles.floorText}
                data-part="floor-label"
              >
                floor {formatTrendValue(data.floor ?? 0, format)}
              </text>
            </g>
          )}
        />
      )}
      {series.map((s, si) => (
        <Line
          key={s.name}
          dataKey={`s${si}`}
          stroke={strokeOf(si)}
          strokeWidth={si === 0 ? 2.5 : 2}
          strokeDasharray={s.dashed || si > 0 ? '6 4' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
          isAnimationActive={false}
          activeDot={false}
          connectNulls={false}
          dot={(dot: DotItemDotProps) => (
            <PointDot
              key={dot.index}
              dot={dot}
              values={s.values}
              seriesIndex={si}
              layout={layout}
              format={format}
            />
          )}
        />
      ))}
      {marks
        .filter((mark) => isValue(series[0]?.values[mark.index]))
        .map((mark) => (
          <ReferenceDot
            key={`mark-${mark.index}`}
            x={mark.index}
            y={series[0]?.values[mark.index] ?? undefined}
            shape={(dot: { cx?: number; cy?: number }) => (
              <rect
                x={(dot.cx ?? 0) - 4}
                y={(dot.cy ?? 0) - 4}
                width={8}
                height={8}
                fill={mark.status === 'fail' ? 'var(--fail)' : 'var(--attn)'}
                stroke="var(--surface)"
                strokeWidth={2}
                data-part="mark"
              />
            )}
          />
        ))}
      {hoverRule}
      {active !== null &&
        series.map((s, si) =>
          !isValue(s.values[active]) ? null : (
            <ReferenceDot
              key={`hover-${s.name}`}
              x={active}
              y={s.values[active]}
              zIndex={DefaultZIndexes.activeDot}
              shape={(dot: { cx?: number; cy?: number }) => (
                <circle
                  cx={dot.cx}
                  cy={dot.cy}
                  r={5}
                  fill="var(--surface)"
                  stroke={strokeOf(si)}
                  strokeWidth={2}
                  data-part="hover-dot"
                />
              )}
            />
          ),
        )}
    </LineChart>
  );

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(nearestIndex(layout, event.clientX - box.left));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
    setHover((current) => nextIndex(current, event.key, count));
  }

  return (
    <div className={styles.plot}>
      <div
        role="img"
        aria-label={label}
        tabIndex={0}
        className={styles.surface}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(count - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        {chart}
      </div>
      <div role="status">
        {active !== null && (
          <Tooltip data={data} labels={labels} marks={marks} layout={layout} index={active} />
        )}
      </div>
    </div>
  );
}

function PointDot({
  dot,
  values,
  seriesIndex,
  layout,
  format,
}: {
  dot: DotItemDotProps;
  values: readonly (number | null)[];
  seriesIndex: number;
  layout: ChartLayout;
  format: TrendFormat;
}) {
  const { cx: x = 0, cy: y = 0, index } = dot;
  const value = values[index];
  if (!isValue(value)) return <g />;
  const last = index === layout.count - 1;
  if (last || (index === 0 && seriesIndex === 0)) {
    return (
      <g>
        <circle
          cx={x}
          cy={y}
          r={4.5}
          fill={last ? strokeOf(seriesIndex) : 'var(--ink)'}
          data-part="end-dot"
        />
        <text
          x={x + 8}
          y={y + (last ? 4 : startLabelDy(layout, y))}
          className={styles.valueText}
          data-part="value-label"
        >
          {formatTrendValue(value, format, true)}
        </text>
      </g>
    );
  }
  if (!showsIntermediateDots(layout.count, layout.phone)) {
    // A point with gaps on both sides has no line through it, so it is drawn as a 3 px dot;
    // where hollow dots are drawn they cover it, as in tp-charts.js.
    const lone = !isValue(values[index - 1]) && !isValue(values[index + 1]);
    return lone ? (
      <circle cx={x} cy={y} r={3} fill={strokeOf(seriesIndex)} data-part="lone-dot" />
    ) : (
      <g />
    );
  }
  return (
    <circle
      cx={x}
      cy={y}
      r={3}
      fill="var(--surface)"
      stroke={strokeOf(seriesIndex)}
      strokeWidth={1.5}
      data-part="dot"
    />
  );
}

function Tooltip({
  data,
  labels,
  marks,
  layout,
  index,
}: {
  data: TrendData;
  labels: readonly string[];
  marks: readonly TrendMark[];
  layout: ChartLayout;
  index: number;
}) {
  const mark = marks.find((m) => m.index === index);
  return (
    <div
      className={styles.tooltip}
      style={{ left: tooltipLeft(layout, index) }}
      data-part="tooltip"
    >
      <div className={styles.tipLabel}>{pointLabel(index, layout.count, labels, data.unit)}</div>
      {data.series.map((s) => {
        const value = s.values[index];
        return (
          <div key={s.name} className={styles.tipRow}>
            <span className={styles.tipName}>{s.name}</span>
            {isValue(value) ? (
              <b className={styles.tipValue}>{formatTrendValue(value, data.format, true)}</b>
            ) : (
              <span className={styles.tipNotRun} data-part="not-run">
                Not run
              </span>
            )}
          </div>
        );
      })}
      {mark && (
        <div
          className={cx(styles.tipMark, mark.status === 'fail' ? styles.tipFail : styles.tipEmpty)}
          data-part="tip-mark"
        >
          {mark.status === 'fail' ? 'Run failed' : 'Run empty'}
        </div>
      )}
    </div>
  );
}

function TableToggle({ data, title }: { data: TrendData; title: string }) {
  const [open, setOpen] = useState(false);
  const tableId = useId();
  return (
    <>
      <div className={styles.toggle}>
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls={tableId}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? 'Hide table' : 'Show table'}
        </Button>
      </div>
      {open && <DataTable data={data} title={title} id={tableId} />}
      {/* Without JavaScript the chart is never drawn, so the table stands in for it. */}
      <noscript>
        <DataTable data={data} title={title} />
      </noscript>
    </>
  );
}

function DataTable({ data, title, id }: { data: TrendData; title: string; id?: string }) {
  const count = data.series[0]?.values.length ?? 0;
  const labels = data.labels ?? NO_LABELS;
  const newestFirst = Array.from({ length: count }, (_, i) => count - 1 - i);
  return (
    // Focusable so a keyboard can scroll the 320 px box.
    <div
      id={id}
      className={styles.tableWrap}
      role="region"
      aria-label={`${title}, table`}
      tabIndex={0}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{data.unit === 'day' ? 'Day (UTC)' : 'Run'}</th>
            {data.series.map((s) => (
              <th key={s.name} scope="col" className={styles.value}>
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((i) => (
            <tr key={i}>
              <th scope="row">{pointLabel(i, count, labels, data.unit)}</th>
              {data.series.map((s) => {
                const value = s.values[i];
                return isValue(value) ? (
                  <td key={s.name} className={styles.value}>
                    {formatTrendValue(value, data.format, true)}
                  </td>
                ) : (
                  <td key={s.name} className={cx(styles.value, styles.notRun)}>
                    Not run
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
