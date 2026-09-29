// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layerSegments } from '../../lib/design/layers';
import { ruleFor } from '../testing/stylesheet';
import {
  ProjectCard,
  type KioskProjectCardProps,
  type WebProjectCardProps,
  type ProjectCardRun,
} from './ProjectCard';
import { timeLabel } from '../testing/time';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'ProjectCard.module.css');

const PASSED_RUN: ProjectCardRun = {
  status: 'passed',
  when: timeLabel('4 min ago'),
  branch: 'main',
  sha: '0e2d0b4c9a11f3e7',
  href: '/p/ostomate2/runs/35642780279',
  total: 142,
  failed: 0,
  skipped: 0,
  duration: '27 s',
};

const OSTOMATE2: WebProjectCardProps = {
  project: {
    name: 'Ostomate2',
    tagline: 'Local-first ostomy supply tracker for Android and iOS. Kotlin Multiplatform.',
    visibility: 'public',
    href: '/p/ostomate2',
  },
  latestRun: PASSED_RUN,
  layers: layerSegments({ unit: 103, integration: 29, visual: 10 }),
  coverage: [
    { module: 'shared', pct: 92, floor: 91 },
    { module: 'composeApp', pct: 94.3, floor: 93 },
  ],
  reports: [
    { key: 'android/shared/jvm', total: 82 },
    { key: 'ios/shared/ios-sim', total: 82 },
    { key: 'android/composeApp/jvm', total: 60 },
    { key: 'ios/composeApp/ios-sim', total: 50 },
  ],
  declared: [
    { name: 'Maestro E2E (Android)', layer: 'e2e', count: 7, status: 'runs_in_ci_not_reported' },
    { name: 'Maestro E2E (iOS)', layer: 'e2e', count: 5, status: 'runs_in_ci_not_reported' },
  ],
  health: { health: 'healthy' },
};

const FAILED: WebProjectCardProps = {
  ...OSTOMATE2,
  latestRun: { ...PASSED_RUN, status: 'failed', sha: 'a41f9c2', failed: 1 },
  failing: [
    {
      suite: 'com.ostomate.app.ui.home.HomeViewModelTest',
      name: 'rendersToday',
      platform: 'ios-sim',
    },
  ],
};

const ROUTESERVE_RUN: ProjectCardRun = {
  status: 'passed',
  when: timeLabel('2 h ago'),
  branch: 'main',
  sha: 'c238574',
  href: '/p/routeserve/runs/1',
  total: 1048,
  failed: 0,
  skipped: 0,
  duration: '29 s',
};

const ROUTESERVE: WebProjectCardProps = {
  project: {
    name: 'RouteServe',
    tagline: 'Field-service CRM, scheduling, and route planning. Mobile app plus multi-tenant API.',
    visibility: 'private',
    href: '/p/routeserve',
  },
  latestRun: ROUTESERVE_RUN,
  layers: layerSegments({ unit: 608, component: 165, integration: 3, api: 269 }),
  coverage: [{ module: 'apps/backend', pct: 96.1, floor: 80 }],
  reports: [{ key: 'test/apps/backend/node', total: 498 }],
  declared: [
    { name: 'Maestro E2E · iOS', layer: 'e2e', count: 13, status: 'authored_not_executed' },
  ],
  health: { health: 'healthy' },
};

