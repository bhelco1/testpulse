import { describe, expect, it } from 'vitest';

import { shortSuite } from './short-suite';

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
