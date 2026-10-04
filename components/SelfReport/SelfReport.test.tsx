// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { BuildProgressView } from '../../lib/pages/build-progress';
import type { SelfReportView } from '../../lib/pages/how-its-tested';
import { ruleFor } from '../testing/stylesheet';
import { timeLabel } from '../testing/time';
import { SelfReport } from './SelfReport';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'SelfReport.module.css');
const ACTIONS = 'https://github.com/bhelco1/testpulse/actions';

const PROGRESS: BuildProgressView = {
  asOf: { text: '1 Oct', datetime: '2026-10-01T00:00:00.000Z', title: '1 Oct 2026, 00:00 UTC' },
  phases: [
    { n: 'Phase 4', label: 'Backfill', status: 'done' },
    { n: 'Phase 5', label: 'Public site', status: 'in_progress' },
    { n: 'Phase 6', label: 'Alerts, tracked links, admin', status: 'planned' },
  ],
};

// testpulse's one seeded run (lib/seed/plan.ts): the Playwright fixture, 13 days before SEED_NOW.
const SEEDED: SelfReportView = {
  state: 'reporting',
  run: {
    status: 'failed',
    when: timeLabel('1 week ago'),
    branch: 'main',
    sha: '0123456',
    total: '3',
    testsWord: 'tests',
    failed: 1,
    skipped: 1,
    duration: '0 s',
  },
  layers: [{ label: 'E2E', count: 3, tone: 3 }],
  total: 3,
  projectHref: '/p/testpulse',
};

