import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import picomatch from 'picomatch';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  compileLayerRules,
  LAYER_ORDER,
  type Layer,
  type LayerRules,
  LayerRulesSchema,
  LayerSchema,
  type LayerTarget,
} from './layer-rules';

// Wrap the real picomatch so the tests can count how often globs are compiled.
vi.mock('picomatch', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof picomatch }>();
  return { default: vi.fn(actual.default) };
});

// Copied verbatim from docs/spec.md Appendix B (`projects/routeserve.yaml`, `layer_rules`).
// Suites are repo-relative (spec 6.2 and 7: the Jest path minus `path_prefix`), so every glob
// carries its workspace prefix.
const routeserveRules: LayerRules = [
  {
    match: { module: 'apps/backend', suite: 'apps/backend/**/*.postgis.test.ts' },
    layer: 'integration',
  },
  { match: { module: 'apps/backend', suite: 'apps/backend/src/routes/**' }, layer: 'api' },
  { match: { module: 'apps/mobile', suite: 'apps/mobile/src/screens/**' }, layer: 'component' },
  { match: { module: 'apps/mobile', suite: 'apps/mobile/src/components/**' }, layer: 'component' },
  { match: { module: 'apps/mobile', suite: 'apps/mobile/src/hooks/**' }, layer: 'component' },
  { match: { module: 'apps/mobile', suite: 'apps/mobile/src/app/**' }, layer: 'component' },
  { default: 'unit' },
];

// Not in the spec yet: the minimal rules that reproduce the inventory's Ostomate2 layer table
// from the JVM JUnit suite names. Module and platform values follow Appendix A's CI steps.
const ostomate2Rules: LayerRules = [
  { match: { module: 'shared', suite: 'com.ostomate.app.data.db.*' }, layer: 'integration' },
  {
    match: { module: 'shared', suite: 'com.ostomate.app.data.RepositoryTest' },
    layer: 'integration',
  },
  { match: { module: 'composeApp', suite: 'com.ostomate.app.ui.screenshot.*' }, layer: 'visual' },
  { default: 'unit' },
];

const target = (overrides: Partial<LayerTarget> = {}): LayerTarget => ({
  job: 'test',
  module: 'apps/backend',
  platform: 'node',
  suite: 'src/index.test.ts',
  ...overrides,
});

const expectRejected = (
  input: unknown,
  messageFragment: string,
  path?: readonly (string | number)[],
): void => {
  const result = LayerRulesSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }
  const matching = result.error.issues.filter((issue) => issue.message.includes(messageFragment));
  expect(matching.length, result.error.message).toBeGreaterThan(0);
  if (path !== undefined) {
    expect(matching.map((issue) => issue.path)).toContainEqual(path);
  }
};

const countByLayer = (
  resolve: (target: LayerTarget) => Layer,
  targets: readonly (LayerTarget & { readonly cases: number })[],
): Partial<Record<Layer, number>> => {
  const counts: Partial<Record<Layer, number>> = {};
  for (const item of targets) {
    const layer = resolve(item);
    counts[layer] = (counts[layer] ?? 0) + item.cases;
  }
  return counts;
};

const fixture = (relative: string): string =>
  fileURLToPath(new URL(`../../fixtures/${relative}`, import.meta.url));

describe('LayerSchema', () => {
  it('lists the six layers in pyramid order', () => {
    expect(LAYER_ORDER).toEqual(['unit', 'component', 'integration', 'api', 'visual', 'e2e']);
    expect(LayerSchema.options).toEqual(LAYER_ORDER);
  });

  it('rejects a layer outside the allowed set', () => {
    expect(LayerSchema.safeParse('smoke').success).toBe(false);
  });
});

