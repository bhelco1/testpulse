import { useId } from 'react';

import styles from './RunReports.module.css';

export interface RunReportsProps {
  // "job/module/platform" with its test count, already formatted.
  reports: readonly { key: string; total: string }[];
}

// The project page's "Reports per run" card (design/pages/Project Page.dc.html): the latest run's
// reports. The design's per-project note and total row are written for each project and have no
// data behind them, so they are not drawn.
export function RunReports({ reports }: RunReportsProps) {
  const titleId = useId();
  if (reports.length === 0) return null;
  return (
    <div className={styles.card}>
      <h3 id={titleId} className={styles.title}>
        Reports per run
      </h3>
      {/* Explicit roles: the grid layout would otherwise drop the table semantics in some browsers. */}
      <table role="table" className={styles.table} aria-labelledby={titleId}>
        <thead role="rowgroup">
          <tr role="row" className={`${styles.row} ${styles.head}`}>
            <th role="columnheader" scope="col">
              Job / module / platform
            </th>
            <th role="columnheader" scope="col">
              Tests
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {reports.map((report) => (
            <tr key={report.key} role="row" className={`${styles.row} ${styles.body}`}>
              <td role="cell" className={styles.key}>
                {report.key}
              </td>
              <td role="cell">{report.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
