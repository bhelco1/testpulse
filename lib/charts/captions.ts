import { qty } from '../copy/count';
import { formatTrendValue } from './format';

// The line under each chart title naming which runs it reads (spec section 11).
export const TREND_SCOPE = {
  passRate: 'Default branch · CI and imported history',
  testCount: 'Default branch · CI runs only',
  coverage: 'Default branch · CI and imported history',
  duration: 'Default branch · CI runs only (imported history has no durations)',
  runsPerDay: 'Default branch · CI and imported history',
} as const;

// Captions follow the templates in design/components.md, oldest point first in every input. With
// fewer than two points there is no caption: the chart's one-run text says it instead. Point
// counts are always two or more, so only the runs-per-day total can be singular.

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
  if (pcts.length < 2 || first === undefined || last === undefined) return null;
  // Compared as displayed, at one decimal (design v5 item 1).
  const [from, to] = [formatTrendValue(first, 'pct', true), formatTrendValue(last, 'pct', true)];
  const side = last < floor ? 'below' : 'above';
  const against = `${side} its ${formatTrendValue(floor, 'pct')} floor.`;
  if (from === to) return `Held at ${to} over ${pcts.length} runs; ${against}`;
  const moved = last > first ? 'Rose' : 'Fell';
  return `${moved} from ${from} to ${to} over ${pcts.length} runs; ${against}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Callers pass at least one value, so the middle entries exist.
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const present = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null);

// One series (a run's duration) gets a median; one test on several platforms has no single one.
// A null is a run with no value, such as a platform that did not run, and is left out of the
// min, max and median (design v7 item 9); n still counts every run.
export function durationCaption(
  series: readonly (readonly (number | null)[])[],
  format: 'sec' | 'dur',
): string | null {
  const n = series[0]?.length ?? 0;
  const all = present(series.flat());
  if (n < 2 || all.length === 0) return null;
  const range =
    `Between ${formatTrendValue(Math.min(...all), format, true)} and ` +
    `${formatTrendValue(Math.max(...all), format, true)} over the last ${n} runs.`;
  // With one series, all holds its values: at least one.
  return series.length === 1
    ? `${range} Median ${formatTrendValue(median(all), format, true)}.`
    : range;
}

export function runsPerDayCaption(perDay: readonly number[]): string | null {
  if (perDay.length < 2) return null;
  const total = perDay.reduce((sum, n) => sum + n, 0);
  if (total === 0) return `No runs in the last ${perDay.length} days.`;
  return `${qty(total, 'run')} in the last ${perDay.length} days, ${Math.max(...perDay)} on the busiest day.`;
}
