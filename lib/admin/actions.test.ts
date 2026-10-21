import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acknowledge, type ActionDeps, createLink, deleteLink, rotateKey } from './actions.ts';
import type { AdminGate } from './guard.ts';

// Admin's actions (spec section 15, "Admin" as built; design/components.md, Admin): each refuses
// anything but the guard's yes before it reads its input or makes a client, validates its input
// with Zod, and answers in the drawn states. The database work is the real functions'
// (lib/tracked-links/create.ts, lib/alerts/rpc.ts, lib/projects/repo.ts), proven against local
// Supabase by lib/admin/admin-actions.int.test.ts; here they are stand-ins.

const ALLOWED: AdminGate = { ok: true, email: 'owner@testpulse.test' };
const SIGNED_OUT: AdminGate = { ok: false, status: 401 };
const UNAVAILABLE: AdminGate = { ok: false, status: 503 };
const NOW = new Date('2026-10-08T11:00:00Z');
const ID = '00000000-0000-4000-8000-0000000000d1';
const KEY = 'tp_x7Kq2mZr9LwB4vNs1YtE8hGd3PaC6uFj0oRi5nMeWbQ';

let deps: ActionDeps & {
  client: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  acknowledgeAlert: ReturnType<typeof vi.fn>;
  alertStatus: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};
let logged: string[];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    logged.push(parts.join(' '));
  });
  deps = {
    client: vi.fn(() => ({}) as SupabaseClient),
    now: () => NOW,
    create: vi.fn(async () => ({
      ok: true,
      link: { id: ID, token: 'Qm8r2LxT0aZe' },
    })),
    acknowledgeAlert: vi.fn(async () => undefined),
    alertStatus: vi.fn(async () => 'open'),
    rotate: vi.fn(async () => KEY),
    remove: vi.fn(async () => true),
  } as unknown as typeof deps;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FORM = {
  company: 'Initech',
  role: 'Head of QA',
  contact: 'Priya Shah',
  notes: 'Applied through their careers page.',
  sent_on: '2026-10-08',
  lead_project_slug: 'routeserve',
};

describe('every action refuses without the guard’s yes, before anything else', () => {
  const calls = [
    ['createLink', (gate: AdminGate) => createLink(gate, FORM, 'https://example.org', deps)],
    ['acknowledge', (gate: AdminGate) => acknowledge(gate, ID, deps)],
    ['rotateKey', (gate: AdminGate) => rotateKey(gate, 'routeserve', deps)],
    ['deleteLink', (gate: AdminGate) => deleteLink(gate, ID, deps)],
  ] as const;

  it.each(calls)(
    '%s: no session reads as the session ended, and nothing is done',
    async (_n, run) => {
      expect(await run(SIGNED_OUT)).toEqual({ status: 'session-ended' });
      expect(deps.client).not.toHaveBeenCalled();
    },
  );

  it.each(calls)(
    '%s: Supabase not answering reads as an error, and nothing is done',
    async (_n, run) => {
      expect(await run(UNAVAILABLE)).toEqual({ status: 'error' });
      expect(deps.client).not.toHaveBeenCalled();
    },
  );
});

