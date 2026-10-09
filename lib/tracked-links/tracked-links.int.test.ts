import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import { readIntegrationEnv } from '../../tests/int/env.ts';
import { addProject } from '../projects/repo.ts';
import { parseProjectFile } from '../projects/schema.ts';
import { createSecretClient } from '../supabase/server.ts';
import { createTrackedLink, TOKEN_ATTEMPTS, TRACKED_LINK_COLUMNS } from './create.ts';
import { TOKEN_PATTERN } from './token.ts';

// Spec sections 5.10 and 14, Phase 6 criterion 3 ("Creating a tracked link yields a unique
// token"), against local Supabase: createTrackedLink writes through the secret client, the
// database's unique constraint is what a collision hits, and anon can neither read nor write
// tracked_links. Every row this file writes carries its suffix and is removed afterwards.

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const NOW = new Date('2026-10-08T15:30:00.000Z');
const PERMISSION_DENIED = '42501';

describe('tracked links (spec section 14)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const company = (name: string) => `${name} int-${suffix}`;
  const privateSlug = `links-private-${suffix}`;

  afterAll(async () => {
    await admin.from('tracked_links').delete().like('company', `% int-${suffix}`);
    await admin.from('projects').delete().eq('slug', privateSlug);
  });

  it('creates a link with a 12-character token and the fields as given', async () => {
    const result = await createTrackedLink(
      admin,
      {
        company: company('Acme Health'),
        role: 'Director of Quality Engineering',
        contact: 'Dana Ruiz',
        sent_on: '2026-09-18',
        notes: 'Met at the meetup.',
      },
      NOW,
    );
    if (!result.ok) throw new Error(`not created: ${result.reason}`);
    expect(result.link.token).toMatch(TOKEN_PATTERN);

    const { data, error } = await admin
      .from('tracked_links')
      .select(TRACKED_LINK_COLUMNS)
      .eq('id', result.link.id)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      token: result.link.token,
      company: company('Acme Health'),
      role: 'Director of Quality Engineering',
      contact: 'Dana Ruiz',
      notes: 'Met at the meetup.',
      lead_project_slug: null,
    });
    expect(new Date(String(data?.sent_at)).toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(new Date(String(data?.created_at)).toISOString()).toBe(NOW.toISOString());
  });

  it('gives two links different tokens', async () => {
    const [first, second] = await Promise.all([
      createTrackedLink(admin, { company: company('First'), role: 'QA Manager' }, NOW),
      createTrackedLink(admin, { company: company('Second'), role: 'QA Manager' }, NOW),
    ]);
    if (!first?.ok || !second?.ok) throw new Error('not created');
    expect(first.link.token).not.toBe(second.link.token);
  });

  it('draws again when the token is taken, and the database refuses a duplicate', async () => {
    const taken = await createTrackedLink(admin, { company: company('Taken'), role: 'R' }, NOW);
    if (!taken.ok) throw new Error('not created');

    const offered: string[] = [];
    const fresh = 'Zz9Yy8Xx7Ww6';
    const retried = await createTrackedLink(
      admin,
      { company: company('Retried'), role: 'R' },
      NOW,
      {
        generateToken: () => {
          const token = offered.length === 0 ? taken.link.token : fresh;
          offered.push(token);
          return token;
        },
      },
    );
    expect(offered).toEqual([taken.link.token, fresh]);
    expect(retried).toMatchObject({ ok: true, link: { token: fresh } });

    // The constraint itself, without the retry.
    const { error } = await admin
      .from('tracked_links')
      .insert({ token: taken.link.token, company: company('Duplicate'), role: 'R' });
    expect(error?.code).toBe('23505');
    expect(error?.message).toContain('tracked_links_token_key');
  });

  it(`gives up after ${String(TOKEN_ATTEMPTS)} taken tokens and writes nothing`, async () => {
    const taken = await createTrackedLink(admin, { company: company('Always'), role: 'R' }, NOW);
    if (!taken.ok) throw new Error('not created');
    await expect(
      createTrackedLink(admin, { company: company('Never'), role: 'R' }, NOW, {
        generateToken: () => taken.link.token,
      }),
    ).rejects.toThrow(`no unused token after ${String(TOKEN_ATTEMPTS)} attempts`);
    const { count } = await admin
      .from('tracked_links')
      .select('id', { count: 'exact', head: true })
      .eq('company', company('Never'));
    expect(count).toBe(0);
  });

  it('accepts a private lead project and refuses one that does not exist', async () => {
    const routeserve = parseProjectFile(
      readFileSync(`${repoRoot}projects/routeserve.yaml`, 'utf8'),
      'projects/routeserve.yaml',
    );
    expect(routeserve.visibility).toBe('private');
    await addProject(admin, { ...routeserve, slug: privateSlug });

    const led = await createTrackedLink(
      admin,
      { company: company('Globex'), role: 'QA Manager', lead_project_slug: privateSlug },
      NOW,
    );
    expect(led).toMatchObject({ ok: true, link: { lead_project_slug: privateSlug } });

    const unknown = await createTrackedLink(
      admin,
      { company: company('Nowhere'), role: 'QA Manager', lead_project_slug: `none-${suffix}` },
      NOW,
    );
    expect(unknown).toEqual({ ok: false, reason: 'unknown_lead_project' });
    const { count } = await admin
      .from('tracked_links')
      .select('id', { count: 'exact', head: true })
      .eq('company', company('Nowhere'));
    expect(count).toBe(0);
  });

  it('refuses anon any read or write of tracked_links', async () => {
    const created = await createTrackedLink(admin, { company: company('Hidden'), role: 'R' }, NOW);
    if (!created.ok) throw new Error('not created');

    const read = await anon.from('tracked_links').select('id, token');
    expect(read.error?.code).toBe(PERMISSION_DENIED);
    expect(read.data).toBeNull();

    const insert = await anon
      .from('tracked_links')
      .insert({ token: 'AnonAnonAnon', company: company('Anon'), role: 'R' });
    expect(insert.error?.code).toBe(PERMISSION_DENIED);

    const update = await anon
      .from('tracked_links')
      .update({ company: 'changed' })
      .eq('id', created.link.id);
    expect(update.error?.code).toBe(PERMISSION_DENIED);

    const remove = await anon.from('tracked_links').delete().eq('id', created.link.id);
    expect(remove.error?.code).toBe(PERMISSION_DENIED);

    // Positive control: the secret client sees the row anon was refused, unchanged.
    const { data } = await admin
      .from('tracked_links')
      .select('company')
      .eq('id', created.link.id)
      .single();
    expect(data?.company).toBe(company('Hidden'));
    const { count } = await admin
      .from('tracked_links')
      .select('id', { count: 'exact', head: true })
      .eq('token', 'AnonAnonAnon');
    expect(count).toBe(0);
  });
});
