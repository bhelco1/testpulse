// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { keyframesIn, ruleFor } from '../testing/stylesheet';
import { RunFeedRow, type FeedRun, type KioskFeedRun } from './RunFeedRow';
import styles from './RunFeedRow.module.css';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'RunFeedRow.module.css');
const TOKENS = join(import.meta.dirname, '..', '..', 'design', 'tokens.css');

const has = (element: Element | null | undefined, name: string) => {
  const className = styles[name];
  if (!className) throw new Error(`RunFeedRow.module.css has no .${name}`);
  return element?.classList.contains(className) ?? false;
};

const part = (root: ParentNode, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

const PASSED: FeedRun = {
  id: '35642780279',
  href: '/p/ostomate2/runs/35642780279',
  status: 'passed',
  visibility: 'public',
  title: 'Push to main',
  project: 'Ostomate2',
  branch: 'main',
  sha: '0e2d0b4c9a11f3e7',
  when: '4 minutes ago',
  total: 142,
  duration: '27 s',
};

const FAILED: FeedRun = {
  id: '35600000001',
  href: '/p/ostomate2/runs/35600000001',
  status: 'failed',
  visibility: 'public',
  title: 'Pull request from fix-today-count',
  project: 'Ostomate2',
  branch: 'fix-today-count',
  sha: 'a41f9c2',
  when: 'yesterday',
  failed: 1,
  passed: 141,
  total: 142,
};

const EMPTY: FeedRun = {
  id: '35600000002',
  href: '/p/ostomate2/runs/35600000002',
  status: 'empty',
  visibility: 'public',
  title: 'Push to main',
  project: 'Ostomate2',
  branch: 'main',
  sha: '0e2d0b4',
  when: '4 minutes ago',
  reports: 4,
};

const PRIVATE: FeedRun = {
  id: '1',
  href: '/p/routeserve/runs/1',
  status: 'passed',
  visibility: 'private',
  project: 'RouteServe',
  branch: 'main',
  sha: 'c238574',
  when: '2 hours ago',
  total: 1048,
  duration: '29 s',
};

function renderRow(run: FeedRun, extra: { showProject?: boolean; isNew?: boolean } = {}) {
  const { getByRole } = render(<RunFeedRow run={run} {...extra} />);
  return getByRole('link');
}

describe('RunFeedRow (web)', () => {
  it('passed: a link to the run with status, title, meta, count and time', () => {
    const row = renderRow(PASSED);

    expect(row.getAttribute('href')).toBe('/p/ostomate2/runs/35642780279');
    expect(row.dataset.variant).toBe('web');
    const badge = part(row, 'status')?.querySelector<HTMLElement>('[data-status]');
    expect(badge?.dataset.status).toBe('passed');
    expect(badge?.dataset.variant).toBe('inline');
    expect(badge?.textContent).toBe('Passed');
    expect(part(row, 'title')?.textContent).toBe('Push to main');
    expect(part(row, 'meta')?.textContent).toBe('Ostomate2·main·0e2d0b4');
    expect(part(row, 'sha')?.textContent).toBe('0e2d0b4');
    expect(part(row, 'count-lead')?.textContent).toBe('142 tests');
    expect(part(row, 'count-rest')?.textContent).toBe('· 27 s');
    expect(has(part(row, 'count-lead'), 'countPassed')).toBe(true);
    expect(part(row, 'when')?.textContent).toBe('4 minutes ago');
  });

  it('keeps the design order: status, title, meta, count, time', () => {
    expect(renderRow(PASSED).textContent).toBe(
      'PassedPush to mainOstomate2·main·0e2d0b4142 tests· 27 s4 minutes ago',
    );
  });

  it('groups thousands in the count', () => {
    const row = renderRow(PRIVATE);
    expect(part(row, 'count-lead')?.textContent).toBe('1,048 tests');
  });

  it('failed: only "{n} failed" in --fail 600, then "· {passed} of {total}"', () => {
    const row = renderRow(FAILED);

    expect(part(row, 'status')?.textContent).toBe('Failed');
    expect(part(row, 'count-lead')?.textContent).toBe('1 failed');
    expect(has(part(row, 'count-lead'), 'countFailed')).toBe(true);
    expect(part(row, 'count-rest')?.textContent).toBe('· 141 of 142');
    expect(has(row, 'new')).toBe(false);
  });

  it('pull request: the branch slot is runs.branch, as for every event (v4 item 28)', () => {
    const row = renderRow(FAILED);
    expect(part(row, 'meta')?.textContent).toBe('Ostomate2·fix-today-count·a41f9c2');
    expect(part(row, 'title')?.textContent).toBe('Pull request from fix-today-count');
  });

  it('is singular at one: "1 test" and "· 1 report" (v4 item 50)', () => {
    expect(part(renderRow({ ...PASSED, total: 1 }), 'count-lead')?.textContent).toBe('1 test');
    cleanup();
    expect(part(renderRow({ ...EMPTY, reports: 1 }), 'count-rest')?.textContent).toBe('· 1 report');
  });

  it('empty: "0 tests" in --attn 600, then "· {n} reports"', () => {
    const row = renderRow(EMPTY);

    expect(part(row, 'status')?.textContent).toBe('Empty');
    expect(part(row, 'count-lead')?.textContent).toBe('0 tests');
    expect(has(part(row, 'count-lead'), 'countEmpty')).toBe(true);
    expect(part(row, 'count-rest')?.textContent).toBe('· 4 reports');
  });

  it('private: a lock and "Private repository" in place of the title', () => {
    const row = renderRow(PRIVATE);

    expect(part(row, 'title')).toBeNull();
    const privateTitle = part(row, 'private');
    expect(privateTitle?.textContent).toBe('Private repository');
    const lock = privateTitle?.querySelector('svg');
    expect(lock?.getAttribute('width')).toBe('12');
    expect(lock?.getAttribute('stroke-width')).toBe('2.4');
    expect(lock?.getAttribute('aria-hidden')).toBe('true');
    // The run page exists for private projects too, so the row still links to it.
    expect(row.getAttribute('href')).toBe('/p/routeserve/runs/1');
    expect(part(row, 'meta')?.textContent).toBe('RouteServe·main·c238574');
  });

  it('showProject false leaves the project out of the meta line (project page)', () => {
    const row = renderRow(PASSED, { showProject: false });
    expect(part(row, 'meta')?.textContent).toBe('main·0e2d0b4');
  });

  it('is not new by default: no chip and no arrival background', () => {
    const row = renderRow(PASSED);
    expect(part(row, 'new')).toBeNull();
    expect(has(row, 'new')).toBe(false);
  });

  it('new: a "New" chip before the title and the arrival fade on the row', () => {
    const row = renderRow(PASSED, { isNew: true });

    const chip = part(row, 'new');
    expect(chip?.textContent).toBe('New');
    expect(chip?.nextElementSibling).toBe(part(row, 'title'));
    expect(has(row, 'new')).toBe(true);
  });

  it('new and failed: the same chip and fade, with the failed status and count and no fail tint', () => {
    const row = renderRow(FAILED, { isNew: true });

    expect(part(row, 'new')?.textContent).toBe('New');
    expect(has(row, 'new')).toBe(true);
    expect(part(row, 'status')?.textContent).toBe('Failed');
    expect(part(row, 'count-lead')?.textContent).toBe('1 failed');
    expect(ruleFor(CSS, '.new')).toEqual({ animation: 'arrive var(--motion-arrive)' });
  });

  it('new and private: the chip comes before the lock', () => {
    const row = renderRow(PRIVATE, { isNew: true });
    expect(part(row, 'new')?.nextElementSibling).toBe(part(row, 'private'));
  });

  it('fades the new row from --raised to its own background, which stays transparent', () => {
    expect(keyframesIn(CSS)).toEqual(['arrive']);
    // Only a start frame: the animation ends on whatever the row's background is, hover included.
    expect(readFileSync(CSS, 'utf8')).toMatch(
      /@keyframes arrive \{\s*from \{\s*background-color: var\(--raised\);\s*\}\s*\}/,
    );
    const css = ruleFor(CSS, '.row');
    expect(css.background).toBeUndefined();
    expect(css['background-color']).toBeUndefined();
  });

  it('drops the fade under reduced motion: tokens.css turns every animation off', () => {
    expect(
      ruleFor(TOKENS, '*, *::before, *::after', '(prefers-reduced-motion: reduce)'),
    ).toMatchObject({ animation: 'none !important' });
  });

  it('lays the row out as the design: flex-wrap, gap 6 16, padding 14 16, min 44, radius 12', () => {
    expect(ruleFor(CSS, '.row')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'center',
      gap: '6px 16px',
      padding: '14px 16px',
      'min-height': 'var(--target-min)',
      'box-sizing': 'border-box',
      'border-radius': 'var(--radius-md)',
      'text-decoration': 'none',
    });
    expect(ruleFor(CSS, '.row:hover, .row:focus-visible')).toEqual({
      background: 'var(--raised)',
    });
  });

  // No breakpoint: at 390 the content's 220px basis pushes the count onto a second line, where the
  // time's auto margin puts it on the right.
  it('wraps to two lines on a phone: status 104, content flex 1 1 220, time pushed right', () => {
    expect(ruleFor(CSS, '.status')).toEqual({ display: 'flex', width: '104px', flex: '0 0 auto' });
    expect(ruleFor(CSS, '.content')).toEqual({ flex: '1 1 220px', 'min-width': '0px' });
    expect(ruleFor(CSS, '.when')).toEqual({
      'margin-left': 'auto',
      'font-size': '13px',
      color: 'var(--ink-3)',
      'white-space': 'nowrap',
    });
  });

  it('sets the title 15/500 with ellipsis, and the meta 13 --ink-3 with a mono SHA', () => {
    expect(ruleFor(CSS, '.titleLine')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '8px',
      'font-size': '15px',
      'font-weight': '500',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.title')).toEqual({
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    expect(ruleFor(CSS, '.private')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      color: 'var(--ink-3)',
      'font-weight': '400',
    });
    expect(ruleFor(CSS, '.meta')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      gap: '0 6px',
      'font-size': '13px',
      color: 'var(--ink-3)',
      'margin-top': '2px',
    });
    expect(ruleFor(CSS, '.sha')).toEqual({ 'font-family': 'var(--font-mono)' });
  });

  it('sets the New chip: 11px/600 sans, pill, --ink on --on-ink, padding 2 by 7', () => {
    expect(ruleFor(CSS, '.chip')).toEqual({
      flex: '0 0 auto',
      font: '600 11px var(--font-sans)',
      padding: '2px 7px',
      'border-radius': 'var(--radius-pill)',
      background: 'var(--ink)',
      color: 'var(--on-ink)',
    });
  });

  it('sets the count: 14px nowrap; passed --ink 400, failed --fail 600, empty --attn 600', () => {
    expect(ruleFor(CSS, '.count')).toEqual({
      display: 'flex',
      gap: '6px',
      'font-size': '14px',
      'white-space': 'nowrap',
    });
    expect(ruleFor(CSS, '.countPassed')).toEqual({ color: 'var(--ink)', 'font-weight': '400' });
    expect(ruleFor(CSS, '.countFailed')).toEqual({ color: 'var(--fail)', 'font-weight': '600' });
    expect(ruleFor(CSS, '.countEmpty')).toEqual({ color: 'var(--attn)', 'font-weight': '600' });
    expect(ruleFor(CSS, '.countRest')).toEqual({ color: 'var(--ink-3)' });
  });
});

