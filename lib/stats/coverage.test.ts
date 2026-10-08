import { describe, expect, it } from 'vitest';

import { latestCoverage, latestCoverageWithLines } from './coverage.ts';
import { countsCoverage, pctCoverage, run } from './records.test-support.ts';

// Spec section 11: "Coverage: Latest lines % per module, plotted against that module's
// coverage_floors value. Lines % is lines_covered / lines_total when the counts are present,
// else lines_pct." Coverage reads backfilled runs as well as CI runs; default branch only.

const floors = { shared: 91, composeApp: 93 };
const options = { defaultBranch: 'main', floors };

describe('latestCoverage', () => {
  it('is empty with no runs or no coverage rows', () => {
    expect(latestCoverage([], [], options)).toEqual([]);
    expect(latestCoverage([run('r1', '2026-10-01T00:00:00Z')], [], options)).toEqual([]);
  });

  it('takes each module from the latest run that reported it, counts first', () => {
    // r2 is latest and reports shared only: 457 / 490 = 93.2653...%. composeApp comes from r1:
    // 497 / 527 = 94.3074...%. Both at or above their floors (91, 93).
    const runs = [run('r1', '2026-10-01T00:00:00Z'), run('r2', '2026-10-02T00:00:00Z')];
    const coverage = [
      countsCoverage('c1', 'r1', 'shared', 400, 490),
      countsCoverage('c2', 'r1', 'composeApp', 497, 527),
      countsCoverage('c3', 'r2', 'shared', 457, 490),
    ];
    expect(latestCoverage(runs, coverage, options)).toEqual([
      { module: 'composeApp', runId: 'r1', pct: (497 / 527) * 100, floor: 93, belowFloor: false },
      { module: 'shared', runId: 'r2', pct: (457 / 490) * 100, floor: 91, belowFloor: false },
    ]);
  });

  // Design v6 item 9: rows are sorted by module key in code-point order, as the database keeps
  // no YAML order. Code points put every capital before every small letter, so "Web" sorts
  // before "apps/backend", which a locale-aware sort would not do.
  it('sorts modules by key in code-point order', () => {
    const runs = [run('r1', '2026-10-01T00:00:00Z')];
    const coverage = ['packages/shared', 'apps/mobile', 'Web', 'apps/backend'].map((module, i) =>
      countsCoverage(`c${i}`, 'r1', module, 1, 2),
    );
    expect(latestCoverage(runs, coverage, options).map((row) => row.module)).toEqual([
      'Web',
      'apps/backend',
      'apps/mobile',
      'packages/shared',
    ]);
  });

  it('falls back to the recorded lines_pct of a backfilled run', () => {
    const runs = [run('bf', '2026-09-22T20:14:18Z', { source: 'backfill' })];
    expect(latestCoverage(runs, [pctCoverage('c1', 'bf', 'shared', 93.3)], options)).toEqual([
      { module: 'shared', runId: 'bf', pct: 93.3, floor: 91, belowFloor: false },
    ]);
  });

  it('prefers a newer CI run over older backfilled history', () => {
    const runs = [
      run('bf', '2026-09-22T20:14:18Z', { source: 'backfill' }),
      run('ci', '2026-10-01T00:00:00Z'),
    ];
    const coverage = [
      pctCoverage('c1', 'bf', 'shared', 93.3),
      countsCoverage('c2', 'ci', 'shared', 450, 500),
    ];
    // 450 / 500 = 90%, under the floor of 91.
    expect(latestCoverage(runs, coverage, options)).toEqual([
      { module: 'shared', runId: 'ci', pct: 90, floor: 91, belowFloor: true },
    ]);
  });

  it('is below floor only strictly under it', () => {
    // 91 / 100 = 91%, exactly the floor: not below. 9_299 / 10_000 = 92.99%, under 93: below.
    const runs = [run('r1', '2026-10-01T00:00:00Z')];
    const coverage = [
      countsCoverage('c1', 'r1', 'shared', 91, 100),
      countsCoverage('c2', 'r1', 'composeApp', 9_299, 10_000),
    ];
    expect(
      latestCoverage(runs, coverage, options).map(({ module, belowFloor }) => [module, belowFloor]),
    ).toEqual([
      ['composeApp', true],
      ['shared', false],
    ]);
  });

  it('gives a module with no floor a null floor, never below it', () => {
    const runs = [run('r1', '2026-10-01T00:00:00Z')];
    expect(latestCoverage(runs, [countsCoverage('c1', 'r1', 'extra', 1, 10)], options)).toEqual([
      { module: 'extra', runId: 'r1', pct: 10, floor: null, belowFloor: false },
    ]);
  });

  it('does not read a floor from the object prototype for a module named like one of its keys', () => {
    const runs = [run('r1', '2026-10-01T00:00:00Z')];
    expect(
      latestCoverage(runs, [countsCoverage('c1', 'r1', 'toString', 1, 2)], options)[0],
    ).toMatchObject({ module: 'toString', floor: null, belowFloor: false });
  });

  it('skips a count-form row with lines_total 0, which has no percentage', () => {
    // r2's shared row has nothing to cover, so shared stays at r1's 45 / 50 = 90%.
    const runs = [run('r1', '2026-10-01T00:00:00Z'), run('r2', '2026-10-02T00:00:00Z')];
    const coverage = [
      countsCoverage('c1', 'r1', 'shared', 45, 50),
      countsCoverage('c2', 'r2', 'shared', 0, 0),
    ];
    expect(latestCoverage(runs, coverage, options)).toEqual([
      { module: 'shared', runId: 'r1', pct: 90, floor: 91, belowFloor: true },
    ]);
  });

  it('ignores coverage from other branches and from runs it was not given', () => {
    // The pull request run is newer but off the default branch; 'gone' is not among the runs.
    const runs = [
      run('main', '2026-10-01T00:00:00Z'),
      run('pr', '2026-10-02T00:00:00Z', { branch: 'feature/x' }),
    ];
    const coverage = [
      countsCoverage('c1', 'main', 'shared', 46, 50),
      countsCoverage('c2', 'pr', 'shared', 10, 50),
      countsCoverage('c3', 'gone', 'shared', 1, 50),
    ];
    // 46 / 50 = 92%.
    expect(latestCoverage(runs, coverage, options)).toEqual([
      { module: 'shared', runId: 'main', pct: 92, floor: 91, belowFloor: false },
    ]);
  });

  it('breaks a finish-time tie by attempt, the later attempt winning', () => {
    const runs = [
      run('a2', '2026-10-01T00:00:00Z', { ciRunId: '5', runAttempt: 2 }),
      run('a1', '2026-10-01T00:00:00Z', { ciRunId: '5', runAttempt: 1 }),
    ];
    const coverage = [
      countsCoverage('c1', 'a1', 'shared', 10, 100),
      countsCoverage('c2', 'a2', 'shared', 95, 100),
    ];
    expect(latestCoverage(runs, coverage, options)[0]).toMatchObject({ runId: 'a2', pct: 95 });
  });
});

