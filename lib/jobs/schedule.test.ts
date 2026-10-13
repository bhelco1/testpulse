import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DAILY_JOB_CRON, DAILY_JOB_TIME } from './schedule.ts';

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
