import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { invalidUrlError, isHttpUrl, URL_VAR } from './url.ts';

// The publishable-key client, for public pages on the server and in the browser (spec section
// 15). It runs as the anon database role, so what it can read is exactly what row-level
// security grants anon (section 9); public pages reach it only through lib/queries/.

const PUBLISHABLE_KEY_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

declare const publicClientBrand: unique symbol;

/**
 * A client that can only have come from createPublicClient, so a lib/queries function typed to
 * take one cannot be handed the secret client without a cast.
 */
export type PublicClient = SupabaseClient & { readonly [publicClientBrand]: true };

export type PublicClientEnv = Readonly<Record<string, string | undefined>>;

// Next.js inlines NEXT_PUBLIC_ variables into the browser bundle only where each is written out
// in full; in the browser, process.env as a whole is empty.
function processEnv(): PublicClientEnv {
  return {
    [URL_VAR]: process.env.NEXT_PUBLIC_SUPABASE_URL,
    [PUBLISHABLE_KEY_VAR]: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

// A legacy Supabase key is a JWT that names its database role in the payload.
function legacyRole(key: string): unknown {
  const [, payload, ...rest] = key.split('.');
  if (payload === undefined || rest.length !== 1) return undefined;
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims === 'object' && claims !== null && 'role' in claims
      ? claims.role
      : undefined;
  } catch {
    return undefined;
  }
}

function isSecretKey(key: string): boolean {
  return key.startsWith('sb_secret_') || legacyRole(key) === 'service_role';
}

export function createPublicClient(env: PublicClientEnv = processEnv()): PublicClient {
  const configuredUrl = env[URL_VAR] ?? '';
  const url = configuredUrl.trim();
  const key = (env[PUBLISHABLE_KEY_VAR] ?? '').trim();
  const missing = [
    [URL_VAR, url],
    [PUBLISHABLE_KEY_VAR, key],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(' and ')}. Set them in the environment or in .env.local ` +
        '(see .env.example).',
    );
  }

  if (!isHttpUrl(url)) {
    throw invalidUrlError(configuredUrl);
  }

  // A NEXT_PUBLIC_ value is already in the browser bundle by the time this runs, so refusing it
  // stops its use here but cannot unpublish it; hence the advice to rotate.
  if (isSecretKey(key)) {
    throw new Error(
      `${PUBLISHABLE_KEY_VAR} holds a secret key, which bypasses row-level security. Set it to ` +
        'the publishable key (sb_publishable_…), and rotate the secret key if this value was ' +
        'ever built or deployed.',
    );
  }

  // The public client never carries a user session: a session would make it run as
  // authenticated rather than anon, and a magic-link token in the URL must not be picked up.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // The one place a PublicClient is made; the brand exists only in the type system.
  return client as PublicClient;
}
