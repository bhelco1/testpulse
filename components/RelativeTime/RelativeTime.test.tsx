// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TimeLabel } from '../../lib/copy/time';
import { RelativeTime, TimedText } from './RelativeTime';

afterEach(cleanup);

const TWO_HOURS: TimeLabel = {
  text: '2 h ago',
  datetime: '2026-10-05T09:26:17.000Z',
  title: '5 Oct 2026, 09:26 UTC',
};

// components.md, "Relative time": every "when" carries its full timestamp in <time datetime>
// and title.
describe('RelativeTime', () => {
  it('is a <time> with the ISO instant as datetime and the full date and time as title', () => {
    const { container } = render(<RelativeTime when={TWO_HOURS} />);
    const time = container.querySelector('time');

    expect(time?.textContent).toBe('2 h ago');
    expect(time?.getAttribute('datetime')).toBe('2026-10-05T09:26:17.000Z');
    expect(time?.getAttribute('title')).toBe('5 Oct 2026, 09:26 UTC');
  });
});

describe('TimedText', () => {
  it('renders text as it is and each time as a <time>', () => {
    const sept22: TimeLabel = {
      text: '22 Sep',
      datetime: '2026-09-22T04:37:00.000Z',
      title: '22 Sep 2026, 04:37 UTC',
    };
    const { container } = render(
      <p>
        <TimedText parts={['Last report ', TWO_HOURS, ', first on ', sept22, '.']} />
      </p>,
    );

    expect(container.textContent).toBe('Last report 2 h ago, first on 22 Sep.');
    expect(
      [...container.querySelectorAll('time')].map((time) => time.getAttribute('datetime')),
    ).toEqual(['2026-10-05T09:26:17.000Z', '2026-09-22T04:37:00.000Z']);
  });
});
