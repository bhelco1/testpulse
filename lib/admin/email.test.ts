import { describe, expect, it } from 'vitest';

import { EMAIL_MAX_LENGTH, isEmailAddress } from './email.ts';

// design/components.md, Admin, "Sign-in": the form checks the address before sending, with the
// rule Admin.dc.html draws, and the server repeats the same check.
describe('isEmailAddress', () => {
  it.each(['owner@example.com', 'first.last+admin@mail.example.co.uk', 'a@b.c'])(
    'accepts %s',
    (value) => {
      expect(isEmailAddress(value)).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['no domain dot', 'owner@example'],
    ['no at sign', 'owner.example.com'],
    ['two at signs', 'owner@@example.com'],
    ['inner space', 'own er@example.com'],
    ['surrounding space', ' owner@example.com '],
    ['a newline', 'owner@example.com\nbcc@example.com'],
  ])('refuses %s', (_label, value) => {
    expect(isEmailAddress(value)).toBe(false);
  });

  it('refuses an address longer than an address can be', () => {
    const at = `@${'d'.repeat(10)}.com`;
    const longest = `${'a'.repeat(EMAIL_MAX_LENGTH - at.length)}${at}`;
    expect(longest).toHaveLength(254);
    expect(isEmailAddress(longest)).toBe(true);
    expect(isEmailAddress(`a${longest}`)).toBe(false);
  });
});
