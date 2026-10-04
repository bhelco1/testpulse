import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PRIVACY, PRIVACY_COPY_SHA256, privacyView } from './privacy.ts';

// /privacy's "today" copy (design/pages/Privacy.dc.html, phase "today"; components.md, Privacy
// page; v9 item 3), with Bobby's edits of 2026-09-30: "If this changes" names anonymous logging
// of every visit as well as tracked links, and the hosting providers' logs "aren’t described
// here". Every claim is checked against the code in docs/spec.md section 13.8.

const copyHash = () =>
  createHash('sha256')
    .update(JSON.stringify({ ...PRIVACY, updated: undefined }))
    .digest('hex');

describe('privacy copy', () => {
  it('leads with "Nothing.", as the today phase does', () => {
    expect(PRIVACY.lede).toBe(
      'Nothing. There are no accounts, no cookies and no analytics, and this site keeps no record of who visits.',
    );
  });

  it('lists what the browser does and what the site does not', () => {
    expect(PRIVACY.browserDoes).toEqual([
      'Loads the pages',
      'Opens one live connection to Supabase Realtime for new results',
      'Saves your theme in localStorage, only if you press the toggle',
    ]);
    expect(PRIVACY.siteDoesNot).toEqual([
      'Set cookies',
      'Log page views or visits',
      'Track links',
      'Load analytics or ad scripts',
    ]);
  });

  it('has the today sections in order, with Bobby’s hosting and "If this changes" wording', () => {
    expect(PRIVACY.sections.map((section) => section.title)).toEqual([
      'Live updates',
      'Your theme choice',
      'Hosting',
      'If this changes',
    ]);
    const text = (title: string) =>
      PRIVACY.sections.find((section) => section.title === title)?.paragraphs.join(' ');
    expect(text('Hosting')).toBe(
      'The site runs on Vercel and its data lives on Supabase. Both keep their own server logs, which aren’t described here; see each provider’s privacy policy.',
    );
    expect(text('If this changes')).toBe(
      'A later version will log every visit anonymously and count visits to links sent with job applications. This page will be rewritten, and its date updated, before that ships.',
    );
    expect(text('Live updates')).toContain('this site sends nothing about you over it.');
    expect(text('Live updates')).toContain('with JavaScript off, none is opened.');
  });

  it('never claims what the Phase 6 copy says', () => {
    const all = JSON.stringify(PRIVACY);
    for (const phrase of ['salted', 'httpOnly', 'session identifier', 'no raw IP']) {
      expect(all).not.toContain(phrase);
    }
  });

  // "Updated {date}" changes whenever the copy does (components.md): changing a word fails here
  // until the recorded fingerprint is updated, beside the date it sits next to.
  it('records the fingerprint of the copy its date belongs to', () => {
    expect(PRIVACY.updated).toBe('2026-10-01');
    expect(copyHash()).toBe(PRIVACY_COPY_SHA256);
  });

  it('dates the copy as a <time> in the one date format', () => {
    expect(privacyView(new Date('2026-10-05T12:00:00.000Z')).updated).toEqual({
      text: '1 Oct',
      datetime: '2026-10-01T00:00:00.000Z',
      title: '1 Oct 2026, 00:00 UTC',
    });
    expect(privacyView(new Date('2027-01-02T00:00:00.000Z')).updated.text).toBe('1 Oct 2026');
  });
});
