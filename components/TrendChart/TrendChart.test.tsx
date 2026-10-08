// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  coverageCaption,
  durationCaption,
  passRateCaption,
  TREND_SCOPE,
} from '../../lib/charts/captions';
import { formatTrendValue } from '../../lib/charts/format';
import {
  COVERAGE_10,
  DATES,
  IOS_GAP_SECONDS,
  IOS_SECONDS,
  JVM_GAP_SECONDS,
  JVM_SECONDS,
  OSTOMATE2_RUN_SECONDS,
  PASS_RATE_30,
  RUNS_PER_DAY,
  TESTS_30,
} from '../../lib/charts/design-samples.test-support';
import { barWidth, chartLayout, xAt, yAt } from '../../lib/charts/layout';
import { trendYScale } from '../../lib/charts/scale';
import { ruleFor } from '../testing/stylesheet';
import { TrendChart, type TrendChartProps } from './TrendChart';
import styles from './TrendChart.module.css';

const CSS = join(import.meta.dirname, 'TrendChart.module.css');

// jsdom does no layout. The chart measures its own width, as tp-charts.js does, and Recharts then
// draws at exactly that width; each test sets the width the browser would report. Recharts itself
// is not mocked: every line, bar, tick and dot below is what it rendered.
let chartWidth = 720;
let resize: (() => void) | undefined;
// jsdom has no canvas either. The chart measures its end-value labels with a 2D context's
// measureText, as tp-charts.js does (design v5 item 6); this stand-in gives every character the
// same width, so a test can say exactly how wide a label is.
let charWidth = 7;
let measuredFonts: string[] = [];

beforeEach(() => {
  chartWidth = 720;
  resize = undefined;
  charWidth = 7;
  measuredFonts = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const context = {
      font: '',
      measureText: (text: string) => {
        measuredFonts.push(context.font);
        return { width: text.length * charWidth };
      },
    };
    return context as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: chartWidth,
        height: 0,
        left: 0,
        top: 0,
        right: chartWidth,
        bottom: 0,
        x: 0,
        y: 0,
      }) as DOMRect,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const has = (element: Element | null | undefined, name: string) => {
  const className = styles[name];
  if (!className) throw new Error(`TrendChart.module.css has no .${name}`);
  return element?.classList.contains(className) ?? false;
};

const parts = (root: ParentNode, part: string) => [
  ...root.querySelectorAll<SVGElement>(`[data-part="${part}"]`),
];
const num = (element: Element | undefined, attribute: string) =>
  Number(element?.getAttribute(attribute));

const COVERAGE: TrendChartProps = {
  title: 'Line coverage, shared',
  scope: TREND_SCOPE.coverage,
  caption: coverageCaption(COVERAGE_10, 91),
  series: [{ name: 'shared', values: COVERAGE_10 }],
  labels: DATES,
  floor: 91,
  format: 'pct',
  unit: 'run',
};

const PASS_RATE: TrendChartProps = {
  title: 'Pass rate',
  scope: TREND_SCOPE.passRate,
  caption: passRateCaption(PASS_RATE_30, 2),
  series: [{ name: 'Pass rate', values: PASS_RATE_30 }],
  marks: [
    { index: 11, status: 'fail' },
    { index: 23, status: 'fail' },
  ],
  format: 'pct',
  unit: 'run',
};

const DURATION: TrendChartProps = {
  title: 'Duration, rendersToday',
  scope: TREND_SCOPE.testDuration,
  caption: 'Between 0.38 s and 0.64 s over the last 30 runs.',
  series: [
    { name: 'jvm', values: JVM_SECONDS },
    { name: 'ios-sim', values: IOS_SECONDS, dashed: true },
  ],
  format: 'sec',
  unit: 'run',
};

const RUNS_PER_DAY_CHART: TrendChartProps = {
  title: 'Runs per day',
  scope: TREND_SCOPE.runsPerDay,
  caption: '39 runs in the last 30 days, 3 on the busiest day.',
  kind: 'bar',
  series: [{ name: 'Runs', values: RUNS_PER_DAY }],
  format: 'int',
  unit: 'day',
};

const TESTS: TrendChartProps = {
  title: 'Tests per run',
  scope: TREND_SCOPE.testCount,
  caption: 'Grew from 118 to 142 over the last 30 runs.',
  series: [{ name: 'Tests', values: TESTS_30 }],
  format: 'int',
  unit: 'run',
};

const RUN_DURATION: TrendChartProps = {
  title: 'Run duration',
  scope: TREND_SCOPE.duration,
  caption: durationCaption([OSTOMATE2_RUN_SECONDS], 'dur'),
  series: [{ name: 'Duration', values: OSTOMATE2_RUN_SECONDS }],
  format: 'dur',
  unit: 'run',
};

const surfaceOf = (container: HTMLElement) => {
  const surface = container.querySelector('[role="img"]');
  if (!(surface instanceof HTMLElement)) throw new Error('no chart surface');
  return surface;
};

// Points of a Recharts line path "M56,180.4L217.3,140.8…" as [x, y] pairs.
const pathPoints = (path: Element | undefined) =>
  (path?.getAttribute('d') ?? '')
    .slice(1)
    .split('L')
    .map((pair) => pair.split(',').map(Number));

describe('TrendChart heading', () => {
  it('names the chart, states its scope and captions it inside the figure caption', () => {
    const { getByRole, container } = render(<TrendChart {...COVERAGE} />);
    const figure = getByRole('figure');
    const caption = figure.querySelector('figcaption');
    expect(caption).toBe(figure.firstElementChild);
    expect(within(figure).getByRole('heading', { level: 3 }).textContent).toBe(
      'Line coverage, shared',
    );
    expect(caption?.querySelector('[data-part="scope"]')?.textContent).toBe(
      'Default branch · last 30 runs · CI and imported history',
    );
    expect(caption?.querySelector('[data-part="caption"]')?.textContent).toBe(
      'Rose from 52.6% to 92.0% over 10 runs; above its 91% floor.',
    );
    expect(has(container.querySelector('figure'), 'figure')).toBe(true);
  });

  it('omits the caption with fewer than two points', () => {
    const { container } = render(
      <TrendChart
        {...TESTS}
        title="Tests per run, testpulse"
        caption="Should not show."
        series={[{ name: 'Tests', values: [322] }]}
      />,
    );
    expect(container.querySelector('[data-part="caption"]')).toBeNull();
    expect(container.textContent).not.toContain('Should not show.');
  });

  it('sets the heading, scope and caption type as the design does', () => {
    expect(ruleFor(CSS, '.figure')).toMatchObject({
      margin: '0px',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: '22px 24px',
      'box-shadow': 'var(--shadow-card)',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.title')).toMatchObject({
      margin: '0px',
      font: '500 20px var(--font-serif)',
    });
    expect(ruleFor(CSS, '.scope')).toMatchObject({
      margin: '2px 0px 0px',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.caption')).toMatchObject({
      margin: '6px 0px 0px',
      'font-size': '14px',
      'line-height': '1.5',
      color: 'var(--ink-2)',
      'text-wrap': 'pretty',
    });
    expect(ruleFor(CSS, '.body')).toMatchObject({ 'margin-top': '14px', 'min-width': '0px' });
  });
});

