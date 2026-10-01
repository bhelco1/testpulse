// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { timeLabel } from '../testing/time';
import { TestHeader, type TestHeaderProps } from './TestHeader';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'TestHeader.module.css');

const part = (root: ParentNode, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

const BASE: TestHeaderProps = {
  name: 'rendersToday',
  suite: 'com.ostomate.app.ui.home.HomeViewModelTest',
  module: 'composeApp',
  layer: 'Unit',
  flaky: false,
  mismatch: null,
  firstSeen: null,
};

// The top of design/pages/Test History.dc.html: the module and layer tags, the Flaky pill when
// section 11 flags the test, the mismatch headline and the New pill, the test's name as the
// heading and its full suite below it.
describe('TestHeader', () => {
  it('heads the page with the test’s name, its suite and its layer', () => {
    const { getByRole, container } = render(
      <TestHeader
        {...BASE}
        name="addEventForDateLogsAtNoon"
        suite="com.ostomate.app.ui.calendar.CalendarViewModelTest"
      />,
    );

    expect(getByRole('heading', { level: 1 }).textContent).toBe('addEventForDateLogsAtNoon');
    expect(part(container, 'suite')?.textContent).toBe(
      'com.ostomate.app.ui.calendar.CalendarViewModelTest',
    );
    expect(part(container, 'layer')?.textContent).toBe('Unit');
    expect(part(container, 'flaky')).toBeNull();
    expect(part(container, 'mismatch')).toBeNull();
    expect(part(container, 'new')).toBeNull();
  });

  // Design v9 item 16 (Design System section 11, "TEST HISTORY HEADER TAGS"): the module tag
  // comes first, before the layer.
  it('tags the test with its module, before its layer', () => {
    const { container } = render(<TestHeader {...BASE} />);
    const tags = [...(part(container, 'tags')?.children ?? [])];
    expect(tags.map((tag) => tag.getAttribute('data-part'))).toEqual(['module', 'layer']);
    expect(part(container, 'module')?.textContent).toBe('composeApp');
    expect(ruleFor(CSS, '.module')).toEqual({
      padding: '3px 10px',
      'border-radius': 'var(--radius-tag)',
      border: '1px solid var(--line-strong)',
      color: 'var(--ink-2)',
      font: '13px var(--font-mono)',
    });
  });

  // components.md: "Mismatch headline (--fail 600, x-circle)" and "New pill" (design v9 item 10).
  it('heads a mismatch in --fail with its latest run, and pills a new test, in order', () => {
    const { container } = render(
      <TestHeader
        {...BASE}
        flaky
        mismatch={{
          text: 'Platform mismatch in 1 run',
          run: 'Pull request from fix-today-count',
          when: timeLabel('yesterday'),
        }}
        firstSeen={timeLabel('4 min ago')}
      />,
    );
    const tags = [...(part(container, 'tags')?.children ?? [])];
    expect(tags.map((tag) => tag.getAttribute('data-part'))).toEqual([
      'module',
      'layer',
      'flaky',
      'mismatch',
      'new',
    ]);
    const mismatch = part(container, 'mismatch') as HTMLElement;
    expect(mismatch.textContent).toBe(
      'Platform mismatch in 1 run· Pull request from fix-today-count, yesterday',
    );
    expect(mismatch.querySelector('svg')?.getAttribute('width')).toBe('14');
    expect(mismatch.querySelector('time')?.textContent).toBe('yesterday');
    expect(part(container, 'mismatch-run')?.textContent).toBe(
      '· Pull request from fix-today-count, yesterday',
    );
    const pill = part(container, 'new') as HTMLElement;
    expect(pill.textContent).toBe('New · first seen 4 min ago');
    expect(pill.querySelector('time')?.textContent).toBe('4 min ago');
    expect(ruleFor(CSS, '.mismatch')).toEqual({
      display: 'inline-flex',
      'align-items': 'center',
      gap: '6px',
      color: 'var(--fail)',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.mismatchRun')).toEqual({ 'font-weight': '400', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.new')).toEqual({
      display: 'inline-flex',
      'align-items': 'center',
      gap: '6px',
      padding: '4px 11px',
      'border-radius': 'var(--radius-pill)',
      background: 'var(--neutral-tint)',
      color: 'var(--neutral)',
      'font-weight': '600',
    });
  });

  it('places what it is given below the suite: the page’s tiles', () => {
    const { container } = render(
      <TestHeader {...BASE}>
        <p data-part="tiles">tiles</p>
      </TestHeader>,
    );
    expect(part(container, 'suite')?.nextElementSibling?.getAttribute('data-part')).toBe('tiles');
  });

  it('marks a flaky test with the amber Flaky pill and its icon', () => {
    const { container } = render(
      <TestHeader {...BASE} name="accepts a minimal valid asset" suite="asset.test.ts" flaky />,
    );
    const flaky = part(container, 'flaky') as HTMLElement;

    expect(flaky.textContent).toBe('Flaky');
    const icon = flaky.querySelector('svg');
    expect(icon?.getAttribute('width')).toBe('14');
    expect(icon?.getAttribute('stroke-width')).toBe('2.6');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('M2 12h4l3-7 6 14 3-7h4');
  });

  it('sets the tag row, tag, pill, heading and suite as the mock draws them', () => {
    expect(ruleFor(CSS, '.header')).toEqual({ padding: '36px 0px 40px' });
    expect(ruleFor(CSS, '.tags')).toEqual({
      display: 'flex',
      'flex-wrap': 'wrap',
      'align-items': 'center',
      gap: '8px 14px',
      'font-size': '14px',
    });
    expect(ruleFor(CSS, '.layer')).toEqual({
      padding: '3px 10px',
      'border-radius': 'var(--radius-tag)',
      border: '1px solid var(--line-strong)',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.flaky')).toEqual({
      display: 'inline-flex',
      'align-items': 'center',
      gap: '6px',
      padding: '4px 11px',
      'border-radius': 'var(--radius-pill)',
      background: 'var(--attn-tint)',
      color: 'var(--attn)',
      'font-weight': '600',
    });
    expect(ruleFor(CSS, '.name')).toEqual({
      margin: '14px 0px 0px',
      font: '500 clamp(32px, 4.5vw, 52px)/1.1 var(--font-mono)',
      'letter-spacing': '-0.03em',
      'overflow-wrap': 'anywhere',
    });
    expect(ruleFor(CSS, '.suite')).toEqual({
      'margin-top': '8px',
      font: '14px var(--font-mono)',
      color: 'var(--ink-3)',
      'overflow-wrap': 'anywhere',
    });
  });
});
