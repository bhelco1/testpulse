// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateLinkResult } from '../../lib/admin/types';
import type { LinksView } from '../../lib/pages/admin';
import { AdminMain } from '../AdminMain/AdminMain';
import { ruleFor } from '../testing/stylesheet';
import { AdminLinks, type CreateLinkInput } from './AdminLinks';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const CSS = join(import.meta.dirname, 'AdminLinks.module.css');
const ORIGIN = 'https://testpulse.example';
const ACME = '00000000-0000-4000-8000-0000000000d1';
const GLOBEX = '00000000-0000-4000-8000-0000000000d2';

const VIEW: LinksView = {
  count: '2 links',
  links: [
    {
      id: ACME,
      href: `/admin/links/${ACME}`,
      company: 'Acme Health',
      role: 'Director of Quality Engineering',
      notes: 'Met at the QA leaders meetup.',
      sent: '18 Sep',
      opened: { text: '3 sessions · 2 visitors', counted: true },
      lastSeen: { text: '2 h ago', datetime: '2026-10-08T09:00:00.000Z', title: 't' },
      pages: ['Overview', 'Ostomate2'],
      path: '/v/Qm8r2LxT0aZe',
    },
    {
      id: GLOBEX,
      href: `/admin/links/${GLOBEX}`,
      company: 'Globex',
      role: 'QA Manager',
      notes: null,
      sent: '—',
      opened: { text: 'Not yet opened', counted: false },
      lastSeen: null,
      pages: [],
      path: '/v/Tb9eJx3mRq6u',
    },
  ],
};
const LEADS = [
  { slug: 'ostomate2', label: 'Ostomate2', private: false },
  { slug: 'routeserve', label: 'RouteServe (private)', private: true },
];

function show(create: (input: CreateLinkInput) => Promise<CreateLinkResult> = vi.fn()) {
  return render(
    <AdminMain variant="main" top={<h1>Admin</h1>}>
      <AdminLinks view={VIEW} leads={LEADS} origin={ORIGIN} today="2026-10-08" create={create} />
    </AdminMain>,
  );
}

