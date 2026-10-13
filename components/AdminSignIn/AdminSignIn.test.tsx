// @vitest-environment jsdom
import { join } from 'node:path';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SignInState } from '../../lib/admin/sign-in';
import { ruleFor } from '../testing/stylesheet';
import { AdminSignIn } from './AdminSignIn';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'AdminSignIn.module.css');
const NEUTRAL = 'If that address can sign in, a link is on its way. It expires in 1 hour.';

type Action = (previous: SignInState, formData: FormData) => Promise<SignInState>;
const signOut = vi.fn(async () => undefined);

function renderForm(requestLink: Action, notice: 'signed-out' | 'link-expired' | null = null) {
  return render(
    <AdminSignIn view={{ kind: 'sign-in', notice }} requestLink={requestLink} signOut={signOut} />,
  );
}

const field = () => screen.getByRole('textbox', { name: /^Email/ });
const submit = () => screen.getByRole('button', { name: /Send sign-in link|Sending…/ });

// design/components.md, Admin, "Sign-in (signed out)", and Admin.dc.html's sign-in views.
describe('AdminSignIn', () => {
  it('asks for an email address, with the drawn heading, lede and footnote', () => {
    renderForm(vi.fn());

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign in to admin');
    expect(
      screen.getByText('Enter your email and a sign-in link will be sent to it.'),
    ).toBeTruthy();
    expect(field().getAttribute('type')).toBe('email');
    expect(field().getAttribute('autocomplete')).toBe('email');
    expect(field().getAttribute('name')).toBe('email');
    expect(field().getAttribute('aria-invalid')).toBe('false');
    expect(submit().textContent).toBe('Send sign-in link');
    expect(screen.getByText('Admin has one owner. Nothing here is public.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('checks the address before sending, and says how to fix it', async () => {
    const requestLink = vi.fn<Action>();
    renderForm(requestLink);

    fireEvent.change(field(), { target: { value: 'owner@example' } });
    await act(async () => fireEvent.click(submit()));

    expect(requestLink).not.toHaveBeenCalled();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    const error = screen.getByText('Enter an email address, like name@example.com');
    expect(field().getAttribute('aria-describedby')).toBe(error.id);

    // Fixing the address clears the error as it is typed, as the drawing does.
    fireEvent.change(field(), { target: { value: 'owner@example.com' } });
    expect(field().getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText('Enter an email address, like name@example.com')).toBeNull();
  });

  it('sends a valid address, shows Sending… while it goes, then the neutral message', async () => {
    let finish: (state: SignInState) => void = () => undefined;
    const requestLink = vi.fn<Action>(
      () => new Promise<SignInState>((resolve) => (finish = resolve)),
    );
    renderForm(requestLink, 'signed-out');

    fireEvent.change(field(), { target: { value: 'owner@example.com' } });
    await act(async () => fireEvent.click(submit()));

    expect(requestLink).toHaveBeenCalledOnce();
    expect(requestLink.mock.calls[0]?.[1].get('email')).toBe('owner@example.com');
    expect(submit().textContent).toBe('Sending…');
    expect(submit().hasAttribute('disabled')).toBe(true);
    expect(field().hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('form', { name: 'Sign in' }).getAttribute('aria-busy')).toBe('true');

    await act(async () => finish({ status: 'sent' }));

    const sent = screen.getByRole('status');
    expect(within(sent).getByRole('heading', { level: 2 }).textContent).toBe('Check your email');
    expect(within(sent).getByText(NEUTRAL)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('You’re signed out')).toBeNull();

    // "Use a different address" is a plain GET of /admin, so it works without scripts too.
    const again = within(sent).getByRole('button', { name: 'Use a different address' });
    const form = again.closest('form');
    expect(form?.getAttribute('action')).toBe('/admin');
    expect(form?.getAttribute('method')).toBe('get');
  });

  it('shows the server’s refusal of an address, keeping what was typed (no scripts)', async () => {
    const requestLink = vi.fn<Action>(async () => ({ status: 'invalid', email: 'owner@example' }));
    renderForm(requestLink);

    // The server's check runs when the browser's could not, as with scripts off.
    fireEvent.change(field(), { target: { value: 'owner@example.com' } });
    await act(async () => fireEvent.click(submit()));

    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect((field() as HTMLInputElement).value).toBe('owner@example');
    expect(screen.getByText('Enter an email address, like name@example.com')).toBeTruthy();
  });

  it('confirms a sign-out above the form', () => {
    renderForm(vi.fn(), 'signed-out');

    const notice = screen.getByRole('status');
    expect(within(notice).getByText('You’re signed out')).toBeTruthy();
    expect(
      within(notice).getByText(
        'Your session on this browser has ended. Send a new link to sign in again.',
      ),
    ).toBeTruthy();
    expect(field()).toBeTruthy();
  });

  it('says an expired or used link has to be sent again, above the form', () => {
    renderForm(vi.fn(), 'link-expired');

    const notice = screen.getByRole('alert');
    expect(
      within(notice).getByText('That sign-in link has expired or was already used'),
    ).toBeTruthy();
    expect(
      within(notice).getByText(
        'Each link works once, within 1 hour of being sent. Send a new one below.',
      ),
    ).toBeTruthy();
    expect(field()).toBeTruthy();
  });

  it('refuses another account by name, offers Sign out, and loads nothing else of admin', () => {
    render(
      <AdminSignIn
        view={{ kind: 'refused', email: 'someone@another-account.example' }}
        requestLink={vi.fn()}
        signOut={signOut}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Admin');
    expect(screen.getByText('Signed in, but not as the owner.')).toBeTruthy();
    const card = screen.getByRole('alert');
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe(
      'This account can’t open admin',
    );
    expect(card.textContent).toBe(
      'This account can’t open admin' +
        'You’re signed in as' +
        'someone@another-account.example' +
        ', which isn’t the owner’s address. Sign out, then sign in with the owner’s address.' +
        'Sign out',
    );
    expect(within(card).getByText('someone@another-account.example').tagName).toBe('CODE');
    const button = within(card).getByRole('button', { name: 'Sign out' });
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.closest('form')).not.toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Admin has one owner. Nothing here is public.')).toBeTruthy();
  });

  it('draws the invalid field and the busy button as the design does', () => {
    expect(ruleFor(CSS, ".input[aria-invalid='true']")).toMatchObject({
      border: '1.5px solid var(--fail)',
    });
    expect(ruleFor(CSS, '.submit:disabled')).toMatchObject({ opacity: '0.7' });
    expect(ruleFor(CSS, '.column')).toMatchObject({ 'max-width': '440px' });
  });
});
