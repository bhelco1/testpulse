// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { AdminShell } from './AdminShell';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'AdminShell.module.css');

// Admin's loading and error states (design/pages/Admin.dc.html, LOADING and ERROR;
// design/components.md, Admin, "Page states"). The signed-in sections are components/AdminMain and
// the section components.
describe('AdminShell', () => {
  it('loading: the heading and the four sections’ headings over blocks, busy, with a status', () => {
    const { container } = render(<AdminShell state="loading" />);

    const main = screen.getByRole('main');
    expect(main.id).toBe('main');
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('Admin');
    expect(
      within(main)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Open alerts', 'Tracked links', 'Projects', 'Daily job']);
    expect(within(main).getByRole('status').textContent).toBe('Loading admin');
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-part="skeleton"]')].map((block) => [
        block.style.height,
        block.style.borderRadius,
      ]),
    ).toEqual([
      ['84px', '16px'],
      ['220px', '16px'],
      ['180px', '16px'],
      ['110px', '16px'],
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(ruleFor(CSS, '.loadingH2')).toMatchObject({
      font: '500 26px var(--font-serif)',
      color: 'var(--ink-3)',
    });
    expect(ruleFor(CSS, '.loading')).toMatchObject({ gap: '14px' });
  });

  it('when Supabase did not answer: the drawn error card, with Try again reloading /admin', () => {
    render(<AdminShell state="unavailable" />);

    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('Admin');
    const card = within(main).getByRole('alert');
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe('Admin couldn’t load');
    expect(
      within(card).getByText(
        'The database didn’t answer, so nothing here can be shown or changed right now. Nothing was lost.',
      ),
    ).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
      '/admin',
    );
  });

  it('spaces and sizes the frame as the design does', () => {
    expect(ruleFor(CSS, '.main')).toMatchObject({ padding: '24px 0px 64px', gap: '48px' });
    expect(ruleFor(CSS, '.h1')).toMatchObject({
      font: '500 44px/1.05 var(--font-serif)',
      'letter-spacing': '-0.02em',
    });
    expect(ruleFor(CSS, '.error')).toMatchObject({ 'max-width': '640px' });
  });
});
