// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { DailyJobView } from '../../lib/pages/admin';
import { ruleFor } from '../testing/stylesheet';
import { AdminDailyJob } from './AdminDailyJob';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'AdminDailyJob.module.css');
const at = { text: '8 Oct, 04:12 UTC', datetime: '2026-10-08T04:12:00.000Z', title: 't' };

const ON_TIME: DailyJobView = {
  notice: null,
  tiles: [
    { label: 'Last run', value: [at], sub: ['6 h ago · next around 04:00 UTC'], tone: 'normal' },
    { label: 'Heartbeat', value: ['✓ Written'], sub: ['Database kept awake'], tone: 'pass' },
    { label: 'Stale check', value: ['1 opened'], sub: ['Opened: RouteServe'], tone: 'normal' },
    { label: 'Prune', value: ['✕ Failed'], sub: ['Nothing removed'], tone: 'fail' },
  ],
};

describe('AdminDailyJob', () => {
  it('says what the job does as built, and shows the four tiles', () => {
    render(<AdminDailyJob view={ON_TIME} />);
    const section = screen.getByRole('region', { name: 'Daily job' });
    expect(section.querySelector('p')?.textContent).toBe(
      'Runs once a day around 04:00 UTC on Vercel cron. Writes a heartbeat so the free-tier ' +
        'database stays awake, opens stale alerts, and prunes: per-test results and failure text ' +
        'after 180 days (each project’s 5 most recent runs are kept), visit records and tracked ' +
        'sessions after 365 days, and expired rate-limit buckets.',
    );
    const tiles = [...section.querySelectorAll(':scope > div:last-child > div')];
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'Last run8 Oct, 04:12 UTC6 h ago · next around 04:00 UTC',
      'Heartbeat✓ WrittenDatabase kept awake',
      'Stale check1 openedOpened: RouteServe',
      'Prune✕ FailedNothing removed',
    ]);
    expect(tiles[0]?.querySelector('time')?.getAttribute('datetime')).toBe(at.datetime);
    expect(tiles.map((tile) => /(pass|attn|fail|muted)/.exec(tile.className)?.[1] ?? '')).toEqual([
      '',
      'pass',
      '',
      'fail',
    ]);
    expect(within(section).queryByRole('alert')).toBeNull();
    expect(within(section).queryByRole('status')).toBeNull();
  });

  it.each([
    ['attn', 'status', 'notice-attn'],
    ['neutral', 'status', 'notice-neutral'],
    ['fail', 'alert', 'notice-fail'],
  ] as const)('puts a %s notice above the tiles as a %s', (tone, role, className) => {
    render(<AdminDailyJob view={{ ...ON_TIME, notice: { tone, title: 'Title', body: 'Body' } }} />);
    const notice = screen.getByRole(role);
    expect(notice.textContent).toBe('TitleBody');
    expect(notice.className).toContain(className);
    expect(notice.querySelector('svg')).not.toBeNull();
  });

  it('draws the tiles and notices as the design does', () => {
    expect(ruleFor(CSS, '.tile')).toMatchObject({
      'border-radius': 'var(--radius-lg)',
      padding: 'var(--space-4) 18px',
    });
    expect(ruleFor(CSS, '.value')).toMatchObject({ font: '500 24px/1.2 var(--font-serif)' });
    expect(ruleFor(CSS, '.attn')).toMatchObject({ 'border-color': 'var(--attn)' });
    expect(ruleFor(CSS, '.fail')).toMatchObject({ 'border-color': 'var(--fail)' });
    expect(ruleFor(CSS, '.notice-neutral')).toMatchObject({
      background: 'var(--neutral-tint)',
      border: '1px solid var(--line-strong)',
    });
    expect(ruleFor(CSS, '.tiles')).toMatchObject({
      'grid-template-columns': 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    });
  });
});
