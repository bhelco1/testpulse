// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { coverageCaption, passRateCaption, TREND_SCOPE } from '../../lib/charts/captions';
import {
  COVERAGE_10,
  DATES,
  IOS_SECONDS,
  JVM_SECONDS,
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

beforeEach(() => {
  chartWidth = 720;
  resize = undefined;
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
  scope: TREND_SCOPE.duration,
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
      'Default branch · CI and imported history',
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

  it('labels the ends of the x axis by runs back when points carry no labels', () => {
    const { container } = render(<TrendChart {...PASS_RATE} />);
    const ticks = parts(container, 'x-label');
    expect(ticks.map((tick) => tick.textContent)).toEqual(['30 runs ago', 'Latest']);
    expect(ticks.map((tick) => tick.getAttribute('text-anchor'))).toEqual(['start', 'end']);
    ticks.forEach((tick) => {
      expect(num(tick, 'y')).toBe(250 - 8);
      expect(has(tick, 'axisText')).toBe(true);
    });
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
    const { container } = render(<TrendChart {...COVERAGE} />);
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('200');
    const ends = parts(container, 'end-dot');
    expect(num(ends[0], 'cx')).toBe(44);
    expect(num(ends[1], 'cx')).toBe(342 - 44);
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
      '30 days ago',
      'Latest',
    ]);
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
    expect(ruleFor(CSS, '.table tbody th, .table tbody td')).toMatchObject({
      padding: '8px 14px',
      'border-bottom': '1px solid var(--line)',
      color: 'var(--ink)',
      'text-align': 'left',
      'font-weight': '400',
    });
    expect(ruleFor(CSS, '.table .value')).toMatchObject({
      'text-align': 'right',
      'font-weight': '600',
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

  it('error: the inline ErrorState in place of the chart, which retries', () => {
    const onRetry = vi.fn();
    const { getByRole, container } = render(
      <TrendChart title="Pass rate" scope={TREND_SCOPE.passRate} error onRetry={onRetry} />,
    );
    const alert = getByRole('alert');
    expect(alert.getAttribute('data-variant')).toBe('inline');
    expect(alert.textContent).toContain('Chart couldn’t be loaded');
    expect(alert.textContent).toContain('The rest of the page is still current.');
    expect(container.querySelector('.recharts-wrapper')).toBeNull();
    expect(container.querySelector('[data-part="caption"]')).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
