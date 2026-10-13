import { randomUUID } from 'node:crypto';

import { expect, type Page, test } from '@playwright/test';

import { confirmLinkIn, deleteMessagesTo, messagesTo, waitForMessageTo } from '../int/mailpit.ts';
import { E2E_ADMIN_EMAIL } from './support/admin.ts';

// Spec section 17, Phase 6 criterion 2, end to end through the mail: the sign-in form emails the
// allowlisted address a link that signs it in, once; any other address gets the same answer and
// no email. Supabase Auth's mail is caught by the local stack's Mailpit (tests/int/mailpit.ts).
// The owner has one sign-in token at a time, so this spec runs in the `live` project, after every
// page project has finished and one file at a time (playwright.config.ts).

/** Sends the form for the address and returns what the page answered, as text. */
async function ask(page: Page, email: string): Promise<string> {
  await page.goto('/admin');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  const sent = page.getByRole('main').getByRole('status');
  await expect(sent.getByRole('heading', { level: 2 })).toHaveText('Check your email');
  return page.getByRole('main').innerText();
}

const adminCookies = async (page: Page) =>
  (await page.context().cookies()).filter(({ name }) => name.startsWith('testpulse_admin'));

// One test, so the owner is sent one link: Supabase refuses a second within max_frequency
// (supabase/config.toml), and that refusal is, by design, invisible on the page.
test('the owner is emailed a link that signs in once; another address gets the same answer and no email', async ({
  page,
  baseURL,
}) => {
  const other = `someone-${randomUUID()}@example.org`;
  await deleteMessagesTo(E2E_ADMIN_EMAIL);

  const toOther = await ask(page, other);
  const toOwner = await ask(page, E2E_ADMIN_EMAIL);
  expect(toOther).toBe(toOwner);
  expect(await adminCookies(page)).toEqual([]);

  // The owner's link, asked for second, has arrived, so one to the other address would have too.
  const message = await waitForMessageTo(E2E_ADMIN_EMAIL);
  expect(await messagesTo(other)).toEqual([]);
  expect(message.subject).toBe('Sign in to testpulse admin');
  const link = await confirmLinkIn(message.id);
  expect(`${link.origin}${link.pathname}`).toBe(`${baseURL}/admin/auth/confirm`);

  await page.goto(link.toString());
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin');
  await expect(page.getByRole('banner').getByText('Signed in with magic link')).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/admin?notice=signed-out');

  // The same link again: spent.
  await page.goto(link.toString());
  await expect(page).toHaveURL('/admin?notice=link-expired');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'That sign-in link has expired or was already used',
  );
  expect(await adminCookies(page)).toEqual([]);
});
