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
import { compileLayerRules } from './layer-rules';
import { type ReportMeta } from './meta';
import { compileNameNormalization } from './name-normalization';
import {
  deriveStatus,
  type IngestProject,
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
    { id: PROJECT_ID, layer_rules: ostomate2.layer_rules, name_normalization: {} },
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

  // Decision 2026-10-05: the files' times and the receipt are kept apart, so a report whose files
  // are older than its arrival (a replayed cache) still records when it arrived.
  it('keeps the receipt time apart from the file times it carries', () => {
    expect(Date.parse(payload.report.finished_at)).toBeLessThan(RECEIVED_AT.getTime());
    expect(payload.received_at).toBe(RECEIVED_AT.toISOString());
    expect(payload.report.started_at).toBe(report.startedAt);
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
    { id: PROJECT_ID, layer_rules: [{ default: 'e2e' }], name_normalization: {} },
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
    { id: PROJECT_ID, layer_rules: routeserve.layer_rules, name_normalization: {} },
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
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }], name_normalization: {} },
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
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }], name_normalization: {} },
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
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }], name_normalization: {} },
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
      { id: PROJECT_ID, layer_rules: [{ default: 'unit' }], name_normalization: {} },
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
        { id: PROJECT_ID, layer_rules: [{ default: 'unit' }], name_normalization: {} },
        { format: 'junit', report },
        [],
        RECEIVED_AT,
      );
    expect(run).toThrow(ParseError);
    expect(run).toThrow(/timestamp/);
  });
});

describe('name normalization (spec section 7)', () => {
  // Kotlin Multiplatform reports the same composeApp tests twice: once from the JVM and once
  // from the iOS simulator, which stamps its target into both the suite and the name.
  const jvm = parseJunit(readSuiteDir('ostomate2/junit/jvm/composeApp'));
  const iosSim = parseJunit(readSuiteDir('ostomate2/junit/ios-sim/composeApp'));
  const normalize = compileNameNormalization(ostomate2.name_normalization);

  const project = (): IngestProject => ({
    id: PROJECT_ID,
    layer_rules: ostomate2.layer_rules,
    name_normalization: ostomate2.name_normalization,
  });
  const identity = (test: { suite: string; name: string }): string =>
    `${test.suite}\u0000${test.name}`;
  const payloadFor = (report: NormalizedReport, platform: string) =>
    normalizeReport(
      meta({ job: platform, module: 'composeApp', platform }),
      project(),
      { format: 'junit', report },
      [],
      RECEIVED_AT,
    );
  const fieldOf = (run: () => unknown): string | undefined => {
    try {
      run();
    } catch (error) {
      return error instanceof ParseError ? error.field : undefined;
    }
    return undefined;
  };

  it('rewrites every iOS simulator suite and name to the spelling the JVM run reports', () => {
    const jvmIdentities = new Set(jvm.tests.map(identity));
    const normalized = iosSim.tests.map((test) => normalize(test.suite, test.name));

    expect(normalized).toHaveLength(50);
    expect(new Set(normalized.map(identity)).size).toBe(50);
    for (const test of normalized) {
      expect(jvmIdentities).toContain(identity(test));
    }
  });

  it('leaves the JVM spelling of those same tests untouched', () => {
    for (const test of jvm.tests) {
      expect(normalize(test.suite, test.name)).toEqual({ suite: test.suite, name: test.name });
    }
  });

  it('gives one test_key to both platforms, so 110 executions are 60 distinct tests', () => {
    const jvmKeys = payloadFor(jvm, 'jvm').tests.map((test) => test.test_key);
    const iosKeys = payloadFor(iosSim, 'ios-sim').tests.map((test) => test.test_key);
    const jvmSet = new Set(jvmKeys);

    expect(jvmKeys).toHaveLength(60);
    expect(iosKeys).toHaveLength(50);
    expect(new Set([...jvmKeys, ...iosKeys]).size).toBe(60);
    for (const key of iosKeys) {
      expect(jvmSet).toContain(key);
    }
  });

  it('stores the normalized identity, so no row carries the platform in its name', () => {
    for (const test of payloadFor(iosSim, 'ios-sim').tests) {
      expect(test.suite).not.toContain('iosSimulatorArm64');
      expect(test.name).not.toContain('iosSimulatorArm64');
    }
  });

  it('resolves the layer from the normalized suite, not the prefixed one', () => {
    const resolveLayer = compileLayerRules(ostomate2.layer_rules);
    const dao = 'iosSimulatorArm64Test.com.ostomate.app.data.db.ChangeEventDaoTest';
    const screenshot = 'iosSimulatorArm64Test.com.ostomate.app.ui.screenshot.HomeScreenshotTest';
    const layerOf = (module: string, suite: string): string =>
      resolveLayer({ job: 'ios', module, platform: 'ios-sim', suite });

    expect(layerOf('shared', normalize(dao, 'x[iosSimulatorArm64]').suite)).toBe('integration');
    expect(layerOf('composeApp', normalize(screenshot, 'x[iosSimulatorArm64]').suite)).toBe(
      'visual',
    );
    // The prefixed spelling is what misclassified every iOS test as `unit` in production.
    expect(layerOf('shared', dao)).toBe('unit');
    expect(layerOf('composeApp', screenshot)).toBe('unit');
  });

  it('gives the iOS composeApp report the layers its JVM counterpart gets', () => {
    expect(countBy(payloadFor(jvm, 'jvm').tests.map((test) => test.layer))).toEqual({
      unit: 50,
      visual: 10,
    });
    expect(countBy(payloadFor(iosSim, 'ios-sim').tests.map((test) => test.layer))).toEqual({
      unit: 50,
    });
  });

  it('strips the first affix that matches, in the order the project listed them', () => {
    const asListed = compileNameNormalization({
      suite_prefixes: ['ios.', 'ios.sim.'],
      name_suffixes: ['[b]', '[a][b]'],
    });
    expect(asListed('ios.sim.Suite', 'test[a][b]')).toEqual({
      suite: 'sim.Suite',
      name: 'test[a]',
    });

    const reordered = compileNameNormalization({
      suite_prefixes: ['ios.sim.', 'ios.'],
      name_suffixes: ['[a][b]', '[b]'],
    });
    expect(reordered('ios.sim.Suite', 'test[a][b]')).toEqual({ suite: 'Suite', name: 'test' });
  });

  it('changes nothing for a project that declares no normalization', () => {
    for (const config of [{}, { suite_prefixes: [], name_suffixes: [] }]) {
      const untouched = compileNameNormalization(config);
      expect(untouched('iosSimulatorArm64Test.A', 'b[iosSimulatorArm64]')).toEqual({
        suite: 'iosSimulatorArm64Test.A',
        name: 'b[iosSimulatorArm64]',
      });
    }
  });

  it('refuses a strip that would leave an empty suite or name, naming the field', () => {
    const strip = compileNameNormalization({
      suite_prefixes: ['com.ostomate.app.OnlyTest'],
      name_suffixes: ['rendersToday'],
    });

    const emptySuite = (): unknown => strip('com.ostomate.app.OnlyTest', 'rendersToday');
    expect(emptySuite).toThrow(ParseError);
    expect(emptySuite).toThrow(/name_normalization\.suite_prefixes/);
    expect(fieldOf(emptySuite)).toBe('suite');

    const emptyName = (): unknown => strip('com.ostomate.app.OtherTest', 'rendersToday');
    expect(emptyName).toThrow(ParseError);
    expect(emptyName).toThrow(/name_normalization\.name_suffixes/);
    expect(fieldOf(emptyName)).toBe('name');
  });

  it('raises that refusal through normalizeReport, where ingestion turns it into a 400', () => {
    const report: NormalizedReport = {
      tests: [
        {
          suite: 'iosSimulatorArm64Test.com.ostomate.app.ui.home.HomeViewModelTest',
          name: '[iosSimulatorArm64]',
          status: 'passed',
          durationMs: 1,
        },
      ],
      durationMs: 1,
    };
    const run = (): unknown =>
      normalizeReport(meta(), project(), { format: 'junit', report }, [], RECEIVED_AT);

    expect(run).toThrow(ParseError);
    expect(run).toThrow(/name_normalization\.name_suffixes/);
    expect(fieldOf(run)).toBe('name');
  });
});

