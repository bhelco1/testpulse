import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-only. The secret key bypasses row-level security (spec section 15), so this module
// must never be imported from a client component or anything else that ships to the browser.
// The no-restricted-imports rule in eslint.config.mjs enforces that for app/ and components/.

const URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL';
const SECRET_KEY_VAR = 'SUPABASE_SECRET_KEY';

/**
 * A client authenticated with the secret key, for scripts, route handlers and server code.
 * Reads the environment eagerly so a missing setting fails at startup with the variable's name
 * rather than on the first query with an HTTP error.
 */
export type SecretClientEnv = Readonly<Record<string, string | undefined>>;

export function createSecretClient(env: SecretClientEnv = process.env): SupabaseClient {
  const url = env[URL_VAR];
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

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
