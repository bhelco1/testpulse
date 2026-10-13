import { describe, expect, it } from 'vitest';

import { siteOrigin } from './origin.ts';

// A tracked link is shown and copied as `<site origin>/v/<token>`, the origin coming from the
// running site, never hard-coded (design/data-map.md, Admin; spec open question 1).

const headers = (entries: Record<string, string>) => new Headers(entries);

describe('siteOrigin', () => {
  it('takes the Origin a server action is posted with, which Next.js has checked', () => {
    expect(siteOrigin(headers({ origin: 'https://testpulse.example', host: 'other' }))).toBe(
      'https://testpulse.example',
    );
  });

  it('builds it from the forwarded host and protocol on a page request', () => {
    expect(
      siteOrigin(
        headers({
          host: 'internal:3000',
          'x-forwarded-host': 'testpulse.example',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://testpulse.example');
    expect(siteOrigin(headers({ host: '127.0.0.1:3105' }))).toBe('http://127.0.0.1:3105');
  });

  it('takes only the first of a list, and refuses what is not an origin', () => {
    expect(siteOrigin(headers({ host: 'a.example', 'x-forwarded-proto': 'https,http' }))).toBe(
      'https://a.example',
    );
    expect(siteOrigin(headers({ origin: 'null', host: 'a.example' }))).toBe('http://a.example');
    expect(siteOrigin(headers({ host: 'a.example/path' }))).toBeNull();
    expect(siteOrigin(headers({}))).toBeNull();
  });
});
