// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { Notice } from './Notice';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'Notice.module.css');

const part = (root: Element, name: string) =>
  root.querySelector<HTMLElement>(`[data-part="${name}"]`);

describe('Notice', () => {
  it('attn: announces a stale project politely with a clock, the title in --attn', () => {
    const { getByRole } = render(
      <Notice
        tone="attn"
        title="RouteServe hasn't reported in 12 days"
        body="Everything below is from the last report, Sep 12."
      />,
    );
    const notice = getByRole('status');

    expect(notice.dataset.tone).toBe('attn');
    expect(part(notice, 'title')?.textContent).toBe("RouteServe hasn't reported in 12 days");
    expect(part(notice, 'body')?.textContent).toBe(
      'Everything below is from the last report, Sep 12.',
    );
    const icon = notice.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('width')).toBe('18');
    expect(icon?.getAttribute('stroke-width')).toBe('2.4');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('M12 7v5l3 2');
  });

  it('fail: is an alert with the failed icon, the title in --fail', () => {
    const { getByRole } = render(
      <Notice
        tone="fail"
        title="1 test failed: HomeViewModelTest › rendersToday"
        body="It failed on ios-sim and passed on jvm in the same run."
      />,
    );
    const notice = getByRole('alert');

    expect(notice.dataset.tone).toBe('fail');
    expect(notice.textContent).toBe(
      '1 test failed: HomeViewModelTest › rendersToday' +
        'It failed on ios-sim and passed on jvm in the same run.',
    );
    const icon = notice.querySelector('svg');
    expect(icon?.getAttribute('stroke-width')).toBe('2.6');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('m15 9-6 6M9 9l6 6');
  });

  it('neutral: a lock and one line of body text, no title, not announced', () => {
    const body =
      'This repository is private, so failure details and source links are hidden. Counts, trends, and test names are real.';
    const { container } = render(<Notice tone="neutral" body={body} />);
    const notice = container.firstElementChild as HTMLElement;

    expect(notice.dataset.tone).toBe('neutral');
    expect(notice.hasAttribute('role')).toBe(false);
    expect(part(notice, 'title')).toBeNull();
    expect(part(notice, 'body')?.textContent).toBe(body);
    const lock = notice.querySelector('svg');
    expect(lock?.getAttribute('stroke-width')).toBe('2.2');
    expect(lock?.querySelector('rect')).not.toBeNull();
  });

  it('is a 14 by 16 banner with the row radius and a 1px border in its tone', () => {
    expect(ruleFor(CSS, '.notice')).toEqual({
      display: 'flex',
      gap: 'var(--space-3)',
      'align-items': 'flex-start',
      padding: '14px var(--space-4)',
      'border-radius': 'var(--radius-md)',
    });
    expect(ruleFor(CSS, '.attn')).toEqual({
      background: 'var(--attn-tint)',
      border: '1px solid var(--attn)',
    });
    expect(ruleFor(CSS, '.fail')).toEqual({
      background: 'var(--fail-tint)',
      border: '1px solid var(--fail)',
    });
    expect(ruleFor(CSS, '.neutral')).toEqual({
      background: 'var(--neutral-tint)',
      border: '1px solid var(--line-strong)',
    });
  });

  it('sets the title 14.5/600 in the tone ink and the body 13.5 in --ink-2', () => {
    // jsdom serializes flex: none as its longhand values.
    expect(ruleFor(CSS, '.icon')).toEqual({ flex: '0 0 auto', 'margin-top': '1px' });
    expect(ruleFor(CSS, '.attn .icon, .attn .title')).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.fail .icon, .fail .title')).toEqual({ color: 'var(--fail)' });
    expect(ruleFor(CSS, '.neutral .icon')).toEqual({ color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.title')).toEqual({ 'font-weight': '600', 'font-size': '14.5px' });
    expect(ruleFor(CSS, '.body')).toEqual({
      'font-size': '13.5px',
      color: 'var(--ink-2)',
      'margin-top': '2px',
    });
    expect(ruleFor(CSS, '.neutral .body')).toEqual({
      'font-size': '14px',
      'line-height': '1.5',
      'margin-top': '0px',
    });
  });
});
