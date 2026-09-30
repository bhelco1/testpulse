// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { TestHeader } from './TestHeader';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'TestHeader.module.css');

const part = (root: ParentNode, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

// The top of design/pages/Test History.dc.html: the layer tag, the Flaky pill when section 11
// flags the test, the test's name as the heading and its full suite below it.
describe('TestHeader', () => {
  it('heads the page with the test’s name, its suite and its layer', () => {
    const { getByRole, container } = render(
      <TestHeader
        name="addEventForDateLogsAtNoon"
        suite="com.ostomate.app.ui.calendar.CalendarViewModelTest"
        layer="Unit"
        flaky={false}
      />,
    );

    expect(getByRole('heading', { level: 1 }).textContent).toBe('addEventForDateLogsAtNoon');
    expect(part(container, 'suite')?.textContent).toBe(
      'com.ostomate.app.ui.calendar.CalendarViewModelTest',
    );
    expect(part(container, 'layer')?.textContent).toBe('Unit');
    expect(part(container, 'flaky')).toBeNull();
  });

  it('marks a flaky test with the amber Flaky pill and its icon', () => {
    const { container } = render(
      <TestHeader name="accepts a minimal valid asset" suite="asset.test.ts" layer="Unit" flaky />,
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
