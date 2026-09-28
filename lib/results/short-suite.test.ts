import { describe, expect, it } from 'vitest';

import { shortSuite } from './short-suite';

// Design v4 item 20 (TPKit.shortSuite).
describe('shortSuite', () => {
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
