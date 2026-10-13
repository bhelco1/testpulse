import { randomUUID } from 'node:crypto';

import { expect, type Page, test } from '@playwright/test';

import {
  authAdmin,
  confirmPath,
  forgedSessionCookie,
  signInAsOwner,
  tokenHashFor,
} from './support/admin.ts';
import { expectNoSeriousAxeViolations } from './support/axe.ts';
import { expectHydrated } from './support/open.ts';

// /admin (spec section 15; section 17, Phase 6 criterion 2), design/pages/Admin.dc.html's
// sign-in, signed-in, refused and signed-out views. Sessions are made through the real confirm
// route with tokens issued by the spec's own client (tests/e2e/support/admin.ts), so no mail is
// sent here; the emailed link itself is proven by tests/e2e/admin-mail.spec.ts. Tags route tests
// to projects (playwright.config.ts): @js where scripts run, @no-js where they do not, @visual in
// the four viewport × theme projects inside the Playwright image; untagged tests run in all five.

const NEUTRAL = 'If that address can sign in, a link is on its way. It expires in 1 hour.';
const banner = (page: Page) => page.getByRole('banner');

async function expectSignInForm(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to admin');
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeVisible();
  await expect(banner(page).getByText('Signed in with magic link')).toHaveCount(0);
  await expect(banner(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0);
}

test.describe('admin signed out', () => {
  test(
    'shows the sign-in form, is never indexed, and passes axe',
    { tag: '@js' },
    async ({ page }) => {
      const response = await page.goto('/admin');
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle('Admin · testpulse');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow',
      );
      await expectSignInForm(page);
      await expect(banner(page).getByText('ADMIN', { exact: true })).toBeVisible();
      await expect(banner(page).getByRole('link', { name: 'View public site' })).toHaveAttribute(
        'href',
        '/',
      );
      await expect(page.getByText('Admin has one owner. Nothing here is public.')).toBeVisible();
      await expectNoSeriousAxeViolations(page);
    },
  );

  test(
    'answers another address with the neutral message, and passes axe',
    { tag: '@js' },
    async ({ page }) => {
      await page.goto('/admin');
      await page
        .getByRole('textbox', { name: 'Email' })
        .fill(`someone-${randomUUID()}@example.org`);
      await page.getByRole('button', { name: 'Send sign-in link' }).click();

      const sent = page.getByRole('main').getByRole('status');
      await expect(sent.getByRole('heading', { level: 2 })).toHaveText('Check your email');
      await expect(sent.getByText(NEUTRAL)).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0);
      await expectNoSeriousAxeViolations(page);

      await sent.getByRole('button', { name: 'Use a different address' }).click();
      await expectSignInForm(page);
    },
  );

  test('checks the address in the browser before sending', { tag: '@js' }, async ({ page }) => {
    await page.goto('/admin');
    await expectHydrated(page, 'form[aria-label="Sign in"]');
    const field = page.getByRole('textbox', { name: /^Email/ });
    await field.fill('owner@example');
    await page.getByRole('button', { name: 'Send sign-in link' }).click();

    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Enter an email address, like name@example.com')).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  });

  test('has the server refuse an address that is not one', { tag: '@no-js' }, async ({ page }) => {
    await page.goto('/admin');
    const field = page.getByRole('textbox', { name: /^Email/ });
    await field.fill('owner@example');
    await page.getByRole('button', { name: 'Send sign-in link' }).click();

    await expect(page.getByText('Enter an email address, like name@example.com')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Email/ })).toHaveValue('owner@example');
    await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
  });

  test(
    'says a link that is spent or made up has expired, and passes axe',
    { tag: '@js' },
    async ({ page }) => {
      await page.goto(confirmPath('0'.repeat(56)));

      await expect(page).toHaveURL('/admin?notice=link-expired');
      const notice = page.getByRole('main').getByRole('alert');
      await expect(notice).toContainText('That sign-in link has expired or was already used');
      await expect(notice).toContainText(
        'Each link works once, within 1 hour of being sent. Send a new one below.',
      );
      await expectSignInForm(page);
      await expectNoSeriousAxeViolations(page);
    },
  );

  test('matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
    await page.goto('/admin');
    await expectSignInForm(page);
    await expect(page).toHaveScreenshot('admin-sign-in.png', { fullPage: true });
  });
});

