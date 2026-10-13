import { describe, expect, it } from 'vitest';

import { type DailySummary, DailySummarySchema, NOTHING_PRUNED, UNFINISHED } from './summary.ts';

// heartbeats.summary's one definition (spec 5.11): a run reads ok only when it finished with no
// step failed, and its failed step, failed steps and error always agree.

const ok: DailySummary = {
  started_at: '2026-10-08T04:00:00.000Z',
  finished_at: '2026-10-08T04:00:03.000Z',
  status: 'ok',
  failed_step: null,
  error: null,
  failed_steps: [],
  heartbeat_written: true,
  projects_checked: 3,
  stale_opened: 0,
  stale_opened_project_ids: [],
  pruned: NOTHING_PRUNED,
  pruned_by_project: [],
  prune_batches: 1,
  prune_complete: true,
};

const failedPrune: DailySummary = {
  ...ok,
  status: 'failed',
  failed_step: 'prune',
  error: 'prune_expired: XX000 broke',
  failed_steps: ['prune'],
  prune_complete: false,
};

const unfinished: DailySummary = {
  ...ok,
  finished_at: null,
  status: 'failed',
  error: UNFINISHED,
  projects_checked: null,
  stale_opened: null,
  prune_batches: 0,
  prune_complete: false,
};

describe('DailySummarySchema', () => {
  it.each([
    ['an ok run', ok],
    ['a failed run', failedPrune],
    ['the row written before the steps run', unfinished],
  ])('accepts %s', (_, summary) => {
    expect(DailySummarySchema.parse(summary)).toEqual(summary);
  });

  it.each([
    ['ok with a failed step', { ...ok, failed_steps: ['prune'] }],
    ['ok with an error', { ...ok, error: 'x' }],
    ['ok but unfinished', { ...ok, finished_at: null }],
    ['failed with no error', { ...failedPrune, error: null }],
    [
      'a failed step that is not the first',
      { ...failedPrune, failed_steps: ['stale_check', 'prune'] },
    ],
    ['an unknown step', { ...failedPrune, failed_step: 'email', failed_steps: ['email'] }],
    ['an error over 300 characters', { ...failedPrune, error: 'x'.repeat(301) }],
    ['a negative count', { ...ok, pruned: { ...NOTHING_PRUNED, visits: -1 } }],
    ['a stale_closed count', { ...ok, stale_closed: 0 }],
    ['a project id that is not a UUID', { ...ok, stale_opened_project_ids: ['routeserve'] }],
    [
      'a negative tracked_sessions count',
      { ...ok, pruned: { ...NOTHING_PRUNED, tracked_sessions: -1 } },
    ],
  ])('refuses %s', (_, summary) => {
    expect(DailySummarySchema.safeParse(summary).success).toBe(false);
  });

  // Summaries written before tracked sessions existed (migration 20261012200000) have no
  // tracked_sessions count; none were pruned then, so they read as 0.
  it('reads a summary from before tracked sessions as having pruned none', () => {
    const before = {
      results: 0,
      result_failures: 0,
      visits: 4,
      rate_limit_buckets: 0,
      runs_marked_pruned: 0,
    };
    const parsed = DailySummarySchema.parse({ ...ok, pruned: before });
    expect(parsed.pruned).toEqual({ ...NOTHING_PRUNED, visits: 4, tracked_sessions: 0 });
  });
});
