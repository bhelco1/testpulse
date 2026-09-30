import type { TimeLabel } from '../../lib/copy/time';
import { CheckCircleIcon, XCircleIcon } from '../icons/icons';
import { RelativeTime } from '../RelativeTime/RelativeTime';
import styles from './RunReportTable.module.css';

export interface RunReportRow {
  // "job/module/platform".
  key: string;
  // Null for a report with no tests, which the design does not draw.
  status: 'passed' | 'failed' | null;
  // The bar's green and red shares of the report's tests, in percent.
  passedShare: number;
  failedShare: number;
  // "82 passed" or "1 failed · 49 passed"; null for a report with no tests.
  result: string | null;
  tests: string;
  received: TimeLabel;
  duration: string;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

const HEADERS = ['Status', 'Job / module / platform', 'Results', 'Tests', 'Received', 'Time'];
const ALIGN_RIGHT = new Set(['Tests', 'Received', 'Time']);

// The run page's "Reports in this run" (design/pages/Run Detail.dc.html): one row per report.
// The box scrolls sideways on a narrow screen, as the mock's 760 px minimum makes it, so it is a
// focusable region the keyboard can scroll. The per-project note above it and the footer below
// are written for each project and have no data behind them, so they are not drawn.
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
                {report.status !== null && <ReportStatus status={report.status} />}
              </td>
              <td role="cell" className={cx(styles.cell, styles.key)}>
                {report.key}
              </td>
              <td role="cell" className={cx(styles.cell, styles.results)}>
                <span className={styles.bar} data-part="bar" aria-hidden="true">
                  <span
                    className={styles.barPass}
                    data-part="bar-pass"
                    style={{ width: `${report.passedShare}%` }}
                  />
                  {/* The red share keeps 4 px when there is any, so one failure shows. */}
                  <span
                    className={report.failedShare > 0 ? styles.barFail : undefined}
                    data-part="bar-fail"
                    style={{ width: `${report.failedShare}%` }}
                  />
                </span>
                {report.result !== null && (
                  <span
                    className={cx(styles.result, report.status === 'failed' && styles.resultFail)}
                    data-part="result"
                  >
                    {report.result}
                  </span>
                )}
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

function ReportStatus({ status }: { status: 'passed' | 'failed' }) {
  const Icon = status === 'passed' ? CheckCircleIcon : XCircleIcon;
  return (
    <span
      className={cx(styles.status, status === 'passed' ? styles.pass : styles.fail)}
      data-status-word
    >
      <Icon size={14} strokeWidth={2.6} />
      {status === 'passed' ? 'Passed' : 'Failed'}
    </span>
  );
}
