// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { AdminShell } from './AdminShell';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'AdminShell.module.css');

// Admin signed in (design/pages/Admin.dc.html, SIGNED IN: MAIN and ERROR). Its sections (alerts,
// tracked links, projects, daily job) arrive in the next pull request; this is the page frame.
describe('AdminShell', () => {
  it('signed in: the page’s heading in the main landmark, and nothing invented under it', () => {
    const { container } = render(<AdminShell state="ready" />);

    const main = screen.getByRole('main');
    expect(main.id).toBe('main');
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('Admin');
    expect(container.querySelectorAll('h2')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
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
