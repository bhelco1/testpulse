// @vitest-environment jsdom
import { join } from 'node:path';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ruleFor } from '../testing/stylesheet';
import { PageFrame } from './PageFrame';

afterEach(cleanup);

const CSS = join(import.meta.dirname, 'PageFrame.module.css');

describe('PageFrame', () => {
  it('holds the page in one centred column', () => {
    const { container } = render(
      <PageFrame>
        <p>content</p>
      </PageFrame>,
    );
    expect(container.firstElementChild?.textContent).toBe('content');
  });

  // design/README.md "Global layout": 1280 of content, gutter clamp(20px, 4vw, 56px) outside it
  // (the design's container is content-box), centred.
  // The footer sits at the bottom of a short page, as NotFound.dc.html draws it.
  it('uses the page width and gutter tokens and fills the viewport', () => {
    expect(ruleFor(CSS, '.frame')).toEqual({
      'max-width': 'var(--page-max)',
      margin: '0px auto',
      padding: '0 var(--page-gutter)',
      display: 'flex',
      'flex-direction': 'column',
      'min-height': '100vh',
    });
    expect(ruleFor(CSS, '.frame > main')).toEqual({ flex: '1 1 0%' });
  });
});
