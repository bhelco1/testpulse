import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ParseError,
  type NormalizedReport,
  parseIstanbulSummary,
  parseJacoco,
  parseJestJson,
  parseJunit,
} from '../parsers';
import { parseProjectFile } from '../projects/schema';
import { MAX_REPORT_DURATION_MS, MAX_TEST_DURATION_MS } from '../parsers/limits';
import { type ReportMeta } from './meta';
import {
  deriveStatus,
  normalizeReport,
  summarize,
  sumTotals,
  testKey,
  type Totals,
} from './normalize';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const readFixture = (relativePath: string): string =>
  readFileSync(`${repoRoot}fixtures/${relativePath}`, 'utf8');
const readSuiteDir = (relativeDir: string): string[] =>
  readdirSync(`${repoRoot}fixtures/${relativeDir}`)
    .filter((name) => name.endsWith('.xml'))
    .sort()
    .map((name) => readFixture(`${relativeDir}/${name}`));

const countBy = (values: readonly string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

const ostomate2 = parseProjectFile(
  readFileSync(`${repoRoot}projects/ostomate2.yaml`, 'utf8'),
  'projects/ostomate2.yaml',
);
const routeserve = parseProjectFile(
  readFileSync(`${repoRoot}projects/routeserve.yaml`, 'utf8'),
  'projects/routeserve.yaml',
);

const PROJECT_ID = '11111111-2222-4333-8444-555555555555';
const RECEIVED_AT = new Date('2026-09-22T12:00:00.000Z');

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const meta = (overrides: Partial<ReportMeta> = {}): ReportMeta => ({
  ci_run_id: '35644117162',
  run_attempt: 1,
  job: 'android',
  module: 'shared',
  platform: 'jvm',
  commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
  branch: 'main',
  event: 'push',
  run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/35644117162',
  ...overrides,
});

describe('testKey', () => {
  it('is the SHA-256 hex of module, suite and name joined by U+0000', () => {
    expect(testKey('shared', 'com.ostomate.app.data.RepositoryTest', 'insertsALog')).toBe(
      sha256('shared\u0000com.ostomate.app.data.RepositoryTest\u0000insertsALog'),
    );
  });

  it('cannot collide across the field boundary', () => {
    expect(testKey('m', 'ab', 'c')).not.toBe(testKey('m', 'a', 'bc'));
    expect(testKey('m', 'ab', 'c')).not.toBe(testKey('ma', 'b', 'c'));
  });

  it('accepts a line break in a suite or name, since the separator is not a line break', () => {
    expect(testKey('m', 'suite', 'a\nb')).toBe(sha256('m\u0000suite\u0000a\nb'));
    expect(testKey('m', 'a\nb', 'name')).not.toBe(testKey('m', 'a', 'b\nname'));
  });
});

describe('deriveStatus (spec section 5.2)', () => {
  it.each<[Totals, string]>([
    [{ total: 0, passed: 0, failed: 0, skipped: 0 }, 'empty'],
    [{ total: 3, passed: 3, failed: 0, skipped: 0 }, 'passed'],
    [{ total: 3, passed: 2, failed: 0, skipped: 1 }, 'passed'],
    [{ total: 3, passed: 2, failed: 1, skipped: 0 }, 'failed'],
    [{ total: 2, passed: 0, failed: 0, skipped: 2 }, 'passed'],
    [{ total: 1, passed: 0, failed: 1, skipped: 0 }, 'failed'],
  ])('derives %j as %s', (totals, status) => {
    expect(deriveStatus(totals)).toBe(status);
  });

  it('counts error results as failed so a run with an error can never be green', () => {
    const totals = summarize([
      { status: 'passed' },
      { status: 'error' },
      { status: 'skipped' },
      { status: 'failed' },
    ]);
    expect(totals).toEqual({ total: 4, passed: 1, failed: 2, skipped: 1 });
    expect(deriveStatus(totals)).toBe('failed');
  });

  it('sums report totals for a run, so one failed report fails the run', () => {
    const run = sumTotals([
      { total: 82, passed: 82, failed: 0, skipped: 0 },
      { total: 3, passed: 1, failed: 1, skipped: 1 },
    ]);
    expect(run).toEqual({ total: 85, passed: 83, failed: 1, skipped: 1 });
    expect(deriveStatus(run)).toBe('failed');
    expect(deriveStatus(sumTotals([]))).toBe('empty');
  });
});

describe('normalizeReport with the Ostomate2 shared JVM fixture', () => {
  const report = parseJunit(readSuiteDir('ostomate2/junit/jvm/shared'));
  const payload = normalizeReport(
    meta(),
    { id: PROJECT_ID, layer_rules: ostomate2.layer_rules },
    { format: 'junit', report },
    [],
    RECEIVED_AT,
  );

  it('carries the project, run and receipt fields', () => {
    expect(payload.project_id).toBe(PROJECT_ID);
    expect(payload.received_at).toBe('2026-09-22T12:00:00.000Z');
    expect(payload.run).toEqual({
      ci_run_id: '35644117162',
      run_attempt: 1,
      commit_sha: '2ec580f377e52f0a1ae584661ff09b07821ea1e2',
      branch: 'main',
      event: 'push',
      run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/35644117162',
    });
  });

  it('builds the report row with the totals from the inventory and the fixture timing', () => {
    expect(report.startedAt).toBeDefined();
    const startedAt = new Date(report.startedAt ?? '').getTime();
    expect(payload.report).toEqual({
      job: 'android',
      module: 'shared',
      platform: 'jvm',
      format: 'junit',
      total: 82,
      passed: 82,
      failed: 0,
      skipped: 0,
      duration_ms: report.durationMs,
      started_at: report.startedAt,
      finished_at: new Date(startedAt + report.durationMs).toISOString(),
    });
  });

  it('emits one entry per result with its documented test_key and no failure', () => {
    expect(payload.tests).toHaveLength(82);
    const [first] = report.tests;
    const [firstEntry] = payload.tests;
    expect(first).toBeDefined();
    expect(firstEntry).toEqual({
      test_key: sha256(`shared\u0000${first?.suite}\u0000${first?.name}`),
      module: 'shared',
      suite: first?.suite,
      name: first?.name,
      layer: 'unit',
      status: 'passed',
      duration_ms: first?.durationMs,
      failure: null,
    });
    expect(new Set(payload.tests.map((test) => test.test_key)).size).toBe(82);
    const repository = payload.tests.find(
      (test) => test.suite === 'com.ostomate.app.data.RepositoryTest',
    );
    expect(repository?.layer).toBe('integration');
  });

  it('resolves layers with the project rules: unit 53, integration 29', () => {
    expect(countBy(payload.tests.map((test) => test.layer))).toEqual({
      unit: 53,
      integration: 29,
    });
  });

  it('writes no coverage rows when none were posted', () => {
    expect(payload.coverage).toEqual([]);
  });
});

describe('normalizeReport with the failing Playwright fixture', () => {
  const report = parseJunit([readFixture('testpulse/junit/playwright-one-failure.xml')]);
  const payload = normalizeReport(
    meta({ job: 'e2e', module: 'testpulse', platform: 'chromium' }),
    { id: PROJECT_ID, layer_rules: [{ default: 'e2e' }] },
    { format: 'junit', report },
    [],
    RECEIVED_AT,
  );

  it('counts the failure and the skip and carries the failure text', () => {
    expect(payload.report).toMatchObject({ total: 3, passed: 1, failed: 1, skipped: 1 });
    const failed = payload.tests.find((test) => test.status === 'failed');
    expect(failed?.failure?.message).toMatch(/expect\(received\)\.toBe\(expected\)/);
    expect(failed?.failure?.detail).toContain('zz-deliberate-failure.spec.ts');
    expect(failed?.layer).toBe('e2e');
  });
});

describe('normalizeReport with the routeserve shared Jest fixture', () => {
  const report = parseJestJson(readFixture('routeserve/jest/shared.json'), {
    pathPrefix: '/home/runner/work/routeserve/routeserve/',
  });
  const jacocoCoverage = parseJacoco(readFixture('ostomate2/jacoco/shared.xml'));
  const istanbulCoverage = parseIstanbulSummary(readFixture('routeserve/istanbul/shared.json'));
  const payload = normalizeReport(
    meta({ job: 'test', module: 'packages/shared', platform: 'node' }),
    { id: PROJECT_ID, layer_rules: routeserve.layer_rules },
    { format: 'jest-json', report },
    [
      { format: 'jacoco', coverage: jacocoCoverage },
      { format: 'istanbul', coverage: istanbulCoverage },
    ],
    RECEIVED_AT,
  );

  it('records the format as jest-json with 119 unit tests', () => {
    expect(payload.report).toMatchObject({ format: 'jest-json', total: 119, passed: 119 });
    expect(countBy(payload.tests.map((test) => test.layer))).toEqual({ unit: 119 });
    expect(payload.tests[0]?.suite.startsWith('packages/shared/')).toBe(true);
  });

  it('builds coverage rows with the README numbers, under the report module', () => {
    expect(payload.coverage).toEqual([
      {
        module: 'packages/shared',
        format: 'jacoco',
        lines_covered: 457,
        lines_total: 490,
        branches_covered: 105,
        branches_total: 140,
      },
      {
        module: 'packages/shared',
        format: 'istanbul',
        lines_covered: 102,
        lines_total: 102,
        branches_covered: 5,
        branches_total: 5,
      },
    ]);
  });
});

describe('normalizeReport timing', () => {
  const twoTests: NormalizedReport = {
    tests: [
      { suite: 's', name: 'a', status: 'passed', durationMs: 100 },
      {
        suite: 's',
        name: 'b',
        status: 'error',
        durationMs: 50,
        failure: { message: 'boom', detail: 'at s' },
      },
    ],
    durationMs: 1500,
  };

  it('uses the receipt time as started_at when the report has no start time', () => {
    const payload = normalizeReport(
      meta(),
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }] },
      { format: 'junit', report: twoTests },
      [],
      RECEIVED_AT,
    );
    expect(payload.report.started_at).toBe('2026-09-22T12:00:00.000Z');
    expect(payload.report.finished_at).toBe('2026-09-22T12:00:01.500Z');
    expect(payload.report).toMatchObject({ total: 2, passed: 1, failed: 1, skipped: 0 });
    expect(payload.tests[1]?.failure).toEqual({ message: 'boom', detail: 'at s' });
  });

  it('writes null branch coverage when the parser reports none', () => {
    const payload = normalizeReport(
      meta(),
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }] },
      { format: 'junit', report: twoTests },
      [{ format: 'istanbul', coverage: { linesCovered: 1, linesTotal: 2 } }],
      RECEIVED_AT,
    );
    expect(payload.coverage).toEqual([
      {
        module: 'shared',
        format: 'istanbul',
        lines_covered: 1,
        lines_total: 2,
        branches_covered: null,
        branches_total: null,
      },
    ]);
  });

  it('omits run_url when meta has none', () => {
    const { run_url, ...withoutUrl } = meta();
    void run_url;
    const payload = normalizeReport(
      withoutUrl,
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }] },
      { format: 'junit', report: twoTests },
      [],
      RECEIVED_AT,
    );
    expect(payload.run.run_url).toBeNull();
  });

  it('computes finished_at at the caps without a RangeError', () => {
    const atCaps: NormalizedReport = {
      tests: [{ suite: 's', name: 'a', status: 'passed', durationMs: MAX_TEST_DURATION_MS }],
      startedAt: '9998-12-31T23:59:59.999Z',
      durationMs: MAX_REPORT_DURATION_MS,
    };
    const payload = normalizeReport(
      meta(),
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }] },
      { format: 'junit', report: atCaps },
      [],
      RECEIVED_AT,
    );
    expect(payload.report.finished_at).toBe('9999-12-31T23:59:59.999Z');
    expect(payload.tests[0]?.duration_ms).toBe(MAX_TEST_DURATION_MS);
  });

  it.each<[string, string, number]>([
    ['one millisecond past the last storable instant', '9999-12-31T23:59:59.999Z', 1],
    [
      'a Date-maximum start plus a one-year report',
      '+275760-09-13T00:00:00.000Z',
      MAX_REPORT_DURATION_MS,
    ],
    ['a start before year 1', '-000001-12-31T00:00:00.000Z', 0],
  ])('refuses %s with a ParseError, not a RangeError', (_label, startedAt, durationMs) => {
    const report: NormalizedReport = { tests: [], startedAt, durationMs };
    const run = () =>
      normalizeReport(
        meta(),
        { id: PROJECT_ID, layer_rules: [{ default: 'unit' }] },
        { format: 'junit', report },
        [],
        RECEIVED_AT,
      );
    expect(run).toThrow(ParseError);
    expect(run).toThrow(/timestamp/);
  });
});
