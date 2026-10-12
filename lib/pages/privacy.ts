import { dateLabel, type TimeLabel } from '../copy/time';

// /privacy's copy for the site with visit logging and tracked links (design/pages/Privacy.dc.html,
// phase "after Phase 6"; components.md, Privacy page), shipped with them. Live updates, Your theme
// choice and Hosting stay as they were, Hosting with Bobby's edit of 2026-09-30; "If this changes"
// goes. Each claim is checked against the code (docs/spec.md section 13.8): the beacon records a
// view after load and its time when it ends, with the session, path, agent class and an HMAC of
// the address; the one cookie is httpOnly and holds only a random session identifier; a tracked
// link sets it and redirects to /; visits and tracked sessions are pruned 365 days on.

export interface PrivacySection {
  readonly title: string;
  readonly paragraphs: readonly string[];
  /** A list after the paragraphs, as "If someone sent you a link" ends. */
  readonly list?: readonly string[];
}

export interface PrivacyCard {
  readonly title: string;
  readonly items: readonly string[];
}

export const PRIVACY = {
  /** The day the copy below last changed; "Updated {date}" under the heading. */
  updated: '2026-10-12',
  lede: 'Which pages you view and for how long. There are no accounts and no third-party analytics, and this site stores a hash of your IP address, never the address itself.',
  cards: [
    {
      title: 'Recorded per page view',
      items: [
        'A random session identifier',
        'The page address',
        'Time spent on the page',
        'Browser, bot, or link preview',
        'A salted hash of your IP address',
      ],
    },
    {
      title: 'Never stored by this site',
      items: [
        'Your IP address itself',
        'Your name or email',
        'Device fingerprints',
        'Anything sent to third-party analytics or ad networks',
      ],
    },
  ] satisfies readonly PrivacyCard[],
  /** The sections about visits, in the mock's order before the standing ones. */
  tracking: [
    {
      title: 'How a visit is recorded',
      paragraphs: [
        'After a page finishes loading, a small script on the page sends one record back to this site. Link previews and mail scanners usually fetch a page without running it, so most of them are never counted.',
        'Each record is labelled as a browser, a bot, or a link preview. Known bots and previews are kept under that label and left out of every visit count.',
        'Your IP address is combined with a secret value and hashed before it is stored. The hash can’t be turned back into an address; it is used only to count how many different visitors opened a link.',
        'Visit records are kept for 365 days, then deleted.',
      ],
    },
    {
      title: 'The cookie',
      paragraphs: [
        'One cookie, set by this site only, holding the session identifier. It is marked httpOnly, so scripts on the page can’t read it, and it is never shared with another site.',
      ],
    },
    {
      title: 'If someone sent you a link',
      paragraphs: [
        'Some links to this site, for example ones included in a job application, carry a short code tied to the company and role they were sent to. Opening one sets the cookie and redirects you straight away, so the code doesn’t stay in your address bar.',
        'Page views in that session are then attributed to the company and role, not to a person. If you arrived any other way, your visit is recorded anonymously.',
        'For each of these links, the site owner can see:',
      ],
      list: [
        'when it was first and last opened',
        'how many separate sessions used it',
        'how many different IP hashes opened it, which shows whether it was passed around',
        'which pages were viewed, and time spent on each project',
      ],
    },
  ] satisfies readonly PrivacySection[],
  /** The sections the page has had since it first shipped. */
  standing: [
    {
      title: 'Live updates',
      paragraphs: [
        'Pages that update live open one WebSocket connection from your browser straight to Supabase Realtime, the database service behind this site. It only receives new test results; this site sends nothing about you over it.',
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
  ] satisfies readonly PrivacySection[],
} as const;

/**
 * SHA-256 of the copy above without its date. lib/pages/privacy.test.ts recomputes it, so a change
 * to the words fails until this is updated, next to the date that must change with it.
 */
export const PRIVACY_COPY_SHA256 =
  'e22140b4090b2b9210c415325561a052ff4a5d55d6e5bd0adf30a1bcd6eaba23';

export interface PrivacyView {
  readonly updated: TimeLabel;
}

export const privacyView = (now: Date): PrivacyView => ({
  updated: dateLabel(new Date(`${PRIVACY.updated}T00:00:00.000Z`), now),
});
