import { DAILY_JOB_TIME } from '../../lib/jobs/schedule';
import type { DailyJobView, TileTone } from '../../lib/pages/admin';
import { ClockIcon, DashedCircleIcon, XCircleIcon } from '../icons/icons';
import { TimedText } from '../RelativeTime/RelativeTime';
import styles from './AdminDailyJob.module.css';

// Admin's Daily job (design/components.md, Admin, "Daily job tiles"; Admin.dc.html DAILY JOB):
// four tiles from the latest run's summary, with a Notice above them when the job is overdue, has
// never run or failed. The intro says what the job does as built (spec section 12): it opens stale
// alerts and never closes them, and it runs around its hour.

const TILE_CLASS: Record<TileTone, string | undefined> = {
  normal: undefined,
  pass: styles.pass,
  attn: styles.attn,
  fail: styles.fail,
  muted: styles.muted,
};

export function AdminDailyJob({ view }: { view: DailyJobView }) {
  const { notice } = view;
  return (
    <section aria-labelledby="job-h">
      <h2 id="job-h" className={styles.h2}>
        Daily job
      </h2>
      <p className={styles.intro}>
        Runs once a day around {DAILY_JOB_TIME} on Vercel cron. Writes a heartbeat so the free-tier
        database stays awake, opens stale alerts, and prunes: per-test results and failure text
        after 180 days (each project’s 5 most recent runs are kept), visit records and tracked
        sessions after 365 days, and expired rate-limit buckets.
      </p>
      {notice !== null && (
        <div
          role={notice.tone === 'fail' ? 'alert' : 'status'}
          className={`${styles.notice} ${styles[`notice-${notice.tone}`]}`}
        >
          {notice.tone === 'attn' && (
            <ClockIcon size={18} strokeWidth={2.6} className={styles.noticeIcon} />
          )}
          {notice.tone === 'neutral' && (
            <DashedCircleIcon size={18} strokeWidth={2.6} className={styles.noticeIcon} />
          )}
          {notice.tone === 'fail' && (
            <XCircleIcon size={18} strokeWidth={2.6} className={styles.noticeIcon} />
          )}
          <div>
            <div className={styles.noticeTitle}>{notice.title}</div>
            <p className={styles.noticeBody}>{notice.body}</p>
          </div>
        </div>
      )}
      <div className={styles.tiles}>
        {view.tiles.map((tile) => (
          <div key={tile.label} className={`${styles.tile} ${TILE_CLASS[tile.tone] ?? ''}`}>
            <div className={styles.label}>{tile.label}</div>
            <div className={styles.value}>
              <TimedText parts={tile.value} />
            </div>
            <div className={styles.sub}>
              <TimedText parts={tile.sub} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