describe('LayerRulesSchema', () => {
  it('accepts the Appendix B routeserve rules verbatim', () => {
    expect(LayerRulesSchema.parse(routeserveRules)).toEqual(routeserveRules);
  });

  it('rejects an unknown layer in a match rule, naming the index', () => {
    expectRejected(
      [{ match: { job: 'android-e2e' }, layer: 'smoke' }, { default: 'unit' }],
      'Invalid option: expected one of "unit"|"component"|"integration"|"api"|"visual"|"e2e"',
      [0, 'layer'],
    );
  });

  it('rejects an unknown layer in the default rule', () => {
    expectRejected(
      [{ default: 'smoke' }],
      'Invalid option: expected one of "unit"|"component"|"integration"|"api"|"visual"|"e2e"',
      [0, 'default'],
    );
  });

  it('rejects rules with no default', () => {
    expectRejected(
      [{ match: { job: 'android-e2e' }, layer: 'e2e' }],
      'layer_rules must end with a default rule',
    );
    expectRejected([], 'layer_rules must end with a default rule');
  });

  it('rejects a default that is not last, naming its index', () => {
    expectRejected(
      [{ default: 'unit' }, { match: { job: 'android-e2e' }, layer: 'e2e' }],
      'default rule must be last, found at index 0',
      [0],
    );
  });

  it('rejects two defaults, naming only the extra one', () => {
    const input = [
      { match: { job: 'android-e2e' }, layer: 'e2e' },
      { default: 'unit' },
      { default: 'e2e' },
    ];
    expectRejected(input, 'only one default rule is allowed; extra default at index 2', [2]);
    const result = LayerRulesSchema.safeParse(input);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
      'only one default rule is allowed; extra default at index 2',
    ]);
  });

  it('rejects a match with no keys', () => {
    expectRejected(
      [{ match: {}, layer: 'e2e' }, { default: 'unit' }],
      'match must name at least one of job, module, platform, suite',
      [0, 'match'],
    );
  });

  it('rejects unknown match keys and empty values', () => {
    expectRejected(
      [{ match: { branch: 'main' }, layer: 'e2e' }, { default: 'unit' }],
      'Unrecognized key: "branch"',
      [0, 'match'],
    );
    expectRejected(
      [{ match: { job: '' }, layer: 'e2e' }, { default: 'unit' }],
      'Too small: expected string to have >=1 characters',
      [0, 'match', 'job'],
    );
  });

  it('rejects a rule that is both a match and a default', () => {
    expectRejected(
      [{ match: { job: 'x' }, layer: 'e2e', default: 'unit' }],
      'Unrecognized keys: "match", "layer"',
      [0],
    );
  });
});

