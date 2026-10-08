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

const PRIVATE_NOTE =
  'This repository is private, so failure messages, stack traces and source links are hidden. Test names, counts and trends are real.';

describe('Notice', () => {
  it('stale project: attn with a clock and a title in the tone ink', () => {
    const { container } = render(
      <Notice
        tone="attn"
        icon="clock"
        title="RouteServe hasn’t reported in 12 days"
        body="Everything below is from the last report, Sep 12."
      />,
    );
    const notice = container.firstElementChild as HTMLElement;

    expect(notice.dataset.tone).toBe('attn');
    expect(part(notice, 'title')?.textContent).toBe('RouteServe hasn’t reported in 12 days');
    expect(part(notice, 'body')?.textContent).toBe(
      'Everything below is from the last report, Sep 12.',
    );
    const icon = notice.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('width')).toBe('18');
    expect(icon?.getAttribute('stroke-width')).toBe('2.4');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('M12 7v5l3 2');
  });

  it('failed-run summary: fail with the x-circle and a title', () => {
    const { container } = render(
      <Notice
        tone="fail"
        icon="x-circle"
        title="1 test failed: HomeViewModelTest › rendersToday"
        body="It failed on ios-sim and passed on jvm in the same run."
      />,
    );
    const notice = container.firstElementChild as HTMLElement;

    expect(notice.dataset.tone).toBe('fail');
    expect(notice.textContent).toBe(
      '1 test failed: HomeViewModelTest › rendersToday' +
        'It failed on ios-sim and passed on jvm in the same run.',
    );
    const icon = notice.querySelector('svg');
    expect(icon?.getAttribute('stroke-width')).toBe('2.6');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('m15 9-6 6M9 9l6 6');
  });

  it('private repository note: neutral with a lock and no title', () => {
    const { container } = render(<Notice tone="neutral" icon="lock" body={PRIVATE_NOTE} />);
    const notice = container.firstElementChild as HTMLElement;

    expect(notice.dataset.tone).toBe('neutral');
    expect(part(notice, 'title')).toBeNull();
    expect(part(notice, 'body')?.textContent).toBe(PRIVATE_NOTE);
    const lock = notice.querySelector('svg');
    expect(lock?.getAttribute('stroke-width')).toBe('2.2');
    expect(lock?.querySelector('rect')).not.toBeNull();
  });

  // Design v4 item 1: the title is optional on every tone, the neutral one included.
  it('takes a title on the neutral tone and leaves it out on attn and fail', () => {
    const { container } = render(
      <>
        <Notice tone="neutral" icon="lock" title="Private repository" body={PRIVATE_NOTE} />
        <Notice tone="attn" icon="clock" body="Everything below is from the last report." />
        <Notice tone="fail" icon="x-circle" body="1 test failed." />
      </>,
    );
    const neutral = container.children.item(0) as Element;
    const attn = container.children.item(1) as Element;
    const fail = container.children.item(2) as Element;

    expect(part(neutral, 'title')?.textContent).toBe('Private repository');
    expect(part(attn, 'title')).toBeNull();
    expect(part(attn, 'body')?.textContent).toBe('Everything below is from the last report.');
    expect(part(fail, 'title')).toBeNull();
  });

  // Design v4 item 2: the icon is chosen per use, not per tone.
  it('draws the icon it is given whatever the tone', () => {
    const { container } = render(<Notice tone="attn" icon="lock" body="Locked." />);
    const icon = container.querySelector('svg');
    expect(icon?.querySelector('rect')).not.toBeNull();
    expect(icon?.getAttribute('stroke-width')).toBe('2.2');
  });

  // Design v4 item 1: no live-region role on a Notice rendered with the page.
  it('has no role when rendered with the page, on every tone', () => {
    const { container } = render(
      <>
        <Notice tone="attn" icon="clock" title="Stale" body="Body." />
        <Notice tone="fail" icon="x-circle" title="Failed" body="Body." />
        <Notice tone="neutral" icon="lock" body="Body." />
      </>,
    );
    for (const notice of container.children) expect(notice.hasAttribute('role')).toBe(false);
  });

  it('is a status when inserted after load, such as a project going stale while open', () => {
    const { getByRole } = render(
      <Notice tone="attn" icon="clock" title="Stale" body="Body." live />,
    );
    expect(getByRole('status').dataset.tone).toBe('attn');
  });

  // The run page's failed-run banner (the Design System's section 10): an action after the text,
  // which wraps below it on a narrow screen.
  it('takes an action after its text, and wraps when it has one', () => {
    const { container } = render(
      <Notice
        tone="fail"
        icon="x-circle"
        title="3 tests failed"
        body="In composeApp and shared. On ios-sim and jvm."
        action={<a href="#results">Show failures</a>}
      />,
    );
    const notice = container.firstElementChild as HTMLElement;
    expect(notice.className).toContain('withAction');
    const content = part(notice, 'content');
    expect(content?.nextElementSibling?.textContent).toBe('Show failures');
    expect(content?.className).toContain('content');
    const plain = render(<Notice tone="attn" icon="clock" body="x" />).container
      .firstElementChild as HTMLElement;
    expect(plain.className).not.toContain('withAction');
    expect(ruleFor(CSS, '.withAction')).toEqual({ 'flex-wrap': 'wrap' });
    expect(ruleFor(CSS, '.withAction .content')).toEqual({ flex: '1 1 260px', 'min-width': '0px' });
    expect(ruleFor(CSS, '.withAction .title')).toEqual({ 'overflow-wrap': 'anywhere' });
    expect(ruleFor(CSS, '.withAction .body')).toEqual({ 'text-wrap': 'pretty' });
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

  // Design v5 item 10 confirms the neutral title in --ink-2.
  it('sets the title 14.5/600 in the tone ink and the body 14/1.5 --ink-2 on every tone', () => {
    // jsdom serializes flex: none as its longhand values.
    expect(ruleFor(CSS, '.icon')).toEqual({ flex: '0 0 auto', 'margin-top': '1px' });
    expect(ruleFor(CSS, '.attn .icon, .attn .title')).toEqual({ color: 'var(--attn)' });
    expect(ruleFor(CSS, '.fail .icon, .fail .title')).toEqual({ color: 'var(--fail)' });
    expect(ruleFor(CSS, '.neutral .icon, .neutral .title')).toEqual({ color: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.title')).toEqual({ 'font-weight': '600', 'font-size': '14.5px' });
    expect(ruleFor(CSS, '.body')).toEqual({
      'font-size': '14px',
      'line-height': '1.5',
      color: 'var(--ink-2)',
    });
    expect(ruleFor(CSS, '.title + .body')).toEqual({ 'margin-top': '2px' });
  });
});
