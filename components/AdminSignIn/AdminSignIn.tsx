'use client';

import { type FormEvent, useActionState, useId, useState } from 'react';

import { isEmailAddress } from '../../lib/admin/email';
import type { SignInState } from '../../lib/admin/sign-in';
import { CheckIcon, ClockIcon, MailIcon, XCircleIcon } from '../icons/icons';
import styles from './AdminSignIn.module.css';

export type AdminSignInView =
  | { readonly kind: 'sign-in'; readonly notice: 'signed-out' | 'link-expired' | null }
  | { readonly kind: 'refused'; readonly email: string };

export interface AdminSignInProps {
  view: AdminSignInView;
  // Server actions (app/admin/actions.ts).
  requestLink: (previous: SignInState, formData: FormData) => Promise<SignInState>;
  signOut: () => Promise<void>;
}

const IDLE: SignInState = { status: 'idle' };

// Admin signed out, and signed in with an address that is not the owner's (design/components.md,
// Admin, "Sign-in (signed out)"; Admin.dc.html's sign-in views). Everything works without scripts:
// the form posts its server action, and "Use a different address" is a plain GET of /admin.
export function AdminSignIn({ view, requestLink, signOut }: AdminSignInProps) {
  const refused = view.kind === 'refused';
  return (
    <main id="main" className={styles.main}>
      <div className={styles.column}>
        <div className={styles.intro}>
          <h1 className={styles.h1}>{refused ? 'Admin' : 'Sign in to admin'}</h1>
          <p className={styles.lede}>
            {refused
              ? 'Signed in, but not as the owner.'
              : 'Enter your email and a sign-in link will be sent to it.'}
          </p>
        </div>
        {view.kind === 'refused' ? (
          <Refused email={view.email} signOut={signOut} />
        ) : (
          <SignInForm notice={view.notice} requestLink={requestLink} />
        )}
        <p className={styles.footnote}>Admin has one owner. Nothing here is public.</p>
      </div>
    </main>
  );
}

function SignInForm({
  notice,
  requestLink,
}: {
  notice: 'signed-out' | 'link-expired' | null;
  requestLink: AdminSignInProps['requestLink'];
}) {
  const [state, formAction, pending] = useActionState(requestLink, IDLE);
  // What was typed since the server last answered; a new answer shows what the server kept.
  const [edit, setEdit] = useState<{ after: SignInState; value: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const errorId = useId();

  if (state.status === 'sent') return <Sent />;

  const value =
    edit !== null && edit.after === state
      ? edit.value
      : state.status === 'invalid'
        ? state.email
        : '';
  const invalid = (checked || state.status === 'invalid') && !isEmailAddress(value.trim());

  // The design's check runs before sending; the server repeats it for a browser without scripts.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!isEmailAddress(value.trim())) {
      event.preventDefault();
      setChecked(true);
    }
  };

  return (
    <>
      {notice === 'signed-out' && (
        <div role="status" className={`${styles.notice} ${styles.pass}`}>
          <CheckIcon size={18} strokeWidth={3} className={styles.noticeIcon} />
          <div>
            <div className={styles.noticeTitle}>You’re signed out</div>
            <p className={styles.noticeBody}>
              Your session on this browser has ended. Send a new link to sign in again.
            </p>
          </div>
        </div>
      )}
      {notice === 'link-expired' && (
        <div role="alert" className={`${styles.notice} ${styles.attn}`}>
          <ClockIcon size={18} strokeWidth={2.6} className={styles.noticeIcon} />
          <div>
            <div className={styles.noticeTitle}>
              That sign-in link has expired or was already used
            </div>
            <p className={styles.noticeBody}>
              Each link works once, within 1 hour of being sent. Send a new one below.
            </p>
          </div>
        </div>
      )}
      <form
        action={formAction}
        onSubmit={onSubmit}
        noValidate
        aria-label="Sign in"
        aria-busy={pending}
        className={styles.card}
      >
        <label className={styles.label}>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={value}
            onChange={(event) => setEdit({ after: state, value: event.target.value })}
            disabled={pending}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={styles.input}
          />
          {invalid && (
            <span id={errorId} className={styles.error}>
              Enter an email address, like name@example.com
            </span>
          )}
        </label>
        <button type="submit" disabled={pending} aria-busy={pending} className={styles.submit}>
          {pending ? 'Sending…' : 'Send sign-in link'}
        </button>
      </form>
    </>
  );
}

// The same words for every address (spec section 15): whether it may sign in is never shown.
function Sent() {
  return (
    <div role="status" className={styles.card}>
      <div className={styles.row}>
        <MailIcon size={18} strokeWidth={2.2} className={styles.mailIcon} />
        <div>
          <h2 className={styles.h2}>Check your email</h2>
          <p className={styles.cardText}>
            If that address can sign in, a link is on its way. It expires in 1 hour.
          </p>
        </div>
      </div>
      <form action="/admin" method="get" className={styles.again}>
        <button type="submit" className={styles.linkButton}>
          Use a different address
        </button>
      </form>
    </div>
  );
}

function Refused({ email, signOut }: { email: string; signOut: () => Promise<void> }) {
  return (
    <div role="alert" className={`${styles.card} ${styles.refused}`}>
      <div className={styles.row}>
        <XCircleIcon size={18} strokeWidth={2.6} className={styles.refusedIcon} />
        <div>
          <h2 className={styles.h2}>This account can’t open admin</h2>
          <p className={`${styles.cardText} ${styles.refusedText}`}>
            <span>You’re signed in as</span>
            <code className={styles.address}>{email}</code>
            <span>
              , which isn’t the owner’s address. Sign out, then sign in with the owner’s address.
            </span>
          </p>
        </div>
      </div>
      <form action={signOut} className={styles.again}>
        <button type="submit" className={styles.submit}>
          Sign out
        </button>
      </form>
    </div>
  );
}
