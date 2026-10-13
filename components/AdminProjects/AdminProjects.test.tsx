// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RotateKeyResult } from '../../lib/admin/types';
import type { ProjectRowView } from '../../lib/pages/admin';
import { AdminMain } from '../AdminMain/AdminMain';
import { ruleFor } from '../testing/stylesheet';
import { AdminProjects } from './AdminProjects';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'AdminProjects.module.css');
const KEY = 'tp_x7Kq2mZr9LwB4vNs1YtE8hGd3PaC6uFj0oRi5nMeWbQ';
const when = (text: string) => ({ text, datetime: '2026-10-08T10:56:00.000Z', title: 't' });

const PROJECTS: ProjectRowView[] = [
  {
    slug: 'ostomate2',
    name: 'Ostomate2',
    visibility: 'Public',
    private: false,
    report: { when: when('4 min ago'), stale: false },
    sync: { word: '✓ In sync', tone: 'pass', detail: null },
    rotateSlug: 'ostomate2',
  },
  {
    slug: 'routeserve',
    name: 'RouteServe',
    visibility: 'Private',
    private: true,
    report: { when: when('1 week ago'), stale: true },
    sync: { word: '≠ Differs', tone: 'attn', detail: 'expected_cadence_days: YAML 7, database 8' },
    rotateSlug: 'routeserve',
  },
  {
    slug: 'demo-shop',
    name: 'demo-shop',
    visibility: 'Public',
    private: false,
    report: { when: null, stale: false },
    sync: { word: '+ Not registered', tone: 'attn', detail: 'projects/demo-shop.yaml has no row.' },
    rotateSlug: null,
  },
];

function show(rotate: (slug: string) => Promise<RotateKeyResult> = vi.fn()) {
  return render(
    <AdminMain variant="main" top={<h1>Admin</h1>}>
      <AdminProjects projects={PROJECTS} rotate={rotate} />
    </AdminMain>,
  );
}

const row = (name: string) =>
  screen.getAllByRole('listitem').find((item) => item.textContent?.startsWith(name)) as HTMLElement;

describe('AdminProjects', () => {
  it('gives each project its visibility, last report, sync state and key action', () => {
    show();
    const section = screen.getByRole('region', { name: 'Projects' });
    expect(section.querySelector('p')?.textContent).toBe(
      'YAML sync compares each projects/*.yaml file deployed with the site against its database ' +
        'row, when this page loads. API keys are stored only as a hash and never shown again ' +
        'after they’re issued.',
    );
    expect(row('Ostomate2').textContent).toBe(
      'Ostomate2PublicLast report4 min agoYAML sync✓ In syncRotate key',
    );
    const rs = row('RouteServe');
    expect(rs.textContent).toBe(
      'RouteServePrivateLast report◷ 1 week agoYAML sync≠ Differsexpected_cadence_days: YAML 7, ' +
        'database 8Rotate key',
    );
    expect(rs.querySelector('svg')).not.toBeNull();
    expect(
      within(rs)
        .getByText(/1 week ago/)
        .closest('dd')?.className,
    ).toContain('stale');
    const demo = row('demo-shop');
    expect(demo.textContent).toBe(
      'demo-shopPublicLast report—YAML sync+ Not registeredprojects/demo-shop.yaml has no row.No row, no key',
    );
    expect(within(demo).queryByRole('button')).toBeNull();
  });

  it('asks before rotating, and Cancel leaves the key alone', () => {
    const rotate = vi.fn();
    show(rotate);
    fireEvent.click(within(row('RouteServe')).getByRole('button', { name: 'Rotate key' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Rotate the RouteServe key' });
    expect(dialog.textContent).toBe(
      'Rotate the RouteServe key?The current key stops working immediately. Reports fail with ' +
        '401 until the project’s CI secret is updated. Its build stays green either way.' +
        'CancelRotate key',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(rotate).not.toHaveBeenCalled();
  });

  it('rotates, busy while it runs, shows the new key once, and hides it for good', async () => {
    let finish: (result: RotateKeyResult) => void = () => undefined;
    const rotate = vi.fn(() => new Promise<RotateKeyResult>((resolve) => (finish = resolve)));
    show(rotate);
    fireEvent.click(within(row('RouteServe')).getByRole('button', { name: 'Rotate key' }));
    const dialog = screen.getByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Rotate key' }));
    });
    expect(rotate).toHaveBeenCalledWith('routeserve');
    expect(within(dialog).getByRole('button', { name: 'Rotating…' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(
      true,
    );

    await act(async () => finish({ status: 'rotated', key: KEY }));
    const rs = row('RouteServe');
    expect(within(rs).getByText('New key. Copy it now; it won’t be shown again.')).toBeTruthy();
    expect(within(rs).getByText(KEY).tagName).toBe('CODE');
    fireEvent.click(within(rs).getByRole('button', { name: 'Copied, hide it' }));
    expect(document.body.textContent).not.toContain(KEY);
  });

  it('says the current key still works when rotating fails, and tries again', async () => {
    const rotate = vi
      .fn<(slug: string) => Promise<RotateKeyResult>>()
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValueOnce({ status: 'rotated', key: KEY });
    show(rotate);
    fireEvent.click(within(row('RouteServe')).getByRole('button', { name: 'Rotate key' }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rotate key' }),
      );
    });
    const alert = within(row('RouteServe')).getByRole('alert');
    expect(alert.textContent).toBe(
      'Couldn’t rotate the RouteServe key.The current key still works. Try again.Try again',
    );
    await act(async () => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    });
    expect(rotate).toHaveBeenCalledTimes(2);
    expect(within(row('RouteServe')).getByText(KEY)).toBeTruthy();
  });

  it('raises the session-ended alert, and shows no key, when the session has gone', async () => {
    show(vi.fn(async () => ({ status: 'session-ended' }) as const));
    fireEvent.click(within(row('Ostomate2')).getByRole('button', { name: 'Rotate key' }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rotate key' }),
      );
    });
    expect(screen.getAllByRole('alert')[0]?.textContent).toBe(
      'Your session has endedThe key wasn’t rotated. Sign in again to finish; nothing was ' +
        'changed.Sign in again',
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText(/^New key/)).toBeNull();
  });

  it('draws the states as the design does', () => {
    expect(ruleFor(CSS, '.stale')).toMatchObject({ color: 'var(--attn)', 'font-weight': '600' });
    expect(ruleFor(CSS, '.rotate, .retry')).toMatchObject({
      border: '1px solid var(--fail)',
      color: 'var(--fail)',
    });
    expect(ruleFor(CSS, '.danger')).toMatchObject({
      background: 'var(--fail-tint)',
      border: '1px solid var(--fail)',
    });
    expect(ruleFor(CSS, '.key')).toMatchObject({ border: '1px dashed var(--line-strong)' });
    expect(ruleFor(CSS, '.pass')).toMatchObject({ color: 'var(--pass)' });
  });
});