describe('compileLayerRules', () => {
  it('lets the first matching rule win', () => {
    const rules: LayerRules = [
      { match: { module: 'apps/backend' }, layer: 'api' },
      { match: { suite: 'src/**' }, layer: 'e2e' },
      { default: 'unit' },
    ];
    expect(compileLayerRules(rules)(target())).toBe('api');
    expect(
      compileLayerRules([...rules].reverse().slice(1).concat({ default: 'unit' }))(target()),
    ).toBe('e2e');
  });

  it('compares job, module and platform exactly, never as globs or prefixes', () => {
    const rules: LayerRules = [
      { match: { job: 'android' }, layer: 'component' },
      { match: { module: 'apps/*' }, layer: 'api' },
      { match: { platform: 'ios-sim' }, layer: 'visual' },
      { default: 'unit' },
    ];
    expect(compileLayerRules(rules)(target({ job: 'android' }))).toBe('component');
    expect(compileLayerRules(rules)(target({ job: 'android-e2e' }))).toBe('unit');
    expect(compileLayerRules(rules)(target({ module: 'apps/backend' }))).toBe('unit');
    expect(compileLayerRules(rules)(target({ module: 'apps/*' }))).toBe('api');
    expect(compileLayerRules(rules)(target({ platform: 'ios-sim' }))).toBe('visual');
    expect(compileLayerRules(rules)(target({ platform: 'ios-simulator' }))).toBe('unit');
  });

  it('matches suite as a glob where ** crosses directories', () => {
    const rules: LayerRules = [
      { match: { suite: '**/*.postgis.test.ts' }, layer: 'integration' },
      { match: { suite: 'src/routes/**' }, layer: 'api' },
      { default: 'unit' },
    ];
    const layerOf = (suite: string): Layer => compileLayerRules(rules)(target({ suite }));

    expect(layerOf('src/services/corridor.postgis.test.ts')).toBe('integration');
    expect(layerOf('corridor.postgis.test.ts')).toBe('integration');
    expect(layerOf('src/services/corridor.service.test.ts')).toBe('unit');

    expect(layerOf('src/routes/jobs.test.ts')).toBe('api');
    expect(layerOf('src/routes/v2/jobs.test.ts')).toBe('api');
    expect(layerOf('src/routesx/jobs.test.ts')).toBe('unit');
    expect(layerOf('apps/backend/src/routes/jobs.test.ts')).toBe('unit');
  });

  it('matches dotted class names and dotfile segments', () => {
    const rules: LayerRules = [
      { match: { suite: 'com.ostomate.app.ui.screenshot.*' }, layer: 'visual' },
      { match: { suite: 'com.ostomate.app.ui.**' }, layer: 'component' },
      { match: { suite: 'com.ostomate.app.data.db.*' }, layer: 'integration' },
      { match: { suite: 'src/**' }, layer: 'api' },
      { default: 'unit' },
    ];
    const layerOf = (suite: string): Layer => compileLayerRules(rules)(target({ suite }));

    expect(layerOf('com.ostomate.app.ui.screenshot.HomeScreenshotTest')).toBe('visual');
    expect(layerOf('com.ostomate.app.ui.home.HomeViewModelTest')).toBe('component');
    expect(layerOf('com.ostomate.app.data.db.MigrationTest')).toBe('integration');
    expect(layerOf('com.ostomate.app.data.RepositoryTest')).toBe('unit');
    expect(layerOf('src/.hidden/x.test.ts')).toBe('api');
  });

  it('requires every key in a match to hold', () => {
    const rules: LayerRules = [
      { match: { module: 'apps/backend', suite: 'src/routes/**', platform: 'node' }, layer: 'api' },
      { default: 'unit' },
    ];
    expect(compileLayerRules(rules)(target({ suite: 'src/routes/jobs.test.ts' }))).toBe('api');
    expect(
      compileLayerRules(rules)(target({ module: 'apps/mobile', suite: 'src/routes/jobs.test.ts' })),
    ).toBe('unit');
    expect(
      compileLayerRules(rules)(target({ platform: 'jvm', suite: 'src/routes/jobs.test.ts' })),
    ).toBe('unit');
    expect(compileLayerRules(rules)(target({ suite: 'src/services/jobs.test.ts' }))).toBe('unit');
  });

  it('falls through to the default when nothing matches', () => {
    expect(compileLayerRules([{ default: 'e2e' }])(target())).toBe('e2e');
    expect(compileLayerRules(routeserveRules)(target({ module: 'packages/shared' }))).toBe('unit');
  });

  it('refuses to compile invalid rules', () => {
    expect(() => compileLayerRules([{ match: { job: 'x' }, layer: 'e2e' }])).toThrow(/default/);
  });

  it('compiles each suite glob once and never again while resolving', () => {
    vi.mocked(picomatch).mockClear();
    const resolve = compileLayerRules(routeserveRules);
    const suiteRules = routeserveRules.filter((rule) => 'match' in rule && rule.match.suite);
    expect(suiteRules).toHaveLength(6);
    expect(picomatch).toHaveBeenCalledTimes(suiteRules.length);
    const targets = [
      target({ module: 'apps/backend', suite: 'apps/backend/src/routes/jobs.test.ts' }),
      target({
        module: 'apps/backend',
        suite: 'apps/backend/src/services/corridor.postgis.test.ts',
      }),
      target({ module: 'apps/mobile', suite: 'apps/mobile/src/hooks/useMe.test.tsx' }),
      target({ module: 'packages/shared', suite: 'packages/shared/src/schemas/job.test.ts' }),
    ];
    for (const pass of [1, 2]) {
      expect(targets.map(resolve), `pass ${pass}`).toEqual([
        'api',
        'integration',
        'component',
        'unit',
      ]);
      expect(picomatch, `pass ${pass}`).toHaveBeenCalledTimes(suiteRules.length);
    }
  });
});