// Ostomate2's Maestro jobs post as module e2e. test_key hashes module, suite and name (5.4) and
// not platform, so a flow is one test across platforms only when both platforms title it alike.
describe('normalizeReport with the Ostomate2 Maestro fixtures (test identity across platforms)', () => {
  const project: IngestProject = {
    id: PROJECT_ID,
    layer_rules: ostomate2.layer_rules,
    name_normalization: ostomate2.name_normalization,
  };
  const payloadFor = (job: string, platform: string) =>
    normalizeReport(
      meta({
        ci_run_id: '36662953449',
        job,
        module: 'e2e',
        platform,
        commit_sha: '8f3be43b4769d431df63aae97f95b05f9bc731f7',
        branch: 'ci/e2e-junit-artifacts-continue',
        event: 'workflow_dispatch',
        run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/36662953449',
      }),
      project,
      { format: 'junit', report: parseJunit(readSuiteDir(`ostomate2/junit/${platform}/e2e`)) },
      [],
      RECEIVED_AT,
    );
  const android = payloadFor('android-e2e', 'android-emulator');
  const ios = payloadFor('ios-e2e', 'ios-sim');

  it('counts the Android report green and the iOS report red with one failure', () => {
    expect(android.report).toMatchObject({ total: 7, passed: 7, failed: 0, skipped: 0 });
    expect(ios.report).toMatchObject({ total: 5, passed: 4, failed: 1, skipped: 0 });
  });

  it('keys the flows by title: 12 executions are 11 tests, and only Journey 8 is shared', () => {
    const androidKeys = new Set(android.tests.map((test) => test.test_key));
    const iosKeys = new Set(ios.tests.map((test) => test.test_key));
    expect(androidKeys.size).toBe(7);
    expect(iosKeys.size).toBe(5);
    expect(new Set([...androidKeys, ...iosKeys]).size).toBe(11);

    const shared = ios.tests.filter((test) => androidKeys.has(test.test_key));
    expect(shared.map((test) => test.name)).toEqual(['Journey 8: Biometric gate on Settings']);
    expect(shared[0]?.test_key).toBe(
      sha256(
        'e2e\u0000Journey 8: Biometric gate on Settings\u0000Journey 8: Biometric gate on Settings',
      ),
    );
  });

  // The same journey titled per platform ("Journey 2: Log + undo" on Android, "iOS Journey 2:
  // Log + undo" on iOS) is two tests with separate histories; name normalization is literal
  // affixes on JUnit suite and name, and Ostomate2's list does not cover an "iOS " prefix.
  it('keeps differently titled counterparts as distinct tests', () => {
    const keyOf = (tests: typeof android.tests, name: string): string | undefined =>
      tests.find((test) => test.name === name)?.test_key;
    const androidLogUndo = keyOf(android.tests, 'Journey 2: Log + undo');
    const iosLogUndo = keyOf(ios.tests, 'iOS Journey 2: Log + undo');
    expect(androidLogUndo).toBeDefined();
    expect(iosLogUndo).toBeDefined();
    expect(iosLogUndo).not.toBe(androidLogUndo);
  });

  it('resolves every flow to e2e and carries the crash text on the failed one only', () => {
    expect(countBy([...android.tests, ...ios.tests].map((test) => test.layer))).toEqual({
      e2e: 12,
    });
    const failures = [...android.tests, ...ios.tests].filter((test) => test.failure !== null);
    expect(failures.map((test) => [test.name, test.status])).toEqual([
      ['iOS Journey 1: Cold-start QR deep link', 'failed'],
    ]);
    expect(failures[0]?.failure?.message).toMatch(/^App crashed or stopped while executing flow/);
  });
});

