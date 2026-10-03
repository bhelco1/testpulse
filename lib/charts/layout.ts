import { qty } from '../copy/count';
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

// endLabelWidth is the widest last-point value label, measured at 13/600 (design v5 item 6): the
// right margin grows to fit it so "100.0%" is never clipped. Bars have no end labels.
// tickLabelWidth is the widest y label as drawn: the labels end 8 px left of the plot, so the left
// margin grows by what they would lose past the edge, as on a phone, where "92.5%" is wider than
// the 36 px the 44 px margin leaves it (decision 2026-10-02).
export function chartLayout(
  width: number,
  count: number,
  kind: TrendKind,
  endLabelWidth = 0,
  tickLabelWidth = 0,
): ChartLayout {
  const phone = isPhone(width);
  const fit = kind === 'bar' ? 0 : Math.ceil(8 + endLabelWidth + 6);
  return {
    width,
    height: chartHeight(width),
    phone,
    left: Math.max(phone ? 44 : 56, Math.ceil(8 + tickLabelWidth)),
    right: Math.max(phone ? 44 : 60, fit),
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

// The first value label sits below its point, or above it when the point is near the x axis
// (tp-charts.js) or when below it would overlap the floor label, which sits on a baseline 6 px
// above the floor line (decision 2026-10-02). Each text is taken as its font size tall above its
// baseline: 13 px for the value, 12 px for the floor.
export function startLabelDy(layout: ChartLayout, y: number, floorY?: number): number {
  if (y > layout.height - layout.bottom - 20) return -10;
  if (floorY !== undefined) {
    const below = y + 18;
    const floorBaseline = floorY - 6;
    if (below - 13 < floorBaseline && floorBaseline - 12 < below) return -10;
  }
  return 18;
}

// The chart's keyboard model: focus shows the latest point, arrows move, Escape closes.
export function nextIndex(current: number | null, key: string, count: number): number | null {
  if (key === 'Escape') return null;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return current;
  const from = current ?? count - 1;
  return Math.max(0, Math.min(count - 1, from + (key === 'ArrowRight' ? 1 : -1)));
}

const ago = (n: number, unit: TrendUnit) => `${qty(n, unit)} ago`;

// A point's name on the x axis, in the tooltip and in the table: one counting rule for all three
// (design v5 item 2), so the oldest of 30 is "29 runs ago" everywhere.
export function pointLabel(
  index: number,
  count: number,
  labels: readonly string[],
  unit: TrendUnit,
): string {
  const back = count - 1 - index;
  return labels[index] || (back === 0 ? 'Latest' : ago(back, unit));
}
