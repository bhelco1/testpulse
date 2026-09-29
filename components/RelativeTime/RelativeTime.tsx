import { Fragment } from 'react';

import type { TimedText as TimedTextParts, TimeLabel } from '../../lib/copy/time';

// components.md, "Relative time" (design v7 item 16): a "when" is a <time> carrying its instant
// and its full date and time, so the short words never hide when something happened. The words
// come from lib/copy/time.ts; components do not read the clock. It takes its parent's styles.

export function RelativeTime({ when }: { when: TimeLabel }) {
  return (
    <time dateTime={when.datetime} title={when.title}>
      {when.text}
    </time>
  );
}

export function TimedText({ parts }: { parts: TimedTextParts }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          <Fragment key={index}>{part}</Fragment>
        ) : (
          <RelativeTime key={index} when={part} />
        ),
      )}
    </>
  );
}
