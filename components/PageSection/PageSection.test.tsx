// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { PageSection } from './PageSection';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'PageSection.module.css');

// design/pages/Project Page.dc.html: each part of the page is a numbered section under a hairline.
describe('PageSection', () => {
  it('names the section by its heading and puts the number before it, hidden from the outline', () => {
    const { getByRole } = render(
      <PageSection number={2} title="How it’s tested">
        <p>body</p>
      </PageSection>,
    );
    const section = getByRole('region', { name: 'How it’s tested' });
    const heading = getByRole('heading', { level: 2, name: 'How it’s tested' });

    expect(section.contains(heading)).toBe(true);
    const number = section.querySelector<HTMLElement>('[data-part="number"]');
    expect(number?.textContent).toBe('02');
    expect(number?.getAttribute('aria-hidden')).toBe('true');
    expect(section.textContent).toContain('body');
  });

  it('pads the last section 48 above and 64 below', () => {
    const { getByRole } = render(
      <PageSection number={4} title="Runs and flaky tests" last>
        <p />
      </PageSection>,
    );
    expect(getByRole('region').className).toContain('last');
    expect(ruleFor(CSS, '.last')).toEqual({ 'padding-bottom': 'var(--space-10)' });
  });

  it('draws the hairline, 48 padding, and the mono number beside a serif 30 heading', () => {
    expect(ruleFor(CSS, '.section')).toEqual({
      padding: '48px 0px',
      'border-top': '1px solid var(--line)',
    });
    expect(ruleFor(CSS, '.head')).toEqual({
      display: 'flex',
      'align-items': 'baseline',
      gap: '14px',
      'margin-bottom': '28px',
    });
    expect(ruleFor(CSS, '.number')).toEqual({
      font: '600 12px var(--font-mono)',
      'letter-spacing': '0.08em',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.title')).toEqual({ margin: '0px', font: 'var(--text-h2)' });
  });
});