describe('TrendChart without JavaScript', () => {
  it('server-renders the heading, the caption and every point as a table', () => {
    const html = renderToStaticMarkup(<TrendChart {...PASS_RATE} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('h3')?.textContent).toBe('Pass rate');
    expect(doc.querySelector('[data-part="caption"]')?.textContent).toBe(
      '100% on the latest run. 2 of the last 30 runs failed.',
    );
    // DOMParser runs with scripting off, so the noscript content parses as elements, as it does
    // in a browser with JavaScript disabled.
    const rows = [...doc.querySelectorAll('noscript table tbody tr')];
    expect(rows).toHaveLength(30);
    expect(rows[0]?.textContent).toBe('Latest100.0%');
    expect(rows[6]?.textContent).toBe('6 runs ago99.3%');
    expect(rows[29]?.textContent).toBe('29 runs ago100.0%');
    expect(doc.querySelector('svg')).toBeNull();
  });

  it('holds the chart height before the width is measured, so nothing jumps', () => {
    const html = renderToStaticMarkup(<TrendChart {...PASS_RATE} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const placeholder = doc.querySelector<HTMLElement>('[data-part="placeholder"]');
    expect(placeholder?.style.height).toBe('250px');
  });

  it('server-renders the one-point, empty and loading states in full', () => {
    expect(
      renderToStaticMarkup(<TrendChart {...TESTS} series={[{ name: 'Tests', values: [322] }]} />),
    ).toContain('One run so far. The trend appears after the next run.');
    expect(
      renderToStaticMarkup(<TrendChart {...TESTS} series={[{ name: 'Tests', values: [] }]} />),
    ).toContain('No runs yet');
    expect(renderToStaticMarkup(<TrendChart title="Run duration" scope="x" loading />)).toContain(
      'Loading chart…',
    );
  });
});

describe('TrendChart line, many points', () => {
  it('draws at the measured width and 250 px tall, in real pixels', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('720');
    expect(svg?.getAttribute('height')).toBe('250');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 720 250');
  });

  it('strokes the primary series 2.5 px in ink with round joins', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const path = container.querySelector('path.recharts-line-curve');
    expect(path?.getAttribute('stroke')).toBe('var(--ink)');
    expect(path?.getAttribute('stroke-width')).toBe('2.5');
    expect(path?.getAttribute('stroke-linejoin')).toBe('round');
    expect(path?.getAttribute('stroke-linecap')).toBe('round');
    expect(path?.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('places every point where the design layout puts it', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const layout = chartLayout(720, 30, 'line');
    const scale = trendYScale({
      values: PASS_RATE_30,
      zero: false,
      percent: true,
      integer: false,
      steps: 3,
    });
    const points = pathPoints(container.querySelector('path.recharts-line-curve') ?? undefined);
    expect(points).toHaveLength(30);
    points.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(xAt(layout, i), 6);
      expect(y).toBeCloseTo(yAt(layout, scale, PASS_RATE_30[i] ?? 0), 6);
    });
  });

  it('dots the first and last points (r 4.5) and no others above 12 points', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    expect(parts(container, 'dot')).toHaveLength(0);
    const ends = parts(container, 'end-dot');
    expect(ends).toHaveLength(2);
    ends.forEach((dot) => {
      expect(dot.getAttribute('r')).toBe('4.5');
      expect(dot.getAttribute('fill')).toBe('var(--ink)');
    });
    expect(num(ends[0], 'cx')).toBe(56);
    expect(num(ends[1], 'cx')).toBe(660);
  });

  it('labels the first and last values, the last one level with its point', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const labels = parts(container, 'value-label');
    expect(labels.map((label) => label.textContent)).toEqual(['100.0%', '100.0%']);
    const [first, last] = labels;
    expect(num(first, 'x')).toBe(64);
    expect(num(last, 'x')).toBe(668);
    expect(num(last, 'y')).toBe(22 + 4);
    // 100% sits on the top edge, far from the x axis, so the first label hangs below the point.
    expect(num(first, 'y')).toBe(22 + 18);
    labels.forEach((label) => expect(has(label, 'valueText')).toBe(true));
  });

  it('marks failed runs with 8 px squares outlined in the surface colour', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const marks = parts(container, 'mark');
    expect(marks).toHaveLength(2);
    const layout = chartLayout(720, 30, 'line');
    marks.forEach((mark, i) => {
      expect(mark.tagName).toBe('rect');
      expect(mark.getAttribute('width')).toBe('8');
      expect(mark.getAttribute('height')).toBe('8');
      expect(mark.getAttribute('fill')).toBe('var(--fail)');
      expect(mark.getAttribute('stroke')).toBe('var(--surface)');
      expect(mark.getAttribute('stroke-width')).toBe('2');
      expect(num(mark, 'x')).toBeCloseTo(xAt(layout, i === 0 ? 11 : 23) - 4, 6);
    });
  });

  it('marks empty runs in amber', () => {
    const { container } = render(
      <TrendChart {...PASS_RATE} marks={[{ index: 4, status: 'empty' }]} />,
    );
    expect(parts(container, 'mark')[0]?.getAttribute('fill')).toBe('var(--attn)');
  });

  it('draws the marks over the dots and the line', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const all = [...container.querySelectorAll('path.recharts-line-curve, [data-part]')];
    const mark = parts(container, 'mark')[0];
    const lastDot = parts(container, 'end-dot')[1];
    const line = container.querySelector('path.recharts-line-curve');
    expect(all.indexOf(mark as Element)).toBeGreaterThan(all.indexOf(lastDot as Element));
    expect(all.indexOf(mark as Element)).toBeGreaterThan(all.indexOf(line as Element));
  });

  it('puts y ticks in 12 px axis text, right-aligned 8 px left of the plot, on grid lines', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const ticks = parts(container, 'y-label');
    expect(ticks.map((tick) => tick.textContent)).toEqual(['98%', '99%', '100%']);
    ticks.forEach((tick) => {
      expect(tick.getAttribute('text-anchor')).toBe('end');
      expect(num(tick, 'x')).toBe(48);
      expect(has(tick, 'axisText')).toBe(true);
    });
    expect(num(ticks[2], 'y')).toBe(22 + 4);
    const grid = [...container.querySelectorAll('.recharts-cartesian-grid-horizontal line')];
    expect(grid.map((line) => num(line, 'y1')).sort((a, b) => a - b)).toEqual([22, 121, 220]);
    grid.forEach((line) => {
      expect(line.getAttribute('stroke')).toBe('var(--line)');
      expect(num(line, 'x1')).toBe(56);
      expect(num(line, 'x2')).toBe(660);
    });
  });

  // Design v5 item 2: the axis counts like the tooltip and the table, so the oldest of 30 is
  // "29 runs ago" in all three.
  it('labels the ends of the x axis by runs back when points carry no labels', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const ticks = parts(container, 'x-label');
    expect(ticks.map((tick) => tick.textContent)).toEqual(['29 runs ago', 'Latest']);
    expect(ticks.map((tick) => tick.getAttribute('text-anchor'))).toEqual(['start', 'end']);
    ticks.forEach((tick) => {
      expect(num(tick, 'y')).toBe(250 - 8);
      expect(has(tick, 'axisText')).toBe(true);
    });
  });

  // Design v5 item 6: right margin = max(60, 8 + widest end label + 6), measured at 13/600.
  it('widens the right margin to fit the end-value label, measured at 13/600', () => {
    charWidth = 10;
    const { container } = render(<TrendChart {...PASS_RATE} />);
    // "100.0%" is 60 px here, so the margin is 8 + 60 + 6 = 74.
    const ends = parts(container, 'end-dot');
    expect(num(ends[1], 'cx')).toBe(720 - 74);
    expect(num(parts(container, 'value-label')[1], 'x')).toBe(720 - 74 + 8);
    expect(measuredFonts.length).toBeGreaterThan(0);
    measuredFonts.forEach((font) => expect(font).toMatch(/^600 13px /));
  });

  it('measures the widest of the series’ end labels', () => {
    charWidth = 10;
    const { container } = render(
      <TrendChart
        {...DURATION}
        series={[
          { name: 'jvm', values: [1, 2] },
          { name: 'ios-sim', values: [1, 12.5] },
        ]}
      />,
    );
    // "12.50 s" is 70 px: 8 + 70 + 6 = 84.
    expect(num(parts(container, 'end-dot').at(-1), 'cx')).toBe(720 - 84);
  });

  it('draws no legend for one series', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    expect(container.querySelector('[data-part="legend"]')).toBeNull();
  });
});

describe('TrendChart line, few points, with a floor', () => {
  it('draws hollow intermediate dots (r 3) at 12 points or fewer on desktop', () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    const dots = parts(container, 'dot');
    expect(dots).toHaveLength(8);
    dots.forEach((dot) => {
      expect(dot.getAttribute('r')).toBe('3');
      expect(dot.getAttribute('fill')).toBe('var(--surface)');
      expect(dot.getAttribute('stroke')).toBe('var(--ink)');
      expect(dot.getAttribute('stroke-width')).toBe('1.5');
    });
  });

  it('fits the y axis to the data and floor', () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    expect(parts(container, 'y-label').map((tick) => tick.textContent)).toEqual([
      '40%',
      '60%',
      '80%',
      '100%',
    ]);
  });

  it('draws the floor as a dashed amber line with its label above the left end', () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    const layout = chartLayout(720, 10, 'line');
    const floorY = yAt(layout, { min: 40, max: 100, ticks: [] }, 91);
    const [line] = parts(container, 'floor');
    expect(line?.getAttribute('stroke')).toBe('var(--attn)');
    expect(line?.getAttribute('stroke-width')).toBe('1.5');
    expect(line?.getAttribute('stroke-dasharray')).toBe('5 4');
    expect(num(line, 'x1')).toBe(56);
    expect(num(line, 'x2')).toBe(660);
    expect(num(line, 'y1')).toBeCloseTo(floorY, 6);
    const [label] = parts(container, 'floor-label');
    expect(label?.textContent).toBe('floor 91%');
    expect(num(label, 'x')).toBe(62);
    expect(num(label, 'y')).toBeCloseTo(floorY - 6, 6);
    expect(has(label, 'floorText')).toBe(true);
  });

  it('draws the floor under the line', () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    const all = [...container.querySelectorAll('path.recharts-line-curve, [data-part="floor"]')];
    expect(all[0]?.getAttribute('data-part')).toBe('floor');
  });

  it('labels the x axis at 0, a third, two thirds and the last point', () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    const ticks = parts(container, 'x-label');
    expect(ticks.map((tick) => tick.textContent)).toEqual(['Jul 2', 'Jul 29', 'Aug 25', 'Sep 21']);
    expect(ticks.map((tick) => tick.getAttribute('text-anchor'))).toEqual([
      'start',
      'middle',
      'middle',
      'end',
    ]);
  });
});

