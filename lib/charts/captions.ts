import { formatTrendValue } from './format';

// The line under each chart title naming which runs it reads (spec section 11).
export const TREND_SCOPE = {
  passRate: 'Default branch · CI and imported history',
  testCount: 'Default branch · CI and imported history',
  coverage: 'Default branch · CI and imported history',
  duration: 'Default branch · CI runs only (imported history has no durations)',
  runsPerDay: 'Default branch · CI and imported history',
} as const;

// Captions follow the templates in design/components.md, oldest point first in every input. With
// fewer than two points there is no caption: the chart's one-run text says it instead.

const runs = (n: number) => `${n} ${n === 1 ? 'run' : 'runs'}`;

export function passRateCaption(rates: readonly number[], failedRuns: number): string | null {
  const latest = rates.at(-1);
  if (rates.length < 2 || latest === undefined) return null;
  if (failedRuns === 0) return `All ${rates.length} runs passed.`;
  return (
    `${formatTrendValue(latest, 'pct')} on the latest run. ` +
    `${failedRuns} of the last ${rates.length} runs failed.`
  );
}

export function testCountCaption(counts: readonly number[]): string | null {
  const first = counts[0];
  const last = counts.at(-1);
  if (counts.length < 2 || first === undefined || last === undefined) return null;
  const n = counts.length;
  const [from, to] = [formatTrendValue(first, 'int'), formatTrendValue(last, 'int')];
  if (last > first) return `Grew from ${from} to ${to} over the last ${n} runs.`;
  if (last < first) return `Fell from ${from} to ${to} over the last ${n} runs.`;
  return `Held at ${to} for the last ${n} runs.`;
}

export function coverageCaption(pcts: readonly number[], floor: number): string | null {
  const first = pcts[0];
  const last = pcts.at(-1);
  // The template has Rose and Fell only; unchanged coverage waits for design copy.
  if (pcts.length < 2 || first === undefined || last === undefined || first === last) return null;
  const moved = last > first ? 'Rose' : 'Fell';
  const side = last < floor ? 'below' : 'above';
  return (
    `${moved} from ${formatTrendValue(first, 'pct', true)} to ${formatTrendValue(last, 'pct', true)} ` +
    `over ${pcts.length} runs; ${side} its ${formatTrendValue(floor, 'pct')} floor.`
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Callers pass at least two values, so both middle entries exist.
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// One series (a run's duration) gets a median; one test on several platforms has no single one.
export function durationCaption(
  series: readonly (readonly number[])[],
  format: 'sec' | 'dur',
): string | null {
  const n = series[0]?.length ?? 0;
  if (n < 2) return null;
  const all = series.flat();
  const range =
    `Between ${formatTrendValue(Math.min(...all), format, true)} and ` +
    `${formatTrendValue(Math.max(...all), format, true)} over the last ${n} runs.`;
  const only = series.length === 1 ? series[0] : undefined;
  return only ? `${range} Median ${formatTrendValue(median(only), format, true)}.` : range;
}

export function runsPerDayCaption(perDay: readonly number[]): string | null {
  if (perDay.length < 2) return null;
  const total = perDay.reduce((sum, n) => sum + n, 0);
  return `${runs(total)} in the last ${perDay.length} days, ${Math.max(...perDay)} on the busiest day.`;
}
