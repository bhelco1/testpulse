// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AcknowledgeResult } from '../../lib/admin/types';
import type { AlertRowView, AlertsView } from '../../lib/pages/admin';
import { AdminMain } from '../AdminMain/AdminMain';
import { ruleFor } from '../testing/stylesheet';
import { AdminAlerts } from './AdminAlerts';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'AdminAlerts.module.css');
const opened = { text: '8 Oct, 04:12 UTC', datetime: '2026-10-08T04:12:00.000Z', title: 't' };

const row = (kind: AlertRowView['kind'], word: string, ack: boolean): AlertRowView => ({
  id: `00000000-0000-4000-8000-0000000000${kind.length}0`,
  kind,
  kindWord: word,
  label: `${word.toLowerCase()} alert`,
  title: `${word} title`,
  body: `${word} body`,
  opened,
  closes: `${word} closes`,
  canAcknowledge: ack,
});

const VIEW: AlertsView = {
  count: '4 open',
  alerts: [
    row('count_drop', 'COUNT DROP', true),
    row('stale', 'STALE', false),
    row('empty_run', 'EMPTY REPORT', false),
    row('coverage_below_floor', 'BELOW FLOOR', false),
  ],
};

function show(acknowledge: (id: string) => Promise<AcknowledgeResult>, view = VIEW) {
  return render(
    <AdminMain variant="main" top={<h1>Admin</h1>}>
      <AdminAlerts view={view} acknowledge={acknowledge} />
    </AdminMain>,
  );
}

