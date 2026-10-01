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
  IOS_GAP_SECONDS,
  IOS_SECONDS,
  JVM_GAP_SECONDS,
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

  // Design v8 item 34 and v9 item 11 (components.md TrendChart, "Captions with gaps"): n counts
  // only runs with a value, and a latest run with none says why.
  describe('with runs that have no rate', () => {
    it('counts only the runs with a rate', () => {
      expect(passRateCaption([100, null, 100, 100], 0)).toBe('All 3 runs passed.');
      expect(passRateCaption([100, null, 90, 99.3], 1)).toBe(
        '99.3% on the latest run. 1 of the last 3 runs failed.',
      );
    });

    it('says the latest run had no tests when it was empty', () => {
      expect(passRateCaption([100, 100, null], 0)).toBe(
        'All 2 runs passed. The latest run had no tests.',
      );
    });

    it('says the latest run’s tests were all skipped when it had tests but no rate', () => {
      expect(passRateCaption([100, 100, null], 0, { latestAllSkipped: true })).toBe(
        'All 2 runs passed. The latest run’s tests were all skipped.',
      );
    });

    // "{latest}% on the latest run" has no figure to give when the latest run has no rate, and the
    // design writes no sentence for it: held back rather than state an older run's rate as latest.
    it('is held back when a run failed and the latest has no rate', () => {
      expect(passRateCaption([100, 90, null], 1)).toBeNull();
    });

    it('is omitted with fewer than two runs that have a rate', () => {
      expect(passRateCaption([null, 100, null], 0)).toBeNull();
    });
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

  // Design v8 item 34 (components.md TrendChart, "Captions with gaps").
  it('reads first and last from the runs with a count, and counts only those', () => {
    expect(testCountCaption([null, 118, null, 142])).toBe(
      'Grew from 118 to 142 over the last 2 runs.',
    );
    expect(testCountCaption([118, 130, 142, null])).toBe(
      'Grew from 118 to 142 over the last 3 runs. The latest run had no tests.',
    );
    expect(testCountCaption([null, 142, null])).toBeNull();
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
    expect(coverageCaption([92, null], 91)).toBeNull();
  });

  // Design v8 item 34 (components.md TrendChart, "Captions with gaps"): n counts the runs with a
  // value; first and last are the first and last of those.
  it('counts only the runs with a value, from the first to the last of them', () => {
    expect(coverageCaption([null, 90, null, 92, null], 91)).toBe(
      'Rose from 90.0% to 92.0% over 2 runs; above its 91% floor.',
    );
  });

  // "If the latest run has none, append 'The latest run had no tests.'": said only when the
  // latest run was empty. A run with tests that sent no coverage for the module has no sentence:
  // "had no tests" would be false there, and the design gives no other.
  it('says the latest run had no tests only when it was empty', () => {
    expect(coverageCaption([90, 92, null], 91, { latestEmpty: true })).toBe(
      'Rose from 90.0% to 92.0% over 2 runs; above its 91% floor. The latest run had no tests.',
    );
    expect(coverageCaption([90, 92, null], 91)).toBe(
      'Rose from 90.0% to 92.0% over 2 runs; above its 91% floor.',
    );
  });

  // A module with no floor has no floor marker or text on the coverage card (design v8 item 15),
  // so its caption ends with the movement.
  it('says nothing of a floor for a module that has none', () => {
    expect(coverageCaption([40, 45], null)).toBe('Rose from 40.0% to 45.0% over 2 runs.');
    expect(coverageCaption([45, 45], null)).toBe('Held at 45.0% over 2 runs.');
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

  // Design v7 item 9: a run where a platform did not run is left out of min, max and median;
  // v8 item 34: n counts only the runs with a value on some series.
  it('leaves missing values out of the range, the median and the count of runs', () => {
    expect(durationCaption([JVM_GAP_SECONDS, IOS_GAP_SECONDS], 'sec')).toBe(
      'Between 0.39 s and 0.64 s over the last 10 runs.',
    );
    expect(durationCaption([[1, null, 3, 5]], 'dur')).toBe(
      'Between 1 s and 5 s over the last 3 runs. Median 3 s.',
    );
    expect(
      durationCaption(
        [
          [1, null, 3],
          [null, null, 2],
        ],
        'dur',
      ),
    ).toBe('Between 1 s and 3 s over the last 2 runs.');
  });

  // Design v8 item 48 (components.md TrendChart, Duration caption): min = max at display
  // precision reads "Held at".
  it('says the duration held when the range is one figure as displayed', () => {
    expect(durationCaption([[35.604, 35.61, 35.9]], 'dur')).toBe(
      'Held at 36 s over the last 3 runs.',
    );
    expect(durationCaption([[0.068, 0.07, 0.071]], 'sec')).toBe(
      'Held at 0.07 s over the last 3 runs.',
    );
    expect(
      durationCaption(
        [
          [0.002, 0.0024],
          [0.0018, null],
        ],
        'sec',
      ),
    ).toBe('Held at 2 ms over the last 2 runs.');
  });

  it('reads times under 10 ms in whole ms and a stored 0 as "<1 ms" (v9 item 8)', () => {
    expect(
      durationCaption(
        [
          [0.025, 0.026],
          [0.003, 0],
        ],
        'sec',
      ),
    ).toBe('Between <1 ms and 0.03 s over the last 2 runs.');
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
  // Design v5 item 7: test count reads CI runs only. Design v7 item 5: the project page's
  // per-run charts cover the last 30 runs; Test History's duration and runs per day keep theirs.
  it('names the runs each chart reads, as the design words it', () => {
    expect(TREND_SCOPE).toEqual({
      passRate: 'Default branch · last 30 runs · CI and imported history',
      testCount: 'Default branch · last 30 CI runs',
      coverage: 'Default branch · last 30 runs · CI and imported history',
      duration: 'Default branch · last 30 CI runs (imported history has no durations)',
      // Owner decision 2026-09-30: v9's string (components.md, Test history page).
      testDuration: 'Default branch · last 30 CI runs (imported history has no durations)',
      runsPerDay: 'Default branch · CI and imported history',
    });
  });
});
