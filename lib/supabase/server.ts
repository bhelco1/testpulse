import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { invalidUrlError, isHttpUrl, URL_VAR } from './url.ts';

// Server-only. The secret key bypasses row-level security (spec section 15), so this module
// must never be imported from a client component, a public page, or anything that ships to the
// browser. The no-restricted-imports rule in eslint.config.mjs enforces that for direct imports
// from app/, components/ and lib/queries/; lib/queries/boundary.test.ts covers indirect ones.

const SECRET_KEY_VAR = 'SUPABASE_SECRET_KEY';

/**
 * A client authenticated with the secret key, for scripts, route handlers and server code.
 * Reads the environment eagerly so a missing setting fails at startup with the variable's name
 * rather than on the first query with an HTTP error.
 */
export type SecretClientEnv = Readonly<Record<string, string | undefined>>;

export function createSecretClient(env: SecretClientEnv = process.env): SupabaseClient {
  const configuredUrl = env[URL_VAR] ?? '';
  // Trimmed before it is judged, so a value that picked up a newline from a paste still works.
  const url = configuredUrl.trim();
  const secretKey = env[SECRET_KEY_VAR];
  const missing = [
    [URL_VAR, url],
    [SECRET_KEY_VAR, secretKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (!url || !secretKey) {
    throw new Error(
      `Missing ${missing.join(' and ')}. Set them in the environment or in .env.local ` +
        '(see .env.example).',
    );
  }

  if (!isHttpUrl(url)) {
    throw invalidUrlError(configuredUrl);
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
