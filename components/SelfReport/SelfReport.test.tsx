// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SelfReportView } from '../../lib/pages/how-its-tested';
import { ruleFor } from '../testing/stylesheet';
import { timeLabel } from '../testing/time';
import { SelfReport } from './SelfReport';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'SelfReport.module.css');
const ACTIONS = 'https://github.com/bhelco1/testpulse/actions';

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
        <SelfReport view={{ state: 'not_reporting' }} actionsHref={ACTIONS} />,
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

    it('holds back “Build progress”, whose rows are out of date, and shows no figures', () => {
      const { container } = render(
        <SelfReport view={{ state: 'not_reporting' }} actionsHref={ACTIONS} />,
      );
      expect(container.textContent).not.toContain('Build progress');
      expect(container.textContent).not.toContain('Phase 3');
      expect(container.querySelector('[data-part="total"]')).toBeNull();
      expect(container.querySelector('article')).toBeNull();
    });
  });

  describe('reporting', () => {
    it('shows the latest run as the landing card does', () => {
      const { container } = render(<SelfReport view={SEEDED} actionsHref={ACTIONS} />);
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
        />,
      );
      expect(container.querySelector('[data-part="failed-count"]')?.getAttribute('class')).toBe('');
    });

    it('holds back the pyramid note, the coverage card and every SAMPLE tag', () => {
      const { container } = render(<SelfReport view={SEEDED} actionsHref={ACTIONS} />);
      expect(container.textContent).not.toMatch(/SAMPLE|Only spec §8|Coverage against the floor/);
      expect(container.textContent).not.toContain('Not reporting yet');
    });

    it('holds back an empty run’s figures, which the design does not draw here', () => {
      const { container } = render(
        <SelfReport
          view={{ ...SEEDED, run: { ...SEEDED.run, status: 'empty' }, layers: [], total: 0 }}
          actionsHref={ACTIONS}
        />,
      );
      expect(container.querySelector('[data-status="empty"]')?.textContent).toBe('Empty');
      expect(container.querySelector('[data-part="total"]')).toBeNull();
      expect(container.querySelector('[data-part="sub"]')).toBeNull();
    });

    it('draws no pyramid for a run with no tests', () => {
      const { container } = render(
        <SelfReport view={{ ...SEEDED, layers: [], total: 0 }} actionsHref={ACTIONS} />,
      );
      expect(container.querySelector('[data-part="row"]')).toBeNull();
    });
  });

  it('takes the mock’s sizes', () => {
    expect(ruleFor(CSS, '.total')).toMatchObject({ font: '500 64px/1 var(--font-serif)' });
    expect(ruleFor(CSS, '.title')).toMatchObject({ font: '500 26px/1.25 var(--font-serif)' });
    expect(ruleFor(CSS, '.notReporting')).toMatchObject({ padding: '28px', gap: '28px 48px' });
    expect(ruleFor(CSS, '.pyramid > ul')).toMatchObject({ gap: '6px' });
  });
});
