// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { keyframesIn, ruleFor } from '../testing/stylesheet';
import { Button, type ButtonVariant } from './Button';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'Button.module.css');
const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];

describe('Button', () => {
  for (const variant of VARIANTS) {
    it(`renders the ${variant} variant as a named, focusable button`, () => {
      const { getByRole } = render(<Button variant={variant}>Create link</Button>);
      const button = getByRole('button', { name: 'Create link' });

      expect(button.dataset.variant).toBe(variant);
      expect(button.getAttribute('type')).toBe('button');
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  }

  it('defaults to primary', () => {
    const { getByRole } = render(<Button>Try again</Button>);
    expect(getByRole('button', { name: 'Try again' }).dataset.variant).toBe('primary');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<Button onClick={onClick}>Copy link</Button>);
    fireEvent.click(getByRole('button', { name: 'Copy link' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit type such as submit', () => {
    const { getByRole } = render(<Button type="submit">Create link</Button>);
    expect(getByRole('button', { name: 'Create link' }).getAttribute('type')).toBe('submit');
  });

  it('when disabled is aria-disabled, still focusable, and inert', () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    const { getByRole } = render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Button type="submit" disabled onClick={onClick}>
          Save
        </Button>
      </form>,
    );
    const button = getByRole('button', { name: 'Save' }) as HTMLButtonElement;

    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('when busy keeps its variant, shows a spinner before the label, and is inert', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Button variant="danger" busy onClick={onClick}>
        Rotating…
      </Button>,
    );
    const button = getByRole('button', { name: 'Rotating…' });

    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.dataset.variant).toBe('danger');
    const spinner = button.firstElementChild;
    expect(spinner?.tagName.toLowerCase()).toBe('svg');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    expect(spinner?.getAttribute('width')).toBe('14');
    expect(spinner?.querySelector('path')?.getAttribute('d')).toBe('M12 3a9 9 0 0 1 9 9');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has no spinner and no busy or disabled state by default', () => {
    const { getByRole } = render(<Button>Load 50 more</Button>);
    const button = getByRole('button', { name: 'Load 50 more' });
    expect(button.querySelector('svg')).toBeNull();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  describe('styles, per the design system state grid', () => {
    it('is 44 tall, padded 0 16, 15px/600, radius sm', () => {
      expect(ruleFor(CSS, '.button')).toMatchObject({
        'min-height': 'var(--target-min)',
        padding: '0px 16px',
        'border-radius': 'var(--radius-sm)',
        font: '600 15px var(--font-sans)',
      });
    });

    it('draws each variant at rest', () => {
      expect(ruleFor(CSS, '.primary')).toEqual({
        background: 'var(--ink)',
        color: 'var(--on-ink)',
      });
      expect(ruleFor(CSS, '.secondary')).toEqual({
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        color: 'var(--ink)',
      });
      expect(ruleFor(CSS, '.ghost')).toEqual({ background: 'none', color: 'var(--ink)' });
      expect(ruleFor(CSS, '.danger')).toEqual({
        background: 'none',
        border: '1px solid var(--fail)',
        color: 'var(--fail)',
      });
    });

    it('draws hover and pressed only while the button can be pressed', () => {
      expect(ruleFor(CSS, '.primary.live:hover')).toEqual({ background: 'var(--ink-2)' });
      expect(ruleFor(CSS, '.primary.live:active')).toEqual({ background: 'var(--ink-3)' });
      expect(ruleFor(CSS, '.secondary.live:hover, .ghost.live:hover, .ghost.live:active')).toEqual({
        background: 'var(--raised)',
      });
      expect(ruleFor(CSS, '.secondary.live:active')).toEqual({
        background: 'var(--raised)',
        'border-color': 'var(--ink-3)',
      });
      expect(ruleFor(CSS, '.danger.live:hover')).toEqual({ background: 'var(--fail-tint)' });
      // The 2px pressed border takes a pixel of padding, so the label does not move.
      expect(ruleFor(CSS, '.danger.live:active')).toEqual({
        background: 'var(--fail-tint)',
        'border-width': '2px',
        padding: '0px 15px',
      });
    });

    it('draws disabled on the raised fill in ink-3 with no border, over any variant', () => {
      expect(ruleFor(CSS, ".button[aria-disabled='true']")).toEqual({
        background: 'var(--raised)',
        color: 'var(--ink-3)',
        border: '0px',
      });
    });

    it('turns the busy ring every 0.9s with a keyframe of its own', () => {
      expect(ruleFor(CSS, '.spinner')).toMatchObject({
        animation: 'spin 0.9s linear infinite',
      });
      expect(keyframesIn(CSS)).toEqual(['spin']);
    });
  });
});
