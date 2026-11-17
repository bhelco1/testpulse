'use client';

import { ServerError } from '../../../components/ServerError/ServerError';

// A project, run or test page whose data could not be read (design v21 item 1, components.md
// "Server error (page)"), in place of the framework's unstyled page. Next.js serves it with 500 and
// logs the error and its digest on the server; neither is shown. retry re-fetches the segment.
export default function ProjectSegmentError({ retry }: { error: Error; retry: () => void }) {
  return <ServerError onRetry={retry} />;
}
