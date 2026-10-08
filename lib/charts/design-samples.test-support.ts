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

// Ostomate2 and routeserve run durations, in whole seconds. Ostomate2's is design v14's, around
// its live 694 s.
export const OSTOMATE2_RUN_SECONDS = [
  658, 670, 658, 682, 670, 694, 682, 670, 706, 682, 694, 670, 718, 694, 682, 706, 742, 694, 682,
  706, 694, 682, 706, 694, 718, 682, 706, 694, 682, 694,
];
export const ROUTESERVE_RUN_SECONDS = [
  27, 28, 27, 29, 28, 27, 30, 28, 29, 27, 28, 31, 29, 28, 27, 29, 28, 30, 29, 28, 27, 29, 30, 28,
  29, 28, 30, 29, 28, 29,
];

// rendersToday on two platforms over 10 runs, ios-sim not run in three of them: the Design
// System's "LINE · gaps where ios-sim didn’t run" (design v7 item 9).
export const JVM_GAP_SECONDS = [0.41, 0.4, 0.43, 0.42, 0.39, 0.41, 0.44, 0.42, 0.4, 0.41];
export const IOS_GAP_SECONDS = [0.6, 0.62, null, null, 0.63, 0.61, null, 0.64, 0.62, 0.63];