test.describe('admin signed in', () => {
  // This server is given no secret key, so every page is proven to render as anon
  // (playwright.config.ts); admin's sections cannot be read here and show the drawn error state.
  // tests/e2e/admin-sections.spec.ts reads them on a server that holds the key.
  test(
    'shows the owner the admin page with how they signed in, and its error state without the database, and passes axe',
    { tag: '@js' },
    async ({ page }) => {
      await signInAsOwner(page);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin');
      await expect(banner(page).getByRole('button', { name: 'Sign out' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Email' })).toHaveCount(0);
      const error = page.getByRole('main').getByRole('alert');
      await expect(error.getByRole('heading', { level: 2 })).toHaveText('Admin couldn’t load');
      await expect(error).toContainText(
        'The database didn’t answer, so nothing here can be shown or changed right now. Nothing was lost.',
      );
      await expect(error.getByRole('link', { name: 'Try again' })).toHaveAttribute(
        'href',
        '/admin',
      );
      await expect(page.getByRole('heading', { name: 'Open alerts' })).toHaveCount(0);
      await expectNoSeriousAxeViolations(page);
    },
  );

  test(
    'signs out, ending the session, and passes axe',
    { tag: '@js' },
    async ({ page, context }) => {
      await signInAsOwner(page);
      const session = (await context.cookies()).filter(({ name }) =>
        name.startsWith('testpulse_admin_auth'),
      );
      expect(session.length).toBeGreaterThan(0);
      expect(session.every(({ httpOnly, path }) => httpOnly && path === '/admin')).toBe(true);

      await banner(page).getByRole('button', { name: 'Sign out' }).click();

      await expect(page).toHaveURL('/admin?notice=signed-out');
      const notice = page.getByRole('main').getByRole('status');
      await expect(notice).toContainText('You’re signed out');
      await expect(notice).toContainText(
        'Your session on this browser has ended. Send a new link to sign in again.',
      );
      await expectSignInForm(page);
      expect(
        (await context.cookies()).filter(({ name }) => name.startsWith('testpulse_admin_auth')),
      ).toEqual([]);
      await expectNoSeriousAxeViolations(page);

      // The old cookies, put back, no longer open admin: Supabase ended the session.
      await context.addCookies(session);
      await page.goto('/admin');
      await expectSignInForm(page);
      await expect(page.getByRole('main').getByRole('status')).toContainText('You’re signed out');
    },
  );

  test('matches its visual snapshot', { tag: '@visual' }, async ({ page }) => {
    await signInAsOwner(page);
    await expect(page.getByRole('heading', { name: 'Admin couldn’t load' })).toBeVisible();
    await expect(page).toHaveScreenshot('admin-unavailable.png', { fullPage: true });
  });
});

test.describe('admin refuses', () => {
  test(
    'a link for another address: its session is ended and the address named',
    { tag: '@js' },
    async ({ page, context }) => {
      const other = `someone-${randomUUID()}@example.org`;
      const { hash, userId } = await tokenHashFor(other);
      try {
        await page.goto(confirmPath(hash));

        await expect(page).toHaveURL('/admin');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin');
        await expect(page.getByText('Signed in, but not as the owner.')).toBeVisible();
        const card = page.getByRole('main').getByRole('alert');
        await expect(card.getByRole('heading', { level: 2 })).toHaveText(
          'This account can’t open admin',
        );
        await expect(card.locator('code')).toHaveText(other);
        await expect(page.getByRole('textbox')).toHaveCount(0);
        await expect(banner(page).getByText('Signed in with magic link')).toHaveCount(0);
        expect(
          (await context.cookies()).filter(({ name }) => name.startsWith('testpulse_admin_auth')),
        ).toEqual([]);
        await expectNoSeriousAxeViolations(page);

        await card.getByRole('button', { name: 'Sign out' }).click();
        await expect(page).toHaveURL('/admin?notice=signed-out');
        await expectSignInForm(page);
      } finally {
        await authAdmin().auth.admin.deleteUser(userId);
      }
    },
  );

  test('a forged session, showing nothing of admin', async ({ page, context }) => {
    await context.addCookies([forgedSessionCookie()]);
    await page.goto('/admin');

    await expectSignInForm(page);
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  test('no session at all, in every admin address but the form', async ({ page, request }) => {
    await page.goto('/admin');
    await expectSignInForm(page);

    // The confirm route answers a request with no token the same way as a spent one, and sets
    // no session.
    const confirm = await request.get('/admin/auth/confirm', { maxRedirects: 0 });
    expect(confirm.status()).toBe(303);
    expect(confirm.headers()['location']).toBe('/admin?notice=link-expired');
    expect(confirm.headers()['set-cookie'] ?? '').not.toContain('testpulse_admin_auth');
  });
});

// Without scripts every admin view still works: the form posts its server action, the neutral
// message and the notices are rendered by the server, and Sign out is a form of its own.
test('signs in, refuses and signs out without scripts', { tag: '@no-js' }, async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('textbox', { name: 'Email' }).fill(`someone-${randomUUID()}@example.org`);
  await page.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(NEUTRAL);

  await page.goto(confirmPath('0'.repeat(56)));
  await expect(page).toHaveURL('/admin?notice=link-expired');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'That sign-in link has expired or was already used',
  );

  await signInAsOwner(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Admin');
  await banner(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/admin?notice=signed-out');
  await expectSignInForm(page);

  const other = `someone-${randomUUID()}@example.org`;
  const { hash, userId } = await tokenHashFor(other);
  try {
    await page.goto(confirmPath(hash));
    const card = page.getByRole('main').getByRole('alert');
    await expect(card.locator('code')).toHaveText(other);
    await card.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/admin?notice=signed-out');
  } finally {
    await authAdmin().auth.admin.deleteUser(userId);
  }
});
