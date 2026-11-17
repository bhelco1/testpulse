import { describe, expect, it } from 'vitest';

import { SITE_DESCRIPTION, SITE_TITLE, siteMetadata } from './site-meta';

// Design v21 item 3 (components.md, "Site name, wordmark and page titles", Link preview): every
// page shares under the Landing's title and one description, as a website.
describe('siteMetadata', () => {
  // components.md calls it 150 characters; the drawn words are 154, still inside the 160 that
  // search results show.
  it('describes the site in the drawn words', () => {
    expect(SITE_DESCRIPTION).toBe(
      'Live results from every CI run of Bobby Helco’s projects, posted automatically: pass rates, test layers, coverage and history. Nothing is entered by hand.',
    );
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it('gives every page the description and the Landing’s share title, as a website', () => {
    expect(SITE_TITLE).toBe('Testament · A testament to every test.');
    expect(siteMetadata).toEqual({
      title: 'Testament',
      description: SITE_DESCRIPTION,
      openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, type: 'website' },
      twitter: { title: SITE_TITLE, description: SITE_DESCRIPTION },
    });
  });
});
