import { describe, expect, it } from 'vitest';

import { REPORT_EVENTS } from '../ingest/meta';
import { runTitle } from './title';

// Design v4 item 28 (TPKit.runTitle): titles come from runs.event and runs.branch only.
describe('runTitle', () => {
  it('titles a push by its branch', () => {
    expect(runTitle('push', 'main')).toBe('Push to main');
  });

  it('titles a pull request by its head branch, not a PR number', () => {
    expect(runTitle('pull_request', 'fix-today-count')).toBe('Pull request from fix-today-count');
  });

  it('titles scheduled and manual runs without a branch', () => {
    expect(runTitle('schedule', 'main')).toBe('Scheduled run');
    expect(runTitle('workflow_dispatch', 'main')).toBe('Manual run');
  });

  it('falls back to "Run on {branch}" for an event it has no title for', () => {
    expect(runTitle('merge_group', 'main')).toBe('Run on main');
  });

  it('has a specific title for every event ingest accepts', () => {
    for (const event of REPORT_EVENTS) {
      expect(runTitle(event, 'main')).not.toBe('Run on main');
    }
  });
});