const part = (root: Element, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);
const parts = (root: Element, name: string) => [
  ...root.querySelectorAll<HTMLElement>(`[data-part="${name}"]`),
];
const cardOf = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('ProjectCard (web)', () => {
  it('passed: status, meta, linked name, tagline, total and sub-line', () => {
    const { container, getByRole } = render(<ProjectCard {...OSTOMATE2} />);
    const card = cardOf(container);

    expect(card.tagName).toBe('ARTICLE');
    expect(card.dataset.variant).toBe('web');
    expect(card.querySelector('[data-status]')?.getAttribute('data-status')).toBe('passed');
    expect(part(card, 'meta')?.textContent).toBe('4 min ago·main·0e2d0b4');
    expect(getByRole('link', { name: '0e2d0b4' }).getAttribute('href')).toBe(
      '/p/ostomate2/runs/35642780279',
    );
    const heading = getByRole('heading', { level: 3, name: 'Ostomate2' });
    expect(within(heading).getByRole('link').getAttribute('href')).toBe('/p/ostomate2');
    expect(part(card, 'tagline')?.textContent).toBe(OSTOMATE2.project.tagline);
    expect(part(card, 'total')?.textContent).toBe('142');
    expect(part(card, 'sub')?.textContent).toBe('tests ·0 failed·0 skipped ·27 s');
    expect(part(card, 'failed-count')?.className).not.toContain('failedCount');
    expect(part(card, 'failing')).toBeNull();
    expect(card.querySelector('[data-size="web"][data-health]')?.textContent).toBe(
      'Reporting healthy',
    );
  });

  it('draws the layer bar, one coverage row per module and the per-report block', () => {
    const { container } = render(<ProjectCard {...OSTOMATE2} />);
    const card = cardOf(container);

    expect(part(card, 'layers')?.querySelector('[data-part="bar"]')).not.toBeNull();
    expect(
      [...card.querySelectorAll<HTMLElement>('[data-state]')].map((row) => row.dataset.state),
    ).toEqual(['above', 'above']);
    expect(part(card, 'no-coverage')).toBeNull();
    expect(part(card, 'reports-head')?.textContent).toBe('4 reports in this run');
    expect(part(card, 'reports-side')?.textContent).toBe('jvm 142 · ios-sim 132');
    expect(parts(card, 'report').map((r) => r.textContent)).toEqual([
      'android/shared/jvm82',
      'ios/shared/ios-sim82',
      'android/composeApp/jvm60',
      'ios/composeApp/ios-sim50',
    ]);
  });

  it('groups thousands in the total and report counts', () => {
    const { container } = render(<ProjectCard {...ROUTESERVE} />);
    expect(part(cardOf(container), 'total')?.textContent).toBe('1,048');
    expect(parts(cardOf(container), 'report')[0]?.textContent).toBe('test/apps/backend/node498');
  });

  it('failed: the total stays ink, "{n} failed" turns --fail, first failing test links to the run', () => {
    const { container } = render(<ProjectCard {...FAILED} />);
    const card = cardOf(container);
    const failing = part(card, 'failing');

    expect(card.querySelector('[data-status]')?.getAttribute('data-status')).toBe('failed');
    expect(part(card, 'total')?.className).not.toContain('totalEmpty');
    expect(part(card, 'failed-count')?.textContent).toBe('1 failed');
    expect(part(card, 'failed-count')?.className).toContain('failedCount');
    expect(failing?.tagName).toBe('A');
    expect(failing?.getAttribute('href')).toBe(PASSED_RUN.href);
    expect(failing?.textContent).toBe('HomeViewModelTest › rendersToday' + 'ios-sim');
  });

  it('failed: shortens a dotted suite to its class name and keeps the full name in title (v4 item 20)', () => {
    const { container } = render(<ProjectCard {...FAILED} />);
    const name = part(cardOf(container), 'failing-name');

    expect(name?.textContent).toBe('HomeViewModelTest › rendersToday');
    expect(name?.getAttribute('title')).toBe(
      'com.ostomate.app.ui.home.HomeViewModelTest › rendersToday',
    );
  });

  it('failed with several failing tests says how many more', () => {
    const { container } = render(
      <ProjectCard
        {...FAILED}
        latestRun={{ ...PASSED_RUN, status: 'failed', failed: 3 }}
        failing={[
          { suite: 'HomeViewModelTest', name: 'rendersToday', platform: 'ios-sim' },
          { suite: 'HomeViewModelTest', name: 'showsDaysOfSupply', platform: 'ios-sim' },
          { suite: 'BackupSerializerTest', name: 'restoresBackup', platform: 'jvm' },
        ]}
      />,
    );
    expect(part(cardOf(container), 'failing')?.textContent).toBe(
      'HomeViewModelTest › rendersToday' + 'ios-sim' + '+2 more',
    );
  });

  it('private: PrivateTag beside the name and the SHA as plain text', () => {
    const { container, getByRole, queryByRole } = render(<ProjectCard {...ROUTESERVE} />);
    const heading = getByRole('heading', { level: 3 });

    expect(heading.textContent).toBe('RouteServePrivate repository');
    expect(heading.querySelector('[data-variant="web"]')?.textContent).toBe('Private repository');
    expect(queryByRole('link', { name: 'c238574' })).toBeNull();
    expect(part(cardOf(container), 'sha')?.tagName).toBe('SPAN');
  });

  it('private + failed: the failing test name still shows and links to the run page', () => {
    const { container } = render(
      <ProjectCard
        {...ROUTESERVE}
        latestRun={{ ...ROUTESERVE_RUN, status: 'failed', sha: '5f0a2c9', failed: 2 }}
        failing={[
          {
            suite: 'apps/backend/src/routes/jobs.test.ts',
            name: 'returns 409 when job overlaps',
            platform: 'node',
          },
          { suite: 'apps/backend/src/routes/jobs.test.ts', name: 'x', platform: 'node' },
        ]}
      />,
    );
    const card = cardOf(container);

    expect(part(card, 'sha')?.tagName).toBe('SPAN');
    expect(part(card, 'failing')?.getAttribute('href')).toBe('/p/routeserve/runs/1');
    expect(part(card, 'failing')?.textContent).toBe(
      'jobs.test.ts › returns 409 when job overlaps' + 'node' + '+1 more',
    );
    expect(part(card, 'failing-name')?.getAttribute('title')).toBe(
      'apps/backend/src/routes/jobs.test.ts › returns 409 when job overlaps',
    );
  });

  it('empty: total 0 in amber, reports received, the empty note, and no layers or coverage', () => {
    const { container } = render(
      <ProjectCard
        {...OSTOMATE2}
        latestRun={{ ...PASSED_RUN, status: 'empty', total: 0 }}
        reports={OSTOMATE2.reports.map((r) => ({ ...r, total: 0 }))}
        health={{ health: 'empty' }}
      />,
    );
    const card = cardOf(container);

    expect(card.querySelector('[data-status]')?.getAttribute('data-status')).toBe('empty');
    expect(part(card, 'total')?.textContent).toBe('0');
    expect(part(card, 'total')?.className).toContain('totalEmpty');
    expect(part(card, 'sub')?.textContent).toBe('tests executed ·4 reports received');
    expect(part(card, 'layers')).toBeNull();
    expect(card.querySelector('[data-state]')).toBeNull();
    expect(part(card, 'no-coverage')).toBeNull();
    expect(part(card, 'empty-note')?.textContent).toBe(
      'Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn’t counted in any total.',
    );
    expect(
      part(card, 'empty-note')?.querySelector('svg circle')?.getAttribute('stroke-dasharray'),
    ).toBe('3.5 3');
    expect(parts(card, 'report-count').every((c) => c.className.includes('reportEmpty'))).toBe(
      true,
    );
    expect(card.querySelector('[data-health]')?.textContent).toBe('Last run empty');
    expect(part(card, 'reports-side')?.textContent).toBe('jvm 0 · ios-sim 0');
  });

  it('empty: shows every report count as 0, whatever totals arrive (components.md)', () => {
    const { container } = render(
      <ProjectCard
        {...OSTOMATE2}
        latestRun={{ ...PASSED_RUN, status: 'empty', total: 0 }}
        health={{ health: 'empty' }}
      />,
    );
    const card = cardOf(container);
    expect(parts(card, 'report-count').map((c) => c.textContent)).toEqual(['0', '0', '0', '0']);
    expect(part(card, 'reports-side')?.textContent).toBe('jvm 0 · ios-sim 0');
  });

  it('is singular at one: "test", "1 report received", "1 report in this run" (v4 item 50)', () => {
    const one = [{ key: 'test/app/node', total: 1 }];
    const { container } = render(
      <ProjectCard {...OSTOMATE2} latestRun={{ ...PASSED_RUN, total: 1 }} reports={one} />,
    );
    expect(part(cardOf(container), 'sub')?.textContent).toBe('test ·0 failed·0 skipped ·27 s');
    expect(part(cardOf(container), 'reports-head')?.textContent).toBe('1 report in this run');
    cleanup();

    const { container: empty } = render(
      <ProjectCard
        {...OSTOMATE2}
        latestRun={{ ...PASSED_RUN, status: 'empty', total: 0 }}
        reports={[{ key: 'test/app/node', total: 0 }]}
        health={{ health: 'empty' }}
      />,
    );
    expect(part(cardOf(empty), 'sub')?.textContent).toBe('tests executed ·1 report received');
  });

  it('stale: the meta time turns amber and the footer says so, with no banner in the card', () => {
    const { container, queryByRole } = render(
      <ProjectCard
        {...ROUTESERVE}
        latestRun={{ ...ROUTESERVE_RUN, when: timeLabel('1 week ago') }}
        health={{ health: 'stale', days: 12 }}
      />,
    );
    const card = cardOf(container);

    expect(part(card, 'when')?.textContent).toBe('1 week ago');
    expect(part(card, 'when')?.className).toContain('stale');
    expect(card.querySelector('[data-health]')?.textContent).toBe('No report in 12 days');
    expect(queryByRole('status')).toBeNull();
    expect(queryByRole('alert')).toBeNull();
  });

  it('is not stale otherwise, so the meta time stays --ink-3', () => {
    const { container } = render(<ProjectCard {...OSTOMATE2} />);
    expect(part(cardOf(container), 'when')?.className).not.toContain('stale');
  });

  it('below floor: the coverage row shows its below state and the footer says so', () => {
    const { container } = render(
      <ProjectCard
        {...OSTOMATE2}
        coverage={[
          { module: 'shared', pct: 92, floor: 91 },
          { module: 'composeApp', pct: 92.6, floor: 93 },
        ]}
        health={{ health: 'below_floor' }}
      />,
    );
    const card = cardOf(container);

    expect(
      [...card.querySelectorAll<HTMLElement>('[data-state]')].map((row) => row.dataset.state),
    ).toEqual(['above', 'below']);
    expect(card.querySelector('[data-health]')?.textContent).toBe('Coverage below floor');
  });

  it('no coverage rows: says "No coverage reported" in their place', () => {
    const { container } = render(<ProjectCard {...OSTOMATE2} coverage={[]} />);
    expect(part(cardOf(container), 'no-coverage')?.textContent).toBe('No coverage reported');
  });

  it('not reporting yet: no meta, no total, the registered note, and nothing measured', () => {
    const { container } = render(
      <ProjectCard
        project={{
          name: 'testpulse',
          tagline: 'This dashboard, reporting on itself.',
          visibility: 'public',
          href: '/p/testpulse',
        }}
        latestRun={null}
        layers={[]}
        coverage={[]}
        reports={[]}
        declared={[]}
        health={{ health: 'not_reporting' }}
      />,
    );
    const card = cardOf(container);

    expect(card.querySelector('[data-status]')?.textContent).toBe('Not reporting yet');
    expect(part(card, 'meta')).toBeNull();
    expect(part(card, 'total')).toBeNull();
    expect(part(card, 'not-reporting')?.textContent).toBe(
      'Registered. Results appear here after its CI posts the first report.',
    );
    expect(part(card, 'layers')).toBeNull();
    expect(part(card, 'no-coverage')).toBeNull();
    expect(part(card, 'reports')).toBeNull();
    expect(card.querySelector('[data-health]')?.textContent).toBe('Not reporting yet');
  });

  it('summarises declared suites on the footer left (v4 item 17)', () => {
    const { container } = render(<ProjectCard {...OSTOMATE2} />);
    expect(part(cardOf(container), 'declared')?.textContent).toBe(
      'Not counted: 12 flows in 2 suites, run in CI, not yet reported',
    );
    cleanup();
    const { container: route } = render(<ProjectCard {...ROUTESERVE} />);
    expect(part(cardOf(route), 'declared')?.textContent).toBe(
      'Not counted: Maestro E2E · iOS (13 flows), authored, not yet executed',
    );
  });

  it('takes its heading level from the page, h3 by default (v4 item 25e)', () => {
    const { getByRole } = render(<ProjectCard {...OSTOMATE2} headingLevel={2} />);
    expect(getByRole('heading', { level: 2 }).textContent).toBe('Ostomate2');
  });

  it('makes the SHA and name links 44px targets (v4 item 22)', () => {
    const target = {
      display: 'inline-flex',
      'align-items': 'center',
      'min-height': 'var(--target-min)',
    };
    expect(ruleFor(CSS, '.shaLink')).toEqual(target);
    expect(ruleFor(CSS, '.nameLink')).toEqual({ ...target, 'text-decoration': 'none' });
    const { container } = render(<ProjectCard {...OSTOMATE2} />);
    expect(part(cardOf(container), 'sha')?.className).toContain('shaLink');
    cleanup();
    const { container: route } = render(<ProjectCard {...ROUTESERVE} />);
    expect(part(cardOf(route), 'sha')?.className).not.toContain('shaLink');
  });

  it('with no declared suites leaves the footer left side empty, the marker right', () => {
    const { container } = render(<ProjectCard {...OSTOMATE2} declared={[]} />);
    const footer = part(cardOf(container), 'footer');

    expect(footer?.firstElementChild?.textContent).toBe('');
    expect(ruleFor(CSS, '.health')).toEqual({ 'margin-left': 'auto' });
  });

  it('loading: a busy skeleton in the shape of the card', () => {
    const { container } = render(<ProjectCard loading />);
    const card = cardOf(container);

    expect(card.tagName).toBe('ARTICLE');
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.getAttribute('aria-label')).toBe('Loading project');
    expect(card.textContent).toBe('');
    expect(
      parts(card, 'skeleton').map((b) => [b.style.width, b.style.height, b.style.borderRadius]),
    ).toEqual([
      ['92px', '26px', '99px'],
      ['180px', '14px', '4px'],
      ['55%', '38px', '6px'],
      ['85%', '14px', '4px'],
      ['40%', '48px', '6px'],
      ['100%', '8px', '99px'],
      ['100%', '6px', '99px'],
      ['100%', '6px', '99px'],
      ['100%', '78px', '12px'],
      ['60%', '14px', '4px'],
    ]);
    expect(parts(card, 'skeleton')[8]?.className).toContain('inset');
    // v4 item 26: the frame stays still; each block shimmers on its own.
    expect(card.style.animation).toBe('');
    expect(parts(card, 'skeleton').every((b) => b.style.animation.includes('tp-shimmer'))).toBe(
      true,
    );
  });

  it('sets the card: surface, 1px --line, radius 20, padding 24 --pad-card-x 0', () => {
    expect(ruleFor(CSS, '.card')).toEqual({
      background: 'var(--surface)',
      display: 'flex',
      'flex-direction': 'column',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.web')).toEqual({
      border: '1px solid var(--line)',
      'border-radius': 'var(--radius-xl)',
      padding: 'var(--space-6) var(--pad-card-x) 0',
      'box-shadow': 'var(--shadow-card)',
    });
    expect(ruleFor(CSS, '.loading')).toEqual({
      padding: 'var(--space-6) var(--pad-card-x) 18px',
    });
  });

  it('sets row 1, the name in --text-title and the tagline 15.5 --ink-2', () => {
    expect(ruleFor(CSS, '.top')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: 'var(--space-2) var(--space-3)',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.meta')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.stale')).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.sha')).toEqual({
      'font-family': 'var(--font-mono)',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.name')).toEqual({
      margin: '18px 0px 6px',
      font: 'var(--text-title)',
      'letter-spacing': '-0.02em',
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'center',
      gap: 'var(--space-2) 14px',
    });
    expect(ruleFor(CSS, '.tagline')).toEqual({
      margin: '0 0 var(--space-5)',
      'font-size': '15.5px',
      'line-height': '1.5',
      color: 'var(--ink-2)',
      'text-wrap': 'pretty',
    });
  });

  it('sets the total in --text-count, the sub-line 15 --ink-2, failed count 600 --fail', () => {
    expect(ruleFor(CSS, '.totals')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'baseline',
      gap: 'var(--space-1) var(--space-3)',
      'margin-bottom': '18px',
    });
    expect(ruleFor(CSS, '.total')).toEqual({ font: 'var(--text-count)' });
    expect(ruleFor(CSS, '.totalEmpty')).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.sub')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '0 6px',
      'font-size': '15px',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.failedCount')).toEqual({ color: 'var(--fail)', 'font-weight': '600' });
  });

  it('sets the failing block on --fail-tint, 12 by 14, at least 44px tall', () => {
    expect(ruleFor(CSS, '.failing')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: 'var(--space-1) var(--space-3)',
      'min-height': 'var(--target-min)',
      'box-sizing': 'border-box',
      'margin-bottom': '18px',
      padding: 'var(--space-3) 14px',
      'border-radius': 'var(--radius-md)',
      background: 'var(--fail-tint)',
      'text-decoration': 'none',
    });
    expect(ruleFor(CSS, '.failingName')).toEqual({
      font: '13px var(--font-mono)',
      color: 'var(--ink)',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.failingSide')).toEqual({
      display: 'flex',
      gap: '10px',
      'font-size': '13px',
      color: 'var(--ink-3)',
    });
  });

  it('spaces the layer bar, the empty note and the coverage rows as drawn', () => {
    expect(ruleFor(CSS, '.layers')).toEqual({ 'margin-bottom': '22px' });
    expect(ruleFor(CSS, '.emptyNote')).toEqual({
      display: 'flex',
      gap: 'var(--space-3)',
      'align-items': 'flex-start',
      padding: '14px var(--space-4)',
      'margin-bottom': '22px',
      'border-radius': 'var(--radius-md)',
      background: 'var(--attn-tint)',
      'font-size': '14.5px',
      'line-height': '1.55',
      color: 'var(--ink)',
    });
    expect(ruleFor(CSS, '.emptyIcon')).toEqual({
      flex: '0 0 auto',
      'margin-top': '2px',
      color: 'var(--attn)',
    });
    expect(ruleFor(CSS, '.coverage')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      gap: '14px',
    });
    expect(ruleFor(CSS, '.noCoverage')).toEqual({ 'font-size': '14px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.notReporting')).toEqual({
      margin: '0px 0px 22px',
      'font-size': '15px',
      'line-height': '1.55',
      color: 'var(--ink-2)',
    });
  });

  it('sets the per-report block as an inset mono panel of 200px key/count pairs', () => {
    expect(ruleFor(CSS, '.reports')).toEqual({
      'margin-top': '22px',
      padding: '14px var(--space-4)',
      'border-radius': 'var(--radius-md)',
      background: 'var(--inset)',
      font: '13px/1.8 var(--font-mono)',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.reportsHead')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'justify-content': 'space-between',
      gap: 'var(--space-1) var(--space-3)',
      'font-family': 'var(--font-sans)',
      'font-size': '13px',
      color: 'var(--ink-3)',
      'margin-bottom': 'var(--space-1)',
    });
    expect(ruleFor(CSS, '.reportsGrid')).toEqual({
      display: 'grid',
      'grid-template-columns': 'repeat(auto-fill, minmax(200px, 1fr))',
      'column-gap': 'var(--space-6)',
      margin: '0px',
      padding: '0px',
      'list-style': 'none',
    });
    expect(ruleFor(CSS, '.report')).toEqual({
      display: 'flex',
      'justify-content': 'space-between',
      gap: 'var(--space-3)',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.reportKey')).toEqual({
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    expect(ruleFor(CSS, '.reportCount')).toEqual({ color: 'var(--ink)' });
    expect(ruleFor(CSS, '.reportEmpty')).toEqual({ color: 'var(--attn)' });
  });

  it('sets the footer on a hairline, 13.5 --ink-3', () => {
    expect(ruleFor(CSS, '.footer')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: 'var(--space-2) var(--space-4)',
      'margin-top': 'var(--space-5)',
      padding: 'var(--space-4) 0 18px',
      'border-top': '1px solid var(--line)',
      'font-size': '13.5px',
      color: 'var(--ink-3)',
    });
  });
});