describe('SelfReport', () => {
  describe('not reporting yet (production before Phase 7)', () => {
    it('draws the design’s not-reporting card and its link to CI on GitHub', () => {
      const { container } = render(
        <SelfReport view={{ state: 'not_reporting' }} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      expect(container.querySelector('[data-status="not_reporting"]')?.textContent).toBe(
        'Not reporting yet',
      );
      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
        'Self-reporting starts in Phase 7.',
      );
      expect(container.textContent).toContain(
        'Until then this section stays empty rather than showing numbers nobody measured. The suites already run in CI on every pull request; you can see them in the repository’s Actions tab.',
      );
      expect(screen.getByRole('link', { name: 'CI runs on GitHub' }).getAttribute('href')).toBe(
        ACTIONS,
      );
    });

    // v9 item 4: from docs/build-progress.json, dated by the file; icon and word per status.
    it('lists build progress, as of its file’s date, each phase with icon and word', () => {
      const { container } = render(
        <SelfReport view={{ state: 'not_reporting' }} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      const progress = container.querySelector<HTMLElement>('[data-part="progress"]');
      expect(progress?.querySelector('[data-part="progress-title"]')?.textContent).toBe(
        'Build progress',
      );
      const asOf = progress?.querySelector('[data-part="as-of"]');
      expect(asOf?.textContent).toBe('As of 1 Oct');
      expect(asOf?.querySelector('time')?.getAttribute('datetime')).toBe(
        '2026-10-01T00:00:00.000Z',
      );
      const rows = [...(progress?.querySelectorAll<HTMLElement>('[data-part="phase"]') ?? [])];
      expect(rows.map((row) => row.textContent)).toEqual([
        'Phase 4BackfillDone',
        'Phase 5Public siteIn progress',
        'Phase 6Alerts, tracked links, adminPlanned',
      ]);
      expect(
        rows.map((row) => row.querySelector('[data-status]')?.getAttribute('data-status')),
      ).toEqual(['done', 'in_progress', 'planned']);
      expect(rows.every((row) => row.querySelector('svg')?.getAttribute('width') === '14')).toBe(
        true,
      );
      // The mock's footnote says the list is read from the specification; it is read from a
      // data file, so the footnote is not drawn (spec 13.7).
      expect(container.textContent).not.toContain('Read from the specification');
      expect(container.querySelector('[data-part="total"]')).toBeNull();
      expect(container.querySelector('article')).toBeNull();
    });
  });

  describe('reporting', () => {
    it('shows the latest run as the landing card does', () => {
      const { container } = render(
        <SelfReport view={SEEDED} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      const article = within(screen.getByRole('article'));
      expect(
        article.getByText('Failed').closest('[data-status]')?.getAttribute('data-status'),
      ).toBe('failed');
      expect(container.querySelector('[data-part="meta"]')?.textContent).toBe(
        '1 week ago·main·0123456',
      );
      const time = container.querySelector('[data-part="when"] time');
      expect(time?.getAttribute('datetime')).toBe('2026-10-05T11:56:00.000Z');
      expect(container.querySelector('[data-part="total"]')?.textContent).toBe('3');
      expect(container.querySelector('[data-part="sub"]')?.textContent).toBe(
        'tests ·1 failed·1 skipped ·0 s',
      );
      expect(
        container.querySelector('[data-part="failed-count"]')?.getAttribute('class'),
      ).toContain('failed');
      expect(
        [...container.querySelectorAll('[data-part="row"]')].map((row) => row.textContent),
      ).toEqual(['E2E3100%']);
      expect(article.getByRole('link', { name: 'Full project page →' }).getAttribute('href')).toBe(
        '/p/testpulse',
      );
    });

    it('does not mark a failed count of 0', () => {
      const { container } = render(
        <SelfReport
          view={{ ...SEEDED, run: { ...SEEDED.run, status: 'passed', failed: 0 } }}
          actionsHref={ACTIONS}
          progress={PROGRESS}
        />,
      );
      expect(container.querySelector('[data-part="failed-count"]')?.getAttribute('class')).toBe('');
    });

    it('notes how the pyramid counts, and holds back the coverage card and SAMPLE tags', () => {
      const { container } = render(
        <SelfReport view={SEEDED} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      expect(container.querySelector('[data-part="pyramid-note"]')?.textContent).toBe(
        'Only spec §8 layers are counted. The axe, visual and leak-sweep checks run inside the Playwright suite and count as E2E; the reporter contract tests run in the unit job and count as Unit.',
      );
      expect(container.textContent).not.toMatch(/SAMPLE|Coverage against the floor/);
      expect(container.textContent).not.toContain('Not reporting yet');
      expect(container.textContent).not.toContain('Build progress');
    });

    it('holds back an empty run’s figures, which the design does not draw here', () => {
      const { container } = render(
        <SelfReport
          view={{ ...SEEDED, run: { ...SEEDED.run, status: 'empty' }, layers: [], total: 0 }}
          actionsHref={ACTIONS}
          progress={PROGRESS}
        />,
      );
      expect(container.querySelector('[data-status="empty"]')?.textContent).toBe('Empty');
      expect(container.querySelector('[data-part="total"]')).toBeNull();
      expect(container.querySelector('[data-part="sub"]')).toBeNull();
    });

    it('draws no pyramid for a run with no tests', () => {
      const { container } = render(
        <SelfReport
          view={{ ...SEEDED, layers: [], total: 0 }}
          actionsHref={ACTIONS}
          progress={PROGRESS}
        />,
      );
      expect(container.querySelector('[data-part="row"]')).toBeNull();
    });
  });

  it('takes the mock’s sizes', () => {
    expect(ruleFor(CSS, '.total')).toMatchObject({ font: '500 64px/1 var(--font-serif)' });
    expect(ruleFor(CSS, '.title')).toMatchObject({ font: '500 26px/1.25 var(--font-serif)' });
    expect(ruleFor(CSS, '.notReporting')).toMatchObject({ padding: '28px', gap: '28px 48px' });
    expect(ruleFor(CSS, '.pyramid > ul')).toMatchObject({ gap: '6px' });
    expect(ruleFor(CSS, '.pyramidNote')).toEqual({
      margin: '18px 0px 0px',
      'font-size': '13.5px',
      'line-height': '1.5',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.progressHead')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'justify-content': 'space-between',
      gap: '4px 12px',
      'margin-bottom': '12px',
    });
    expect(ruleFor(CSS, '.progressTitle')).toEqual({
      font: '600 12px var(--font-mono)',
      'letter-spacing': '0.08em',
      'text-transform': 'uppercase',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.asOf')).toEqual({
      display: 'flex',
      gap: '4px',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.phase')).toEqual({
      display: 'grid',
      'grid-template-columns': '72px minmax(0, 1fr) auto',
      gap: '12px',
      'align-items': 'center',
      padding: '11px 0px',
      'border-top': '1px solid var(--line)',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.phaseN')).toEqual({
      'font-family': 'var(--font-mono)',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.phaseStatus')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.done')).toEqual({ color: 'var(--pass)' });
    expect(ruleFor(CSS, '.inProgress')).toEqual({ color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.planned')).toEqual({ color: 'var(--ink-3)' });
  });
});
