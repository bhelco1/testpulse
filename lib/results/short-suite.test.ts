import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseJunit } from '../parsers/junit';
import { fullTestLabel, shortSuite, suiteLabel, testLabel } from './short-suite';

// Design v4 item 20, with v8 item 12's bare file names (TPKit.shortSuite, components.md
// ProjectCard "Short suite").
describe('shortSuite', () => {
  it('keeps a bare file name with a source extension whole', () => {
    expect(shortSuite('zz-deliberate-failure.spec.ts')).toBe('zz-deliberate-failure.spec.ts');
    expect(shortSuite('asset.test.ts')).toBe('asset.test.ts');
    expect(shortSuite('Widget.test.tsx')).toBe('Widget.test.tsx');
    expect(shortSuite('loader.test.mjs')).toBe('loader.test.mjs');
    expect(shortSuite('HomeViewModelTest.kt')).toBe('HomeViewModelTest.kt');
    expect(shortSuite('build.gradle.kts')).toBe('build.gradle.kts');
    for (const extension of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'swift', 'py', 'rb', 'go']) {
      expect(shortSuite(`runner.${extension}`)).toBe(`runner.${extension}`);
    }
  });

  it('still keeps the last dotted segment of a class name that ends like no source file', () => {
    expect(shortSuite('com.example.Tests')).toBe('Tests');
  });

  it('keeps the last path segment of a path-style suite', () => {
    expect(shortSuite('apps/backend/src/routes/jobs.test.ts')).toBe('jobs.test.ts');
  });

  it('keeps the last dotted segment of a class name', () => {
    expect(shortSuite('com.ostomate.app.ui.home.HomeViewModelTest')).toBe('HomeViewModelTest');
  });

  it('leaves a plain name as it is', () => {
    expect(shortSuite('HomeViewModelTest')).toBe('HomeViewModelTest');
  });

  it('is empty for an empty suite', () => {
    expect(shortSuite('')).toBe('');
  });
});

// Maestro 2.11.0 writes a flow's title as both its classname and its name, so the suite is the
// test's own name; it is named once, and never shortened at a "/" or "." in the title.
describe('suiteLabel, testLabel and fullTestLabel', () => {
  const fixture = readFileSync(
    fileURLToPath(
      new URL(
        '../../fixtures/ostomate2/junit/maestro-2.11.0/android-emulator/e2e/03_edit_delete_event.xml',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const [flow] = parseJunit([fixture]).tests;
  if (flow === undefined) throw new Error('the Maestro fixture holds one testcase');

  it('names a Maestro flow once, whole, though its title holds a "/"', () => {
    expect(flow.suite).toBe(flow.name);
    expect(suiteLabel(flow.suite, flow.name)).toBeNull();
    expect(testLabel(flow.suite, flow.name)).toBe(
      'Journey 3: Edit/delete event from calendar day sheet',
    );
    expect(fullTestLabel(flow.suite, flow.name)).toBe(
      'Journey 3: Edit/delete event from calendar day sheet',
    );
  });

  it('puts a different suite, shortened, before the name', () => {
    const suite = 'com.ostomate.app.ui.home.HomeViewModelTest';
    expect(suiteLabel(suite, 'rendersToday')).toBe('HomeViewModelTest');
    expect(testLabel(suite, 'rendersToday')).toBe('HomeViewModelTest › rendersToday');
    expect(fullTestLabel(suite, 'rendersToday')).toBe(`${suite} › rendersToday`);
  });

  it('compares the full suite, not the shortened one', () => {
    expect(testLabel('com.example.render', 'render')).toBe('render › render');
  });
});
