import { describe, expect, it } from 'vitest';

import {
  coverageCaption,
  durationCaption,
  passRateCaption,
  runsPerDayCaption,
  testCountCaption,
  TREND_SCOPE,
} from './captions';
import {
  COVERAGE_10,
  IOS_SECONDS,
  JVM_SECONDS,
  OSTOMATE2_RUN_SECONDS,
  PASS_RATE_30,
  ROUTESERVE_RUN_SECONDS,
  RUNS_PER_DAY,
  TESTS_30,
} from './design-samples.test-support';

describe('passRateCaption', () => {
  it('gives the latest rate and how many runs failed', () => {
    expect(passRateCaption(PASS_RATE_30, 2)).toBe(
      '100% on the latest run. 2 of the last 30 runs failed.',
    );
    expect(passRateCaption([100, 100, 100, 100, 99.3], 1)).toBe(
      '99.3% on the latest run. 1 of the last 5 runs failed.',
    );
  });

  it('says so when every run passed', () => {
    expect(passRateCaption(Array<number>(30).fill(100), 0)).toBe('All 30 runs passed.');
  });

  it('is omitted with fewer than two runs', () => {
    expect(passRateCaption([100], 0)).toBeNull();
    expect(passRateCaption([], 0)).toBeNull();
  });
});

describe('testCountCaption', () => {
  it('says the count grew, fell or held from the first run to the latest', () => {
    expect(testCountCaption(TESTS_30)).toBe('Grew from 118 to 142 over the last 30 runs.');
    expect(testCountCaption([1012, 1030, 1048])).toBe(
      'Grew from 1,012 to 1,048 over the last 3 runs.',
    );
    expect(testCountCaption([142, 141])).toBe('Fell from 142 to 141 over the last 2 runs.');
    expect(testCountCaption([142, 150, 142])).toBe('Held at 142 for the last 3 runs.');
  });

  it('is omitted with fewer than two runs', () => {
    expect(testCountCaption([322])).toBeNull();
  });
});

describe('coverageCaption', () => {
  it('says which way coverage moved and where it sits against its floor', () => {
    expect(coverageCaption(COVERAGE_10, 91)).toBe(
      'Rose from 52.6% to 92.0% over 10 runs; above its 91% floor.',
    );
    expect(coverageCaption([92, 90.5], 91)).toBe(
      'Fell from 92.0% to 90.5% over 2 runs; below its 91% floor.',
    );
  });

  it('treats coverage at the floor as not below it, as CoverageBar does', () => {
    expect(coverageCaption([90, 91], 91)).toBe(
      'Rose from 90.0% to 91.0% over 2 runs; above its 91% floor.',
    );
  });

  // Design v5 item 1, with the Design System's "coverage held" sample.
  it('says coverage held when it ended where it started', () => {
    expect(coverageCaption([92.0, 91.6, 91.2, 91.8, 92.4, 92.1, 91.7, 91.9, 92.3, 92.0], 91)).toBe(
      'Held at 92.0% over 10 runs; above its 91% floor.',
    );
    expect(coverageCaption([88.5, 90, 88.5], 91)).toBe(
      'Held at 88.5% over 3 runs; below its 91% floor.',
    );
  });

  it('compares first and last at one decimal, as they are displayed', () => {
    // Percentages round down to the tenth (decision 2026-09-29), so 92.09 reads 92.0%.
    expect(coverageCaption([92.01, 92.09], 91)).toBe(
      'Held at 92.0% over 2 runs; above its 91% floor.',
    );
    expect(coverageCaption([92.09, 92.11], 91)).toBe(
      'Rose from 92.0% to 92.1% over 2 runs; above its 91% floor.',
    );
  });

  it('is omitted with fewer than two runs', () => {
    expect(coverageCaption([92], 91)).toBeNull();
  });
});

describe('durationCaption', () => {
  it('gives the range and median of run durations', () => {
    expect(durationCaption([OSTOMATE2_RUN_SECONDS], 'dur')).toBe(
      'Between 24 s and 31 s over the last 30 runs. Median 27 s.',
    );
    expect(durationCaption([ROUTESERVE_RUN_SECONDS], 'dur')).toBe(
      'Between 27 s and 31 s over the last 30 runs. Median 28 s.',
    );
  });

  it('takes the median of the middle two runs when the count is even', () => {
    expect(durationCaption([[1.1, 1.3, 1.2, 1.4]], 'sec')).toBe(
      'Between 1.10 s and 1.40 s over the last 4 runs. Median 1.25 s.',
    );
  });

  it('gives the range across platforms, with no single median, for one test on several', () => {
    expect(durationCaption([JVM_SECONDS, IOS_SECONDS], 'sec')).toBe(
      'Between 0.38 s and 0.64 s over the last 30 runs.',
    );
  });

  it('is omitted with fewer than two runs', () => {
    expect(durationCaption([[0.41]], 'sec')).toBeNull();
    expect(durationCaption([], 'sec')).toBeNull();
  });
});

describe('runsPerDayCaption', () => {
  it('gives the total and the busiest day', () => {
    expect(runsPerDayCaption(RUNS_PER_DAY)).toBe(
      '39 runs in the last 30 days, 3 on the busiest day.',
    );
  });

  it('says run for a single run', () => {
    expect(runsPerDayCaption([0, 1])).toBe('1 run in the last 2 days, 1 on the busiest day.');
  });

  it('counts runs with the site-wide count copy, thousands grouped (design v4 item 50)', () => {
    expect(runsPerDayCaption([600, 600])).toBe(
      '1,200 runs in the last 2 days, 600 on the busiest day.',
    );
  });

  // Design v5 item 5, drawn as "BAR · all zero, 0…1".
  it('says there were no runs when every day is zero', () => {
    expect(runsPerDayCaption([0, 0, 0, 0, 0, 0, 0])).toBe('No runs in the last 7 days.');
  });

  it('is omitted with fewer than two days', () => {
    expect(runsPerDayCaption([4])).toBeNull();
  });
});

describe('TREND_SCOPE', () => {
  // Design v5 item 7: test count reads CI runs only.
  it('names the runs each chart reads, as the design words it', () => {
    expect(TREND_SCOPE).toEqual({
      passRate: 'Default branch · CI and imported history',
      testCount: 'Default branch · CI runs only',
      coverage: 'Default branch · CI and imported history',
      duration: 'Default branch · CI runs only (imported history has no durations)',
      runsPerDay: 'Default branch · CI and imported history',
    });
  });
});