const KIOSK_FAILED: KioskProjectCardProps = {
  variant: 'kiosk',
  project: OSTOMATE2.project,
  latestRun: {
    ...PASSED_RUN,
    status: 'failed',
    when: timeLabel('4 min ago'),
    sha: 'a41f9c2',
    failed: 1,
  },
  layers: OSTOMATE2.layers,
  coverage: [{ module: 'shared', pct: 92, floor: 91 }],
  reports: OSTOMATE2.reports,
  health: { health: 'healthy' },
  failing: [
    {
      suite: 'com.ostomate.app.ui.home.HomeViewModelTest',
      name: 'rendersToday',
      platform: 'ios-sim',
    },
  ],
};

const KIOSK_EMPTY: KioskProjectCardProps = {
  ...KIOSK_FAILED,
  latestRun: { ...PASSED_RUN, status: 'empty', when: timeLabel('4 min ago'), total: 0 },
  health: { health: 'empty' },
  failing: [],
};

const KIOSK_NOT_REPORTING: KioskProjectCardProps = {
  variant: 'kiosk',
  project: {
    name: 'testpulse',
    tagline: 'This dashboard, reporting on itself.',
    visibility: 'public',
    href: '/p/testpulse',
  },
  latestRun: null,
  layers: [],
  coverage: [],
  reports: [],
  health: { health: 'not_reporting' },
};