describe('AdminAlerts', () => {
  it('lists each open alert with its glyph, kind word, title, body and how it closes', () => {
    show(vi.fn());
    const section = screen.getByRole('region', { name: 'Open alerts' });
    expect(within(section).getByText('4 open')).toBeTruthy();
    const groups = within(section).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'count drop alert',
      'stale alert',
      'empty report alert',
      'below floor alert',
    ]);
    const [drop, stale] = groups as [HTMLElement, HTMLElement];
    expect(drop.textContent).toBe(
      'COUNT DROPCOUNT DROP titleCOUNT DROP bodyOpened8 Oct, 04:12 UTC·COUNT DROP closesAcknowledge',
    );
    expect(drop.querySelector('time')?.getAttribute('datetime')).toBe(opened.datetime);
    for (const group of groups) {
      expect(group.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
    // Acknowledge on count_drop alone.
    expect(
      within(section)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Acknowledge']);
    expect(within(stale).queryByRole('button')).toBeNull();
  });

  it('says so when no alert is open', () => {
    show(vi.fn(), { count: 'None', alerts: [] });
    const section = screen.getByRole('region', { name: 'Open alerts' });
    expect(section.textContent).toBe(
      'Open alertsNone✓No open alerts. Every project is reporting on schedule.',
    );
    expect(within(section).queryByRole('group')).toBeNull();
  });

  it('acknowledges, busy while it runs', async () => {
    let finish: (result: AcknowledgeResult) => void = () => undefined;
    const acknowledge = vi.fn(
      () => new Promise<AcknowledgeResult>((resolve) => (finish = resolve)),
    );
    show(acknowledge);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    });
    const busy = screen.getByRole('button', { name: 'Acknowledging…' });
    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(acknowledge).toHaveBeenCalledWith(VIEW.alerts[0]?.id);
    await act(async () => finish({ status: 'acknowledged' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the drawn error under the body when acknowledging fails', async () => {
    show(vi.fn(async () => ({ status: 'error' }) as const));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    });
    const error = within(screen.getByRole('group', { name: 'count drop alert' })).getByRole(
      'alert',
    );
    expect(error.textContent).toBe('Couldn’t acknowledge. The alert is still open. Try again.');
  });

  it('shows nothing when the alert was acknowledged elsewhere, or is gone', async () => {
    show(vi.fn(async () => ({ status: 'closed' }) as const));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/already closed/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Acknowledge' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  // v19 item 6 (design/components.md, "Alert row"; Admin.dc.html `states` "already closed"): the
  // refreshed page drops the row and a pass Notice takes the first place under the heading, until
  // the page is next loaded.
  it('says the alert had already closed when a report closed it before Acknowledge', async () => {
    const view = show(vi.fn(async () => ({ status: 'closed-by-itself' }) as const));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    });
    const refreshed: AlertsView = { count: '3 open', alerts: VIEW.alerts.slice(1) };
    view.rerender(
      <AdminMain variant="main" top={<h1>Admin</h1>}>
        <AdminAlerts view={refreshed} acknowledge={vi.fn()} />
      </AdminMain>,
    );
    const section = screen.getByRole('region', { name: 'Open alerts' });
    const notice = within(section).getByRole('status');
    expect(notice.textContent).toBe(
      'That alert had already closed“COUNT DROP title” closed by itself when a later report ' +
        'brought the count back, so there was nothing to acknowledge.',
    );
    expect(notice.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(within(section).queryByRole('alert')).toBeNull();
    // First in the section after its heading, then the remaining alerts.
    const [head, first, list] = [...section.children] as HTMLElement[];
    expect(head?.textContent).toBe('Open alerts3 open');
    expect(first).toBe(notice);
    expect(list?.querySelectorAll('[role="group"]')).toHaveLength(3);
  });

  it('keeps the notice above “No open alerts” when it was the only alert', async () => {
    const only: AlertsView = { count: '1 open', alerts: VIEW.alerts.slice(0, 1) };
    const view = show(
      vi.fn(async () => ({ status: 'closed-by-itself' }) as const),
      only,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    });
    view.rerender(
      <AdminMain variant="main" top={<h1>Admin</h1>}>
        <AdminAlerts view={{ count: 'None', alerts: [] }} acknowledge={vi.fn()} />
      </AdminMain>,
    );
    const section = screen.getByRole('region', { name: 'Open alerts' });
    expect(section.textContent).toBe(
      'Open alertsNoneThat alert had already closed“COUNT DROP title” closed by itself when a ' +
        'later report brought the count back, so there was nothing to acknowledge.✓No open ' +
        'alerts. Every project is reporting on schedule.',
    );
  });

  it('raises the session-ended alert at the top of the page when the session has gone', async () => {
    show(vi.fn(async () => ({ status: 'session-ended' }) as const));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    });
    const [notice] = screen.getAllByRole('alert');
    expect(notice?.textContent).toBe(
      'Your session has endedThe alert wasn’t acknowledged. Sign in again to finish; nothing was ' +
        'changed, and the alert is still open.Sign in again',
    );
    // design/components.md, "Page states": the row stays as it was, its button back to Acknowledge.
    const button = screen.getByRole('button', { name: 'Acknowledge' });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/Couldn’t acknowledge/)).toBeNull();
    expect(
      within(notice as HTMLElement)
        .getByRole('link')
        .getAttribute('href'),
    ).toBe('/admin');
  });

  it('draws the row as the design does', () => {
    expect(ruleFor(CSS, '.row')).toMatchObject({
      padding: '14px var(--space-4)',
      'border-radius': 'var(--radius-md)',
      background: 'var(--attn-tint)',
      border: '1px solid var(--attn)',
    });
    expect(ruleFor(CSS, '.kind')).toMatchObject({
      font: '600 11px var(--font-mono)',
      'letter-spacing': '0.06em',
      border: '1px solid var(--attn)',
    });
    expect(ruleFor(CSS, '.title')).toMatchObject({ 'font-size': '14.5px', color: 'var(--attn)' });
    expect(ruleFor(CSS, '.meta')).toMatchObject({ 'font-size': '12.5px', color: 'var(--ink-3)' });
    expect(ruleFor(CSS, '.none')).toMatchObject({ border: '1px dashed var(--line-strong)' });
    expect(ruleFor(CSS, '.ack')).toMatchObject({ 'min-height': 'var(--target-min)' });
  });

  it('draws the already-closed notice as the design does', () => {
    expect(ruleFor(CSS, '.closed')).toMatchObject({
      'margin-bottom': '10px',
      padding: '14px var(--space-4)',
      'border-radius': 'var(--radius-md)',
      background: 'var(--pass-tint)',
      border: '1px solid var(--pass)',
    });
    expect(ruleFor(CSS, '.closedIcon')).toMatchObject({ color: 'var(--pass)' });
    expect(ruleFor(CSS, '.closedTitle')).toMatchObject({
      'font-weight': '600',
      'font-size': '14.5px',
      color: 'var(--ink)',
    });
    expect(ruleFor(CSS, '.closedBody')).toMatchObject({
      margin: '4px 0px 0px',
      'font-size': '13.5px',
      'line-height': '1.5',
      color: 'var(--ink-2)',
    });
  });
});
