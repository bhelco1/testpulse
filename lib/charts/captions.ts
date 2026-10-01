import { qty } from '../copy/count';
import { formatTrendValue } from './format';

// The line under each chart title naming which runs it reads (spec section 11,
// design/components.md "Scope line"). The project page's per-run charts cover the last 30
// default-branch runs their source rule admits (design v7 item 5); testDuration is Test
// History's duration chart.
export const TREND_SCOPE = {
  passRate: 'Default branch · last 30 runs · CI and imported history',
  testCount: 'Default branch · last 30 CI runs',
  coverage: 'Default branch · last 30 runs · CI and imported history',
  duration: 'Default branch · last 30 CI runs (imported history has no durations)',
  testDuration: 'Default branch · last 30 CI runs (imported history has no durations)',
  runsPerDay: 'Default branch · CI and imported history',
} as const;

// Captions follow the templates in design/components.md, oldest point first in every input. A
// null is a run with no value, a gap in the line: n counts only the runs with a value, and first
// and last are the first and last of those (design v8 item 34). With fewer than two there is no
// caption: the chart's one-run text says it instead. Counts are then two or more, so only the
// runs-per-day total can be singular.

const present = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null);

const NO_TESTS = 'The latest run had no tests.';
const ALL_SKIPPED = 'The latest run’s tests were all skipped.';

const withSuffix = (text: string, suffix: string | null) =>
  suffix === null ? text : `${text} ${suffix}`;

export function passRateCaption(
  rates: readonly (number | null)[],
  failedRuns: number,
  // The latest run had tests but none passed or failed (v9 item 11), rather than none at all.
  { latestAllSkipped = false }: { latestAllSkipped?: boolean } = {},
): string | null {
  const counted = present(rates);
  const latest = rates.at(-1);
  if (counted.length < 2 || latest === undefined) return null;
  const n = counted.length;
  const suffix = latest !== null ? null : latestAllSkipped ? ALL_SKIPPED : NO_TESTS;
  if (failedRuns === 0) return withSuffix(`All ${n} runs passed.`, suffix);
  // "{latest}% on the latest run" has no figure when the latest run has no rate, and the design
  // gives no other sentence: held back rather than give an older run's rate as the latest.
  if (latest === null) return null;
  return (
    `${formatTrendValue(latest, 'pct')} on the latest run. ` +
    `${failedRuns} of the last ${n} runs failed.`
  );
}

export function testCountCaption(counts: readonly (number | null)[]): string | null {
  const counted = present(counts);
  const first = counted[0];
  const last = counted.at(-1);
  if (counted.length < 2 || first === undefined || last === undefined) return null;
  const n = counted.length;
  const suffix = counts.at(-1) === null ? NO_TESTS : null;
  const [from, to] = [formatTrendValue(first, 'int'), formatTrendValue(last, 'int')];
  if (last > first)
    return withSuffix(`Grew from ${from} to ${to} over the last ${n} runs.`, suffix);
  if (last < first)
    return withSuffix(`Fell from ${from} to ${to} over the last ${n} runs.`, suffix);
  return withSuffix(`Held at ${to} for the last ${n} runs.`, suffix);
}

export function coverageCaption(
  pcts: readonly (number | null)[],
  // Null for a module with no floor, which the coverage card draws without one (v8 item 15).
  floor: number | null,
  // The latest run was empty, so its gap is "no tests"; a run that had tests and sent no coverage
  // for the module has no sentence the design gives.
  { latestEmpty = false }: { latestEmpty?: boolean } = {},
): string | null {
  const counted = present(pcts);
  const first = counted[0];
  const last = counted.at(-1);
  if (counted.length < 2 || first === undefined || last === undefined) return null;
  // Compared as displayed, at one decimal (design v5 item 1).
  const [from, to] = [formatTrendValue(first, 'pct', true), formatTrendValue(last, 'pct', true)];
  const n = counted.length;
  const moved =
    from === to
      ? `Held at ${to} over ${n} runs`
      : `${last > first ? 'Rose' : 'Fell'} from ${from} to ${to} over ${n} runs`;
  const against =
    floor === null
      ? `${moved}.`
      : `${moved}; ${last < floor ? 'below' : 'above'} its ${formatTrendValue(floor, 'pct')} floor.`;
  return withSuffix(against, pcts.at(-1) === null && latestEmpty ? NO_TESTS : null);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Callers pass at least one value, so the middle entries exist.
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// One series (a run's duration) gets a median; one test on several platforms has no single one.
// A null is a run with no value, such as a platform that did not run, and is left out of the
// min, max and median (design v7 item 9); n counts the runs with a value on some series (v8
// item 34). A range that is one figure as displayed reads "Held at" (v8 item 48).
export function durationCaption(
  series: readonly (readonly (number | null)[])[],
  format: 'sec' | 'dur',
): string | null {
  const runs = series[0]?.length ?? 0;
  const n = Array.from({ length: runs }, (_, i) => i).filter((i) =>
    series.some((s) => (s[i] ?? null) !== null),
  ).length;
  const all = present(series.flat());
  if (n < 2) return null;
  const [min, max] = [
    formatTrendValue(Math.min(...all), format, true),
    formatTrendValue(Math.max(...all), format, true),
  ];
  if (min === max) return `Held at ${min} over the last ${n} runs.`;
  const range = `Between ${min} and ${max} over the last ${n} runs.`;
  // With one series, all holds its values: at least two.
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