const rows = () => screen.getAllByRole('listitem');
const field = (name: RegExp | string) => screen.getByRole('textbox', { name });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdminLinks table', () => {
  it('lists each link with its details, figures and address, labelled for each value', () => {
    show();
    const section = screen.getByRole('region', { name: /Tracked links/ });
    expect(within(section).getByText('2 links')).toBeTruthy();
    const [acme, globex] = rows() as [HTMLElement, HTMLElement];
    expect(within(acme).getByRole('link', { name: 'Acme Health' }).getAttribute('href')).toBe(
      `/admin/links/${ACME}`,
    );
    expect(acme.querySelector('dl')?.textContent).toBe(
      'Sent18 SepOpened3 sessions · 2 visitorsLast seen2 h agoPagesOverviewOstomate2',
    );
    expect(within(acme).getByTitle('Met at the QA leaders meetup.').textContent).toBe(
      'Note:Met at the QA leaders meetup.',
    );
    expect(within(acme).getByText(ORIGIN).parentElement?.textContent).toBe(
      `${ORIGIN}/v/Qm8r2LxT0aZe`,
    );
    // The origin gives way to an ellipsis first, so the token stays in view.
    expect(within(acme).getByText(ORIGIN).className).toContain('origin');
    expect(within(acme).getByText('/v/Qm8r2LxT0aZe').className).toContain('path');
    expect(globex.querySelector('dl')?.textContent).toBe(
      'Sent—OpenedNot yet openedLast seen—Pages—',
    );
    expect(within(globex).queryByText('Note:')).toBeNull();
    expect(section.textContent).toContain(
      'Sessions are distinct session cookies; visitors are distinct salted IP hashes. Bot and ' +
        'link-preview visits are never counted. Visitors can read what’s recorded on the privacy page.',
    );
  });

  it('copies the full address, and reads Copied', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link for Acme Health' }));
    });
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/v/Qm8r2LxT0aZe`);
    expect(screen.getByRole('button', { name: 'Copy link for Acme Health' }).textContent).toBe(
      'Copied',
    );
  });

  it.each([
    ['refuses', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('no'))) } }],
    ['has no clipboard', {}],
  ])('offers the address to select when the browser %s', async (_label, navigator) => {
    vi.stubGlobal('navigator', navigator);
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link for Globex' }));
    });
    const status = within(rows()[1] as HTMLElement).getByRole('status');
    expect(status.textContent).toBe('Your browser blocked copying. Select the link and copy it.');
    const input = within(status).getByRole('textbox', { name: 'Link for Globex' });
    expect((input as HTMLInputElement).value).toBe(`${ORIGIN}/v/Tb9eJx3mRq6u`);
    expect(input.hasAttribute('readonly')).toBe(true);
  });

  it('lays rows out as the design’s table and cards', () => {
    expect(ruleFor(CSS, '.card')).toMatchObject({
      background: 'var(--surface)',
      'border-radius': 'var(--radius-lg)',
    });
    expect(ruleFor(CSS, '.line')).toMatchObject({ padding: '12px var(--space-4) var(--space-4)' });
    expect(ruleFor(CSS, '.opened')).toMatchObject({ color: 'var(--ink)', 'font-weight': '600' });
    expect(ruleFor(CSS, '.unopened')).toMatchObject({ color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.isNew')).toMatchObject({ background: 'var(--raised)' });
  });
});

describe('AdminLinks create form', () => {
  let create: ReturnType<typeof vi.fn<(input: CreateLinkInput) => Promise<CreateLinkResult>>>;

  beforeEach(() => {
    create = vi.fn<(input: CreateLinkInput) => Promise<CreateLinkResult>>();
  });

  const open = () => fireEvent.click(screen.getByRole('button', { name: 'New link' }));
  const type = (name: RegExp | string, value: string) =>
    fireEvent.change(field(name), { target: { value } });

  it('opens with every field, the sent date today and None as the lead', () => {
    show(create);
    open();
    const form = screen.getByRole('group', { name: 'New tracked link' });
    expect(within(form).getByText('Company').parentElement?.textContent).toBe('Companyrequired');
    expect(within(form).getByText('Role').parentElement?.textContent).toBe('Rolerequired');
    expect(within(form).getByText('Contact').parentElement?.textContent).toBe('Contactoptional');
    expect(within(form).getByText('optional').className).toContain('tag');
    expect((field(/^Contact/) as HTMLInputElement).placeholder).toBe('Name or email');
    const lead = within(form).getByRole('combobox', { name: 'Lead project' }) as HTMLSelectElement;
    expect([...lead.options].map((option) => option.textContent)).toEqual([
      'None, open the overview',
      'Ostomate2',
      'RouteServe (private)',
    ]);
    expect(lead.value).toBe('');
    expect((form.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-10-08');
    expect(within(form).getByText('optional, only you see them')).toBeTruthy();
    expect(within(form).queryByText(/^Private:/)).toBeNull();
    fireEvent.change(lead, { target: { value: 'routeserve' } });
    expect(
      within(form).getByText('Private: the visitor sees counts and trends, never failure text.'),
    ).toBeTruthy();
  });

  it('marks Company and Role when they are blank, and sends nothing', async () => {
    show(create);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    });
    expect(create).not.toHaveBeenCalled();
    expect(field(/^Company/).getAttribute('aria-invalid')).toBe('true');
    expect(field(/^Role/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Company is required').id).toBe(
      field(/^Company/).getAttribute('aria-describedby'),
    );
    expect(screen.getByText('Role is required')).toBeTruthy();
    expect(field(/^Contact/).getAttribute('aria-invalid')).toBeNull();
  });

  it('sends the fields, busy while it runs, then closes and marks the new row', async () => {
    let finish: (result: CreateLinkResult) => void = () => undefined;
    create.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    show(create);
    open();
    type(/^Company/, 'Initech');
    type(/^Role/, 'Head of QA');
    type(/^Contact/, 'Priya Shah');
    type(/^Notes/, 'Applied through their careers page.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Lead project' }), {
      target: { value: 'routeserve' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    });
    expect(create).toHaveBeenCalledWith({
      company: 'Initech',
      role: 'Head of QA',
      contact: 'Priya Shah',
      notes: 'Applied through their careers page.',
      sent_on: '2026-10-08',
      lead_project_slug: 'routeserve',
    });
    const form = screen.getByRole('group', { name: 'New tracked link' });
    expect((form as HTMLFieldSetElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Creating…' }).getAttribute('aria-busy')).toBe(
      'true',
    );

    await act(async () => finish({ status: 'created', id: GLOBEX, url: `${ORIGIN}/v/x` }));
    expect(screen.queryByRole('group', { name: 'New tracked link' })).toBeNull();
    const globex = rows()[1] as HTMLElement;
    expect(globex.className).toContain('isNew');
    expect(within(globex).getByText('NEW')).toBeTruthy();
  });

  it('keeps the entries and says nothing was saved when creating fails', async () => {
    create.mockResolvedValue({ status: 'error' });
    show(create);
    open();
    type(/^Company/, 'Initech');
    type(/^Role/, 'Head of QA');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    });
    const alert = within(screen.getByRole('group', { name: 'New tracked link' })).getByRole(
      'alert',
    );
    expect(alert.textContent).toBe(
      'Couldn’t create the linkNothing was saved; your entries are still here. Try again.',
    );
    expect((field(/^Company/) as HTMLInputElement).value).toBe('Initech');
  });

  it('keeps the form and its entries when the session has ended, naming the action', async () => {
    create.mockResolvedValue({ status: 'session-ended' });
    show(create);
    open();
    type(/^Company/, 'Initech');
    type(/^Role/, 'Head of QA');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    });
    expect(screen.getAllByRole('alert')[0]?.textContent).toBe(
      'Your session has endedThe link wasn’t created. Sign in again to finish; nothing was ' +
        'changed, and the form keeps what you typed until you leave this page.Sign in again',
    );
    expect((field(/^Company/) as HTMLInputElement).value).toBe('Initech');
    expect((field(/^Role/) as HTMLInputElement).value).toBe('Head of QA');
  });

  it('closes on Cancel', () => {
    show(create);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'New tracked link' })).toBeNull();
  });

  it('sizes the form as the design does', () => {
    expect(ruleFor(CSS, '.form')).toMatchObject({
      padding: 'var(--space-6)',
      'border-radius': 'var(--radius-xl)',
    });
    expect(ruleFor(CSS, '.legend')).toMatchObject({ font: '500 22px var(--font-serif)' });
    expect(ruleFor(CSS, ".input[aria-invalid='true']")).toMatchObject({
      border: '1.5px solid var(--fail)',
    });
  });
});
