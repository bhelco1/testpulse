import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { PRIVACY, PRIVACY_COPY_SHA256, privacyView, type PrivacySection } from './privacy.ts';

// /privacy's "after Phase 6" copy (design/pages/Privacy.dc.html, phase "after Phase 6";
// components.md, Privacy page), shipped with visit logging and tracked links. Live updates, Your
// theme choice and Hosting stay as they were, Hosting with Bobby's edit of 2026-09-30 (the
// providers' logs "aren’t described here"); "If this changes" goes. Every claim is checked
// against the code in docs/spec.md section 13.8.

const copyHash = () =>
  createHash('sha256')
    .update(JSON.stringify({ ...PRIVACY, updated: undefined }))
    .digest('hex');

const allSections = (): readonly PrivacySection[] => [...PRIVACY.tracking, ...PRIVACY.standing];
const text = (title: string) => {
  const section = allSections().find((candidate) => candidate.title === title);
  return section === undefined
    ? undefined
    : [...section.paragraphs, ...(section.list ?? [])].join(' ');
};

describe('privacy copy', () => {
  it('leads with what is recorded, as the after-Phase-6 phase does', () => {
    expect(PRIVACY.lede).toBe(
      'Which pages you view and for how long. There are no accounts and no third-party analytics, and this site stores a hash of your IP address, never the address itself.',
    );
  });

  it('lists what is recorded per page view and what is never stored', () => {
    expect(PRIVACY.cards).toEqual([
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
    ]);
  });

  it('has the tracking sections, then the standing ones, in the design’s order', () => {
    expect(PRIVACY.tracking.map((section) => section.title)).toEqual([
      'How a visit is recorded',
      'The cookie',
      'If someone sent you a link',
    ]);
    expect(PRIVACY.standing.map((section) => section.title)).toEqual([
      'Live updates',
      'Your theme choice',
      'Hosting',
    ]);
  });

  it('says how a visit is recorded, and that records go after 365 days', () => {
    expect(PRIVACY.tracking[0]?.paragraphs).toEqual([
      'After a page finishes loading, a small script on the page sends one record back to this site. Link previews and mail scanners usually fetch a page without running it, so most of them are never counted.',
      'Each record is labelled as a browser, a bot, or a link preview. Known bots and previews are kept under that label and left out of every visit count.',
      'Your IP address is combined with a secret value and hashed before it is stored. The hash can’t be turned back into an address; it is used only to count how many different visitors opened a link.',
      'Visit records are kept for 365 days, then deleted.',
    ]);
  });

  it('describes the one cookie', () => {
    expect(text('The cookie')).toBe(
      'One cookie, set by this site only, holding the session identifier. It is marked httpOnly, so scripts on the page can’t read it, and it is never shared with another site.',
    );
  });

  it('says what a tracked link does and what the owner sees of it', () => {
    const section: PrivacySection | undefined = PRIVACY.tracking[2];
    expect(section?.paragraphs).toEqual([
      'Some links to this site, for example ones included in a job application, carry a short code tied to the company and role they were sent to. Opening one sets the cookie and redirects you straight away, so the code doesn’t stay in your address bar.',
      'Page views in that session are then attributed to the company and role, not to a person. If you arrived any other way, your visit is recorded anonymously.',
      'For each of these links, the site owner can see:',
    ]);
    expect(section?.list).toEqual([
      'when it was first and last opened',
      'how many separate sessions used it',
      'how many different IP hashes opened it, which shows whether it was passed around',
      'which pages were viewed, and time spent on each project',
    ]);
  });

  it('keeps Live updates, Your theme choice and Hosting, with Bobby’s hosting wording', () => {
    expect(text('Hosting')).toBe(
      'The site runs on Vercel and its data lives on Supabase. Both keep their own server logs, which aren’t described here; see each provider’s privacy policy.',
    );
    expect(text('Live updates')).toContain('this site sends nothing about you over it.');
    expect(text('Live updates')).toContain('with JavaScript off, none is opened.');
    expect(text('Your theme choice')).toContain('It never leaves your browser.');
  });

  it('no longer says what the today copy said', () => {
    const all = JSON.stringify(PRIVACY);
    for (const phrase of [
      'Nothing.',
      'no cookies',
      'keeps no record of who visits',
      'What your browser does here',
      'What this site doesn’t do',
      'Set cookies',
      'Log page views or visits',
      'Track links',
      'If this changes',
      'A later version will',
    ]) {
      expect(all).not.toContain(phrase);
    }
  });

  // "Updated {date}" changes whenever the copy does (components.md): changing a word fails here
  // until the recorded fingerprint is updated, beside the date it sits next to.
  it('records the fingerprint of the copy its date belongs to', () => {
    expect(PRIVACY.updated).toBe('2026-10-12');
    expect(copyHash()).toBe(PRIVACY_COPY_SHA256);
  });

  it('dates the copy as a <time> in the one date format', () => {
    expect(privacyView(new Date('2026-10-12T12:00:00.000Z')).updated).toEqual({
      text: '12 Oct',
      datetime: '2026-10-12T00:00:00.000Z',
      title: '12 Oct 2026, 00:00 UTC',
    });
    expect(privacyView(new Date('2027-01-02T00:00:00.000Z')).updated.text).toBe('12 Oct 2026');
  });
});
