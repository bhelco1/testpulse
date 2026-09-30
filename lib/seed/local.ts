import type { SupabaseClient } from '@supabase/supabase-js';

import { createSecretClient, type SecretClientEnv } from '../supabase/server.ts';
import { URL_VAR } from '../supabase/url.ts';

// The seed deletes and re-creates projects and issues their keys, so it only ever runs against
// the local stack `supabase start` serves. The host is compared exactly, after URL parsing, so
// neither a look-alike domain nor userinfo in front of the host gets through.

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

// `caller` names who is refused, so the message is accurate for every writer this guards.
export function assertLocalSupabaseUrl(url: string | undefined, caller = 'db:seed'): void {
  const value = url?.trim() ?? '';
  if (value === '') {
    throw new Error(`${URL_VAR} is not set; ${caller} needs the local Supabase URL`);
  }
  let parsed: URL | undefined;
  try {
    parsed = new URL(value);
  } catch {
    parsed = undefined;
  }
  const local =
    parsed !== undefined &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    LOCAL_HOSTNAMES.has(parsed.hostname);
  if (!local) {
    // The URL is not a secret (lib/supabase/url.ts echoes it too); the host is enough to act on.
    const shown = parsed === undefined ? 'a value that is not a URL' : `host "${parsed.host}"`;
    throw new Error(
      `${caller} only writes to a local Supabase (localhost, 127.0.0.1 or [::1]); ` +
        `${URL_VAR} names ${shown}`,
    );
  }
}

/** The secret-key client, built only after the URL is known to be the local stack. */
export function createSeedClient(
  env: SecretClientEnv = process.env,
  caller = 'db:seed',
): SupabaseClient {
  assertLocalSupabaseUrl(env[URL_VAR], caller);
  return createSecretClient(env);
}
