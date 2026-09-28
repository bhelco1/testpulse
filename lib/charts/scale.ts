export interface YScale {
  min: number;
  max: number;
  ticks: number[];
}

export interface TrendScaleInput {
  // Every point of every series.
  values: readonly number[];
  floor?: number;
  // Start at zero: bars, and counts that must read as amounts.
  zero: boolean;
  percent: boolean;
  // The values print as whole numbers, so a fractional tick would repeat its neighbour's label.
  integer: boolean;
  // How many steps the axis is divided into: 3 on desktop, 2 on a phone.
  steps: number;
}

const MULTIPLES = [1, 2, 2.5, 5, 10];
// Values printed as whole numbers never step by 2.5 × 10ⁿ (design v5 item 5).
const WHOLE_MULTIPLES = [1, 2, 5, 10];
const MAX_TICKS = 20;
// Tick arithmetic in tenths or hundredths drifts (0.1 * 3 is 0.30000000000000004).
const tidy = (n: number) => Number(n.toFixed(6));

export function niceScale(
  lo: number,
  hi: number,
  steps: number,
  { percent, integer, zero = false }: { percent: boolean; integer: boolean; zero?: boolean },
): YScale {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) {
    // A zero-based chart, or a lone zero, opens upwards: all zeros read 0…1, never -1…1.
    if (zero || lo === 0) {
      lo = Math.max(0, lo);
      hi = lo + 1;
    } else {
      hi = lo + 1;
      lo = lo - 1;
    }
  }
  const raw = (hi - lo) / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fits = (integer ? WHOLE_MULTIPLES : MULTIPLES)
    .map((m) => m * magnitude)
    .find((step) => step >= raw);
  const found = fits ?? 10 * magnitude;
  const step = integer ? Math.max(1, Math.round(found)) : found;
  let min = tidy(Math.floor(lo / step) * step);
  let max = tidy(Math.ceil(hi / step) * step);
  if (percent) {
    min = Math.max(0, min);
    max = Math.min(100, max);
  }
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9 && ticks.length < MAX_TICKS; v += step) ticks.push(tidy(v));
  return { min, max, ticks };
}

// Lines are fitted to the data and floor with 12% padding (at least 1 point for percentages);
// zero-based charts run from 0. Spec 13.1 and the design's tp-charts.js.
export function trendYScale({
  values,
  floor,
  zero,
  percent,
  integer,
  steps,
}: TrendScaleInput): YScale {
  const all = floor === undefined ? values : [...values, floor];
  let lo = zero ? 0 : Math.min(...all);
  let hi = Math.max(...all);
  if (!zero) {
    const pad = Math.max((hi - lo) * 0.12, percent ? 1 : (hi || 1) * 0.02);
    lo -= pad;
    hi += pad;
  }
  return niceScale(lo, hi, steps, { percent, integer, zero });
}
