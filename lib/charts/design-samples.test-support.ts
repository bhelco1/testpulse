// The sample series the design bundle draws its charts from (design/pages/Design System.dc.html
// and Project Page.dc.html), so tests can check results against what the design shows.

export const DATES = [
  'Jul 2',
  'Jul 11',
  'Jul 20',
  'Jul 29',
  'Aug 7',
  'Aug 16',
  'Aug 25',
  'Sep 3',
  'Sep 12',
  'Sep 21',
];

// Line coverage, shared: 10 runs against a 91% floor.
export const COVERAGE_10 = [52.6, 57.9, 64.3, 69.8, 76.1, 81.4, 86.2, 89.7, 91.3, 92.0];

// Pass rate per run: runs 12 and 24 each had one failure.
export const PASS_RATE_30 = Array.from({ length: 30 }, (_, i) =>
  i === 11 || i === 23 ? 99.3 : 100,
);

// Tests per run, growing in steps.
export const TESTS_30 = [118, 124, 131, 137, 142].flatMap((count) => Array<number>(6).fill(count));

// rendersToday duration on two platforms, in seconds.
export const JVM_SECONDS = Array.from({ length: 30 }, (_, i) =>
  Number((0.4 + Math.sin(i * 1.7) * 0.02).toFixed(3)),
);
export const IOS_SECONDS = Array.from({ length: 30 }, (_, i) =>
  Number((0.61 + Math.cos(i * 0.9) * 0.03).toFixed(3)),
);

// Runs per UTC day over 30 days.
export const RUNS_PER_DAY = Array.from(
  { length: 30 },
  (_, i) => ([0, 1, 2, 1, 0, 3, 1][i % 7] ?? 0) + (i % 11 === 0 ? 2 : 0),
);

// Ostomate2 and routeserve run durations, in whole seconds.
export const OSTOMATE2_RUN_SECONDS = [
  24, 25, 24, 26, 25, 27, 26, 25, 28, 26, 27, 25, 29, 27, 26, 28, 31, 27, 26, 28, 27, 26, 28, 27,
  29, 26, 28, 27, 26, 27,
];
export const ROUTESERVE_RUN_SECONDS = [
  27, 28, 27, 29, 28, 27, 30, 28, 29, 27, 28, 31, 29, 28, 27, 29, 28, 30, 29, 28, 27, 29, 30, 28,
  29, 28, 30, 29, 28, 29,
];
