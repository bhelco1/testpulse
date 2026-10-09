import { describe, expect, it } from 'vitest';

import { TRACKED_LINK_LIMITS, TrackedLinkInputSchema, sentAtFromDate } from './schema';

// Spec section 5.10 and the Phase 6 decisions of 2026-10-08: company and role are required,
// contact and notes optional, the sent date is a UTC date stored as timestamptz, and the lead
// project, if any, is a slug (its existence is checked against the database on create).

const valid = { company: 'Acme Health', role: 'Director of Quality Engineering' };

describe('TrackedLinkInputSchema', () => {
  it('accepts company and role alone, the optional fields coming out null', () => {
    expect(TrackedLinkInputSchema.parse(valid)).toEqual({
      ...valid,
      contact: null,
      notes: null,
      sent_on: null,
      lead_project_slug: null,
    });
  });

  it('accepts every field', () => {
    expect(
      TrackedLinkInputSchema.parse({
        ...valid,
        contact: 'Dana Ruiz, dana.ruiz@acme.example',
        notes: 'Met at the QA leaders meetup.\nAsked how flaky tests are handled.',
        sent_on: '2026-09-18',
        lead_project_slug: 'routeserve',
      }),
    ).toEqual({
      ...valid,
      contact: 'Dana Ruiz, dana.ruiz@acme.example',
      notes: 'Met at the QA leaders meetup.\nAsked how flaky tests are handled.',
      sent_on: '2026-09-18',
      lead_project_slug: 'routeserve',
    });
  });

  it('trims every text field, and reads a blank optional field as absent', () => {
    expect(
      TrackedLinkInputSchema.parse({
        company: '  Acme Health ',
        role: '\tQA Manager\n',
        contact: '   ',
        notes: '',
        lead_project_slug: '',
      }),
    ).toMatchObject({
      company: 'Acme Health',
      role: 'QA Manager',
      contact: null,
      notes: null,
      lead_project_slug: null,
    });
  });

  it.each([
    [{ role: 'QA Manager' }, 'company'],
    [{ company: 'Acme' }, 'role'],
    [{ company: '   ', role: 'QA Manager' }, 'company'],
    [{ company: 'Acme', role: '' }, 'role'],
  ])('refuses %j for its %s', (input, field) => {
    const result = TrackedLinkInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(field);
  });

  it.each(['company', 'role', 'contact', 'notes'] as const)(
    'caps %s at its limit, counted after trimming',
    (field) => {
      const limit = TRACKED_LINK_LIMITS[field];
      const at = { ...valid, [field]: ` ${'x'.repeat(limit)} ` };
      const over = { ...valid, [field]: 'x'.repeat(limit + 1) };
      expect(TrackedLinkInputSchema.safeParse(at).success).toBe(true);
      expect(TrackedLinkInputSchema.safeParse(over).success).toBe(false);
    },
  );

  it.each(['2026-02-30', '2026-13-01', '18 Sep 2026', '2026-09-18T00:00:00Z', '2026-9-18'])(
    'refuses the sent date %j',
    (sent_on) => {
      expect(TrackedLinkInputSchema.safeParse({ ...valid, sent_on }).success).toBe(false);
    },
  );

  it('accepts 29 February in a leap year only', () => {
    expect(TrackedLinkInputSchema.safeParse({ ...valid, sent_on: '2028-02-29' }).success).toBe(
      true,
    );
    expect(TrackedLinkInputSchema.safeParse({ ...valid, sent_on: '2026-02-29' }).success).toBe(
      false,
    );
  });

  it.each(['RouteServe', '-routeserve', 'route serve', '../admin'])(
    'refuses the lead project slug %j',
    (lead_project_slug) => {
      expect(TrackedLinkInputSchema.safeParse({ ...valid, lead_project_slug }).success).toBe(false);
    },
  );

  it('refuses fields it does not know, such as a token chosen by the caller', () => {
    expect(TrackedLinkInputSchema.safeParse({ ...valid, token: 'AAAAAAAAAAAA' }).success).toBe(
      false,
    );
  });

  it('gives the same result when its own output is parsed again', () => {
    const once = TrackedLinkInputSchema.parse({ ...valid, contact: ' x ', sent_on: '2026-09-18' });
    expect(TrackedLinkInputSchema.parse(once)).toEqual(once);
  });
});

describe('sentAtFromDate', () => {
  it('stores a sent date as midnight UTC that day', () => {
    expect(sentAtFromDate('2026-09-18')).toBe('2026-09-18T00:00:00.000Z');
  });
});