const KIOSK_PASSED: KioskProjectCardProps = {
  ...KIOSK_FAILED,
  latestRun: { ...PASSED_RUN, status: 'passed', when: timeLabel('4 min ago') },
  failing: [],
};

describe('ProjectCard (kiosk)', () => {
  it('failed: kiosk pill, when and SHA, the name, total and failed sub-line in --fail', () => {
    const { container, getByRole, queryAllByRole } = render(<ProjectCard {...KIOSK_FAILED} />);
    const card = cardOf(container);

    expect(card.dataset.variant).toBe('kiosk');
    expect(card.dataset.frame).toBe('fail');
    expect(card.querySelector('[data-status]')?.getAttribute('data-variant')).toBe('kiosk');
    expect(part(card, 'meta')?.textContent).toBe('4 min ago·a41f9c2');
    expect(getByRole('heading', { level: 3 }).textContent).toBe('Ostomate2');
    expect(queryAllByRole('link')).toEqual([]);
    expect(part(card, 'tagline')).toBeNull();
    expect(part(card, 'totals')?.textContent).toBe('142tests');
    expect(part(card, 'sub')?.textContent).toBe('1 failed·0 skipped ·27 s');
    expect(part(card, 'failed-count')?.className).toContain('failedCount');
  });

  it('failed: shows the failing test name and platform without a link, and no layer bar', () => {
    const { container } = render(<ProjectCard {...KIOSK_FAILED} />);
    const card = cardOf(container);
    const failing = part(card, 'failing');

    expect(failing?.tagName).toBe('DIV');
    expect(failing?.textContent).toBe('HomeViewModelTest › rendersToday' + 'ios-sim');
    expect(part(card, 'layers')).toBeNull();
  });

  it('failed with several failing tests: the platform key and "+{n} more" (v4 item 25g)', () => {
    const { container } = render(
      <ProjectCard
        {...KIOSK_FAILED}
        failing={[
          ...(KIOSK_FAILED.failing ?? []),
          { suite: 'BackupSerializerTest', name: 'restoresBackup', platform: 'jvm' },
        ]}
      />,
    );
    expect(part(cardOf(container), 'failing')?.textContent).toBe(
      'HomeViewModelTest › rendersToday' + 'ios-sim' + '+1 more',
    );
  });

  it('says "test" beside a total of one', () => {
    const { container } = render(
      <ProjectCard {...KIOSK_PASSED} latestRun={{ ...PASSED_RUN, status: 'passed', total: 1 }} />,
    );
    expect(part(cardOf(container), 'totals')?.textContent).toBe('1test');
  });

  it('below floor: the kiosk coverage row shows its below state', () => {
    const { container } = render(
      <ProjectCard
        {...KIOSK_PASSED}
        coverage={[{ module: 'composeApp', pct: 92.6, floor: 93 }]}
        health={{ health: 'below_floor' }}
      />,
    );
    const row = cardOf(container).querySelector<HTMLElement>('[data-state]');
    expect(row?.dataset.state).toBe('below');
    expect(row?.querySelector('svg')?.getAttribute('width')).toBe('22');
  });

  it('empty: an amber frame, "0" in amber, reports received, the empty note, no layers or coverage (v4 item 25i)', () => {
    const { container } = render(<ProjectCard {...KIOSK_EMPTY} />);
    const card = cardOf(container);

    expect(card.dataset.frame).toBe('attn');
    expect(card.querySelector('[data-status]')?.getAttribute('data-status')).toBe('empty');
    expect(part(card, 'total')?.textContent).toBe('0');
    expect(part(card, 'total')?.className).toContain('totalEmpty');
    expect(part(card, 'totals')?.textContent).toBe('0tests executed');
    expect(part(card, 'sub')?.textContent).toBe('4 reports received');
    expect(part(card, 'empty-note')?.textContent).toBe(
      'Every report in this run arrived with no test results. An empty run is treated as a problem, not a pass, and isn’t counted in any total.',
    );
    expect(part(card, 'empty-note')?.querySelector('svg')?.getAttribute('width')).toBe('24');
    expect(part(card, 'layers')).toBeNull();
    expect(part(card, 'coverage-legend')).toBeNull();
    expect(card.querySelector('[data-state]')).toBeNull();
    expect(card.querySelector('[data-health]')?.textContent).toBe('Last run empty');
  });

  it('empty: says "1 report received" for one report', () => {
    const { container } = render(
      <ProjectCard {...KIOSK_EMPTY} reports={[{ key: 'test/app/node', total: 0 }]} />,
    );
    expect(part(cardOf(container), 'sub')?.textContent).toBe('1 report received');
  });

  it('not reporting: a --line frame, the badge, the registered note and the footer only (v4 item 25i)', () => {
    const { container } = render(<ProjectCard {...KIOSK_NOT_REPORTING} />);
    const card = cardOf(container);

    expect(card.dataset.frame).toBe('line');
    const badge = card.querySelector('[data-status]');
    expect(badge?.getAttribute('data-status')).toBe('not_reporting');
    expect(badge?.getAttribute('data-variant')).toBe('kiosk');
    expect(part(card, 'meta')).toBeNull();
    expect(part(card, 'totals')).toBeNull();
    expect(part(card, 'sub')).toBeNull();
    expect(part(card, 'not-reporting')?.textContent).toBe(
      'Registered. Results appear here after its CI posts the first report.',
    );
    expect(part(card, 'layers')).toBeNull();
    expect(part(card, 'coverage-legend')).toBeNull();
    expect(card.querySelector('[data-health]')?.textContent).toBe('Not reporting yet');
  });

  it('takes its heading level from the page (the Kiosk page passes 2)', () => {
    const { getByRole } = render(<ProjectCard {...KIOSK_PASSED} headingLevel={2} />);
    expect(getByRole('heading', { level: 2 }).textContent).toBe('Ostomate2');
  });

  it('draws the coverage legend and kiosk coverage rows, no per-report block', () => {
    const { container } = render(<ProjectCard {...KIOSK_FAILED} />);
    const card = cardOf(container);

    expect(part(card, 'coverage-legend')?.textContent).toBe('Line coverage' + 'floor');
    expect(card.querySelector('[data-state]')?.getAttribute('data-variant')).toBe('kiosk');
    expect(part(card, 'reports')).toBeNull();
    const health = card.querySelector('[data-health]');
    expect(health?.getAttribute('data-size')).toBe('kiosk');
    expect(health?.textContent).toBe('Reporting healthy');
  });

  it('passed: a --line frame, "0 failed" in plain ink and the kiosk layer bar', () => {
    const { container } = render(<ProjectCard {...KIOSK_PASSED} />);
    const card = cardOf(container);

    expect(card.dataset.frame).toBe('line');
    expect(part(card, 'sub')?.textContent).toBe('0 failed·0 skipped ·27 s');
    expect(part(card, 'failed-count')?.className).not.toContain('failedCount');
    expect(part(card, 'failing')).toBeNull();
    expect(part(card, 'layers')?.firstElementChild?.getAttribute('data-variant')).toBe('kiosk');
  });

  it('stale: an amber frame and amber meta', () => {
    const { container } = render(
      <ProjectCard
        {...KIOSK_PASSED}
        latestRun={{ ...PASSED_RUN, status: 'passed', when: timeLabel('1 week ago') }}
        health={{ health: 'stale', days: 12 }}
      />,
    );
    const card = cardOf(container);

    expect(card.dataset.frame).toBe('attn');
    expect(part(card, 'meta')?.className).toContain('stale');
    expect(card.querySelector('[data-health]')?.textContent).toBe('No report in 12 days');
  });

  it('private: the kiosk PrivateTag beside the name', () => {
    const { getByRole } = render(<ProjectCard {...KIOSK_PASSED} project={ROUTESERVE.project} />);
    const heading = getByRole('heading', { level: 3 });

    expect(heading.textContent).toBe('RouteServePrivate');
    expect(heading.querySelector('[data-variant="kiosk"]')?.textContent).toBe('Private');
  });

  it('with no coverage rows leaves out the coverage block', () => {
    const { container } = render(<ProjectCard {...KIOSK_PASSED} coverage={[]} />);
    expect(part(cardOf(container), 'coverage-legend')).toBeNull();
  });

  it('sets the kiosk frame: 3px border by state, radius 24, padding 30 34 0', () => {
    expect(ruleFor(CSS, '.kiosk')).toEqual({
      border: '3px solid var(--line)',
      'border-radius': 'var(--radius-kiosk)',
      padding: '30px 34px 0px',
      'box-sizing': 'border-box',
    });
    expect(ruleFor(CSS, '.frameFail')).toEqual({ 'border-color': 'var(--fail)' });
    expect(ruleFor(CSS, '.frameAttn')).toEqual({ 'border-color': 'var(--attn)' });
  });

  it('sets the kiosk type: name 64, total 104, sub 26, meta 24 with a 22px SHA', () => {
    expect(ruleFor(CSS, '.kiosk .top')).toEqual({ gap: 'var(--space-4)', 'font-size': '24px' });
    expect(ruleFor(CSS, '.kiosk .meta')).toEqual({ gap: '10px' });
    expect(ruleFor(CSS, '.kiosk .sha')).toEqual({ 'font-size': '22px' });
    expect(ruleFor(CSS, '.kiosk .name')).toEqual({
      margin: '22px 0px 0px',
      font: '500 64px/1 var(--font-serif)',
      gap: 'var(--space-2) 18px',
    });
    expect(ruleFor(CSS, '.kiosk .totals')).toEqual({
      gap: 'var(--space-4)',
      'margin-top': '26px',
      'margin-bottom': '0px',
    });
    expect(ruleFor(CSS, '.kiosk .total')).toEqual({
      font: '500 104px/1 var(--font-serif)',
      'letter-spacing': '-0.03em',
    });
    expect(ruleFor(CSS, '.kioskUnit')).toEqual({ 'font-size': '26px', color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.kiosk .sub')).toEqual({
      gap: '10px',
      'margin-top': '10px',
      'font-size': '26px',
    });
  });

  it('sets the kiosk failing block, layer bar, coverage and footer spacing', () => {
    expect(ruleFor(CSS, '.kiosk .failing')).toEqual({
      'flex-direction': 'column',
      'align-items': 'stretch',
      gap: '6px',
      'margin-top': '22px',
      'margin-bottom': '0px',
      padding: 'var(--space-4) var(--space-5)',
      'border-radius': 'var(--radius-kiosk-inset)',
      'min-width': '0px',
    });
    // v4 item 25g: one line with an ellipsis.
    expect(ruleFor(CSS, '.kiosk .failingName')).toEqual({
      font: '500 22px var(--font-mono)',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    expect(ruleFor(CSS, '.kiosk .failingSide')).toEqual({
      gap: 'var(--space-3)',
      'font-size': '22px',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.kiosk .emptyNote')).toEqual({
      gap: '14px',
      'margin-top': 'var(--space-6)',
      'margin-bottom': '0px',
      padding: 'var(--space-4) var(--space-5)',
      'border-radius': 'var(--radius-kiosk-inset)',
      'font-size': '22px',
      'line-height': '1.45',
    });
    expect(ruleFor(CSS, '.kiosk .emptyIcon')).toEqual({ 'margin-top': '3px' });
    expect(ruleFor(CSS, '.kiosk .notReporting')).toEqual({
      margin: '26px 0px 0px',
      'font-size': '26px',
      'line-height': '1.45',
      'text-wrap': 'pretty',
    });
    expect(ruleFor(CSS, '.kiosk .layers')).toEqual({
      'margin-top': '28px',
      'margin-bottom': '0px',
    });
    expect(ruleFor(CSS, '.kiosk .coverage')).toEqual({
      gap: 'var(--space-4)',
      'margin-top': '28px',
      'font-size': '24px',
    });
    expect(ruleFor(CSS, '.coverageLegend')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '10px',
      'font-size': '22px',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.floorKey')).toEqual({
      width: '3px',
      height: '18px',
      background: 'var(--attn)',
    });
    expect(ruleFor(CSS, '.kiosk .footer')).toEqual({
      'justify-content': 'flex-end',
      'margin-top': '28px',
      padding: 'var(--space-5) 0 var(--space-6)',
    });
  });
});