// Spec section 8: resolved counts per layer must match the inventory's layer table. The fixture
// counts pin each rule's prefix and module; every fixture suite sits one directory deep, so the
// nested synthetic paths below pin that `**` also reaches deeper directories.
describe('routeserve acceptance against fixtures/routeserve/jest', () => {
  const PATH_PREFIX = '/home/runner/work/routeserve/routeserve/';
  const JestJson = z.object({
    testResults: z.array(z.object({ name: z.string(), assertionResults: z.array(z.unknown()) })),
  });

  const suitesOf = (workspace: string, module: string) => {
    const json = JestJson.parse(
      JSON.parse(readFileSync(fixture(`routeserve/jest/${workspace}.json`), 'utf8')),
    );
    return json.testResults.map((result) => {
      expect(result.name.startsWith(PATH_PREFIX)).toBe(true);
      return {
        ...target({
          job: 'test',
          module,
          platform: 'node',
          suite: result.name.slice(PATH_PREFIX.length),
        }),
        cases: result.assertionResults.length,
      };
    });
  };
  const resolve = compileLayerRules(routeserveRules);

  it('reaches nested directories under every Appendix B prefix', () => {
    const layerOf = (module: string, suite: string): Layer => resolve(target({ module, suite }));
    expect(layerOf('apps/backend', 'apps/backend/src/routes/v2/jobs.test.ts')).toBe('api');
    expect(layerOf('apps/backend', 'apps/backend/src/services/geo/corridor.postgis.test.ts')).toBe(
      'integration',
    );
    expect(layerOf('apps/mobile', 'apps/mobile/src/screens/settings/Profile.test.tsx')).toBe(
      'component',
    );
    expect(layerOf('apps/mobile', 'apps/mobile/src/components/forms/Field.test.tsx')).toBe(
      'component',
    );
    expect(layerOf('apps/mobile', 'apps/mobile/src/hooks/sync/useQueue.test.tsx')).toBe(
      'component',
    );
    expect(layerOf('apps/mobile', 'apps/mobile/src/app/(auth)/login.test.tsx')).toBe('component');
  });

  // Inventory rows for routeserve (docs/PROJECT_INVENTORY.md, section 3 table):
  // shared: schemas 116 + orgSettings 3 = unit 119.
  it('packages/shared: unit 119', () => {
    expect(countByLayer(resolve, suitesOf('shared', 'packages/shared'))).toEqual({ unit: 119 });
  });

  // backend: routes 269 api; services 203 + utils 23 + instrument 3 = unit 229. The inventory's
  // integration 3 cannot appear here: fixtures/README.md records that corridor.postgis.test.ts was
  // excluded at capture, so the fixture has no PostGIS suite and the inventory's services row
  // (200) double-counted those 3 cases. The postgis glob itself is proven by the unit test above.
  it('apps/backend: api 269, unit 229, no integration in the captured fixture', () => {
    expect(countByLayer(resolve, suitesOf('backend', 'apps/backend'))).toEqual({
      api: 269,
      unit: 229,
    });
  });

  // mobile: screens 138 + components 14 + hooks 10 + app/login 3 = component 165;
  // lib 237 + db 16 + api/client 10 = unit 263.
  it('apps/mobile: component 165, unit 263', () => {
    expect(countByLayer(resolve, suitesOf('mobile', 'apps/mobile'))).toEqual({
      component: 165,
      unit: 263,
    });
  });
});

describe('Ostomate2 acceptance against fixtures/ostomate2/junit/jvm', () => {
  const suitesOf = (module: 'shared' | 'composeApp') => {
    const dir = fixture(`ostomate2/junit/jvm/${module}`);
    return readdirSync(dir)
      .filter((file) => file.startsWith('TEST-') && file.endsWith('.xml'))
      .map((file) => {
        const openingTag = /<testsuite\b[^>]*>/.exec(readFileSync(`${dir}/${file}`, 'utf8'))?.[0];
        const name = /\sname="([^"]*)"/.exec(openingTag ?? '')?.[1];
        const tests = /\stests="(\d+)"/.exec(openingTag ?? '')?.[1];
        expect(name, file).toBeDefined();
        expect(tests, file).toBeDefined();
        return {
          ...target({ job: 'android', module, platform: 'jvm', suite: name ?? '' }),
          cases: Number(tests),
        };
      });
  };
  const resolve = compileLayerRules(ostomate2Rules);

  // Inventory rows for Ostomate2: shared commonTest unit 53, androidHostTest integration 29.
  it('shared: unit 53, integration 29', () => {
    expect(countByLayer(resolve, suitesOf('shared'))).toEqual({ unit: 53, integration: 29 });
  });

  // composeApp commonTest unit 50, androidHostTest screenshot (visual) 10.
  it('composeApp: unit 50, visual 10', () => {
    expect(countByLayer(resolve, suitesOf('composeApp'))).toEqual({ unit: 50, visual: 10 });
  });
});
