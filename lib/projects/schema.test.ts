import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  type ProjectFile,
  ProjectFileError,
  ProjectFileSchema,
  parseProjectFile,
} from './schema.ts';

const readProject = (slug: string): string =>
  readFileSync(fileURLToPath(new URL(`../../projects/${slug}.yaml`, import.meta.url)), 'utf8');

const routeserveYaml = readProject('routeserve');
const ostomate2Yaml = readProject('ostomate2');

// The ```yaml block under "## Appendix B" in docs/spec.md, so the checked-in file is held to
// the spec's content rather than to a copy of it in this test.
const appendixBYaml = (): string => {
  const spec = readFileSync(fileURLToPath(new URL('../../docs/spec.md', import.meta.url)), 'utf8');
  const appendix = spec.slice(spec.indexOf('\n## Appendix B'));
  const start = appendix.indexOf('```yaml\n') + '```yaml\n'.length;
  return appendix.slice(start, appendix.indexOf('\n```', start) + 1);
};

const expectRejected = (
  text: string,
  file: string,
  messageFragment: string,
  issuePath: string,
): ProjectFileError => {
  let caught: unknown;
  try {
    parseProjectFile(text, file);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ProjectFileError);
  if (!(caught instanceof ProjectFileError)) {
    throw new Error('unreachable');
  }
  expect(caught.file).toBe(file);
  expect(caught.message).toContain(file);
  const matching = caught.issues.filter((issue) => issue.message.includes(messageFragment));
  expect(
    matching.map((issue) => issue.path),
    caught.message,
  ).toContain(issuePath);
  return caught;
};

