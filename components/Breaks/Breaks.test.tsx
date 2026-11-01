// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Breaks } from './Breaks';

// Design v21 item 8: the soft breaks are <wbr> elements, never zero-width spaces, so copying the
// text or reading it aloud gives it exactly as stored.
describe('Breaks', () => {
  it('puts a <wbr> at each break point and nothing else into the text', () => {
    const { container } = render(<Breaks text="ios/composeApp/ios-sim" rule="key" />);
    expect(container.innerHTML).toBe('ios/<wbr>composeApp/<wbr>ios-sim');
    expect(container.textContent).toBe('ios/composeApp/ios-sim');
    expect(container.textContent).not.toMatch(/​/);
  });

  it('leaves a text with no break point as it is', () => {
    const { container } = render(<Breaks text="jvm" rule="name" />);
    expect(container.innerHTML).toBe('jvm');
  });
});
