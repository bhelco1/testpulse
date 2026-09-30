import { describe, expect, it, vi } from 'vitest';

import type { PublicClient } from '../supabase/public';
import { feedConnection, watchReports, type LiveState } from './reports';

// A stand-in for the one RealtimeChannel call chain watchReports makes: .on(...).on(...)
// .subscribe(callback). It records what was asked for and lets a test play the server's part.
function fakeClient() {
  const bindings: { type: string; filter: unknown; handler: (payload: unknown) => void }[] = [];
  let status: ((status: string, error?: Error) => void) | undefined;
  const channel = {
    on(type: string, filter: unknown, handler: (payload: unknown) => void) {
      bindings.push({ type, filter, handler });
      return channel;
    },
    subscribe(callback: (status: string, error?: Error) => void) {
      status = callback;
      return channel;
    },
  };
  const client = {
    channel: vi.fn<(name: string, options: unknown) => typeof channel>(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  };
  return {
    client: client as unknown as PublicClient,
    calls: client,
    channel,
    bindings,
    status: (value: string) => status?.(value),
    emit: (type: string, payload: unknown) =>
      bindings.filter((binding) => binding.type === type).forEach((b) => b.handler(payload)),
  };
}

function watch() {
  const fake = fakeClient();
  const onReport = vi.fn();
  const onState = vi.fn<(state: LiveState) => void>();
  const stop = watchReports(fake.client, { onReport, onState });
  return { ...fake, onReport, onState, stop };
}

describe('watchReports', () => {
  // Spec section 4 and the 2026-09-21 and 2026-09-28 decisions: reports is the only table in
  // the publication, and the browser learns only that a report arrived.
  it('listens for INSERT on public.reports only, holding SUBSCRIBED until Postgres is listening', () => {
    const { calls, bindings } = watch();

    expect(calls.channel).toHaveBeenCalledOnce();
    expect(calls.channel.mock.calls[0]?.[1]).toEqual({
      config: { postgres_changes_options: { wait: true } },
    });
    expect(bindings.filter((b) => b.type === 'postgres_changes').map((b) => b.filter)).toEqual([
      { event: 'INSERT', schema: 'public', table: 'reports' },
    ]);
  });

  it('calls onReport for each insert and passes nothing of the row on', () => {
    const { emit, onReport } = watch();
    emit('postgres_changes', { new: { id: 'r1', run_id: 'x', total: 3 } });
    emit('postgres_changes', { new: { id: 'r2' } });

    expect(onReport).toHaveBeenCalledTimes(2);
    expect(onReport.mock.calls).toEqual([[], []]);
  });

  it('is live on SUBSCRIBED and offline on CHANNEL_ERROR, TIMED_OUT and CLOSED', () => {
    const { status, onState } = watch();
    for (const value of ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED', 'TIMED_OUT', 'CLOSED']) {
      status(value);
    }
    expect(onState.mock.calls.map(([state]) => state)).toEqual([
      'live',
      'offline',
      'live',
      'offline',
      'offline',
    ]);
  });

  // A server that ignores `wait` still answers the binding with a system message; an error there
  // means nothing will arrive, whatever SUBSCRIBED said.
  it('is offline when Realtime refuses the postgres_changes binding', () => {
    const { status, emit, onState } = watch();
    status('SUBSCRIBED');
    emit('system', { extension: 'postgres_changes', status: 'error', message: 'refused' });
    emit('system', { extension: 'postgres_changes', status: 'ok' });
    emit('system', { extension: 'broadcast', status: 'error' });

    expect(onState.mock.calls.map(([state]) => state)).toEqual(['live', 'offline']);
  });

  it('removes its channel when stopped and reports nothing afterwards', () => {
    const { stop, calls, channel, status, emit, onState, onReport } = watch();
    stop();

    expect(calls.removeChannel).toHaveBeenCalledWith(channel);
    // removeChannel closes the channel, which reports CLOSED to a component already gone.
    status('CLOSED');
    emit('postgres_changes', { new: { id: 'r3' } });
    expect(onState).not.toHaveBeenCalled();
    expect(onReport).not.toHaveBeenCalled();
  });
});

describe('feedConnection', () => {
  const asOf = {
    text: '12:00',
    datetime: '2026-10-05T12:00:00.000Z',
    title: '5 Oct 2026, 12:00 UTC',
  };

  // Neither "Live" nor "Offline" is true until the channel answers, and never without scripts.
  it('gives no connection while connecting', () => {
    expect(feedConnection('connecting', asOf)).toEqual({});
  });

  it('is connected when live, and disconnected as of the page’s data when offline', () => {
    expect(feedConnection('live', asOf)).toEqual({ connected: true });
    expect(feedConnection('offline', asOf)).toEqual({ connected: false, asOf });
  });
});
