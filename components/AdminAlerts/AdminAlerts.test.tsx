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

  it('raises the session-ended alert at the top of the page when the session has gone', async () => {
    show(vi.fn(async () => ({ status: 'session-ended' }) as const));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    });
    const [notice] = screen.getAllByRole('alert');
    expect(notice?.textContent).toBe(
      'Your session has endedThe alert wasn’t acknowledged. Sign in again to finish; nothing was ' +
        'changed.Sign in again',
    );
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
});
