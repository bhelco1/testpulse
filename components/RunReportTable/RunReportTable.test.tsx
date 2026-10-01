// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { RunReportTable, type RunReportRow } from './RunReportTable';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'RunReportTable.module.css');

const received = (text: string) => ({
  text,
  datetime: `2026-10-05T${text}.000Z`,
  title: `5 Oct 2026, ${text.slice(0, 5)} UTC`,
});

const REPORTS: RunReportRow[] = [
  {
    key: 'android/shared/jvm',
    status: 'passed',
    passedShare: 100,
    failedShare: 0,
    skippedShare: 0,
    result: '82 passed',
    tests: '82',
    received: received('14:03:41'),
    duration: '11 s',
  },
  {
    key: 'ios/composeApp/ios-sim',
    status: 'failed',
    passedShare: 98,
    failedShare: 2,
    skippedShare: 0,
    result: '1 failed · 49 passed',
    tests: '50',
    received: received('14:06:30'),
    duration: '7 s',
  },
];

// design/pages/Run Detail.dc.html, "Reports in this run".
describe('RunReportTable', () => {
  it('tables each report: status, key, results, tests, time received and duration', () => {
    const { getByRole } = render(<RunReportTable reports={REPORTS} />);
    const table = getByRole('table', { name: 'Reports in this run' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Status', 'Job / module / platform', 'Results', 'Tests', 'Received', 'Time']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ['Passed', 'android/shared/jvm', '82 passed', '82', '14:03:41', '11 s'],
      ['Failed', 'ios/composeApp/ios-sim', '1 failed · 49 passed', '50', '14:06:30', '7 s'],
    ]);
  });

  it('dates each report as a <time> with its instant and full date', () => {
    const { container } = render(<RunReportTable reports={REPORTS} />);
    const time = container.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2026-10-05T14:03:41.000Z');
    expect(time?.getAttribute('title')).toBe('5 Oct 2026, 14:03 UTC');
  });

  it('tints a failing report and draws its bar: green and red shares, red at least 4 px', () => {
    const { container } = render(<RunReportTable reports={REPORTS} />);
    const [passing, failing] = [...container.querySelectorAll<HTMLElement>('[data-part="report"]')];

    expect(passing?.dataset.status).toBe('passed');
    expect(failing?.dataset.status).toBe('failed');
    const bar = (row: HTMLElement | undefined, part: string) =>
      row?.querySelector<HTMLElement>(`[data-part="${part}"]`)?.style.width;
    expect([bar(passing, 'bar-pass'), bar(passing, 'bar-fail')]).toEqual(['100%', '0%']);
    expect([bar(failing, 'bar-pass'), bar(failing, 'bar-fail')]).toEqual(['98%', '2%']);
    // The bar is drawn for the eye; the line beside it says the same in words.
    expect(failing?.querySelector('[data-part="bar"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  // Design v8 item 26: the bar runs passed, failed, skipped (--neutral), each at least 4 px when
  // there is any.
  it('draws a skipped share after the passed and failed ones', () => {
    const { container } = render(
      <RunReportTable
        reports={[
          {
            ...REPORTS[1],
            passedShare: 88,
            failedShare: 2,
            skippedShare: 10,
            result: '1 failed · 44 passed · 5 skipped',
          } as RunReportRow,
          { ...REPORTS[0], skippedShare: 0 } as RunReportRow,
        ]}
      />,
    );
    const [skipping, none] = [...container.querySelectorAll<HTMLElement>('[data-part="report"]')];
    const bar = skipping?.querySelector('[data-part="bar"]');
    expect([...(bar?.children ?? [])].map((part) => part.getAttribute('data-part'))).toEqual([
      'bar-pass',
      'bar-fail',
      'bar-skip',
    ]);
    const skip = skipping?.querySelector<HTMLElement>('[data-part="bar-skip"]');
    expect(skip?.style.width).toBe('10%');
    expect(skip?.className).toContain('barSkip');
    expect(none?.querySelector('[data-part="bar-skip"]')?.className).not.toContain('barSkip');
    expect(skipping?.querySelector('[data-part="result"]')?.textContent).toBe(
      '1 failed · 44 passed · 5 skipped',
    );
  });

  // Design v8 item 27: Empty status, a dashed --attn track, "No tests in this report", "0", "—".
  it('reads Empty for a report with no tests: a dashed track and its line in --attn', () => {
    const { container, getAllByRole } = render(
      <RunReportTable
        reports={[
          {
            key: 'ios/e2e/ios-sim',
            received: received('14:03:41'),
            status: 'empty',
            passedShare: 0,
            failedShare: 0,
            skippedShare: 0,
            result: 'No tests in this report',
            tests: '0',
            duration: '—',
          },
        ]}
      />,
    );
    const row = container.querySelector<HTMLElement>('[data-part="report"]');
    expect(row?.dataset.status).toBe('empty');
    expect(row?.className).not.toContain('failing');
    expect(
      within(getAllByRole('row')[1] as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Empty', 'ios/e2e/ios-sim', 'No tests in this report', '0', '14:03:41', '—']);
    expect(row?.querySelector('[data-status-word]')?.className).toContain('attn');
    expect(row?.querySelector('[data-part="bar"]')).toBeNull();
    expect(row?.querySelector('[data-part="empty-track"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(row?.querySelector('[data-part="result"]')?.className).toContain('resultEmpty');
  });

  it('scrolls sideways inside its own box, which the keyboard can reach', () => {
    const { getByRole } = render(<RunReportTable reports={REPORTS} />);
    const region = getByRole('region', { name: 'Reports in this run' });
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('draws the box, the 760 px grid and the rows as the mock does', () => {
    expect(ruleFor(CSS, '.box')).toEqual({
      'overflow-x': 'auto',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-lg)',
    });
    expect(ruleFor(CSS, '.table')).toEqual({
      display: 'block',
      'min-width': '760px',
      'border-collapse': 'collapse',
    });
    expect(ruleFor(CSS, '.row')).toEqual({
      display: 'grid',
      'grid-template-columns': '120px minmax(0, 1.4fr) minmax(0, 1fr) 90px 120px 90px',
      gap: '14px',
      'align-items': 'center',
      padding: '14px 18px',
      'border-bottom': '1px solid var(--line)',
      'font-size': '14px',
      'text-align': 'left',
    });
    expect(ruleFor(CSS, '.head')).toEqual({
      padding: '12px 18px',
      font: '600 12px var(--font-mono)',
      'letter-spacing': '0.04em',
      'text-transform': 'uppercase',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.failing')).toEqual({ background: 'var(--fail-tint)' });
    expect(ruleFor(CSS, '.status')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.key')).toEqual({
      font: '13.5px var(--font-mono)',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.bar')).toEqual({
      display: 'flex',
      height: '6px',
      'border-radius': 'var(--radius-pill)',
      overflow: 'hidden',
      background: 'var(--raised)',
    });
    expect(ruleFor(CSS, '.barFail')).toEqual({ background: 'var(--fail)', 'min-width': '4px' });
    expect(ruleFor(CSS, '.barSkip')).toEqual({ background: 'var(--neutral)', 'min-width': '4px' });
    expect(ruleFor(CSS, '.emptyTrack')).toEqual({
      display: 'block',
      height: '6px',
      'box-sizing': 'border-box',
      'border-radius': 'var(--radius-pill)',
      border: '1.5px dashed var(--attn)',
    });
    expect(ruleFor(CSS, '.attn')).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.resultEmpty')).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.result')).toEqual({
      'font-size': '12.5px',
      'white-space': 'nowrap',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.tests')).toEqual({ 'text-align': 'right', 'font-weight': '600' });
    expect(ruleFor(CSS, '.received')).toEqual({
      'text-align': 'right',
      color: 'var(--ink-3)',
      'font-size': '13px',
    });
    expect(ruleFor(CSS, '.time')).toEqual({ 'text-align': 'right', color: 'var(--ink-2)' });
  });
});
