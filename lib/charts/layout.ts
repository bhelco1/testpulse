import type { YScale } from './scale';

export type TrendKind = 'line' | 'bar';
export type TrendUnit = 'run' | 'day';

// The chart laid out in real pixels at its measured width, as the design's tp-charts.js does:
// the text never scales, so narrower charts get fewer labels rather than smaller ones.
export interface ChartLayout {
  width: number;
  height: number;
  phone: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  count: number;
  kind: TrendKind;
}

export const PHONE_BELOW = 560;
const TOOLTIP_WIDTH = 180;

const isPhone = (width: number) => width > 0 && width < PHONE_BELOW;

// Before the width is measured (and on the server) the desktop height holds the space.
export function chartHeight(width: number): number {
  return isPhone(width) ? 200 : 250;
}

export function chartLayout(width: number, count: number, kind: TrendKind): ChartLayout {
  const phone = isPhone(width);
  return {
    width,
    height: chartHeight(width),
    phone,
    left: phone ? 44 : 56,
    right: phone ? 44 : 60,
    top: 22,
    bottom: 30,
    count,
    kind,
  };
}

const plotWidth = (layout: ChartLayout) => layout.width - layout.left - layout.right;

// Lines run edge to edge of the plot; bars sit in the middle of equal day slots.
export function xAt(layout: ChartLayout, index: number): number {
  if (layout.kind === 'bar')
    return layout.left + ((index + 0.5) * plotWidth(layout)) / layout.count;
  return layout.left + (index * plotWidth(layout)) / (layout.count - 1);
}

export function yAt(layout: ChartLayout, scale: YScale, value: number): number {
  const plotHeight = layout.height - layout.top - layout.bottom;
  return layout.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
}

export function barWidth(layout: ChartLayout): number {
  return Math.max(2, (plotWidth(layout) / layout.count) * 0.62);
}

export function xTickIndices(count: number, phone: boolean, labelled: boolean): number[] {
  const last = count - 1;
  const indices =
    phone || !labelled ? [0, last] : [0, Math.round(last / 3), Math.round((last * 2) / 3), last];
  return [...new Set(indices)];
}

export function showsIntermediateDots(count: number, phone: boolean): boolean {
  return count <= 12 && !phone;
}

export function nearestIndex(layout: ChartLayout, x: number): number {
  let best = 0;
  for (let i = 1; i < layout.count; i++) {
    if (Math.abs(xAt(layout, i) - x) < Math.abs(xAt(layout, best) - x)) best = i;
  }
  return best;
}

export function tooltipLeft(layout: ChartLayout, index: number): number {
  return Math.min(
    Math.max(xAt(layout, index) - TOOLTIP_WIDTH / 2, 0),
    layout.width - TOOLTIP_WIDTH,
  );
}

// The first value label sits below its point, or above it when the point is near the x axis.
export function startLabelDy(layout: ChartLayout, y: number): number {
  return y > layout.height - layout.bottom - 20 ? -10 : 18;
}

// The chart's keyboard model: focus shows the latest point, arrows move, Escape closes.
export function nextIndex(current: number | null, key: string, count: number): number | null {
  if (key === 'Escape') return null;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return current;
  const from = current ?? count - 1;
  return Math.max(0, Math.min(count - 1, from + (key === 'ArrowRight' ? 1 : -1)));
}

const ago = (n: number, unit: TrendUnit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

// A point's name in the tooltip and the table.
export function pointLabel(
  index: number,
  count: number,
  labels: readonly string[],
  unit: TrendUnit,
): string {
  const back = count - 1 - index;
  return labels[index] || (back === 0 ? 'Latest' : ago(back, unit));
}

// An x-axis label. Without labels the ends read as the span covered and "Latest".
export function axisLabel(
  index: number,
  position: 'first' | 'middle' | 'last',
  count: number,
  labels: readonly string[],
  unit: TrendUnit,
): string {
  if (labels[index]) return labels[index];
  if (position === 'first') return ago(count, unit);
  return position === 'last' ? 'Latest' : '';
}