describe('projects/<slug>.yaml (spec sections 5.1, 5.8, 8, 10, Appendix B)', () => {
  it('accepts projects/routeserve.yaml, Appendix B verbatim, as a private project', () => {
    const file = parseProjectFile(routeserveYaml, 'projects/routeserve.yaml');

    // Prettier normalises quote style in YAML, so equality is checked on the parsed content.
    expect(file).toEqual(parseProjectFile(appendixBYaml(), 'docs/spec.md#appendix-b'));

    expect(file).toMatchObject({
      slug: 'routeserve',
      name: 'RouteServe',
      visibility: 'private',
      default_branch: 'main',
      expected_cadence_days: 8,
      sort_order: 20,
      retention_days: 180,
      coverage_floors: { 'apps/backend': 80, 'apps/mobile': 80, 'packages/shared': 80 },
    });
    expect(file.dev_stack.map((entry) => entry.category)).toEqual([
      'Mobile',
      'API',
      'Services',
      'Delivery',
    ]);
    expect(file.test_stack).toHaveLength(4);
    expect(file.layer_rules).toHaveLength(7);
    expect(file.layer_rules.at(-1)).toEqual({ default: 'unit' });
    expect(file.declared_suites).toEqual([
      {
        name: 'Maestro E2E (iOS)',
        layer: 'e2e',
        count: 13,
        status: 'authored_not_executed',
        note: 'Flows written; not yet certified on a simulator. Workflow is manual-only.',
      },
    ]);
  });

  it('accepts projects/ostomate2.yaml as a public project', () => {
    const file = parseProjectFile(ostomate2Yaml, 'projects/ostomate2.yaml');

    expect(file).toMatchObject({
      slug: 'ostomate2',
      visibility: 'public',
      repo_url: 'https://github.com/bhelco1/Ostomate2',
      default_branch: 'main',
      coverage_floors: { shared: 91, composeApp: 93 },
    });
    expect(file.layer_rules).toEqual([
      { match: { module: 'shared', suite: 'com.ostomate.app.data.db.*' }, layer: 'integration' },
      {
        match: { module: 'shared', suite: 'com.ostomate.app.data.RepositoryTest' },
        layer: 'integration',
      },
      {
        match: { module: 'composeApp', suite: 'com.ostomate.app.ui.screenshot.*' },
        layer: 'visual',
      },
      { default: 'unit' },
    ]);
    expect(file.declared_suites.length).toBeGreaterThan(0);
    for (const suite of file.declared_suites) {
      expect(suite).toMatchObject({ layer: 'e2e', status: 'runs_in_ci_not_reported' });
      expect(suite.count).toBeGreaterThan(0);
    }
  });

  it('fills the defaults the spec gives for omitted columns', () => {
    const file = parseProjectFile(
      [
        'slug: minimal',
        'name: Minimal',
        'tagline: The smallest valid project file.',
        'description: Nothing but the required columns.',
        'visibility: public',
        'layer_rules:',
        '  - default: unit',
      ].join('\n'),
      'projects/minimal.yaml',
    );

    const expected: ProjectFile = {
      slug: 'minimal',
      name: 'Minimal',
      tagline: 'The smallest valid project file.',
      description: 'Nothing but the required columns.',
      visibility: 'public',
      repo_url: null,
      default_branch: 'main',
      dev_stack: [],
      test_stack: [],
      layer_rules: [{ default: 'unit' }],
      name_normalization: {},
      declared_suites: [],
      coverage_floors: {},
      expected_cadence_days: 8,
      sort_order: 0,
      retention_days: 180,
    };
    expect(file).toEqual(expected);
  });

  it('rejects a slug that is not a lowercase URL segment', () => {
    for (const slug of ['Ostomate2', '-leading', 'has space', 'under_score', 'dot.', '']) {
      expectRejected(
        routeserveYaml.replace('slug: routeserve', `slug: "${slug}"`),
        'projects/routeserve.yaml',
        'slug',
        'slug',
      );
    }
  });

  it('rejects an unknown key, so a typo cannot silently drop a column', () => {
    expectRejected(
      `${routeserveYaml}\nrepo: https://example.test\n`,
      'projects/routeserve.yaml',
      'Unrecognized key',
      'repo',
    );
  });

  it('rejects invalid layer rules through LayerRulesSchema and keeps the nested path', () => {
    expectRejected(
      routeserveYaml.replace('  - default: unit\n', ''),
      'projects/routeserve.yaml',
      'default rule',
      'layer_rules',
    );
    expectRejected(
      routeserveYaml.replace('layer: api', 'layer: contract'),
      'projects/routeserve.yaml',
      'Invalid option',
      'layer_rules.1.layer',
    );
  });

  it('reads the name_normalization block Ostomate2 needs for its iOS simulator run', () => {
    const file = parseProjectFile(ostomate2Yaml, 'projects/ostomate2.yaml');

    expect(file.name_normalization).toEqual({
      suite_prefixes: ['iosSimulatorArm64Test.'],
      name_suffixes: ['[iosSimulatorArm64]'],
    });
  });

  it('rejects name_normalization that is not a capped list of non-empty strings', () => {
    const withBlock = (body: string): string => `${routeserveYaml}\nname_normalization:\n${body}`;
    const eleven = Array.from({ length: 11 }, (_, index) => `'p${index}.'`).join(', ');

    expectRejected(
      withBlock("  suite_prefixes: 'iosSimulatorArm64Test.'\n"),
      'projects/routeserve.yaml',
      'expected array',
      'name_normalization.suite_prefixes',
    );
    expectRejected(
      withBlock("  suite_prefixes: ['']\n"),
      'projects/routeserve.yaml',
      '>=1',
      'name_normalization.suite_prefixes.0',
    );
    expectRejected(
      withBlock(`  name_suffixes: [${eleven}]\n`),
      'projects/routeserve.yaml',
      '<=10',
      'name_normalization.name_suffixes',
    );
    expectRejected(
      withBlock(`  name_suffixes: ['${'x'.repeat(201)}']\n`),
      'projects/routeserve.yaml',
      '<=200',
      'name_normalization.name_suffixes.0',
    );
    expectRejected(
      withBlock('  suite_suffixes: [x]\n'),
      'projects/routeserve.yaml',
      'Unrecognized key',
      'name_normalization.suite_suffixes',
    );
  });

  it('rejects a coverage floor over 100', () => {
    expectRejected(
      routeserveYaml.replace('apps/backend: 80', 'apps/backend: 101'),
      'projects/routeserve.yaml',
      '<=100',
      'coverage_floors.apps/backend',
    );
  });

  // Design v5 item 12: a declared suite always counts at least one test or flow.
  it('rejects a declared suite with a count below 1', () => {
    expect(routeserveYaml).toContain('count: 13');
    expectRejected(
      routeserveYaml.replace('count: 13', 'count: 0'),
      'projects/routeserve.yaml',
      '>=1',
      'declared_suites.0.count',
    );
  });

  it('accepts a declared suite with a count of 1', () => {
    const file = parseProjectFile(
      routeserveYaml.replace('count: 13', 'count: 1'),
      'projects/routeserve.yaml',
    );
    expect(file.declared_suites[0]?.count).toBe(1);
  });

  it('rejects a declared-suite status outside the two the spec names', () => {
    expectRejected(
      routeserveYaml.replace('status: authored_not_executed', 'status: planned'),
      'projects/routeserve.yaml',
      'Invalid option',
      'declared_suites.0.status',
    );
  });

  it('rejects a visibility outside public and private', () => {
    expectRejected(
      routeserveYaml.replace('visibility: private', 'visibility: internal'),
      'projects/routeserve.yaml',
      'Invalid option',
      'visibility',
    );
  });

  it('reports every issue in one error, each with its path', () => {
    const error = expectRejected(
      routeserveYaml
        .replace('expected_cadence_days: 8', 'expected_cadence_days: 0')
        .replace('sort_order: 20', 'sort_order: twenty'),
      'projects/routeserve.yaml',
      '>0',
      'expected_cadence_days',
    );
    expect(error.issues.map((issue) => issue.path)).toEqual([
      'expected_cadence_days',
      'sort_order',
    ]);
  });

  it('reports YAML syntax errors as a ProjectFileError with the file path', () => {
    const error = expectRejected('slug: [unclosed', 'projects/broken.yaml', 'Flow sequence', '');
    expect(error.name).toBe('ProjectFileError');
  });

  it('rejects a document that is not a mapping', () => {
    expectRejected('- just\n- a list\n', 'projects/list.yaml', 'expected object', '');
    expectRejected('', 'projects/empty.yaml', 'expected object', '');
  });

  it('exposes the schema for callers that already hold a parsed object', () => {
    const result = ProjectFileSchema.safeParse({ slug: 'x' });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('unreachable');
    }
    const issues = result.error.issues
      .map((issue) => ({ path: issue.path.join('.'), code: issue.code }))
      .sort((a, b) => a.path.localeCompare(b.path));
    expect(issues).toEqual([
      { path: 'description', code: 'invalid_type' },
      { path: 'layer_rules', code: 'invalid_type' },
      { path: 'name', code: 'invalid_type' },
      { path: 'tagline', code: 'invalid_type' },
      { path: 'visibility', code: 'invalid_value' },
    ]);
  });
});