describe('createLink', () => {
  it('creates the link and answers its id and copyable address', async () => {
    expect(await createLink(ALLOWED, FORM, 'https://example.org', deps)).toEqual({
      status: 'created',
      id: ID,
      url: 'https://example.org/v/Qm8r2LxT0aZe',
    });
    expect(deps.create).toHaveBeenCalledWith(expect.anything(), FORM, NOW);
  });

  it('names Company and Role when they are blank, and creates nothing', async () => {
    expect(
      await createLink(ALLOWED, { ...FORM, company: '  ', role: '' }, 'https://example.org', deps),
    ).toEqual({ status: 'invalid', fields: ['company', 'role'] });
    expect(
      await createLink(ALLOWED, { ...FORM, contact: '', lead_project_slug: '' }, 'o', deps),
    ).toMatchObject({ status: 'created' });
    expect(deps.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unknown field', { ...FORM, token: 'chosen' }],
    ['a company over 120 characters', { ...FORM, company: 'x'.repeat(121) }],
    ['a date that is not one', { ...FORM, sent_on: '2026-02-30' }],
    ['not an object', 'company=Initech'],
  ])('answers an error for %s, and creates nothing', async (_label, input) => {
    expect(await createLink(ALLOWED, input, 'https://example.org', deps)).toEqual({
      status: 'error',
    });
    expect(deps.create).not.toHaveBeenCalled();
  });

  it('answers an error when the lead project is gone or the database fails, logging no value', async () => {
    deps.create.mockResolvedValueOnce({ ok: false, reason: 'unknown_lead_project' });
    expect(await createLink(ALLOWED, FORM, 'o', deps)).toEqual({ status: 'error' });
    deps.create.mockRejectedValueOnce(new Error('insert the tracked link: 08006 gone'));
    expect(await createLink(ALLOWED, FORM, 'o', deps)).toEqual({ status: 'error' });
    expect(logged.join('\n')).toContain('08006 gone');
    expect(logged.join('\n')).not.toContain('Initech');
  });
});

describe('acknowledge', () => {
  it('acknowledges the alert at now', async () => {
    expect(await acknowledge(ALLOWED, ID, deps)).toEqual({ status: 'acknowledged' });
    expect(deps.acknowledgeAlert).toHaveBeenCalledWith(expect.anything(), ID, NOW);
  });

  it('refuses an id that is not one, and answers the database’s refusal as an error', async () => {
    expect(await acknowledge(ALLOWED, 'not-a-uuid', deps)).toEqual({ status: 'error' });
    expect(deps.acknowledgeAlert).not.toHaveBeenCalled();
    deps.acknowledgeAlert.mockRejectedValueOnce(new Error('acknowledge_alert: P0001 refused'));
    expect(await acknowledge(ALLOWED, ID, deps)).toEqual({ status: 'error' });
    expect(deps.alertStatus).toHaveBeenCalledWith(expect.anything(), ID);
  });

  // v19 item 6: a count_drop a later report closed has nothing left to acknowledge, and the page
  // says so; one acknowledged elsewhere, or gone, leaves with no message (spec section 13.9).
  it('answers closed-by-itself for a count_drop a report closed before it was acknowledged', async () => {
    deps.acknowledgeAlert.mockRejectedValueOnce(new Error('acknowledge_alert: P0001 refused'));
    deps.alertStatus.mockResolvedValueOnce('closed-by-itself');
    expect(await acknowledge(ALLOWED, ID, deps)).toEqual({ status: 'closed-by-itself' });
    expect(deps.alertStatus).toHaveBeenCalledWith(expect.anything(), ID);
  });

  it('answers closed when the alert was acknowledged elsewhere, or is gone', async () => {
    deps.acknowledgeAlert.mockRejectedValueOnce(new Error('acknowledge_alert: P0001 refused'));
    deps.alertStatus.mockResolvedValueOnce('closed');
    expect(await acknowledge(ALLOWED, ID, deps)).toEqual({ status: 'closed' });
    expect(deps.alertStatus).toHaveBeenCalledWith(expect.anything(), ID);
  });

  it('answers an error when the alert is still open after the refusal, or cannot be read', async () => {
    deps.acknowledgeAlert.mockRejectedValueOnce(new Error('acknowledge_alert: 08006 gone'));
    deps.alertStatus.mockResolvedValueOnce('open');
    expect(await acknowledge(ALLOWED, ID, deps)).toEqual({ status: 'error' });
    deps.acknowledgeAlert.mockRejectedValueOnce(new Error('acknowledge_alert: 08006 gone'));
    deps.alertStatus.mockRejectedValueOnce(new Error('alert: 08006 still gone'));
    expect(await acknowledge(ALLOWED, ID, deps)).toEqual({ status: 'error' });
    expect(logged.join('\n')).toContain('08006 still gone');
  });

  it('does not read the alert when acknowledging succeeds', async () => {
    expect(await acknowledge(ALLOWED, ID, deps)).toEqual({ status: 'acknowledged' });
    expect(deps.alertStatus).not.toHaveBeenCalled();
  });
});

describe('rotateKey', () => {
  it('answers the new key, once, and never logs it', async () => {
    expect(await rotateKey(ALLOWED, 'routeserve', deps)).toEqual({ status: 'rotated', key: KEY });
    expect(deps.rotate).toHaveBeenCalledWith(expect.anything(), 'routeserve');
    deps.rotate.mockRejectedValueOnce(new Error('project "routeserve" not found'));
    expect(await rotateKey(ALLOWED, 'routeserve', deps)).toEqual({ status: 'error' });
    expect(logged.join('\n')).not.toContain(KEY);
  });

  it('refuses a slug that is not one', async () => {
    expect(await rotateKey(ALLOWED, '../secrets', deps)).toEqual({ status: 'error' });
    expect(deps.rotate).not.toHaveBeenCalled();
  });
});

describe('deleteLink', () => {
  it('deletes the link, and answers an error for one that is gone or an id that is not one', async () => {
    expect(await deleteLink(ALLOWED, ID, deps)).toEqual({ status: 'deleted' });
    expect(deps.remove).toHaveBeenCalledWith(expect.anything(), ID);
    deps.remove.mockResolvedValueOnce(false);
    expect(await deleteLink(ALLOWED, ID, deps)).toEqual({ status: 'error' });
    expect(await deleteLink(ALLOWED, 42, deps)).toEqual({ status: 'error' });
    expect(deps.remove).toHaveBeenCalledTimes(2);
  });
});