// Ostomate2 CI run 36965404280 on main, after its PR #37 moved Maestro to 2.11.0, which stamps
// each testsuite with an offsetless UTC timestamp. The report starts at the earliest one rather
// than when testpulse received it, and the shared titles now make three cross-platform tests.
describe('normalizeReport with the Ostomate2 Maestro 2.11.0 fixtures', () => {
  const project: IngestProject = {
    id: PROJECT_ID,
    layer_rules: ostomate2.layer_rules,
    name_normalization: ostomate2.name_normalization,
  };
  const payloadFor = (job: string, platform: string) =>
    normalizeReport(
      meta({
        ci_run_id: '36965404280',
        job,
        module: 'e2e',
        platform,
        commit_sha: 'f0a41bb172e9c85d6c74945dd3e9706dc1a5cd57',
        branch: 'main',
        event: 'push',
        run_url: 'https://github.com/bhelco1/Ostomate2/actions/runs/36965404280',
      }),
      project,
      {
        format: 'junit',
        report: parseJunit(readSuiteDir(`ostomate2/junit/maestro-2.11.0/${platform}/e2e`)),
      },
      [],
      RECEIVED_AT,
    );
  const android = payloadFor('android-e2e', 'android-emulator');
  const ios = payloadFor('ios-e2e', 'ios-sim');

  it('starts each report at its first flow, read as UTC, and ends it after the summed times', () => {
    expect(android.report).toMatchObject({
      started_at: '2026-10-02T04:44:36.000Z',
      finished_at: '2026-10-02T04:47:21.370Z',
      duration_ms: 165370,
    });
    expect(ios.report).toMatchObject({
      started_at: '2026-10-02T04:49:41.000Z',
      finished_at: '2026-10-02T04:52:59.689Z',
      duration_ms: 198689,
    });
  });

  it('counts both reports green and resolves every flow to e2e', () => {
    expect(android.report).toMatchObject({ total: 7, passed: 7, failed: 0, skipped: 0 });
    expect(ios.report).toMatchObject({ total: 5, passed: 5, failed: 0, skipped: 0 });
    expect(countBy([...android.tests, ...ios.tests].map((test) => test.layer))).toEqual({
      e2e: 12,
    });
  });

  it('keys the flows by title: 12 executions are 9 tests, three of them on both platforms', () => {
    const androidKeys = new Set(android.tests.map((test) => test.test_key));
    expect(new Set([...androidKeys, ...ios.tests.map((test) => test.test_key)]).size).toBe(9);
    expect(
      ios.tests.filter((test) => androidKeys.has(test.test_key)).map((test) => test.name),
    ).toEqual([
      'Journey 1: Cold-start QR log',
      'Journey 2: Log + undo',
      'Journey 8: Biometric gate on Settings',
    ]);
  });
});
