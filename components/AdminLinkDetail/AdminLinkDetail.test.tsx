// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeleteLinkResult } from '../../lib/admin/types';
import type { LinkDetailView } from '../../lib/pages/admin';
import { ruleFor } from '../testing/stylesheet';
import { AdminLinkDetail } from './AdminLinkDetail';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CSS = join(import.meta.dirname, 'AdminLinkDetail.module.css');
const ORIGIN = 'https://testpulse.example';
const ID = '00000000-0000-4000-8000-0000000000d1';

const OPENED: LinkDetailView = {
  company: 'Acme Health',
  role: 'Director of Quality Engineering',
  contact: 'Dana Ruiz, dana.ruiz@acme.example',
  lead: { name: 'RouteServe', private: true },
  sent: '18 Sep',
  notes: 'Met at the QA leaders meetup.',
  path: '/v/Qm8r2LxT0aZe',
  opened: true,
  firstSeen: { text: '18 Sep, 16:02 UTC', datetime: '2026-09-18T16:02:00.000Z', title: 't' },
  lastSeen: { text: '2 h ago', datetime: '2026-10-08T09:00:00.000Z', title: 't' },
  sessions: '3',
  visitors: '2',
  pages: [
    { label: 'Overview', path: '/', views: '2', time: '1m 14s' },
    { label: 'Ostomate2', path: '/p/ostomate2', views: '3', time: '6m 52s' },
    { label: 'Ostomate2 run', path: '/p/ostomate2/runs/412', views: '1', time: null },
  ],
  perProject: [
    { name: 'Ostomate2', time: '6m 52s', share: '100%' },
    { name: 'RouteServe', time: '41 s', share: '10%' },
    { name: 'testpulse', time: null, share: '0%' },
  ],
};

const UNOPENED: LinkDetailView = {
  ...OPENED,
  company: 'Globex',
  contact: null,
  lead: null,
  notes: null,
  opened: false,
  firstSeen: null,
  lastSeen: null,
  sessions: '0',
  visitors: '0',
  pages: [],
  perProject: [],
};

function show(view: LinkDetailView, remove: (id: string) => Promise<DeleteLinkResult> = vi.fn()) {
  return render(<AdminLinkDetail view={view} linkId={ID} origin={ORIGIN} remove={remove} />);
}

