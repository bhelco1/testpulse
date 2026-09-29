import type { TimeLabel } from '../../lib/copy/time';

// A "when" for component tests, which take the words as given: lib/copy/time.ts computes them,
// and its own tests pin the instant and title that go with them.
export const timeLabel = (text: string): TimeLabel => ({
  text,
  datetime: '2026-10-05T11:56:00.000Z',
  title: '5 Oct 2026, 11:56 UTC',
});
