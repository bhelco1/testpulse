'use client';

import { useState, useTransition } from 'react';

import type { RotateKeyResult } from '../../lib/admin/types';
import type { ProjectRowView } from '../../lib/pages/admin';
import { useSessionEnded } from '../AdminMain/AdminMain';
import { LockIcon, XCircleIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './AdminProjects.module.css';

// Admin's Projects (design/components.md, Admin, "Projects table"; Admin.dc.html PROJECTS): each
// project's visibility, last report (attn when stale), YAML sync state compared when the page
// loaded, and Rotate key: confirm, busy, then the new key shown once until "Copied, hide it". The
// key lives only in this component's state; nothing stores it, and leaving the page loses it.

export interface AdminProjectsProps {
  readonly projects: readonly ProjectRowView[];
  readonly rotate: (slug: string) => Promise<RotateKeyResult>;
}

export function AdminProjects({ projects, rotate }: AdminProjectsProps) {
  return (
    <section aria-labelledby="proj-h">
      <div className={styles.head}>
        <h2 id="proj-h" className={styles.h2}>
          Projects
        </h2>
      </div>
      <p className={styles.intro}>
        YAML sync compares each <code className={styles.code}>projects/*.yaml</code> file deployed
        with the site against its database row, when this page loads. API keys are stored only as a
        hash and never shown again after they’re issued.
      </p>
      <div className={styles.card}>
        <div className={styles.scroll}>
          <div className={styles.table}>
            <div className={styles.columns} aria-hidden="true">
              <span>PROJECT</span>
              <span>VISIBILITY</span>
              <span>LAST REPORT</span>
              <span>YAML SYNC</span>
              <span />
            </div>
            <ul className={styles.rows}>
              {projects.map((project) => (
                <ProjectRow key={project.slug} project={project} rotate={rotate} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

type RotateState =
  | { readonly step: 'idle' | 'confirming' | 'failed' }
  | { readonly step: 'revealed'; readonly key: string };

function ProjectRow({
  project,
  rotate,
}: {
  project: ProjectRowView;
  rotate: AdminProjectsProps['rotate'];
}) {
  const [state, setState] = useState<RotateState>({ step: 'idle' });
  const [pending, startTransition] = useTransition();
  const sessionEnded = useSessionEnded();

  const confirm = () => {
    if (project.rotateSlug === null) return;
    const slug = project.rotateSlug;
    startTransition(async () => {
      const result = await rotate(slug);
      if (result.status === 'rotated') setState({ step: 'revealed', key: result.key });
      else if (result.status === 'session-ended') {
        setState({ step: 'idle' });
        sessionEnded('The key wasn’t rotated. Sign in again to finish; nothing was changed.');
      } else setState({ step: 'failed' });
    });
  };

  const report = project.report;
  return (
    <li className={styles.row}>
      <div className={styles.line}>
        <span className={styles.name}>{project.name}</span>
        <span className={styles.visibility}>
          {project.private && <LockIcon size={12} strokeWidth={2.4} />}
          {project.visibility}
        </span>
        <dl className={styles.facts}>
          <dt>Last report</dt>
          <dd
            className={
              report.stale ? styles.stale : report.when === null ? styles.never : styles.report
            }
          >
            {report.when === null ? (
              '—'
            ) : (
              <>
                {report.stale && '◷ '}
                <RelativeTime when={report.when} />
              </>
            )}
          </dd>
          <dt>YAML sync</dt>
          <dd className={styles.sync}>
            <span className={`${styles.syncWord} ${styles[project.sync.tone]}`}>
              {project.sync.word}
            </span>
            {project.sync.detail !== null && (
              <span className={styles.syncDetail}>
                {project.sync.detail}
                {project.sync.command !== null && (
                  <>
                    <code className={styles.command}>{project.sync.command}</code>.
                  </>
                )}
              </span>
            )}
          </dd>
        </dl>
        <span className={styles.action}>
          {project.rotateSlug === null ? (
            <span className={styles.noKey}>No row, no key</span>
          ) : (
            <button
              type="button"
              onClick={() => setState({ step: 'confirming' })}
              className={styles.rotate}
            >
              Rotate key
            </button>
          )}
        </span>
      </div>
      {state.step === 'confirming' && (
        <div
          role="alertdialog"
          aria-label={`Rotate the ${project.name} key`}
          className={`${styles.panel} ${styles.danger}`}
        >
          <div className={styles.panelText}>
            <b className={styles.failInk}>Rotate the {project.name} key?</b>
            <span className={styles.after}>
              The current key stops working immediately. Reports fail with 401 until the project’s
              CI secret is updated. Its build stays green either way.
            </span>
          </div>
          <div className={styles.panelButtons}>
            <button
              type="button"
              onClick={() => setState({ step: 'idle' })}
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
              className={styles.confirm}
            >
              {pending ? 'Rotating…' : 'Rotate key'}
            </button>
          </div>
        </div>
      )}
      {state.step === 'failed' && (
        <div role="alert" className={`${styles.panel} ${styles.danger}`}>
          <XCircleIcon size={18} strokeWidth={2.6} className={styles.failIcon} />
          <div className={styles.panelText}>
            <b className={styles.failInk}>Couldn’t rotate the {project.name} key.</b>
            <span className={styles.after}>The current key still works. Try again.</span>
          </div>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            aria-busy={pending}
            className={styles.retry}
          >
            Try again
          </button>
        </div>
      )}
      {state.step === 'revealed' && (
        <div className={`${styles.panel} ${styles.reveal}`}>
          <div className={styles.revealTitle}>New key. Copy it now; it won’t be shown again.</div>
          <div className={styles.revealLine}>
            <code className={styles.key}>{state.key}</code>
            <button
              type="button"
              onClick={() => setState({ step: 'idle' })}
              className={styles.done}
            >
              Copied, hide it
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
