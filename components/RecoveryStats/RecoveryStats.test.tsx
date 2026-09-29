// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Recovery, TimeToGreen } from '../../lib/stats/time-to-green';
import { ruleFor } from '../testing/stylesheet';
import { RecoveryStats } from './RecoveryStats';

afterEach(cleanup);

// Design v6 item 3; components.md RecoveryStats, drawn on the Design System (section 05) in four
// states with the figures used here: green, red now, no recoveries in 90 days, and red now with
// no recoveries yet.

const CSS = join(import.meta.dirname, 'RecoveryStats.module.css');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const recovery = (elapsedMs: number): Recovery => ({
  failedRunId: 'f',
  failedAt: new Date('2026-09-01T00:00:00Z'),
  greenRunId: 'g',
  greenAt: new Date(Date.parse('2026-09-01T00:00:00Z') + elapsedMs),
  elapsedMs,
});

// Four recoveries of 1 h, 2 h, 2 h 28 m and 9 h 2 m: the median is the mean of the middle two,
// (2 h + 2 h 28 m) / 2 = 2 h 14 m, and the worst 9 h 2 m.
const elapsed = [HOUR, 2 * HOUR, 2 * HOUR + 28 * MINUTE, 9 * HOUR + 2 * MINUTE];
const FOUR: TimeToGreen = {
  recoveries: elapsed.map(recovery),
  medianMs: 2 * HOUR + 14 * MINUTE,
  worstMs: 9 * HOUR + 2 * MINUTE,
  stillRed: null,
};
const NONE: TimeToGreen = { recoveries: [], medianMs: null, worstMs: null, stillRed: null };
const redFor = (elapsedMs: number): TimeToGreen['stillRed'] => ({
  failedRunId: 'r',
  failedAt: new Date('2026-10-01T00:00:00Z'),
  elapsedMs,
});

const part = (root: Element, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);
const texts = (root: Element | null) =>
  [...(root?.children ?? [])].map((child) => child.textContent);

function cells(container: HTMLElement) {
  const [streak, green] = [...container.querySelectorAll<HTMLElement>('[data-part="cell"]')];
  if (streak === undefined || green === undefined) throw new Error('two cells expected');
  return { streak, green };
}

describe('RecoveryStats', () => {
  it('green: the current streak with its longest, and the median with its count and worst', () => {
    const { container } = render(
      <RecoveryStats greenStreak={{ current: 41, longest: 58 }} timeToGreen={FOUR} />,
    );
    const { streak, green } = cells(container);

    expect(part(streak, 'label')?.textContent).toBe('Green streak');
    expect(texts(part(streak, 'value'))).toEqual(['41', 'runs']);
    expect(texts(part(streak, 'sub'))).toEqual(['Longest', '58 runs']);
    expect(part(green, 'label')?.textContent).toBe('Time to green');
    expect(part(green, 'value')?.textContent).toBe('2h 14m');
    expect(part(green, 'sub')?.textContent).toBe('Median of 4, 90 days · worst 9h 02m');
    expect(part(container, 'red-now')).toBeNull();
  });

  it('red now: a streak of 0 and a --fail "Red now for {duration}" line under the median', () => {
    const { container } = render(
      <RecoveryStats
        greenStreak={{ current: 0, longest: 58 }}
        timeToGreen={{ ...FOUR, stillRed: redFor(21 * HOUR + 10 * MINUTE) }}
      />,
    );
    const { streak, green } = cells(container);

    expect(texts(part(streak, 'value'))).toEqual(['0', 'runs']);
    // The open stretch is not in the median or the worst until it recovers.
    expect(part(green, 'value')?.textContent).toBe('2h 14m');
    expect(part(green, 'sub')?.textContent).toBe('Median of 4, 90 days · worst 9h 02m');
    const red = part(green, 'red-now');
    expect([...(red?.querySelectorAll('span') ?? [])].map((s) => s.textContent)).toEqual([
      'Red now for',
      '21h 10m',
    ]);
    const svg = red?.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('12');
    expect(svg?.getAttribute('stroke-width')).toBe('2.8');
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('m15 9-6 6M9 9l6 6');
  });

  it('no recoveries in 90 days: "None" and "No recoveries in 90 days", never 0', () => {
    const { container } = render(
      <RecoveryStats greenStreak={{ current: 41, longest: 41 }} timeToGreen={NONE} />,
    );
    const { streak, green } = cells(container);

    expect(texts(part(streak, 'value'))).toEqual(['41', 'runs']);
    expect(texts(part(streak, 'sub'))).toEqual(['Longest', '41 runs']);
    expect(part(green, 'value')?.textContent).toBe('None');
    expect(part(green, 'sub')?.textContent).toBe('No recoveries in 90 days');
    expect(part(container, 'red-now')).toBeNull();
  });

  it('red now with no recoveries yet: "None" with the Red now line', () => {
    const { container } = render(
      <RecoveryStats
        greenStreak={{ current: 0, longest: 12 }}
        timeToGreen={{ ...NONE, stillRed: redFor(3 * DAY + 4 * HOUR) }}
      />,
    );
    const { streak, green } = cells(container);

    expect(texts(part(streak, 'value'))).toEqual(['0', 'runs']);
    expect(texts(part(streak, 'sub'))).toEqual(['Longest', '12 runs']);
    expect(part(green, 'value')?.textContent).toBe('None');
    expect(part(green, 'sub')?.textContent).toBe('No recoveries in 90 days');
    expect(texts(part(green, 'red-now')).slice(1)).toEqual(['Red now for', '3d 4h']);
  });

  it('says "run" at 1, for the current streak and the longest', () => {
    const { container } = render(
      <RecoveryStats
        greenStreak={{ current: 1, longest: 1 }}
        timeToGreen={{ ...FOUR, recoveries: [recovery(HOUR)], medianMs: HOUR, worstMs: HOUR }}
      />,
    );
    const { streak, green } = cells(container);
    expect(texts(part(streak, 'value'))).toEqual(['1', 'run']);
    expect(texts(part(streak, 'sub'))).toEqual(['Longest', '1 run']);
    expect(part(green, 'sub')?.textContent).toBe('Median of 1, 90 days · worst 1h 00m');
  });

  it('sets the cells as the design draws them: 13 labels, 30 serif values, 13 sub-lines', () => {
    expect(ruleFor(CSS, '.label')).toEqual({ 'font-size': '13px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.value')).toEqual({ font: '500 30px/1.15 var(--font-serif)' });
    expect(ruleFor(CSS, '.streakValue')).toEqual({
      display: 'flex',
      'align-items': 'baseline',
      gap: '6px',
      'margin-top': '4px',
    });
    expect(ruleFor(CSS, '.greenValue')).toEqual({ 'margin-top': '4px' });
    expect(ruleFor(CSS, '.unit')).toEqual({ 'font-size': '18px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.sub')).toEqual({
      'margin-top': '2px',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.longest')).toEqual({ display: 'flex', gap: '4px' });
    expect(ruleFor(CSS, '.greenSub')).toEqual({ 'text-wrap': 'pretty' });
    expect(ruleFor(CSS, '.redNow')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      'margin-top': '4px',
      'font-size': '13px',
      'font-weight': '600',
      color: 'var(--fail)',
    });
    expect(ruleFor(CSS, '.redNow svg')).toEqual({ flex: '0 0 auto' });
  });
});
