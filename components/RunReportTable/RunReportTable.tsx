import type { TimeLabel } from '../../lib/copy/time';
import { CheckCircleIcon, EmptyIcon, XCircleIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './RunReportTable.module.css';

export interface RunReportRow {
  // "job/module/platform".
  key: string;
  // Empty for a report whose files held no test cases (design v8 item 27).
  status: 'passed' | 'failed' | 'empty';
  // The bar's passed, failed and skipped shares of the report's tests, in percent.
  passedShare: number;
  failedShare: number;
  skippedShare: number;
  // "82 passed", "1 failed · 44 passed · 5 skipped", or "No tests in this report".
  result: string;
  tests: string;
  received: TimeLabel;
  duration: string;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

const HEADERS = ['Status', 'Job / module / platform', 'Results', 'Tests', 'Received', 'Time'];
const ALIGN_RIGHT = new Set(['Tests', 'Received', 'Time']);

// The run page's "Reports in this run" (design/pages/Run Detail.dc.html, the Design System's
// "REPORTS IN THIS RUN"): one row per report. The box scrolls sideways on a narrow screen, as the
// mock's 760 px minimum makes it, so it is a focusable region the keyboard can scroll. There is no
// note above it and no footer (design v8 item 25).
export function RunReportTable({ reports }: { reports: readonly RunReportRow[] }) {
  return (
    <div role="region" aria-label="Reports in this run" tabIndex={0} className={styles.box}>
      {/* Explicit roles: the grid layout would otherwise drop the table semantics in some browsers. */}
      <table role="table" aria-label="Reports in this run" className={styles.table}>
        <thead role="rowgroup" className={styles.group}>
          <tr role="row" className={cx(styles.row, styles.head)}>
            {HEADERS.map((header) => (
              <th
                key={header}
                role="columnheader"
                scope="col"
                className={cx(styles.cell, ALIGN_RIGHT.has(header) && styles.right)}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className={styles.group}>
          {reports.map((report) => (
            <tr
              key={report.key}
              role="row"
              className={cx(styles.row, report.status === 'failed' && styles.failing)}
              data-part="report"
              data-status={report.status ?? undefined}
            >
              <td role="cell" className={styles.cell}>
                <ReportStatus status={report.status} />
              </td>
              <td role="cell" className={cx(styles.cell, styles.key)}>
                {report.key}
              </td>
              <td role="cell" className={cx(styles.cell, styles.results)}>
                {report.status === 'empty' ? (
                  <span className={styles.emptyTrack} data-part="empty-track" aria-hidden="true" />
                ) : (
                  <span className={styles.bar} data-part="bar" aria-hidden="true">
                    <span
                      className={styles.barPass}
                      data-part="bar-pass"
                      style={{ width: `${report.passedShare}%` }}
                    />
                    {/* The red and grey shares keep 4 px when there are any, so one shows. */}
                    <span
                      className={report.failedShare > 0 ? styles.barFail : undefined}
                      data-part="bar-fail"
                      style={{ width: `${report.failedShare}%` }}
                    />
                    <span
                      className={report.skippedShare > 0 ? styles.barSkip : undefined}
                      data-part="bar-skip"
                      style={{ width: `${report.skippedShare}%` }}
                    />
                  </span>
                )}
                <span
                  className={cx(
                    styles.result,
                    report.status === 'failed' && styles.resultFail,
                    report.status === 'empty' && styles.resultEmpty,
                  )}
                  data-part="result"
                >
                  {report.result}
                </span>
              </td>
              <td role="cell" className={cx(styles.cell, styles.tests)}>
                {report.tests}
              </td>
              <td role="cell" className={cx(styles.cell, styles.received)}>
                <RelativeTime when={report.received} />
              </td>
              <td role="cell" className={cx(styles.cell, styles.time)}>
                {report.duration}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const REPORT_STATUS = {
  passed: { Icon: CheckCircleIcon, word: 'Passed', tone: 'pass' },
  failed: { Icon: XCircleIcon, word: 'Failed', tone: 'fail' },
  // The dashed ring, as StatusBadge's Empty.
  empty: { Icon: EmptyIcon, word: 'Empty', tone: 'attn' },
} as const;

function ReportStatus({ status }: { status: RunReportRow['status'] }) {
  const { Icon, word, tone } = REPORT_STATUS[status];
  return (
    <span className={cx(styles.status, styles[tone])} data-status-word>
      <Icon size={14} strokeWidth={2.6} />
      {word}
    </span>
  );
}
