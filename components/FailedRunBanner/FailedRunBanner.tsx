import type { FailedRunBanner as Banner } from '../../lib/pages/run';
import { Notice } from '../Notice/Notice';
import { ShowFailuresLink } from './ShowFailuresLink';

// The run page's failed-run summary (components.md Notice and Run page; the Design System's
// "FAILED-RUN BANNER"): a fail Notice with the x-circle, its head and sub-line from
// lib/pages/run.ts, and the "Show failure(s)" action.
export function FailedRunBanner({ banner }: { banner: Banner }) {
  return (
    <Notice
      tone="fail"
      icon="x-circle"
      title={banner.title}
      body={banner.body}
      action={<ShowFailuresLink label={banner.action} filter={banner.filter} />}
    />
  );
}
