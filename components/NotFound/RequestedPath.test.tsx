// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestedPath } from './RequestedPath';

vi.mock('next/navigation', () => ({ usePathname: () => '/p/nope' }));

afterEach(cleanup);

describe('RequestedPath', () => {
  it('shows the path that was asked for, as plain text', () => {
    const { container } = render(<RequestedPath />);
    expect(container.innerHTML).toBe('/p/nope');
  });
});