describe('TrendChart at phone width', () => {
  beforeEach(() => {
    // A 390 px screen less the page gutter and the card padding.
    chartWidth = 342;
  });

  it('is 200 px tall with 44 px side margins', () => {
    // "92.0%" is 30 px here: 8 + 30 + 6 = 44.
    charWidth = 6;
    const { container } = render(<TrendChart {...COVERAGE} />);
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('200');
    const ends = parts(container, 'end-dot');
    expect(num(ends[0], 'cx')).toBe(44);
    expect(num(ends[1], 'cx')).toBe(342 - 44);
  });

  it('widens the right margin past 44 px when the end label needs it', () => {
    // "92.0%" is 40 px here: 8 + 40 + 6 = 54.
    charWidth = 8;
    const { container } = render(<TrendChart {...COVERAGE} />);
    expect(num(parts(container, 'end-dot')[1], 'cx')).toBe(342 - 54);
  });

  it('labels only the first and last x values and uses two y steps', () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    expect(parts(container, 'x-label').map((tick) => tick.textContent)).toEqual([
      'Jul 2',
      'Sep 21',
    ]);
    expect(parts(container, 'y-label').map((tick) => tick.textContent)).toEqual([
      '25%',
      '50%',
      '75%',
      '100%',
    ]);
  });

  it('draws no intermediate dots', () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    expect(parts(container, 'dot')).toHaveLength(0);
  });

  it('keeps the text at the same pixel sizes', () => {
    expect(ruleFor(CSS, '.axisText')).toMatchObject({
      'font-size': 'var(--chart-axis)',
      fill: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.valueText')).toMatchObject({
      'font-size': 'var(--chart-value)',
      'font-weight': '600',
      fill: 'var(--ink)',
    });
    expect(ruleFor(CSS, '.floorText')).toMatchObject({
      'font-size': 'var(--chart-axis)',
      'font-weight': '600',
      fill: 'var(--attn)',
    });
  });

  // Design v10 item 13 (components.md TrendChart; decision 2026-10-07): the start, end and floor
  // labels sit on a 3 px --surface halo, painted under the text, so a line never cuts a digit.
  it('draws the value and floor labels on a 3 px surface halo', () => {
    const halo = {
      stroke: 'var(--surface)',
      'stroke-width': '3px',
      'paint-order': 'stroke',
      'stroke-linejoin': 'round',
    };
    expect(ruleFor(CSS, '.valueText')).toMatchObject(halo);
    expect(ruleFor(CSS, '.floorText')).toMatchObject(halo);
  });

  it('redraws on the next frame when the width changes', async () => {
    const { container } = render(<TrendChart {...COVERAGE} />);
    chartWidth = 720;
    await act(async () => {
      resize?.();
      await new Promise((done) => requestAnimationFrame(done));
    });
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('250');
    expect(parts(container, 'dot')).toHaveLength(8);
  });
});

