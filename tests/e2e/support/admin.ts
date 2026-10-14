import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ADMIN_AUTH_COOKIE } from '../../../lib/admin/session.ts';
import { createSeedClient } from '../../../lib/seed/local.ts';

// Admin in e2e (spec section 15, "Admin" as built). The server under test is given this address
// as ADMIN_EMAIL (playwright.config.ts). It is not a secret and owns no mailbox outside the local
// stack: Supabase Auth's mail goes to the local Mailpit. Production's ADMIN_EMAIL lives only in
// Vercel's environment settings.
export const E2E_ADMIN_EMAIL = 'owner@testpulse.test';

// The spec's own client holds the local secret key, to issue sign-in tokens without mail; it
// never reaches the page or the server under test.
let client: SupabaseClient | undefined;
export function authAdmin(): SupabaseClient {
  client ??= createSeedClient(process.env, 'the e2e admin sign-in');
  return client;
}

// Supabase keeps one sign-in token per user: issuing a second replaces the first. The page
// projects run side by side, so each issue-and-spend of the owner's token holds this lock, which
// mkdir takes atomically across Playwright's worker processes.
const LOCK = join(tmpdir(), 'testpulse-e2e-owner-sign-in.lock');
const LOCK_WAIT_MS = 30_000;
// A lock older than this was left by a run that died holding it.
const LOCK_STALE_MS = 60_000;

async function withOwnerLock<T>(work: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > LOCK_STALE_MS)
          rmSync(LOCK, { force: true, recursive: true });
      } catch {
        // Released between the two calls.
      }
      if (Date.now() > deadline) throw new Error(`waited ${LOCK_WAIT_MS} ms for ${LOCK}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await work();
  } finally {
    rmSync(LOCK, { force: true, recursive: true });
  }
}

/** A sign-in token's hash for the address, as the emailed link would carry it; nothing is sent. */
export async function tokenHashFor(email: string): Promise<{ hash: string; userId: string }> {
  const { data, error } = await authAdmin().auth.admin.generateLink({ type: 'magiclink', email });
  if (error !== null) throw new Error(`generateLink failed: ${error.code ?? error.status}`);
  return { hash: data.properties.hashed_token, userId: data.user.id };
}

export const confirmPath = (hash: string) => `/admin/auth/confirm?token_hash=${hash}&type=email`;

/** Signs the page's browser in as the owner through the real confirm route, as the link does. */
export async function signInAsOwner(page: Page): Promise<void> {
  await withOwnerLock(async () => {
    const { hash } = await tokenHashFor(E2E_ADMIN_EMAIL);
    await page.goto(confirmPath(hash));
  });
  await expect(page).toHaveURL('/admin');
  // Sign out is in the header at every width; "Signed in with magic link" only from 760 px (v18).
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/**
 * A session cookie in @supabase/ssr's form whose token claims to be the owner's magic-link
 * session but was never signed by Supabase.
 */
export function forgedSessionCookie() {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = [
    part({ alg: 'HS256', typ: 'JWT' }),
    part({
      sub: '00000000-0000-4000-8000-000000000001',
      email: E2E_ADMIN_EMAIL,
      role: 'authenticated',
      amr: [{ method: 'otp', timestamp: 1 }],
      exp: 4102444800,
    }),
    'Zm9yZ2Vk',
  ].join('.');
  const session = {
    access_token: accessToken,
    refresh_token: 'forged',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    user: { id: '00000000-0000-4000-8000-000000000001', email: E2E_ADMIN_EMAIL },
  };
  return {
    name: ADMIN_AUTH_COOKIE,
    value: `base64-${part(session)}`,
    domain: '127.0.0.1',
    path: '/admin',
  };
}
