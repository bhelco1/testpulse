// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminNotFound } from './AdminNotFound';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

// design/components.md, Admin, "Page states", Unknown link (v18 item 14; Admin.dc.html detail
// "unknown link (404)"): inside the admin frame, the breadcrumb "Admin / Tracked links / Not
// found" above NotFound's layout, never the public not-found page.
describe('AdminNotFound', () => {
  it('puts the admin breadcrumb above the tracked-link not-found', () => {
    render(<AdminNotFound path="/admin/links/not-a-link" />);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs.textContent).toBe('Admin/Tracked links/Not found');
    expect(
      within(crumbs)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/admin', '/admin#tracked-links']);
    expect(within(crumbs).getByText('Not found').getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'No tracked link at this address',
    );
    expect(screen.getByRole('main').textContent).toContain('/admin/links/not-a-link');
    expect(screen.getByRole('link', { name: 'Go to tracked links' }).getAttribute('href')).toBe(
      '/admin#tracked-links',
    );
    expect(screen.queryByRole('link', { name: 'Go to overview' })).toBeNull();
  });
});
