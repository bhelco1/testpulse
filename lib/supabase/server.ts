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

/** Longest prefix of a bad URL worth echoing; enough to see the mistake, short enough to read. */
const ECHO_LIMIT = 60;

/**
 * The value as configured, quoted and with whitespace spelled out, because the mistakes this
 * catches are a copied newline, a stray space and a pasted pair of quotes: all invisible
 * otherwise. Only ever applied to the URL, which is public; never to the secret key.
 */
function echoed(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  const capped = escaped.length > ECHO_LIMIT ? `${escaped.slice(0, ECHO_LIMIT)}\u2026` : escaped;
  return `"${capped}"`;
}

function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

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

  // supabase-js rejects a malformed URL from inside a minified stack, which named nothing an
  // operator could act on. Checking it here names the variable and shows the offending value.
  if (!isHttpUrl(url)) {
    throw new Error(
      `${URL_VAR} is not an absolute http or https URL: ${echoed(configuredUrl)}. ` +
        'Expected a value like https://<project-ref>.supabase.co.',
    );
  }

  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