describe('TrendChart with two series', () => {
  it('dashes the second series in --ink-3 at 2 px', () => {
    const { container } = render(<TrendChart {...DURATION} />);
    const [first, second] = [...container.querySelectorAll('path.recharts-line-curve')];
    expect(first?.getAttribute('stroke')).toBe('var(--ink)');
    expect(second?.getAttribute('stroke')).toBe('var(--ink-3)');
    expect(second?.getAttribute('stroke-width')).toBe('2');
    expect(second?.getAttribute('stroke-dasharray')).toBe('6 4');
  });

  it('dots both last points but only the primary first point, and labels both ends', () => {
    const { container } = render(<TrendChart {...DURATION} />);
    expect(parts(container, 'end-dot').map((dot) => dot.getAttribute('fill'))).toEqual([
      'var(--ink)',
      'var(--ink)',
      'var(--ink-3)',
    ]);
    expect(parts(container, 'value-label').map((label) => label.textContent)).toEqual([
      '0.40 s',
      '0.38 s',
      '0.63 s',
    ]);
  });

  it('dashes the first series too when it asks to be dashed', () => {
    const { container } = render(
      <TrendChart {...DURATION} series={[{ name: 'jvm', values: JVM_SECONDS, dashed: true }]} />,
    );
    const path = container.querySelector('path.recharts-line-curve');
    expect(path?.getAttribute('stroke')).toBe('var(--ink)');
    expect(path?.getAttribute('stroke-dasharray')).toBe('6 4');
  });

  it('shows a legend above the chart naming each series with its line style', () => {
    const { container } = render(<TrendChart {...DURATION} />);
    const legend = container.querySelector('[data-part="legend"]');
    expect(legend?.textContent).toBe('jvmios-sim');
    const keys = legend?.querySelectorAll('[data-part="legend-key"]') ?? [];
    expect(has(keys[0], 'keySolid')).toBe(true);
    expect(has(keys[1], 'keyDashed')).toBe(true);
    expect(ruleFor(CSS, '.legend')).toMatchObject({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '6px 18px',
      margin: '0px 0px 10px',
      padding: '0px',
      'list-style': 'none',
      'font-size': '13px',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.keySolid')).toMatchObject({ 'border-top': '2.5px solid var(--ink)' });
    expect(ruleFor(CSS, '.keyDashed')).toMatchObject({ 'border-top': '2px dashed var(--ink-3)' });
  });
});

describe('TrendChart bars (runs per UTC day)', () => {
  it('draws one bar per day, 62% of its slot, from zero, in --layer-2', () => {
    const { container } = render(<TrendChart {...RUNS_PER_DAY_CHART} />);
    const layout = chartLayout(720, 30, 'bar');
    const bars = [...container.querySelectorAll('.recharts-bar-rectangle path')];
    expect(bars).toHaveLength(RUNS_PER_DAY.filter((v) => v > 0).length);
    bars.forEach((bar) => {
      expect(bar.getAttribute('fill')).toBe('var(--layer-2)');
      // Recharts rounds bar sizes to four decimal places.
      expect(num(bar, 'width')).toBeCloseTo(barWidth(layout), 3);
    });
    expect(parts(container, 'y-label').map((tick) => tick.textContent)).toEqual([
      '0',
      '1',
      '2',
      '3',
    ]);
    expect(parts(container, 'x-label').map((tick) => tick.textContent)).toEqual([
      '29 days ago',
      'Latest',
    ]);
  });

  it('keeps the minimum right margin whatever the labels measure: bars have no end labels', () => {
    const barXs = () => {
      const { container, unmount } = render(<TrendChart {...RUNS_PER_DAY_CHART} />);
      const xs = [...container.querySelectorAll('.recharts-bar-rectangle path')].map((bar) =>
        num(bar, 'x'),
      );
      unmount();
      return xs;
    };
    charWidth = 0;
    const narrow = barXs();
    charWidth = 40;
    expect(barXs()).toEqual(narrow);
    expect(measuredFonts).toEqual([]);
  });

  // Design v5 item 5, drawn as "BAR · all zero, 0…1".
  it('runs an all-zero bar chart from 0 to 1', () => {
    const { container } = render(
      <TrendChart
        {...RUNS_PER_DAY_CHART}
        series={[{ name: 'Runs', values: [0, 0, 0, 0, 0, 0, 0] }]}
      />,
    );
    expect(parts(container, 'y-label').map((tick) => tick.textContent)).toEqual(['0', '1']);
  });

  it('turns the hovered bar ink', () => {
    const { container } = render(<TrendChart {...RUNS_PER_DAY_CHART} />);
    fireEvent.focus(surfaceOf(container));
    const bars = [...container.querySelectorAll('.recharts-bar-rectangle path')];
    expect(bars.at(-1)?.getAttribute('fill')).toBe('var(--ink)');
    expect(bars.slice(0, -1).every((bar) => bar.getAttribute('fill') === 'var(--layer-2)')).toBe(
      true,
    );
    expect(parts(container, 'hover-rule')).toHaveLength(1);
    expect(parts(container, 'hover-dot')).toHaveLength(0);
  });

  it('has no value labels, dots or marks', () => {
    const { container } = render(<TrendChart {...RUNS_PER_DAY_CHART} />);
    expect(parts(container, 'value-label')).toHaveLength(0);
    expect(parts(container, 'end-dot')).toHaveLength(0);
    expect(container.querySelector('path.recharts-line-curve')).toBeNull();
  });

  it('heads the table "Day (UTC)"', () => {
    const { getByRole } = render(<TrendChart {...RUNS_PER_DAY_CHART} />);
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    expect(getByRole('columnheader', { name: 'Day (UTC)' })).toBeTruthy();
    expect(getByRole('rowheader', { name: '1 day ago' })).toBeTruthy();
  });
});

describe('TrendChart tooltip', () => {
  it('is reachable with Tab and named by its title and caption', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const surface = surfaceOf(container);
    expect(surface.tabIndex).toBe(0);
    expect(surface.getAttribute('aria-label')).toBe(
      'Pass rate. 100% on the latest run. 2 of the last 30 runs failed.',
    );
  });

  it('opens on the latest point on focus, moves with the arrows, and closes on Escape', () => {
    const { container, getByRole } = render(<TrendChart {...PASS_RATE} />);
    const surface = surfaceOf(container);
    const status = getByRole('status');
    expect(status.textContent).toBe('');

    fireEvent.focus(surface);
    expect(status.textContent).toBe('LatestPass rate100.0%');

    // The arrows move the tooltip, not the page.
    expect(fireEvent.keyDown(surface, { key: 'ArrowLeft' })).toBe(false);
    expect(status.textContent).toBe('1 run agoPass rate100.0%');

    for (let i = 0; i < 5; i++) fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    expect(status.textContent).toBe('6 runs agoPass rate99.3%Run failed');

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(status.textContent).toBe('5 runs agoPass rate100.0%');

    fireEvent.keyDown(surface, { key: 'Escape' });
    expect(status.textContent).toBe('');
  });

  it('closes when the series shrinks past the point it was showing', () => {
    const { container, getByRole, rerender } = render(<TrendChart {...PASS_RATE} />);
    fireEvent.focus(surfaceOf(container));
    rerender(
      <TrendChart {...PASS_RATE} series={[{ name: 'Pass rate', values: [100, 99.3, 100] }]} />,
    );
    expect(getByRole('status').textContent).toBe('');
    expect(parts(container, 'hover-rule')).toHaveLength(0);
  });

  it('closes when focus leaves', () => {
    const { container, getByRole } = render(<TrendChart {...PASS_RATE} />);
    const surface = surfaceOf(container);
    fireEvent.focus(surface);
    fireEvent.blur(surface);
    expect(getByRole('status').textContent).toBe('');
  });

  it('follows the pointer to the nearest point and closes when it leaves', () => {
    const { container, getByRole } = render(<TrendChart {...COVERAGE} />);
    const surface = surfaceOf(container);
    const layout = chartLayout(720, 10, 'line');
    fireEvent.pointerMove(surface, { clientX: xAt(layout, 3) + 10 });
    expect(getByRole('status').textContent).toBe('Jul 29shared69.8%');
    fireEvent.pointerLeave(surface);
    expect(getByRole('status').textContent).toBe('');
  });

  it('draws a rule from 6 px above the plot to the axis, and hollow dots on each series', () => {
    const { container } = render(<TrendChart {...DURATION} />);
    fireEvent.focus(surfaceOf(container));
    const layout = chartLayout(720, 30, 'line');
    const [rule] = parts(container, 'hover-rule');
    expect(rule?.getAttribute('stroke')).toBe('var(--line-strong)');
    expect(num(rule, 'x1')).toBe(xAt(layout, 29));
    expect(num(rule, 'y1')).toBe(16);
    expect(num(rule, 'y2')).toBe(220);
    const dots = parts(container, 'hover-dot');
    expect(dots.map((dot) => dot.getAttribute('stroke'))).toEqual(['var(--ink)', 'var(--ink-3)']);
    dots.forEach((dot) => {
      expect(dot.getAttribute('r')).toBe('5');
      expect(dot.getAttribute('fill')).toBe('var(--surface)');
      expect(dot.getAttribute('stroke-width')).toBe('2');
    });
  });

  it('lists every series value in a 180 px panel kept inside the chart', () => {
    const { container, getByRole } = render(<TrendChart {...DURATION} />);
    fireEvent.focus(surfaceOf(container));
    const panel = getByRole('status').querySelector<HTMLElement>('[data-part="tooltip"]');
    expect(panel?.textContent).toBe('Latestjvm0.38 sios-sim0.63 s');
    expect(panel?.style.left).toBe(`${720 - 180}px`);
    expect(ruleFor(CSS, '.tooltip')).toMatchObject({
      position: 'absolute',
      top: '0px',
      width: '180px',
      'box-sizing': 'border-box',
      padding: '10px 12px',
      'border-radius': 'var(--radius-md)',
      background: 'var(--raised)',
      border: '1px solid var(--line-strong)',
      'box-shadow': 'var(--shadow-menu)',
      'font-size': '13px',
      'pointer-events': 'none',
    });
    expect(ruleFor(CSS, '.tipLabel')).toMatchObject({ color: 'var(--ink-3)', 'font-size': '12px' });
    expect(ruleFor(CSS, '.tipName')).toMatchObject({ color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.tipValue')).toMatchObject({ 'font-weight': '600', color: 'var(--ink)' });
  });

  it('says a marked run failed or was empty, in its status colour', () => {
    const { container, getByRole } = render(
      <TrendChart {...PASS_RATE} marks={[{ index: 29, status: 'empty' }]} />,
    );
    fireEvent.focus(surfaceOf(container));
    const note = getByRole('status').querySelector('[data-part="tip-mark"]');
    expect(note?.textContent).toBe('Run empty');
    expect(has(note, 'tipEmpty')).toBe(true);
    expect(ruleFor(CSS, '.tipEmpty')).toMatchObject({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.tipFail')).toMatchObject({ color: 'var(--fail)' });
  });

  it('lets a touch scroll the page vertically across the chart', () => {
    expect(ruleFor(CSS, '.surface')).toMatchObject({
      'touch-action': 'pan-y',
      'font-family': 'var(--font-sans)',
      'font-variant-numeric': 'tabular-nums',
    });
  });
});

// Design v7 item 9 (components.md TrendChart, "Missing values"; tp-charts.js): a null is a run
// where the series has no value, such as a platform that did not run.
// Design v14 item 3 (tp-charts.js dur): the y axis keeps whole-second ticks; the end labels,
// tooltip, table and caption read as run durations do.
describe('TrendChart run duration', () => {
  it('ticks the y axis in whole seconds', () => {
    const { container } = render(<TrendChart {...RUN_DURATION} />);
    expect(parts(container, 'y-label').map((tick) => tick.textContent)).toEqual([
      '600 s',
      '650 s',
      '700 s',
      '750 s',
      '800 s',
    ]);
  });

  it('labels the first and last values, captions and tabulates in minutes and seconds', () => {
    const { container, getByRole } = render(<TrendChart {...RUN_DURATION} />);
    expect(parts(container, 'value-label').map((label) => label.textContent)).toEqual([
      '10m 58s',
      '11m 34s',
    ]);
    expect(container.querySelector('[data-part="caption"]')?.textContent).toBe(
      'Between 10m 58s and 12m 22s over the last 30 runs. Median 11m 34s.',
    );
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    const rows = within(getByRole('table')).getAllByRole('row').slice(1);
    expect(rows[0]?.textContent).toBe('Latest11m 34s');
    expect(rows[13]?.textContent).toBe('13 runs ago12m 22s');
  });

  it('reads the hovered run in minutes and seconds in the tooltip', () => {
    const { container, getByRole } = render(<TrendChart {...RUN_DURATION} />);
    fireEvent.focus(surfaceOf(container));
    const panel = getByRole('status').querySelector('[data-part="tooltip"]');
    expect(panel?.textContent).toBe('LatestDuration11m 34s');
  });
});

describe('TrendChart with missing values', () => {
  const GAPS: TrendChartProps = {
    title: 'Duration, rendersToday',
    scope: TREND_SCOPE.testDuration,
    caption: durationCaption([JVM_GAP_SECONDS, IOS_GAP_SECONDS], 'sec'),
    series: [
      { name: 'jvm', values: JVM_GAP_SECONDS },
      { name: 'ios-sim', values: IOS_GAP_SECONDS, dashed: true },
    ],
    format: 'sec',
    unit: 'run',
  };

  // Each "M…" run of a Recharts line path as its points' x positions.
  const segmentXs = (path: Element | undefined) =>
    (path?.getAttribute('d') ?? '')
      .split('M')
      .filter(Boolean)
      .map((segment) =>
        segment
          .replace(/Z$/, '')
          .split('L')
          .map((pair) => Number(pair.split(',')[0])),
      );

  it('breaks the line at a missing value, never joining across the gap', () => {
    const { container } = render(<TrendChart {...GAPS} />);
    const layout = chartLayout(720, 10, 'line', '0.64 s'.length * 7);
    const [, ios] = [...container.querySelectorAll('path.recharts-line-curve')];
    const xs = segmentXs(ios);
    expect(xs.map((segment) => segment.length)).toEqual([2, 2, 3]);
    const expected = [0, 1, 4, 5, 7, 8, 9].map((i) => xAt(layout, i));
    expect(xs.flat()).toHaveLength(expected.length);
    xs.flat().forEach((x, k) => expect(x).toBeCloseTo(expected[k] ?? Number.NaN, 6));
  });

  it('draws no dot where a value is missing', () => {
    const { container } = render(<TrendChart {...GAPS} />);
    const layout = chartLayout(720, 10, 'line', '0.64 s'.length * 7);
    // Desktop, 10 points: hollow dots between the ends, none where ios-sim did not run.
    const iosDots = parts(container, 'dot')
      .filter((dot) => dot.getAttribute('stroke') === 'var(--ink-3)')
      .map((dot) => Math.round(num(dot, 'cx')));
    expect(iosDots).toEqual(
      expect.arrayContaining([1, 4, 5, 7, 8].map((i) => Math.round(xAt(layout, i)))),
    );
    for (const missing of [2, 3, 6])
      expect(iosDots).not.toContain(Math.round(xAt(layout, missing)));
  });

  it('draws a lone point between gaps as a 3 px filled dot where no hollow dots are drawn', () => {
    chartWidth = 390;
    const { container } = render(
      <TrendChart {...GAPS} series={[{ name: 'jvm', values: [0.5, null, 0.6, null, 0.55] }]} />,
    );
    const lone = parts(container, 'lone-dot');
    expect(lone).toHaveLength(1);
    expect(lone[0]?.getAttribute('r')).toBe('3');
    expect(lone[0]?.getAttribute('fill')).toBe('var(--ink)');
    expect(num(lone[0], 'cx')).toBe(xAt(chartLayout(390, 5, 'line', '0.55 s'.length * 7), 2));
  });

  // tp-charts.js draws a series' hollow dots only for 0 < i < n − 1, and a lone 3 px dot only
  // between its first and last points; the first point of series 0 has its own end dot.
  it('draws a second series’ hollow dots only between its ends, as tp-charts.js does', () => {
    const { container } = render(
      <TrendChart
        {...GAPS}
        series={[
          { name: 'jvm', values: [0.41, 0.4, 0.42, 0.43] },
          { name: 'ios-sim', values: [0.6, 0.62, 0.61, 0.63], dashed: true },
        ]}
      />,
    );
    const layout = chartLayout(720, 4, 'line', '0.63 s'.length * 7);
    const dotsOf = (stroke: string) =>
      parts(container, 'dot')
        .filter((dot) => dot.getAttribute('stroke') === stroke)
        .map((dot) => Math.round(num(dot, 'cx')));
    const between = [1, 2].map((i) => Math.round(xAt(layout, i)));
    expect(dotsOf('var(--ink)')).toEqual(between);
    expect(dotsOf('var(--ink-3)')).toEqual(between);
  });

  it('draws no lone dot at a second series’ first point, even with a gap after it', () => {
    chartWidth = 390;
    const { container } = render(
      <TrendChart
        {...GAPS}
        series={[
          { name: 'jvm', values: [0.5, 0.51, 0.52, 0.53, 0.55] },
          { name: 'ios-sim', values: [0.6, null, 0.61, 0.62, 0.63], dashed: true },
        ]}
      />,
    );
    expect(parts(container, 'lone-dot')).toHaveLength(0);
    expect(parts(container, 'dot')).toHaveLength(0);
  });

  it('gives a series whose latest value is missing no end dot or end label', () => {
    const { container } = render(
      <TrendChart
        {...GAPS}
        series={[
          { name: 'jvm', values: [0.41, 0.4, 0.42, 0.43] },
          { name: 'ios-sim', values: [0.6, 0.62, 0.61, null] },
        ]}
      />,
    );
    expect(parts(container, 'end-dot').map((dot) => dot.getAttribute('fill'))).toEqual([
      'var(--ink)',
      'var(--ink)',
    ]);
    expect(parts(container, 'value-label').map((label) => label.textContent)).toEqual([
      '0.41 s',
      '0.43 s',
    ]);
  });

  it('leaves missing values out of the y axis', () => {
    const { container } = render(<TrendChart {...GAPS} />);
    const scale = trendYScale({
      values: [...JVM_GAP_SECONDS, ...IOS_GAP_SECONDS].filter((v): v is number => v !== null),
      zero: false,
      percent: false,
      integer: false,
      steps: 3,
    });
    expect(parts(container, 'y-label').map((label) => label.textContent)).toEqual(
      scale.ticks.map((tick) => formatTrendValue(tick, 'sec')),
    );
  });

  it('reads "Not run" in the tooltip, in --ink-3 at 400, with no hover dot for that series', () => {
    const { container, getByRole } = render(<TrendChart {...GAPS} />);
    const surface = surfaceOf(container);
    fireEvent.focus(surface);
    for (let i = 0; i < 6; i++) fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    const panel = getByRole('status').querySelector('[data-part="tooltip"]');
    expect(panel?.textContent).toBe('6 runs agojvm0.42 sios-simNot run');
    expect(has(panel?.querySelector('[data-part="not-run"]'), 'tipNotRun')).toBe(true);
    expect(parts(container, 'hover-dot').map((dot) => dot.getAttribute('stroke'))).toEqual([
      'var(--ink)',
    ]);
    expect(ruleFor(CSS, '.tipNotRun')).toEqual({ color: 'var(--ink-3)', 'font-weight': '400' });
  });

  it('reads "Not run" in the table, in --ink-3 at 400', () => {
    const { getByRole } = render(<TrendChart {...GAPS} />);
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    const rows = within(getByRole('table')).getAllByRole('row').slice(1);
    expect(rows[0]?.textContent).toBe('Latest0.41 s0.63 s');
    expect(rows[3]?.textContent).toBe('3 runs ago0.44 sNot run');
    const [, , cell] = [...(rows[3]?.children ?? [])];
    expect(has(cell, 'notRun')).toBe(true);
    expect(ruleFor(CSS, '.table .notRun')).toEqual({ color: 'var(--ink-3)', 'font-weight': '400' });
  });

  it('draws no mark on a run the primary series has no value for', () => {
    const { container } = render(
      <TrendChart
        {...GAPS}
        series={[{ name: 'ios-sim', values: IOS_GAP_SECONDS }]}
        marks={[
          { index: 2, status: 'fail' },
          { index: 4, status: 'fail' },
        ]}
      />,
    );
    expect(parts(container, 'mark')).toHaveLength(1);
  });
});

describe('TrendChart table', () => {
  it('opens and closes from a 44 px secondary button under the chart', () => {
    const { getByRole, queryByRole } = render(<TrendChart {...PASS_RATE} />);
    const button = getByRole('button', { name: 'Show table' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('data-variant')).toBe('secondary');
    expect(queryByRole('table')).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe('Hide table');
    const table = getByRole('table');
    expect(button.getAttribute('aria-controls')).toBe(table.parentElement?.id);

    fireEvent.click(button);
    expect(queryByRole('table')).toBeNull();
    expect(ruleFor(CSS, '.toggle')).toMatchObject({
      display: 'flex',
      'justify-content': 'flex-end',
      'margin-top': '8px',
    });
  });

  it('lists the points newest first with exact values under each series', () => {
    const { getByRole } = render(<TrendChart {...DURATION} />);
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    const table = getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Run', 'jvm', 'ios-sim']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(30);
    expect(rows[0]?.textContent).toBe('Latest0.38 s0.63 s');
    expect(rows[29]?.textContent).toBe('29 runs ago0.40 s0.64 s');
  });

  it('uses the point labels when there are some', () => {
    const { getByRole } = render(<TrendChart {...COVERAGE} />);
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    const rows = within(getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'Sep 2192.0%',
      'Sep 1291.3%',
      'Sep 389.7%',
      'Aug 2586.2%',
      'Aug 1681.4%',
      'Aug 776.1%',
      'Jul 2969.8%',
      'Jul 2064.3%',
      'Jul 1157.9%',
      'Jul 252.6%',
    ]);
  });

  it('scrolls inside a 320 px box, keyboard reachable, with a sticky header', () => {
    const { getByRole } = render(<TrendChart {...PASS_RATE} />);
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    const region = getByRole('region', { name: 'Pass rate, table' });
    expect(region.tabIndex).toBe(0);
    expect(has(region, 'tableWrap')).toBe(true);
    expect(ruleFor(CSS, '.tableWrap')).toMatchObject({
      'max-height': '320px',
      overflow: 'auto',
      'margin-top': '8px',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-md)',
    });
    expect(ruleFor(CSS, '.table')).toMatchObject({
      width: '100%',
      'border-collapse': 'collapse',
      'font-size': '14px',
      'font-variant-numeric': 'tabular-nums',
    });
    expect(ruleFor(CSS, '.table thead th')).toMatchObject({
      position: 'sticky',
      top: '0px',
      background: 'var(--surface)',
      'text-align': 'left',
      padding: '10px 14px',
      'border-bottom': '1px solid var(--line)',
      font: '600 12px var(--font-mono)',
      'letter-spacing': '0.04em',
      color: 'var(--ink-3)',
    });
    // Rows are 44 px tall (design v9 item 1).
    expect(ruleFor(CSS, '.table tbody th, .table tbody td')).toMatchObject({
      padding: '0px 14px',
      height: '44px',
      'box-sizing': 'border-box',
      'vertical-align': 'middle',
      'border-bottom': '1px solid var(--line)',
      color: 'var(--ink)',
      'text-align': 'left',
      'font-weight': '400',
    });
    expect(ruleFor(CSS, '.table .value')).toMatchObject({
      'text-align': 'right',
      'font-weight': '600',
      'white-space': 'nowrap',
    });
  });
});

describe('TrendChart one point', () => {
  const ONE: TrendChartProps = { ...TESTS, series: [{ name: 'Tests', values: [322] }] };

  it('shows the value, one dot and the one-run text in a dashed frame, with no axes', () => {
    const { container, queryByRole } = render(<TrendChart {...ONE} />);
    const frame = container.querySelector('[data-part="one-point"]');
    expect(frame?.textContent).toBe('322One run so far. The trend appears after the next run.');
    expect(has(frame, 'single')).toBe(true);
    expect(container.querySelector('svg')).toBeNull();
    expect(queryByRole('button')).toBeNull();
    expect(queryByRole('img')).toBeNull();
    expect(ruleFor(CSS, '.single')).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '10px',
      'border-radius': 'var(--radius-md)',
      border: '1px dashed var(--line-strong)',
    });
    expect(ruleFor(CSS, '.singleValue')).toMatchObject({
      font: '600 var(--chart-value) var(--font-sans)',
      color: 'var(--ink)',
    });
    expect(ruleFor(CSS, '.singleDot')).toMatchObject({
      width: '9px',
      height: '9px',
      'border-radius': '50%',
      background: 'var(--ink)',
    });
    expect(ruleFor(CSS, '.singleText')).toMatchObject({
      'font-size': '14px',
      color: 'var(--ink-2)',
      'text-align': 'center',
      padding: '0px 16px',
    });
  });

  // Undesigned: tp-charts.js has no value to print for a lone point that is missing, and "0"
  // would be a false figure, so the frame keeps only the one-run text (docs/spec.md 13.2).
  it('prints no value or dot for a single point that has no value', () => {
    const { container } = render(
      <TrendChart {...ONE} series={[{ name: 'Tests', values: [null] }]} />,
    );
    const frame = container.querySelector('[data-part="one-point"]');
    expect(frame?.textContent).toBe('One run so far. The trend appears after the next run.');
    expect(container.querySelector(`.${styles.singleValue}`)).toBeNull();
    expect(container.querySelector(`.${styles.singleDot}`)).toBeNull();
  });

  it('is 250 px tall on desktop and 200 px on a phone', () => {
    const { container, unmount } = render(<TrendChart {...ONE} />);
    expect(container.querySelector<HTMLElement>('[data-part="one-point"]')?.style.height).toBe(
      '250px',
    );
    unmount();
    chartWidth = 342;
    const phone = render(<TrendChart {...ONE} />);
    expect(
      phone.container.querySelector<HTMLElement>('[data-part="one-point"]')?.style.height,
    ).toBe('200px');
  });
});

describe('TrendChart empty, loading and error', () => {
  it('empty: "No runs yet" in a dashed frame, and no table', () => {
    const { container, queryByRole } = render(
      <TrendChart {...PASS_RATE} caption={null} series={[{ name: 'Pass rate', values: [] }]} />,
    );
    const frame = container.querySelector('[data-part="empty"]');
    expect(frame?.textContent).toBe('No runs yet');
    expect(has(frame, 'frame')).toBe(true);
    expect(queryByRole('button')).toBeNull();
    expect(ruleFor(CSS, '.frame')).toMatchObject({
      display: 'grid',
      'place-items': 'center',
      'border-radius': 'var(--radius-md)',
      border: '1px dashed var(--line-strong)',
      'font-size': '14px',
      color: 'var(--ink-3)',
    });
  });

  it('loading: a shimmering --raised block that keeps the heading, and no table', () => {
    const { container, getByRole, queryByRole } = render(
      <TrendChart title="Run duration" scope={TREND_SCOPE.duration} loading />,
    );
    expect(getByRole('figure').getAttribute('aria-busy')).toBe('true');
    // Design v4 item 51: the loading container's hidden name.
    expect(getByRole('figure', { name: 'Loading chart' })).toBeTruthy();
    expect(getByRole('heading', { level: 3 }).textContent).toBe('Run duration');
    const block = container.querySelector<HTMLElement>('[data-part="loading"]');
    expect(block?.textContent).toBe('Loading chart…');
    expect(block?.style.animation).toBe('tp-shimmer 1.6s ease-in-out infinite');
    expect(block?.style.height).toBe('250px');
    expect(has(block, 'frame')).toBe(true);
    expect(has(block, 'loading')).toBe(true);
    expect(queryByRole('button')).toBeNull();
    expect(ruleFor(CSS, '.frame.loading')).toMatchObject({
      background: 'var(--raised)',
      border: '0px',
    });
  });

  // Design v5 item 3: the plot area becomes an inset panel inside the chart card.
  it('error: an inset panel in place of the plot, inside the same card, which retries', () => {
    const onRetry = vi.fn();
    const { getByRole, container } = render(
      <TrendChart title="Pass rate" scope={TREND_SCOPE.passRate} error onRetry={onRetry} />,
    );
    const figure = getByRole('figure');
    const alert = within(figure).getByRole('alert');
    expect(has(alert, 'errorPanel')).toBe(true);
    expect(alert.getAttribute('data-variant')).toBeNull();
    expect(alert.style.height).toBe('250px');
    expect(alert.querySelector('[data-part="error-title"]')?.textContent).toBe(
      'Chart couldn’t be loaded',
    );
    expect(alert.querySelector('[data-part="error-text"]')?.textContent).toBe(
      'The rest of the page is still current.',
    );
    const icon = alert.querySelector('svg');
    expect(icon?.getAttribute('width')).toBe('18');
    expect(has(icon, 'errorIcon')).toBe(true);
    // Title and scope stay; caption and "Show table" go.
    expect(within(figure).getByRole('heading', { level: 3 }).textContent).toBe('Pass rate');
    expect(container.querySelector('[data-part="scope"]')?.textContent).toBe(TREND_SCOPE.passRate);
    expect(container.querySelector('[data-part="caption"]')).toBeNull();
    expect(container.querySelector('.recharts-wrapper')).toBeNull();
    const retry = within(alert).getByRole('button', { name: 'Try again' });
    expect(retry.dataset.variant).toBe('secondary');
    expect(within(figure).getAllByRole('button')).toEqual([retry]);
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('error: the panel is the plot’s height, 200 px on a phone', () => {
    chartWidth = 342;
    const { getByRole } = render(
      <TrendChart title="Pass rate" scope={TREND_SCOPE.passRate} error onRetry={() => {}} />,
    );
    expect(getByRole('alert').style.height).toBe('200px');
  });

  it('error: draws the panel as the design does', () => {
    expect(ruleFor(CSS, '.errorPanel')).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '4px',
      padding: '0px 16px',
      'text-align': 'center',
      'border-radius': 'var(--radius-md)',
      background: 'var(--inset)',
      border: '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.errorIcon')).toMatchObject({
      color: 'var(--fail)',
      'margin-bottom': '6px',
    });
    expect(ruleFor(CSS, '.errorTitle')).toMatchObject({
      font: '500 20px var(--font-serif)',
      color: 'var(--ink)',
    });
    expect(ruleFor(CSS, '.errorText')).toMatchObject({
      'font-size': '14px',
      color: 'var(--ink-2)',
    });
    // components.md puts "Try again" 12 px below the text: the 4 px gap plus 8.
    expect(ruleFor(CSS, '.errorRetry')).toMatchObject({ 'margin-top': '8px' });
  });
});

// Design v8 item 48 and v9 item 8 (components.md TrendChart, "sec format"; tp-charts.js msMode).
describe('TrendChart sec format under 10 ms', () => {
  const FAST: TrendChartProps = {
    title: 'Duration',
    scope: TREND_SCOPE.testDuration,
    series: [{ name: 'node', values: [0.002, 0.003, 0.001, 0.004, 0] }],
    format: 'sec',
    unit: 'run',
  };

  it('steps the axis in whole milliseconds when every value is under 10 ms', () => {
    const { container } = render(<TrendChart {...FAST} />);
    const ticks = parts(container, 'y-label').map((tick) => tick.textContent);
    // Lines are fitted with 12% padding, as tp-charts.js fits them, so the axis can reach below 0.
    expect(ticks).toContain('0 ms');
    expect(ticks.every((tick) => /^-?\d+ ms$/.test(tick ?? ''))).toBe(true);
    expect(parts(container, 'value-label').map((label) => label.textContent)).toEqual([
      '2 ms',
      '<1 ms',
    ]);
  });

  it('reads a stored 0 as "<1 ms" in the tooltip and table, the axis at 0 as "0 s"', () => {
    const { container, getByRole } = render(
      <TrendChart {...FAST} series={[{ name: 'node', values: [0.41, 0, 0.38] }]} />,
    );
    expect(parts(container, 'y-label').map((tick) => tick.textContent)).toContain('0 s');
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    const rows = [...getByRole('table').querySelectorAll('tbody tr')].map((row) => row.textContent);
    expect(rows).toEqual(['Latest0.38 s', '1 run ago<1 ms', '2 runs ago0.41 s']);
  });
});

// Design v8 item 32 (components.md TrendChart, "Without JavaScript"): the table stands open in
// place of the plot, with no empty plot and no "Show table" button, which only the client renders.
describe('TrendChart without JavaScript, v8', () => {
  it('hides the held plot area and the "Show table" button when scripting is off', () => {
    const html = renderToStaticMarkup(<TrendChart {...PASS_RATE} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const placeholder = doc.querySelector<HTMLElement>('[data-part="placeholder"]');
    const toggle = doc.querySelector('button')?.parentElement;
    expect(placeholder?.classList.contains(String(styles.scriptOnly))).toBe(true);
    expect(toggle?.classList.contains(String(styles.scriptOnly))).toBe(true);
    expect(ruleFor(CSS, '.scriptOnly', '(scripting: none)')).toEqual({ display: 'none' });
  });
});

// Design v9 item 13 (components.md TrendChart, "Marks"): at most one mark per run, failed or error
// over flaky over empty, on the series of the platform that produced it; a flaky run is an amber
// diamond, the square turned 45°, named "Flaky run".
describe('TrendChart marks, v9', () => {
  const TWO: TrendChartProps = {
    ...DURATION,
    series: [
      { name: 'jvm', values: [0.4, null, 0.42, 0.41] },
      { name: 'ios-sim', values: [0.6, 0.62, 0.61, 0.63], dashed: true },
    ],
  };
  const layout = chartLayout(720, 4, 'line');
  const scaleOf = (props: TrendChartProps) =>
    trendYScale({
      values: ('series' in props ? props.series : [])
        .flatMap((s) => s.values)
        .filter((v): v is number => v !== null),
      percent: false,
      integer: false,
      zero: false,
      steps: 3,
    });

  it('draws a flaky run as an amber diamond turned about its centre', () => {
    const { container } = render(<TrendChart {...TWO} marks={[{ index: 2, status: 'flaky' }]} />);
    const [mark] = parts(container, 'mark');
    const x = xAt(layout, 2);
    const y = yAt(layout, scaleOf(TWO), 0.42);
    expect(mark?.getAttribute('fill')).toBe('var(--attn)');
    expect(mark?.getAttribute('stroke')).toBe('var(--surface)');
    expect(num(mark, 'x')).toBeCloseTo(x - 4, 6);
    expect(num(mark, 'y')).toBeCloseTo(y - 4, 6);
    const [cxText, cyText] = (mark?.getAttribute('transform') ?? '')
      .replace(/^rotate\(45 /, '')
      .replace(/\)$/, '')
      .split(' ');
    expect(mark?.getAttribute('transform')).toMatch(/^rotate\(45 /);
    expect(Number(cxText)).toBeCloseTo(x, 6);
    expect(Number(cyText)).toBeCloseTo(y, 6);
  });

  it('leaves failed and empty squares unturned', () => {
    const { container } = render(
      <TrendChart
        {...TWO}
        marks={[
          { index: 0, status: 'fail' },
          { index: 3, status: 'empty' },
        ]}
      />,
    );
    expect(parts(container, 'mark').map((mark) => mark.getAttribute('transform'))).toEqual([
      null,
      null,
    ]);
  });

  it('sits on its platform’s series, or the first with a value when that has none', () => {
    const { container } = render(
      <TrendChart
        {...TWO}
        marks={[
          { index: 0, status: 'fail', series: 1 },
          { index: 1, status: 'fail', series: 0 },
        ]}
      />,
    );
    const scale = scaleOf(TWO);
    const ys = parts(container, 'mark').map((mark) => num(mark, 'y') + 4);
    expect(ys).toHaveLength(2);
    expect(ys[0]).toBeCloseTo(yAt(layout, scale, 0.6), 6);
    expect(ys[1]).toBeCloseTo(yAt(layout, scale, 0.62), 6);
  });

  it('draws one mark per run, by priority', () => {
    const { container } = render(
      <TrendChart
        {...TWO}
        marks={[
          { index: 2, status: 'empty' },
          { index: 2, status: 'flaky' },
          { index: 2, status: 'fail', series: 1 },
        ]}
      />,
    );
    const marks = parts(container, 'mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute('fill')).toBe('var(--fail)');
  });

  it('names a flaky run "Flaky run" in the tooltip, in amber', () => {
    const { container, getByRole } = render(
      <TrendChart {...TWO} marks={[{ index: 3, status: 'flaky', series: 1 }]} />,
    );
    fireEvent.focus(surfaceOf(container));
    const note = getByRole('status').querySelector('[data-part="tip-mark"]');
    expect(note?.textContent).toBe('Flaky run');
    expect(has(note, 'tipFlaky')).toBe(true);
    expect(ruleFor(CSS, '.tipFlaky')).toEqual({ color: 'var(--attn)' });
  });

  it('names the run’s mark in the tooltip only when the run has one placed', () => {
    const { container, getByRole } = render(
      <TrendChart
        {...TWO}
        series={[
          { name: 'jvm', values: [0.4, 0.41, 0.42, null] },
          { name: 'ios-sim', values: [0.6, 0.62, 0.61, null], dashed: true },
        ]}
        marks={[{ index: 3, status: 'fail' }]}
      />,
    );
    fireEvent.focus(surfaceOf(container));
    expect(getByRole('status').querySelector('[data-part="tip-mark"]')).toBeNull();
  });
});

// Design v9 items 1 and 2 (components.md TrendChart, "Table" and "Row links"): a When column of
// each run's finish time, and the Run cell linking to the run's page; imported history has no run
// page and reads as plain text.
describe('TrendChart table, v9', () => {
  const WHENS = [
    '2025-12-12T04:37:00.000Z',
    '2026-09-21T05:37:00.000Z',
    '2026-09-22T06:37:00.000Z',
    '2026-09-23T07:37:00.000Z',
  ];
  const LINKED: TrendChartProps = {
    title: 'Pass rate',
    scope: TREND_SCOPE.passRate,
    series: [{ name: 'Pass rate', values: [100, 99.3, null, 100] }],
    format: 'pct',
    unit: 'run',
    whens: WHENS,
    hrefs: [null, '/p/ostomate2/runs/r1', '/p/ostomate2/runs/r2', '/p/ostomate2/runs/r3'],
    nowYear: 2026,
  };

  const openTable = (props: TrendChartProps) => {
    const view = render(<TrendChart {...props} />);
    fireEvent.click(view.getByRole('button', { name: 'Show table' }));
    return view.getByRole('table');
  };

  it('heads the columns Run, When, then each series', () => {
    const table = openTable(LINKED);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Run', 'When', 'Pass rate']);
  });

  it('gives each run its finish time in a <time>, date and time as two pieces', () => {
    const table = openTable(LINKED);
    const times = [...table.querySelectorAll('tbody time')];
    expect(times.map((time) => time.getAttribute('datetime'))).toEqual([...WHENS].reverse());
    expect(times.map((time) => time.getAttribute('title'))).toEqual([
      '23 Sep 2026, 07:37 UTC',
      '22 Sep 2026, 06:37 UTC',
      '21 Sep 2026, 05:37 UTC',
      '12 Dec 2025, 04:37 UTC',
    ]);
    expect([...(times[0]?.children ?? [])].map((piece) => piece.textContent)).toEqual([
      '23 Sep,',
      '07:37 UTC',
    ]);
    expect([...(times[3]?.children ?? [])].map((piece) => piece.textContent)).toEqual([
      '12 Dec 2025,',
      '04:37 UTC',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'Latest23 Sep,07:37 UTC100.0%',
      '1 run ago22 Sep,06:37 UTCNot run',
      '2 runs ago21 Sep,05:37 UTC99.3%',
      '3 runs ago12 Dec 2025,04:37 UTC100.0%',
    ]);
  });

  it('links the Run cell to the run’s page, and leaves imported history plain', () => {
    const table = openTable(LINKED);
    const rows = within(table).getAllByRole('row').slice(1);
    const links = rows.map((row) => row.querySelector('th a'));
    expect(links.map((link) => link?.getAttribute('href') ?? null)).toEqual([
      '/p/ostomate2/runs/r3',
      '/p/ostomate2/runs/r2',
      '/p/ostomate2/runs/r1',
      null,
    ]);
    expect(within(table).getByRole('link', { name: 'Latest' })).toBe(links[0]);
    links.slice(0, 3).forEach((link) => expect(has(link, 'runLink')).toBe(true));
    const plain = rows[3]?.querySelector('th span');
    expect(plain?.textContent).toBe('3 runs ago');
    expect(has(plain, 'runText')).toBe(true);
    // Only a linked row takes the hover.
    expect(rows.map((row) => has(row, 'linked'))).toEqual([true, true, true, false]);
    rows.forEach((row) => expect(has(row.querySelector('th'), 'runCell')).toBe(true));
    rows.forEach((row) => expect(has(row.children[1], 'when')).toBe(true));
  });

  it('dashes a run with no finish time, and drops the When column with no times at all', () => {
    let table = openTable({ ...LINKED, whens: [WHENS[0] ?? '', '', ...WHENS.slice(2)] });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[2]?.children[1]?.textContent).toBe('—');
    expect(has(rows[2]?.children[1], 'whenNone')).toBe(true);
    cleanup();
    table = openTable({ ...LINKED, whens: undefined, hrefs: undefined });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Run', 'Pass rate']);
    expect(table.querySelector('a')).toBeNull();
  });

  it('has no When column for bars: the Day column is the date', () => {
    const table = openTable({
      ...RUNS_PER_DAY_CHART,
      whens: Array.from({ length: 30 }, () => WHENS[1] ?? ''),
      nowYear: 2026,
    });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Day (UTC)', 'Runs']);
  });

  it('server-renders the same table, When and links included, without JavaScript', () => {
    const html = renderToStaticMarkup(<TrendChart {...LINKED} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [...doc.querySelectorAll('noscript table tbody tr')];
    expect(rows.map((row) => row.querySelector('a')?.getAttribute('href') ?? null)).toEqual([
      '/p/ostomate2/runs/r3',
      '/p/ostomate2/runs/r2',
      '/p/ostomate2/runs/r1',
      null,
    ]);
    expect(rows[0]?.querySelector('time')?.getAttribute('datetime')).toBe(WHENS[3]);
  });

  it('styles the link, its hover and focus, the plain text and the When cell as drawn', () => {
    expect(ruleFor(CSS, '.table .runCell')).toEqual({ padding: '0px', 'white-space': 'nowrap' });
    expect(ruleFor(CSS, '.runLink, .runText')).toEqual({
      display: 'flex',
      'align-items': 'center',
      'min-height': '44px',
      padding: '0px 14px',
    });
    expect(ruleFor(CSS, '.runLink')).toEqual({
      color: 'var(--ink)',
      'font-weight': '500',
      'text-decoration': 'none',
    });
    expect(ruleFor(CSS, '.runText')).toEqual({ color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.linked:hover')).toEqual({ background: 'var(--raised)' });
    expect(ruleFor(CSS, '.linked:hover .runLink')).toEqual({
      'text-decoration': 'underline',
      'text-decoration-color': 'currentcolor',
    });
    expect(ruleFor(CSS, '.runLink:focus-visible')).toEqual({
      outline: '2px solid var(--ink)',
      'outline-offset': '-2px',
      'border-radius': '6px',
    });
    expect(ruleFor(CSS, '.table .when')).toEqual({ color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.table .whenNone')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.whenTime')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'column-gap': '4px',
    });
    expect(ruleFor(CSS, '.whenTime > span')).toEqual({ 'white-space': 'nowrap' });
  });

  it('is compact below 560 px wide: 13 px, cells padded 0 6, When on two lines', () => {
    expect(ruleFor(CSS, '.body')).toMatchObject({ 'container-type': 'inline-size' });
    const narrow = '(width < 560px)';
    expect(ruleFor(CSS, '.table', narrow)).toEqual({ 'font-size': '13px' });
    expect(ruleFor(CSS, '.table thead th', narrow)).toEqual({ padding: '10px 6px' });
    expect(ruleFor(CSS, '.table tbody th, .table tbody td', narrow)).toEqual({
      padding: '0px 6px',
    });
    expect(ruleFor(CSS, '.table .runCell', narrow)).toEqual({ padding: '0px' });
    expect(ruleFor(CSS, '.runLink, .runText', narrow)).toEqual({ padding: '0px 6px' });
    expect(ruleFor(CSS, '.whenTime', narrow)).toEqual({
      'flex-direction': 'column',
      'line-height': '1.3',
    });
  });
});

// Design v8 item 17, answered by v9 item 18 (components.md TrendChart, gapLabels): a series can
// name its missing values; Test History says "Skipped" where the platform's result was skipped.
describe('TrendChart gap labels', () => {
  const SKIPS: TrendChartProps = {
    ...DURATION,
    series: [
      { name: 'jvm', values: [0.4, null, null, 0.41], gapLabels: [null, 'Skipped', null, null] },
      { name: 'ios-sim', values: [0.6, 0.62, 0.61, 0.63], dashed: true },
    ],
  };

  it('reads the gap’s label in the table, "Not run" where it has none', () => {
    const { getByRole } = render(<TrendChart {...SKIPS} />);
    fireEvent.click(getByRole('button', { name: 'Show table' }));
    const rows = within(getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'Latest0.41 s0.63 s',
      '1 run agoNot run0.61 s',
      '2 runs agoSkipped0.62 s',
      '3 runs ago0.40 s0.60 s',
    ]);
    expect(has(rows[2]?.children[1], 'notRun')).toBe(true);
  });

  it('reads it in the tooltip too', () => {
    const { container, getByRole } = render(<TrendChart {...SKIPS} />);
    const surface = surfaceOf(container);
    fireEvent.focus(surface);
    fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    fireEvent.keyDown(surface, { key: 'ArrowLeft' });
    expect(getByRole('status').querySelector('[data-part="tooltip"]')?.textContent).toBe(
      '2 runs agojvmSkippedios-sim0.62 s',
    );
  });
});

// From the Phase 5 design review, on the seed (lib/seed/plan.ts): y labels that were clipped at the
// left edge or read twice. The browser measures each drawn label with getComputedTextLength, which
// counts the tabular figures the axis uses; jsdom has none, so this stand-in gives every character
// charWidth, as the canvas stand-in above does.
describe('TrendChart y labels', () => {
  // Ostomate2's "Line coverage, shared" over its 21 runs on main, as the seeded page sends it.
  const SHARED: TrendChartProps = {
    title: 'Line coverage, shared',
    scope: TREND_SCOPE.coverage,
    series: [
      {
        name: 'shared',
        values: [
          93.2,
          ...Array<number>(12).fill(93.3),
          ...Array<number>(8).fill(93.26530612244898),
        ],
      },
    ],
    floor: 91,
    format: 'pct',
    unit: 'run',
  };

  beforeEach(() => {
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value(this: SVGElement) {
        return (this.textContent?.length ?? 0) * charWidth;
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
  });

  it('widens the left margin at phone width so "92.5%" is not cut to "2.5%"', () => {
    chartWidth = 342;
    // "92.5%" is 40 px here: 8 + 40 = 48, past the phone's 44.
    charWidth = 8;
    const { container } = render(<TrendChart {...SHARED} />);
    const ticks = parts(container, 'y-label');
    expect(ticks.map((tick) => tick.textContent)).toEqual(['90%', '92.5%', '95%']);
    ticks.forEach((tick) => {
      expect(num(tick, 'x')).toBe(40);
      expect(num(tick, 'x') - (tick.textContent?.length ?? 0) * charWidth).toBeGreaterThanOrEqual(
        0,
      );
    });
    expect(num(parts(container, 'end-dot')[0], 'cx')).toBe(48);
  });

  it('keeps the 44 px phone margin when every label fits it', () => {
    chartWidth = 342;
    charWidth = 7;
    const { container } = render(<TrendChart {...SHARED} />);
    expect(num(parts(container, 'y-label')[0], 'x')).toBe(36);
    expect(num(parts(container, 'end-dot')[0], 'cx')).toBe(44);
  });

  // Measuring the labels redraws the plot; the marks must still sit over the dots and the line.
  it('keeps the marks over the dots once the labels are measured', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const all = [...container.querySelectorAll('path.recharts-line-curve, [data-part]')];
    const marks = parts(container, 'mark');
    expect(marks).toHaveLength(2);
    const lastDot = parts(container, 'end-dot')[1];
    marks.forEach((mark) => {
      expect(all.indexOf(mark)).toBeGreaterThan(all.indexOf(lastDot as Element));
    });
  });

  // Ostomate2's "Line coverage, composeApp" over its 21 runs on main, as the seeded page sends it.
  const COMPOSE_APP: TrendChartProps = {
    title: 'Line coverage, composeApp',
    scope: TREND_SCOPE.coverage,
    series: [
      {
        name: 'composeApp',
        values: [
          93.6,
          ...Array<number>(3).fill(93.7),
          ...Array<number>(9).fill(94.3),
          ...Array<number>(8).fill(94.30740037950665),
        ],
      },
    ],
    floor: 93,
    format: 'pct',
    unit: 'run',
  };

  // Design v10 item 13: a start 9.9 px above the floor line meets "floor 93%" both 18 px below
  // its point and 10 px above it, so its label is dropped; the caption states the first value.
  it('drops the first value label when both places meet the floor label', () => {
    const values = [93.2, ...(COMPOSE_APP.series[0]?.values.slice(1) ?? [])];
    const { container } = render(
      <TrendChart {...COMPOSE_APP} series={[{ name: 'composeApp', values }]} />,
    );
    expect(parts(container, 'end-dot')).toHaveLength(2);
    expect(parts(container, 'value-label').map((label) => label.textContent)).toEqual(['94.3%']);
  });

  for (const width of [720, 342]) {
    it(`lifts "93.6%" above its point, off "floor 93%", at ${width} px`, () => {
      chartWidth = width;
      const { container } = render(<TrendChart {...COMPOSE_APP} />);
      const start = parts(container, 'value-label')[0];
      expect(start?.textContent).toBe('93.6%');
      expect(num(start, 'y')).toBeCloseTo(num(parts(container, 'end-dot')[0], 'cy') - 10, 6);
      // The value label is 13 px text and the floor label 12 px, each sitting on its baseline.
      const floor = parts(container, 'floor-label')[0];
      expect(
        num(start, 'y') <= num(floor, 'y') - 12 || num(start, 'y') - 13 >= num(floor, 'y'),
      ).toBe(true);
    });
  }

  // Ostomate2's fromTagsFindsSourceAmongOtherUserTags: 352 ms in each of its 8 seeded CI runs.
  it('never prints two y labels alike for a duration that holds at 0.352 s', () => {
    const { container } = render(
      <TrendChart
        title="Duration"
        scope={TREND_SCOPE.testDuration}
        series={[{ name: 'jvm', values: Array<number>(8).fill(0.352) }]}
        format="sec"
        unit="run"
      />,
    );
    expect(parts(container, 'y-label').map((tick) => tick.textContent)).toEqual([
      '0.34 s',
      '0.35 s',
      '0.36 s',
    ]);
  });
});
