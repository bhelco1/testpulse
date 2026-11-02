// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestedPath } from './RequestedPath';

vi.mock('next/navigation', () => ({ usePathname: () => '/p/nope' }));

afterEach(cleanup);

describe('RequestedPath', () => {
  // Design v21 item 8: it may break after "/" and ".", by soft breaks only, so it copies as asked.
  it('shows the path that was asked for, breaking only after "/" and "."', () => {
    const { container } = render(<RequestedPath />);
    expect(container.innerHTML).toBe('/<wbr>p/<wbr>nope');
    expect(container.textContent).toBe('/p/nope');
  });
});
