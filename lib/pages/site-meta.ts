import type { Metadata } from 'next';

// What every page sends for the tab and for a shared link (design v20 item 3, v21 item 3;
// components.md "Site name, wordmark and page titles"). Pages set their own title; the share title,
// description and type are the site's, so a shared project page previews as the site does.

export const SITE_TITLE = 'Testament · A testament to every test.';

export const SITE_DESCRIPTION =
  'Live results from every CI run of Bobby Helco’s projects, posted automatically: pass rates, ' +
  'test layers, coverage and history. Nothing is entered by hand.';

export const siteMetadata: Metadata = {
  title: 'Testament',
  description: SITE_DESCRIPTION,
  openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, type: 'website' },
  twitter: { title: SITE_TITLE, description: SITE_DESCRIPTION },
};