const KIOSK_PASSED: KioskFeedRun = {
  id: '35642780279',
  status: 'passed',
  visibility: 'public',
  project: 'Ostomate2',
  branch: 'main',
  when: '4 min ago',
  total: 142,
};

const KIOSK_FAILED: KioskFeedRun = {
  id: '35600000001',
  status: 'failed',
  visibility: 'public',
  project: 'Ostomate2',
  branch: 'fix-today-count',
  when: 'yesterday',
  failed: 1,
};

const KIOSK_EMPTY: KioskFeedRun = {
  id: '35600000002',
  status: 'empty',
  visibility: 'public',
  project: 'Ostomate2',
  branch: 'main',
  when: '4 min ago',
};

const KIOSK_PRIVATE: KioskFeedRun = {
  id: '1',
  status: 'passed',
  visibility: 'private',
  project: 'RouteServe',
  branch: 'main',
  when: '2 hr ago',
  total: 1048,
};

const renderTile = (run: KioskFeedRun) =>
  render(<RunFeedRow variant="kiosk" run={run} />).container.firstElementChild as HTMLElement;

describe('RunFeedRow (kiosk)', () => {
  it('passed: a tile, not a link, with status, time, project, branch and test count', () => {
    const { container, queryByRole } = render(<RunFeedRow variant="kiosk" run={KIOSK_PASSED} />);
    const tile = container.firstElementChild as HTMLElement;

    expect(queryByRole('link')).toBeNull();
    expect(tile.dataset.variant).toBe('kiosk');
    const badge = part(tile, 'status')?.querySelector<HTMLElement>('[data-status]');
    expect(badge?.dataset.status).toBe('passed');
    expect(badge?.dataset.variant).toBe('inline-kiosk');
    expect(part(tile, 'when')?.textContent).toBe('4 min ago');
    expect(part(tile, 'project')?.textContent).toBe('Ostomate2');
    expect(part(tile, 'branch')?.textContent).toBe('main');
    expect(part(tile, 'count')?.textContent).toBe('142 tests');
    expect(has(part(tile, 'count'), 'tileCountFailed')).toBe(false);
  });

  it('failed: "{n} failed" in --fail', () => {
    const { container } = render(<RunFeedRow variant="kiosk" run={KIOSK_FAILED} />);
    const tile = container.firstElementChild as HTMLElement;

    expect(part(tile, 'status')?.textContent).toBe('Failed');
    expect(part(tile, 'branch')?.textContent).toBe('fix-today-count');
    expect(part(tile, 'count')?.textContent).toBe('1 failed');
    expect(has(part(tile, 'count'), 'tileCountFailed')).toBe(true);
  });

  it('empty: "0 tests" in --attn (v4 item 41)', () => {
    const tile = renderTile(KIOSK_EMPTY);

    expect(part(tile, 'status')?.textContent).toBe('Empty');
    expect(part(tile, 'count')?.textContent).toBe('0 tests');
    expect(has(part(tile, 'count'), 'tileCountEmpty')).toBe(true);
  });

  it('private: a 22px lock labelled "Private repository" right after the name (v4 item 41)', () => {
    const tile = renderTile(KIOSK_PRIVATE);

    const lock = part(tile, 'private');
    expect(lock?.getAttribute('role')).toBe('img');
    expect(lock?.getAttribute('aria-label')).toBe('Private repository');
    expect(lock?.previousElementSibling).toBe(part(tile, 'project'));
    expect(lock?.nextElementSibling).toBe(part(tile, 'branch'));
    const svg = lock?.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('22');
    expect(svg?.getAttribute('stroke-width')).toBe('2.2');
    expect(ruleFor(CSS, '.tileLock')).toEqual({ display: 'flex', color: 'var(--ink-3)' });
  });

  it('public: no lock', () => {
    expect(part(renderTile(KIOSK_PASSED), 'private')).toBeNull();
  });

  it('is singular at one: "1 test" (v4 item 50)', () => {
    expect(part(renderTile({ ...KIOSK_PASSED, total: 1 }), 'count')?.textContent).toBe('1 test');
  });

  it('is --surface for every status: no fail tint (v4 item 40)', () => {
    for (const run of [KIOSK_PASSED, KIOSK_FAILED, KIOSK_EMPTY, KIOSK_PRIVATE]) {
      expect(renderTile(run).className).toBe(styles.tile);
      cleanup();
    }
  });

  it('groups thousands in the count', () => {
    const { container } = render(
      <RunFeedRow variant="kiosk" run={{ ...KIOSK_PASSED, project: 'RouteServe', total: 1048 }} />,
    );
    expect(part(container, 'count')?.textContent).toBe('1,048 tests');
  });

  it('draws the tile: padding 18 24, --radius-lg, --surface, 1px --line, gap 8', () => {
    expect(ruleFor(CSS, '.tile')).toEqual({
      display: 'flex',
      'flex-direction': 'column',
      'justify-content': 'center',
      gap: '8px',
      padding: '18px 24px',
      'border-radius': 'var(--radius-lg)',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.tileTop')).toEqual({
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: '12px',
    });
    expect(ruleFor(CSS, '.tileWhen')).toEqual({
      'font-size': '22px',
      color: 'var(--ink-3)',
      'white-space': 'nowrap',
    });
  });

  it('sets project 24/600, branch 24 --ink-3 with ellipsis, and the count right by status', () => {
    expect(ruleFor(CSS, '.tileBottom')).toEqual({
      display: 'flex',
      'align-items': 'center',
      gap: '10px',
      'font-size': '24px',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'min-width': '0px',
    });
    expect(ruleFor(CSS, '.tileProject')).toEqual({ 'font-weight': '600' });
    expect(ruleFor(CSS, '.tileBranch')).toEqual({
      color: 'var(--ink-3)',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
    });
    expect(ruleFor(CSS, '.tileCount')).toEqual({
      color: 'var(--ink-2)',
      'font-weight': '400',
      'margin-left': 'auto',
    });
    expect(ruleFor(CSS, '.tileCountFailed')).toEqual({
      color: 'var(--fail)',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.tileCountEmpty')).toEqual({ color: 'var(--attn)', 'font-weight': '600' });
  });
});
