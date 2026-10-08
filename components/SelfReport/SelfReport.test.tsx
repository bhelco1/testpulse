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
  coverage: [],
  projectHref: '/p/testpulse',
};

// Production's figures of 7 Oct (design v12 items 1 and 10), as the view passes them.
const LIVE: SelfReportView = {
  ...SEEDED,
  run: {
    ...SEEDED.run,
    status: 'passed',
    total: '2,598',
    failed: 0,
    skipped: 0,
    duration: '1073 s',
  },
  layers: [
    { label: 'Unit', count: 1528, tone: 1 },
    { label: 'Component', count: 655, tone: 2 },
    { label: 'Integration', count: 180, tone: 3 },
    { label: 'E2E', count: 235, tone: 3 },
  ],
  total: 2598,
  coverage: [
    {
      module: 'unit',
      pct: (3125 / 3141) * 100,
      floor: 90,
      note: 'unit: 3,125 of 3,141 lines covered.',
    },
  ],
};

describe('SelfReport', () => {
  describe('not reporting yet (a database with no testpulse run)', () => {
    // Design v12 (v11 item 1): for a reset or an outage, with no phase reference and no figures.
    it('draws the design’s not-reporting card and its link to CI on GitHub', () => {
      const { container } = render(
        <SelfReport view={{ state: 'not_reporting' }} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      const card = container.querySelector<HTMLElement>('[data-state="not_reporting"]');
      expect(card?.querySelector('[data-status="not_reporting"]')?.textContent).toBe(
        'Not reporting yet',
      );
      expect(card?.querySelector('h3')?.textContent).toBe('No results received yet.');
      expect(card?.querySelector('p')?.textContent).toBe(
        'This section stays empty rather than showing numbers nobody measured. The suites run in CI on every pull request; you can see them in the repository’s Actions tab.',
      );
      expect(screen.getByRole('link', { name: 'CI runs on GitHub' }).getAttribute('href')).toBe(
        ACTIONS,
      );
      // Build progress is its own card now, after this one, not a column inside it.
      expect(card?.querySelector('[data-part="progress"]')).toBeNull();
      expect(card?.textContent).not.toMatch(/Phase|Build progress/);
      expect(container.querySelector('[data-part="total"]')).toBeNull();
      expect(container.textContent).not.toContain('Coverage against the floor');
    });
  });

  // Design v12 item 8 and v11 item 1: Build progress is the last card of section 04 in both
  // states, from docs/build-progress.json, dated by the file, with one heading, the card's h3.
  describe.each([
    ['not reporting yet', { state: 'not_reporting' } as SelfReportView],
    ['reporting', SEEDED],
  ])('build progress, %s', (_, view) => {
    it('is the last card, labelled by its one heading', () => {
      const { container } = render(
        <SelfReport view={view} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      const region = screen.getByRole('region', { name: 'Build progress' });
      expect(region.tagName).toBe('SECTION');
      expect(screen.getAllByRole('heading', { name: 'Build progress' })).toHaveLength(1);
      expect(within(region).getByRole('heading', { level: 3 }).textContent).toBe('Build progress');
      expect(container.lastElementChild).toBe(region);
      expect(region.getAttribute('class')).toContain('progress');
    });

    it('lists each phase, as of its file’s date, with icon and word', () => {
      const { container } = render(
        <SelfReport view={view} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      const progress = container.querySelector<HTMLElement>('[data-part="progress"]');
      expect(progress).toBe(screen.getByRole('region', { name: 'Build progress' }));
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

    it('notes how the pyramid counts, with no SAMPLE tags', () => {
      const { container } = render(
        <SelfReport view={SEEDED} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      expect(container.querySelector('[data-part="pyramid-note"]')?.textContent).toBe(
        'Only spec §8 layers are counted. The axe, visual and leak-sweep checks run inside the Playwright suite and count as E2E; the Action’s contract tests run in the unit job and count as Unit. Each test counts once, in the layer testpulse’s layer rules give it, whichever report it arrived in.',
      );
      expect(container.textContent).not.toContain('SAMPLE');
      expect(container.textContent).not.toContain('Not reporting yet');
    });

    // Design v12 item 1 (decided by Bobby, 2026-10-07): distinct tests, Unit and Component rows.
    it('draws distinct tests per layer, Unit and Component apart, tip first', () => {
      const { container } = render(
        <SelfReport view={LIVE} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      expect(container.querySelector('[data-part="total"]')?.textContent).toBe('2,598');
      expect(container.querySelector('[data-part="sub"]')?.textContent).toBe(
        'tests ·0 failed·0 skipped ·1073 s',
      );
      expect(
        [...container.querySelectorAll('[data-part="row"]')].map((row) => row.textContent),
      ).toEqual(['E2E2359%', 'Integration1807%', 'Component65525%', 'Unit1,52859%']);
    });

    // Design v12 item 10, components.md "How it’s tested page", data-map v11.
    it('draws the coverage card: a CoverageBar row and a line-count note per module', () => {
      const { container } = render(
        <SelfReport view={LIVE} actionsHref={ACTIONS} progress={PROGRESS} />,
      );
      const card = screen.getByRole('region', { name: 'Coverage against the floor' });
      expect(card.tagName).toBe('SECTION');
      expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(
        'Coverage against the floor',
      );
      expect(card.querySelector('[data-part="coverage-scope"]')?.textContent).toBe(
        'Lines, latest default-branch run',
      );
      const rows = [...card.querySelectorAll<HTMLElement>('[data-variant="web"]')];
      expect(rows.map((row) => [row.textContent, row.dataset.state])).toEqual([
        ['unit99.4%floor 90%', 'above'],
      ]);
      expect(
        [...card.querySelectorAll('[data-part="coverage-note"]')].map((note) => note.textContent),
      ).toEqual(['unit: 3,125 of 3,141 lines covered.']);
      // Section 04 in order: the results card, the coverage card, Build progress.
      expect([...container.children].map((child) => child.tagName)).toEqual(['DIV', 'SECTION']);
      expect(
        [...(container.firstElementChild?.children ?? [])].map(
          (child) => child.getAttribute('aria-labelledby') ?? child.tagName,
        ),
      ).toEqual(['ARTICLE', card.getAttribute('aria-labelledby')]);
    });

    it('draws a module below its floor in the CoverageBar’s below state, and no note without counts', () => {
      render(
        <SelfReport
          view={{
            ...LIVE,
            coverage: [
              { module: 'imported', pct: 80, floor: null, note: null },
              { module: 'unit', pct: 85.04, floor: 90, note: 'unit: 85 of 100 lines covered.' },
            ],
          }}
          actionsHref={ACTIONS}
          progress={PROGRESS}
        />,
      );
      const card = screen.getByRole('region', { name: 'Coverage against the floor' });
      const rows = [...card.querySelectorAll<HTMLElement>('[data-variant="web"]')];
      expect(rows.map((row) => [row.textContent, row.dataset.state])).toEqual([
        ['imported80.0%', 'none'],
        ['unit85.0%below floor 90%', 'below'],
      ]);
      expect(
        [...card.querySelectorAll('[data-part="coverage-note"]')].map((note) => note.textContent),
      ).toEqual(['unit: 85 of 100 lines covered.']);
    });

    // The design draws the card only with data; as the kiosk card omits its coverage block when
    // there are no rows, nothing is drawn rather than an empty card (spec 13.7).
    it('draws no coverage card when testpulse reported no coverage', () => {
      render(<SelfReport view={SEEDED} actionsHref={ACTIONS} progress={PROGRESS} />);
      expect(screen.queryByRole('region', { name: 'Coverage against the floor' })).toBeNull();
      expect(screen.queryByText('Coverage against the floor')).toBeNull();
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
    expect(ruleFor(CSS, '.notReporting')).toEqual({ padding: '28px' });
    expect(ruleFor(CSS, '.reporting')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      gap: 'var(--space-4)',
    });
    expect(ruleFor(CSS, '.panel')).toEqual({
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: '22px 24px',
      'box-shadow': 'var(--shadow-card)',
      'box-sizing': 'border-box',
    });
    expect(ruleFor(CSS, '.progress')).toEqual({ 'margin-top': 'var(--space-4)' });
    expect(ruleFor(CSS, '.coverageTitle')).toEqual({
      margin: '0px',
      font: '500 20px var(--font-serif)',
    });
    expect(ruleFor(CSS, '.coverageScope')).toEqual({
      'margin-top': '2px',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.coverageRows')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      gap: '12px',
      'margin-top': '18px',
    });
    expect(ruleFor(CSS, '.coverageNotes')).toEqual({
      margin: '14px 0px 0px',
      'font-size': '13.5px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.coverageNote')).toEqual({ display: 'block' });
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
      margin: '0px',
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