// How it's tested's coverage card (design v12, components.md "How it’s tested page"; data-map v11)
// adds "{module}: {covered} of {total} lines covered." under each row, from the same coverage row
// the percentage was read from.
describe('latestCoverageWithLines', () => {
  it('carries the line counts of the row each module’s percentage came from', () => {
    // r2 is latest for shared; composeApp comes from r1, as latestCoverage reads them.
    const runs = [run('r1', '2026-10-01T00:00:00Z'), run('r2', '2026-10-02T00:00:00Z')];
    const coverage = [
      countsCoverage('c1', 'r1', 'shared', 400, 490),
      countsCoverage('c2', 'r1', 'composeApp', 497, 527),
      countsCoverage('c3', 'r2', 'shared', 457, 490),
    ];
    expect(latestCoverageWithLines(runs, coverage, options)).toEqual([
      {
        module: 'composeApp',
        runId: 'r1',
        pct: (497 / 527) * 100,
        floor: 93,
        belowFloor: false,
        lines: { covered: 497, total: 527 },
      },
      {
        module: 'shared',
        runId: 'r2',
        pct: (457 / 490) * 100,
        floor: 91,
        belowFloor: false,
        lines: { covered: 457, total: 490 },
      },
    ]);
  });

  it('has no line counts for a recorded percentage', () => {
    const runs = [run('bf', '2026-09-22T20:14:18Z', { source: 'backfill' })];
    expect(
      latestCoverageWithLines(runs, [pctCoverage('c1', 'bf', 'shared', 93.3)], options),
    ).toEqual([
      { module: 'shared', runId: 'bf', pct: 93.3, floor: 91, belowFloor: false, lines: null },
    ]);
  });

  it('reads the same modules and values as latestCoverage', () => {
    const runs = [
      run('bf', '2026-09-22T20:14:18Z', { source: 'backfill' }),
      run('r1', '2026-10-01T00:00:00Z'),
      run('pr', '2026-10-03T00:00:00Z', { branch: 'feature' }),
    ];
    const coverage = [
      pctCoverage('c0', 'bf', 'composeApp', 92.5),
      countsCoverage('c1', 'r1', 'shared', 3125, 3141),
      countsCoverage('c2', 'r1', 'empty', 0, 0),
      countsCoverage('c3', 'pr', 'shared', 1, 2),
    ];
    const withLines = latestCoverageWithLines(runs, coverage, options);
    expect(
      withLines.map(({ module, runId, pct, floor, belowFloor }) => ({
        module,
        runId,
        pct,
        floor,
        belowFloor,
      })),
    ).toEqual(latestCoverage(runs, coverage, options));
    expect(withLines.map(({ module, lines }) => [module, lines])).toEqual([
      ['composeApp', null],
      ['shared', { covered: 3125, total: 3141 }],
    ]);
  });
});
