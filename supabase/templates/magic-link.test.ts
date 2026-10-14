import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// The sign-in email (design/components.md, Admin, "Sign-in", Sign-in email; design v18 item 15),
// Supabase Auth's Magic Link and Confirm signup template. Production's templates are pasted from
// this file by hand (spec section 15), so this holds what it must carry: the link the confirm route
// spends, unchanged, and the drawn wording.

const TEMPLATE = readFileSync('supabase/templates/magic-link.html', 'utf8');
const CONFIRM_URL = '{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email';

/** The words a reader sees, tags dropped and whitespace collapsed, entities as written. */
const words = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(style|title)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('the sign-in email template', () => {
  it('links to the confirm route with the token hash, and to nothing else', () => {
    const hrefs = [...TEMPLATE.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual([CONFIRM_URL]);
    expect(TEMPLATE).not.toMatch(/<(script|img|link|iframe)\b/i);
    expect(TEMPLATE).not.toContain('{{ .ConfirmationURL }}');
  });

  it('says what the design writes, in order, with the link to paste', () => {
    expect(words(TEMPLATE)).toBe(
      [
        'The link works once and expires in 1 hour.',
        'testpulse ADMIN',
        'Sign in to admin',
        'Use this button to sign in to testpulse admin. It works once and expires in 1 hour.',
        'Sign in to admin',
        'If the button doesn’t work, paste this address into your browser:',
        CONFIRM_URL,
        'If you didn’t ask to sign in, ignore this email. Nobody can sign in without the link.',
        'Sent by testpulse because a sign-in link was asked for with this address.',
      ].join(' '),
    );
    expect(TEMPLATE).toMatch(/<title>Sign in to testpulse admin<\/title>/);
  });

  it('hides the preview text, and uses a fixed light palette, never the site’s variables', () => {
    const flat = TEMPLATE.replace(/\s+/g, ' ');
    expect(flat).toMatch(
      /<div style="display: none;[^"]*"> The link works once and expires in 1 hour\. <\/div>/,
    );
    expect(flat).not.toContain('var(--');
    expect(flat).toContain('max-width: 560px;');
    expect(flat).toContain('background: #1c1a17; color: #f6f4f0;');
  });

  it('is both templates local Supabase sends, under the drawn subject', () => {
    const config = readFileSync('supabase/config.toml', 'utf8');
    for (const name of ['magic_link', 'confirmation']) {
      const block = new RegExp(
        `\\[auth\\.email\\.template\\.${name}\\]\\nsubject = "([^"]*)"\\ncontent_path = "([^"]*)"`,
      ).exec(config);
      expect(block?.slice(1), name).toEqual([
        'Sign in to testpulse admin',
        './supabase/templates/magic-link.html',
      ]);
    }
  });
});
