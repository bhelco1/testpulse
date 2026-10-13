'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import type { DeleteLinkResult } from '../../lib/admin/types';
import type { LinkDetailView } from '../../lib/pages/admin';
import { AdminMain, useSessionEnded } from '../AdminMain/AdminMain';
import { CopyButton, CopyFallback, LinkAddress, useCopy } from '../CopyLink/CopyLink';
import { DashedCircleIcon, LockIcon, XCircleIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './AdminLinkDetail.module.css';

// One tracked link, /admin/links/{id} (design/components.md, Admin, "Link detail";
// Admin.dc.html LINK DETAIL): its details and address, the visit figures from browser visits
// alone (spec section 14), and Delete, which keeps the visits, unlinked.

export interface AdminLinkDetailProps {
  readonly view: LinkDetailView;
  readonly linkId: string;
  readonly origin: string;
  readonly remove: (linkId: string) => Promise<DeleteLinkResult>;
}

export function AdminLinkDetail(props: AdminLinkDetailProps) {
  const { view } = props;
  return (
    <AdminMain
      variant="detail"
      top={
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <Link href="/admin" className={styles.crumb}>
            Admin
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/admin#tracked-links" className={styles.crumb}>
            Tracked links
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className={styles.current}>
            {view.company}
          </span>
        </nav>
      }
    >
      <Detail {...props} />
    </AdminMain>
  );
}

function Detail({ view, linkId, origin, remove }: AdminLinkDetailProps) {
  const url = `${origin}${view.path}`;
  const { state, copy } = useCopy(url);
  const muted = view.opened ? undefined : styles.mutedValue;
  return (
    <>
      <div className={styles.titles}>
        <h1 className={styles.h1}>{view.company}</h1>
        <span className={styles.role}>{view.role}</span>
      </div>

      <div className={styles.cards}>
        <section aria-label="Link details" className={styles.card}>
          <dl className={styles.details}>
            <dt>Contact</dt>
            <dd className={styles.anywhere}>{view.contact}</dd>
            <dt>Lead project</dt>
            <dd className={styles.lead}>
              <span>{view.lead === null ? 'None, opens the overview' : view.lead.name}</span>
              {view.lead?.private === true && (
                <span className={styles.private}>
                  <LockIcon size={12} strokeWidth={2.4} />
                  Private
                </span>
              )}
            </dd>
            <dt>Sent</dt>
            <dd>{view.sent}</dd>
            <dt>Notes</dt>
            <dd className={view.notes === null ? styles.noNotes : styles.notes}>
              {view.notes ?? 'No notes'}
            </dd>
          </dl>
        </section>
        <section aria-label="Link" className={`${styles.card} ${styles.linkCard}`}>
          <span className={styles.linkLabel}>Link</span>
          <div className={styles.linkLine}>
            <LinkAddress origin={origin} path={view.path} className={styles.address} />
            <CopyButton company={view.company} state={state} copy={copy} className={styles.copy} />
          </div>
          {state === 'refused' && (
            <CopyFallback url={url} company={view.company} layout="stacked" />
          )}
        </section>
      </div>

      <section aria-labelledby="visits-h" className={styles.visits}>
        <h2 id="visits-h" className={styles.h2}>
          Visits
        </h2>
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>First seen</div>
            <div className={`${styles.tileValue} ${muted ?? ''}`}>
              {view.firstSeen === null ? '—' : <RelativeTime when={view.firstSeen} />}
            </div>
            <div className={styles.tileSub}>
              {view.opened ? 'First browser visit' : 'Not yet opened'}
            </div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Last seen</div>
            <div className={`${styles.tileValue} ${muted ?? ''}`}>
              {view.lastSeen === null ? '—' : <RelativeTime when={view.lastSeen} />}
            </div>
            <div className={styles.tileSub}>
              {view.opened ? 'Latest browser visit' : 'Not yet opened'}
            </div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Sessions</div>
            <div className={`${styles.tileValue} ${muted ?? ''}`}>{view.sessions}</div>
            <div className={styles.tileSub}>Distinct session cookies</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Visitors</div>
            <div className={`${styles.tileValue} ${muted ?? ''}`}>{view.visitors}</div>
            <div className={styles.tileSub}>Distinct salted IP hashes</div>
          </div>
        </div>
        {view.opened ? (
          <div className={styles.panels}>
            <div className={styles.pagesCard}>
              <h3 className={styles.h3}>Pages viewed</h3>
              <div className={styles.pageHead} aria-hidden="true">
                <span>PAGE</span>
                <span className={styles.right}>VIEWS</span>
                <span className={styles.right}>TIME</span>
              </div>
              <ul className={styles.pageRows}>
                {view.pages.map((page) => (
                  <li key={page.path} className={styles.pageRow}>
                    <span className={styles.page}>
                      <span className={styles.pageLabel}>{page.label}</span>
                      <code className={styles.pagePath}>{page.path}</code>
                    </span>
                    <span className={styles.right}>
                      <span className={styles.hidden}>Views: </span>
                      {page.views}
                    </span>
                    <span className={`${styles.right} ${styles.time}`}>
                      <span className={styles.hidden}>Time: </span>
                      {page.time}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.pagesFoot}>
                Time on a page is measured until the next page or the tab closes.
              </p>
            </div>
            <div className={styles.projectsCard}>
              <h3 className={`${styles.h3} ${styles.h3Projects}`}>Time per project</h3>
              <ul className={styles.projectRows}>
                {(view.perProject.length === 0
                  ? [{ name: 'None', time: '—', share: '0%' }]
                  : view.perProject
                ).map((project) => (
                  <li key={project.name} className={styles.projectRow}>
                    <span className={styles.projectName}>{project.name}</span>
                    <span className={styles.bar} aria-hidden="true">
                      <span className={styles.fill} style={{ width: project.share }} />
                    </span>
                    <span className={`${styles.right} ${styles.time}`}>{project.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className={styles.unopened}>
            <DashedCircleIcon size={18} strokeWidth={2.4} className={styles.unopenedIcon} />
            <div>
              <div className={styles.unopenedTitle}>Not yet opened</div>
              <p className={styles.unopenedBody}>
                Visits appear here once someone opens the link in a browser. Link previews and bots
                are never counted.
              </p>
            </div>
          </div>
        )}
        <p className={styles.foot}>
          Sessions are distinct session cookies; visitors are distinct salted IP hashes. Bot and
          link-preview visits are never counted.
        </p>
      </section>

      <DeleteLink company={view.company} linkId={linkId} remove={remove} />
    </>
  );
}

function DeleteLink({
  company,
  linkId,
  remove,
}: {
  company: string;
  linkId: string;
  remove: AdminLinkDetailProps['remove'];
}) {
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const sessionEnded = useSessionEnded();

  const confirm = () => {
    setFailed(false);
    startTransition(async () => {
      // On success the action sends the browser back to /admin.
      const result = await remove(linkId);
      setConfirming(false);
      if (result.status === 'session-ended') {
        sessionEnded('Sign in again to finish. Nothing was changed.');
      } else if (result.status === 'error') {
        setFailed(true);
      }
    });
  };

  return (
    <section aria-labelledby="del-h" className={styles.delete}>
      <h2 id="del-h" className={styles.deleteH2}>
        Delete this link
      </h2>
      {!confirming && (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setConfirming(true);
          }}
          className={styles.danger}
        >
          Delete link
        </button>
      )}
      {confirming && (
        <div role="alertdialog" aria-labelledby="del-q" className={styles.confirm}>
          <div className={styles.confirmText}>
            <b id="del-q" className={styles.failInk}>
              Delete the {company} link?
            </b>
            <span className={styles.after}>
              The link stops working. Its visit history is kept, unlinked from this company and
              role.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className={styles.cancel}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            aria-busy={pending}
            className={styles.confirmButton}
          >
            {pending ? 'Deleting…' : 'Delete link'}
          </button>
        </div>
      )}
      {failed && (
        <div role="alert" className={styles.deleteError}>
          <XCircleIcon size={15} strokeWidth={2.6} />
          Couldn’t delete the link. Nothing was removed. Try again.
        </div>
      )}
    </section>
  );
}
