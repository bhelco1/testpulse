'use client';

import { useState, useTransition } from 'react';

import type { AcknowledgeResult } from '../../lib/admin/types';
import type { AlertKind } from '../../lib/alerts/schema';
import type { AlertRowView, AlertsView } from '../../lib/pages/admin';
import { useSessionEnded } from '../AdminMain/AdminMain';
import { ClockIcon, EmptyIcon, FloorIcon, TrendDownIcon, XCircleIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './AdminAlerts.module.css';

// Admin's Open alerts (design/components.md, Admin, "Alert row"; Admin.dc.html ALERTS): every open
// alert in the attn tone with its kind's glyph and word, Acknowledge on count_drop alone (spec
// section 12), and the drawn row when none is open.

export interface AdminAlertsProps {
  readonly view: AlertsView;
  readonly acknowledge: (alertId: string) => Promise<AcknowledgeResult>;
}

const GLYPH: Record<AlertKind, (props: { className?: string }) => React.JSX.Element> = {
  stale: ({ className }) => <ClockIcon size={18} strokeWidth={2.6} className={className} />,
  count_drop: ({ className }) => (
    <TrendDownIcon size={18} strokeWidth={2.6} className={className} />
  ),
  empty_run: ({ className }) => <EmptyIcon size={18} strokeWidth={2.6} className={className} />,
  coverage_below_floor: ({ className }) => (
    <FloorIcon size={18} strokeWidth={2.6} className={className} />
  ),
};

export function AdminAlerts({ view, acknowledge }: AdminAlertsProps) {
  return (
    <section aria-labelledby="alerts-h">
      <div className={styles.head}>
        <h2 id="alerts-h" className={styles.h2}>
          Open alerts
        </h2>
        <span className={styles.count}>{view.count}</span>
      </div>
      {view.alerts.length === 0 ? (
        <div className={styles.none}>
          <span className={styles.check} aria-hidden="true">
            ✓
          </span>
          No open alerts. Every project is reporting on schedule and the daily job ran on time.
        </div>
      ) : (
        <div className={styles.list}>
          {view.alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} acknowledge={acknowledge} />
          ))}
        </div>
      )}
    </section>
  );
}

function AlertRow({
  alert,
  acknowledge,
}: {
  alert: AlertRowView;
  acknowledge: AdminAlertsProps['acknowledge'];
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const sessionEnded = useSessionEnded();
  const Glyph = GLYPH[alert.kind];

  const onAcknowledge = () => {
    setFailed(false);
    startTransition(async () => {
      const result = await acknowledge(alert.id);
      if (result.status === 'session-ended') {
        sessionEnded(
          'The alert wasn’t acknowledged. Sign in again to finish; nothing was changed.',
        );
      } else if (result.status === 'error') {
        setFailed(true);
      }
    });
  };

  return (
    <div role="group" aria-label={alert.label} className={styles.row}>
      <Glyph className={styles.glyph} />
      <div className={styles.text}>
        <div className={styles.titleLine}>
          <span className={styles.kind}>{alert.kindWord}</span>
          <span className={styles.title}>{alert.title}</span>
        </div>
        <div className={styles.body}>{alert.body}</div>
        <div className={styles.meta}>
          <span>Opened</span>
          <RelativeTime when={alert.opened} />
          <span aria-hidden="true">·</span>
          <span>{alert.closes}</span>
        </div>
        {failed && (
          <div role="alert" className={styles.error}>
            <XCircleIcon size={15} strokeWidth={2.6} />
            Couldn’t acknowledge. The alert is still open. Try again.
          </div>
        )}
      </div>
      {alert.canAcknowledge && (
        <button
          type="button"
          onClick={onAcknowledge}
          disabled={pending}
          aria-busy={pending}
          className={styles.ack}
        >
          {pending ? 'Acknowledging…' : 'Acknowledge'}
        </button>
      )}
    </div>
  );
}
