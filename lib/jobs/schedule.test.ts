import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DAILY_JOB_CRON, DAILY_JOB_MAX_SECONDS, DAILY_JOB_TIME } from './schedule.ts';

describe('the daily job’s schedule', () => {
  it('is the one vercel.json gives the cron route, at the hour admin names', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    expect(config.crons).toEqual([{ path: '/api/cron/daily', schedule: DAILY_JOB_CRON }]);
    const [minute, hour] = DAILY_JOB_CRON.split(' ');
    expect(DAILY_JOB_TIME).toBe(
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} UTC`,
    );
  });
});

describe('the daily job’s time limit', () => {
  // Next.js reads a route's maxDuration only as a literal, so the route cannot import the
  // constant; this holds the two equal instead. Admin reads a run with no finish after this long
  // as one the platform stopped (decision row of 2026-10-14, a).
  it('is the cron route’s maxDuration', () => {
    const route = readFileSync('app/api/cron/daily/route.ts', 'utf8');
    const literal = /^export const maxDuration = (\d+);$/m.exec(route)?.[1];
    expect(Number(literal)).toBe(DAILY_JOB_MAX_SECONDS);
    expect(DAILY_JOB_MAX_SECONDS).toBe(300);
  });
});
