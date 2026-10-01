import { dateLabel, type TimeLabel } from '../copy/time';

// /privacy's copy for the site as it is today (design/pages/Privacy.dc.html, phase "today";
// components.md, Privacy page; design v9 item 3), with Bobby's edits of 2026-09-30. Each claim is
// checked against the code (docs/spec.md section 13.8): no page sets a cookie, nothing records a
// visit, the theme is stored only when the toggle is pressed, and the only other origin the
// browser reaches is the Supabase Realtime WebSocket of the live pages. The Phase 6 version ships
// with tracked links, in the same PR.

export interface PrivacySection {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export const PRIVACY = {
  /** The day the copy below last changed; "Updated {date}" under the heading. */
  updated: '2026-10-01',
  lede: 'Nothing. There are no accounts, no cookies and no analytics, and this site keeps no record of who visits.',
  browserDoes: [
    'Loads the pages',
    'Opens one live connection to Supabase Realtime for new results',
    'Saves your theme in localStorage, only if you press the toggle',
  ],
  siteDoesNot: [
    'Set cookies',
    'Log page views or visits',
    'Track links',
    'Load analytics or ad scripts',
  ],
  sections: [
    {
      title: 'Live updates',
      paragraphs: [
        'Pages that update live open one WebSocket connection from your browser straight to Supabase Realtime, the database service behind this site. It only receives new test results; nothing about you is sent over it.',
        'Like any server your browser connects to, Supabase sees your IP address. That is covered by Supabase’s own privacy policy, not by this site. Pages work without the connection: with JavaScript off, none is opened.',
      ],
    },
    {
      title: 'Your theme choice',
      paragraphs: [
        'If you press the theme toggle, your choice (light or dark) is saved in your browser’s localStorage so the next page opens the same way. It never leaves your browser. Until you press the toggle, nothing is saved; clearing this site’s data removes it.',
      ],
    },
    {
      title: 'Hosting',
      paragraphs: [
        'The site runs on Vercel and its data lives on Supabase. Both keep their own server logs, which aren’t described here; see each provider’s privacy policy.',
      ],
    },
    {
      title: 'If this changes',
      paragraphs: [
        'A later version will log every visit anonymously and count visits to links sent with job applications. This page will be rewritten, and its date updated, before that ships.',
      ],
    },
  ] satisfies readonly PrivacySection[],
} as const;

/**
 * SHA-256 of the copy above without its date. lib/pages/privacy.test.ts recomputes it, so a change
 * to the words fails until this is updated, next to the date that must change with it.
 */
export const PRIVACY_COPY_SHA256 =
  'edcb1f09a4e41e971a05ad0dd1e42f6744613f4603546416c87a1ea767603b7a';

export interface PrivacyView {
  readonly updated: TimeLabel;
}

export const privacyView = (now: Date): PrivacyView => ({
  updated: dateLabel(new Date(`${PRIVACY.updated}T00:00:00.000Z`), now),
});