describe('AdminLinkDetail', () => {
  it('shows the breadcrumb, heading, details and the link with its address', () => {
    show(OPENED);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(crumbs)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/admin', '/admin#tracked-links']);
    expect(crumbs.textContent).toBe('Admin/Tracked links/Acme Health');
    expect(within(crumbs).getByText('Acme Health').getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Acme Health');
    expect(screen.getByRole('region', { name: 'Link details' }).textContent).toBe(
      'ContactDana Ruiz, dana.ruiz@acme.exampleLead projectRouteServePrivateSent18 Sep' +
        'NotesMet at the QA leaders meetup.',
    );
    expect(screen.getByRole('region', { name: 'Link' }).textContent).toBe(
      `Link${ORIGIN}/v/Qm8r2LxT0aZeCopy`,
    );
  });

  it('shows the figures, the pages viewed and the time per project of an opened link', () => {
    show(OPENED);
    const visits = screen.getByRole('region', { name: 'Visits' });
    const tiles = [...visits.querySelectorAll(':scope > div:nth-of-type(1) > div')];
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      'First seen18 Sep, 16:02 UTCFirst browser visit',
      'Last seen2 h agoLatest browser visit',
      'Sessions3Distinct session cookies',
      'Visitors2Distinct salted IP hashes',
    ]);
    const pages = within(visits).getByRole('heading', { name: 'Pages viewed' }).parentElement;
    expect([...(pages?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Overview/Views: 2Time: 1m 14s',
      'Ostomate2/p/ostomate2Views: 3Time: 6m 52s',
      'Ostomate2 run/p/ostomate2/runs/412Views: 1Time: —',
    ]);
    expect(pages?.textContent).toContain(
      'Time on a page runs until the next page, or until the tab is hidden or closed.',
    );
    const perProject = within(visits).getByRole('heading', { name: 'Time per project' })
      .parentElement as HTMLElement;
    const bars = [...perProject.querySelectorAll('li')];
    expect(bars.map((bar) => bar.textContent)).toEqual([
      'Ostomate26m 52s',
      'RouteServe41 s',
      'testpulse—',
    ]);
    expect(
      bars.map((bar) => (bar.querySelector('span > span') as HTMLElement | null)?.style.width),
    ).toEqual(['100%', '10%', '0%']);
    expect(within(visits).queryByText('Not yet opened')).toBeNull();
  });

  it('reads an unopened link as not yet opened, with no pages or time', () => {
    show(UNOPENED);
    expect(screen.getByRole('region', { name: 'Link details' }).textContent).toBe(
      'Contact—Lead projectNone, opens the overviewSent18 SepNotesNo notes',
    );
    const visits = screen.getByRole('region', { name: 'Visits' });
    expect(visits.textContent).toContain(
      'Not yet openedVisits appear here once someone opens the link in a browser. Link previews ' +
        'and bots are never counted.',
    );
    expect(within(visits).queryByRole('heading', { name: 'Pages viewed' })).toBeNull();
    expect(within(visits).getAllByText('—')).toHaveLength(2);
  });

  it('draws a dash for no contact and for unmeasured time in the third ink', () => {
    show({ ...OPENED, contact: null });
    const details = screen.getByRole('region', { name: 'Link details' });
    expect(within(details).getByText('—').className).toContain('unknown');
    const visits = screen.getByRole('region', { name: 'Visits' });
    const dashes = within(visits)
      .getAllByText('—')
      .map((dash) => dash.className);
    expect(dashes).toHaveLength(2);
    for (const name of dashes) expect(name).toContain('unknown');
    const measured = within(visits).getAllByText('6m 52s', { selector: 'li > span' });
    expect(measured).toHaveLength(2);
    for (const time of measured) expect(time.className).toContain('time');
    expect(ruleFor(CSS, '.unknown')).toEqual({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.time')).toEqual({ color: 'var(--ink-2)' });
  });

  it('offers the address to select when the browser refuses to copy', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('refused')) },
    });
    show(OPENED);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link for Acme Health' }));
    });
    const field = within(screen.getByRole('status')).getByRole('textbox', {
      name: 'Link for Acme Health',
    }) as HTMLInputElement;
    expect(field.value).toBe(`${ORIGIN}/v/Qm8r2LxT0aZe`);
  });

  it('asks before deleting, busy while it runs', async () => {
    let finish: (result: DeleteLinkResult) => void = () => undefined;
    const remove = vi.fn(() => new Promise<DeleteLinkResult>((resolve) => (finish = resolve)));
    show(OPENED, remove);
    const section = screen.getByRole('region', { name: 'Delete this link' });
    fireEvent.click(within(section).getByRole('button', { name: 'Delete link' }));
    const dialog = within(section).getByRole('alertdialog', {
      name: 'Delete the Acme Health link?',
    });
    expect(dialog.textContent).toBe(
      'Delete the Acme Health link?The link stops working. Its visit history is kept, unlinked ' +
        'from this company and role.CancelDelete link',
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete link' }));
    });
    expect(remove).toHaveBeenCalledWith(ID);
    expect(within(dialog).getByRole('button', { name: 'Deleting…' }).hasAttribute('disabled')).toBe(
      true,
    );
    await act(async () => finish({ status: 'error' }));
    expect(within(section).getByRole('alert').textContent).toBe(
      'Couldn’t delete the link. Nothing was removed. Try again.',
    );
    expect(within(section).getByRole('button', { name: 'Delete link' })).toBeTruthy();
  });

  it('cancels a delete, and raises the session-ended alert when the session has gone', async () => {
    show(
      OPENED,
      vi.fn(async () => ({ status: 'session-ended' }) as const),
    );
    const section = screen.getByRole('region', { name: 'Delete this link' });
    fireEvent.click(within(section).getByRole('button', { name: 'Delete link' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Cancel' }));
    expect(within(section).queryByRole('alertdialog')).toBeNull();
    fireEvent.click(within(section).getByRole('button', { name: 'Delete link' }));
    await act(async () => {
      fireEvent.click(
        within(within(section).getByRole('alertdialog')).getByRole('button', {
          name: 'Delete link',
        }),
      );
    });
    expect(screen.getAllByRole('alert')[0]?.textContent).toBe(
      'Your session has endedSign in again to finish. Nothing was changed.Sign in again',
    );
  });

  it('draws the page as the design does', () => {
    expect(ruleFor(CSS, '.h1')).toMatchObject({
      font: '500 clamp(34px, 5vw, 44px)/1.05 var(--font-serif)',
    });
    expect(ruleFor(CSS, '.crumbs')).toMatchObject({ 'font-size': '14px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.unopened')).toMatchObject({
      border: '1px dashed var(--line-strong)',
      background: 'var(--inset)',
    });
    expect(ruleFor(CSS, '.bar')).toMatchObject({ height: '8px' });
    expect(ruleFor(CSS, '.fill')).toMatchObject({ background: 'var(--ink-2)' });
    expect(ruleFor(CSS, '.confirm')).toMatchObject({
      background: 'var(--fail-tint)',
      border: '1px solid var(--fail)',
    });
  });
});
