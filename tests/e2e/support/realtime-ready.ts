import { watchReports } from '../../../lib/live/reports.ts';
import { assertLocalSupabaseUrl } from '../../../lib/seed/local.ts';
import { createPublicClient } from '../../../lib/supabase/public.ts';
import { URL_VAR } from '../../../lib/supabase/url.ts';

// Playwright globalSetup. The pages subscribe to report inserts as soon as they load, and the
// visual, axe and live-feed tests wait for "Live". Realtime restarts after `supabase db reset`
// and can refuse joins for a while, so before any test runs this waits, on a condition rather
// than a sleep, until a publishable-key subscription made exactly as the pages make it is
// listening to Postgres. The Supabase client retries a refused join by itself.

const READY_TIMEOUT_MS = 60_000;

export default async function realtimeReady(): Promise<void> {
  // The suite runs against the seeded local stack, and its live-feed spec writes and deletes
  // projects there; a hosted URL stops it here, before any test or client (lib/seed/local.ts).
  assertLocalSupabaseUrl(process.env[URL_VAR], 'the e2e suite');
  const client = createPublicClient();
  let stop = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Realtime was not listening within ${READY_TIMEOUT_MS} ms`)),
        READY_TIMEOUT_MS,
      );
      stop = watchReports(client, {
        onReport: () => {},
        onState: (state) => {
          if (state !== 'live') return;
          clearTimeout(timer);
          resolve();
        },
      });
    });
  } finally {
    stop();
    await client.removeAllChannels();
  }
}
