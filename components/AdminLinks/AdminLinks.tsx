'use client';

import Link from 'next/link';
import { type FormEvent, useId, useState, useTransition } from 'react';

import type { CreateLinkResult } from '../../lib/admin/types';
import type { LeadOption, LinkRowView, LinksView } from '../../lib/pages/admin';
import { TRACKED_LINK_LIMITS } from '../../lib/tracked-links/schema';
import { useSessionEnded } from '../AdminMain/AdminMain';
import { CopyButton, CopyFallback, LinkAddress, useCopy } from '../CopyLink/CopyLink';
import { LockIcon, NoteIcon, XCircleIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './AdminLinks.module.css';

// Admin's Tracked links (design/components.md, Admin, "Tracked links table" and "Create form";
// Admin.dc.html TRACKED LINKS). One list serves both layouts: a table from a content width of
// 760 px, a card per link below it, each row a definition list whose labels the table shows once
// in its head. Company and Role are required and Contact optional, as the schema has them
// (decision row of 2026-10-08, v16).

export interface CreateLinkInput {
  readonly company: string;
  readonly role: string;
  readonly contact: string;
  readonly notes: string;
  readonly sent_on: string;
  readonly lead_project_slug: string;
}

export interface AdminLinksProps {
  readonly view: LinksView;
  readonly leads: readonly LeadOption[];
  /** The site's origin, put in front of each link's path. */
  readonly origin: string;
  /** Today's UTC date, YYYY-MM-DD: the form's default sent date. */
  readonly today: string;
  readonly create: (input: CreateLinkInput) => Promise<CreateLinkResult>;
}

export function AdminLinks({ view, leads, origin, today, create }: AdminLinksProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);

  return (
    <section aria-labelledby="links-h" id="tracked-links">
      <div className={styles.head}>
        <div className={styles.heading}>
          <h2 id="links-h" className={styles.h2}>
            Tracked links
          </h2>
          <span className={styles.count}>{view.count}</span>
        </div>
        <button type="button" onClick={() => setFormOpen(true)} className={styles.primary}>
          New link
        </button>
      </div>
      {formOpen && (
        <LinkForm
          leads={leads}
          today={today}
          create={create}
          onClose={() => setFormOpen(false)}
          onCreated={(id) => {
            setNewId(id);
            setFormOpen(false);
          }}
        />
      )}
      <div className={styles.card}>
        <div className={styles.scroll}>
          <div className={styles.table}>
            <div className={styles.columns} aria-hidden="true">
              <span>COMPANY / ROLE</span>
              <span>SENT</span>
              <span>OPENED</span>
              <span>LAST SEEN</span>
              <span>PAGES VIEWED</span>
              <span>LINK</span>
            </div>
            <ul className={styles.rows}>
              {view.links.map((link) => (
                <LinkRow key={link.id} link={link} origin={origin} isNew={link.id === newId} />
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className={styles.foot}>
        Sessions are distinct session cookies; visitors are distinct salted IP hashes. Bot and
        link-preview visits are never counted. Visitors can read what’s recorded on the privacy
        page.
      </p>
    </section>
  );
}

function LinkRow({ link, origin, isNew }: { link: LinkRowView; origin: string; isNew: boolean }) {
  const url = `${origin}${link.path}`;
  const { state, copy } = useCopy(url);
  return (
    <li className={`${styles.row} ${isNew ? styles.isNew : ''}`}>
      <div className={styles.line}>
        <div className={styles.who}>
          <div className={styles.company}>
            <Link href={link.href} className={styles.open}>
              {link.company}
            </Link>
            {isNew && <span className={styles.newTag}>NEW</span>}
          </div>
          <div className={styles.role}>{link.role}</div>
          {link.notes !== null && (
            <div title={link.notes} className={styles.note}>
              <NoteIcon size={12} strokeWidth={2.4} className={styles.noteIcon} />
              <span className={styles.hidden}>Note:</span>
              <span className={styles.noteText}>{link.notes}</span>
            </div>
          )}
        </div>
        <dl className={styles.facts}>
          <dt>Sent</dt>
          <dd className={styles.muted}>{link.sent}</dd>
          <dt>Opened</dt>
          <dd className={link.opened.counted ? styles.opened : styles.unopened}>
            {link.opened.text}
          </dd>
          <dt>Last seen</dt>
          <dd className={styles.muted}>
            {link.lastSeen === null ? '—' : <RelativeTime when={link.lastSeen} />}
          </dd>
          <dt>Pages</dt>
          <dd className={styles.chips}>
            {link.pages.length === 0 ? (
              <span className={styles.none}>—</span>
            ) : (
              link.pages.map((page) => (
                <span key={page} className={styles.chip}>
                  {page}
                </span>
              ))
            )}
          </dd>
        </dl>
        <div className={styles.link}>
          <LinkAddress origin={origin} path={link.path} className={styles.address} truncate />
          <CopyButton company={link.company} state={state} copy={copy} className={styles.copy} />
        </div>
      </div>
      {state === 'refused' && (
        <div className={styles.refused}>
          <CopyFallback url={url} company={link.company} layout="row" />
        </div>
      )}
    </li>
  );
}

interface Fields {
  company: string;
  role: string;
  contact: string;
  lead: string;
  sent: string;
  notes: string;
}

const SESSION_ENDED =
  'The link wasn’t created. Sign in again to finish; nothing was changed, and the form keeps ' +
  'what you typed until you leave this page.';

function LinkForm({
  leads,
  today,
  create,
  onClose,
  onCreated,
}: {
  leads: AdminLinksProps['leads'];
  today: string;
  create: AdminLinksProps['create'];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [fields, setFields] = useState<Fields>({
    company: '',
    role: '',
    contact: '',
    lead: '',
    sent: today,
    notes: '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [pending, startTransition] = useTransition();
  const sessionEnded = useSessionEnded();
  const companyError = useId();
  const roleError = useId();

  const companyInvalid = touched && fields.company.trim() === '';
  const roleInvalid = touched && fields.role.trim() === '';
  const leadPrivate = leads.some((lead) => lead.slug === fields.lead && lead.private);
  const set = (key: keyof Fields) => (event: { target: { value: string } }) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(false);
    if (fields.company.trim() === '' || fields.role.trim() === '') {
      setTouched(true);
      return;
    }
    startTransition(async () => {
      const result = await create({
        company: fields.company,
        role: fields.role,
        contact: fields.contact,
        notes: fields.notes,
        sent_on: fields.sent,
        lead_project_slug: fields.lead,
      });
      if (result.status === 'created') onCreated(result.id);
      else if (result.status === 'invalid') setTouched(true);
      else if (result.status === 'session-ended') sessionEnded(SESSION_ENDED);
      else setServerError(true);
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-busy={pending} className={styles.form}>
      <fieldset disabled={pending} className={styles.fieldset}>
        <legend className={styles.legend}>New tracked link</legend>
        {serverError && (
          <div role="alert" className={styles.serverError}>
            <XCircleIcon size={18} strokeWidth={2.6} className={styles.serverIcon} />
            <div>
              <div className={styles.serverTitle}>Couldn’t create the link</div>
              <p className={styles.serverBody}>
                Nothing was saved; your entries are still here. Try again.
              </p>
            </div>
          </div>
        )}
        <label className={styles.label}>
          <span className={styles.labelLine}>
            <span>Company</span>
            <span className={styles.tag}>required</span>
          </span>
          <input
            value={fields.company}
            onChange={set('company')}
            maxLength={TRACKED_LINK_LIMITS.company}
            aria-invalid={companyInvalid}
            aria-describedby={companyInvalid ? companyError : undefined}
            className={styles.input}
          />
          {companyInvalid && (
            <span id={companyError} className={styles.fieldError}>
              Company is required
            </span>
          )}
        </label>
        <label className={styles.label}>
          <span className={styles.labelLine}>
            <span>Role</span>
            <span className={styles.tag}>required</span>
          </span>
          <input
            value={fields.role}
            onChange={set('role')}
            maxLength={TRACKED_LINK_LIMITS.role}
            aria-invalid={roleInvalid}
            aria-describedby={roleInvalid ? roleError : undefined}
            className={styles.input}
          />
          {roleInvalid && (
            <span id={roleError} className={styles.fieldError}>
              Role is required
            </span>
          )}
        </label>
        <label className={styles.label}>
          Contact
          <input
            value={fields.contact}
            onChange={set('contact')}
            maxLength={TRACKED_LINK_LIMITS.contact}
            placeholder="Name or email"
            className={styles.input}
          />
        </label>
        <label className={styles.label}>
          Lead project
          <select value={fields.lead} onChange={set('lead')} className={styles.input}>
            <option value="">None, open the overview</option>
            {leads.map((lead) => (
              <option key={lead.slug} value={lead.slug}>
                {lead.label}
              </option>
            ))}
          </select>
          {leadPrivate && (
            <span className={styles.private}>
              <LockIcon size={12} strokeWidth={2.4} />
              Private: the visitor sees counts and trends, never failure text.
            </span>
          )}
        </label>
        <label className={styles.label}>
          Sent
          <input
            type="date"
            value={fields.sent}
            onChange={set('sent')}
            className={`${styles.input} ${styles.date}`}
          />
        </label>
        <label className={`${styles.label} ${styles.wide}`}>
          <span className={styles.labelLine}>
            <span>Notes</span>
            <span className={styles.tag}>optional, only you see them</span>
          </span>
          <textarea
            rows={2}
            value={fields.notes}
            onChange={set('notes')}
            maxLength={TRACKED_LINK_LIMITS.notes}
            className={styles.textarea}
          />
        </label>
        <div className={styles.buttons}>
          <button type="button" onClick={onClose} className={styles.cancel}>
            Cancel
          </button>
          <button type="submit" aria-busy={pending} className={styles.primary}>
            {pending ? 'Creating…' : 'Create link'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
