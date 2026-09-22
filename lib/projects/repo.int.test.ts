import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readIntegrationEnv } from '../../tests/int/env.ts';
import { createSecretClient } from '../supabase/server.ts';
import { API_KEY_PREFIX, hashApiKey } from './keys.ts';
import { addProject, rotateProjectKey, syncProjects, toProjectRow } from './repo.ts';
import { type ProjectFile, parseProjectFile } from './schema.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const routeserveYaml = readFileSync(join(repoRoot, 'projects', 'routeserve.yaml'), 'utf8');

const KEY_PATTERN = /tp_[A-Za-z0-9_-]{43}/g;

function unwrap<T>(result: PostgrestSingleResponse<T>, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.code} ${result.error.message}`);
  }
  return result.data;
}

// The repository never selects api_key_hash; the tests read it directly to prove what the
// repository wrote, and only ever compare it, never print it.
async function storedHash(admin: ReturnType<typeof createSecretClient>, slug: string) {
  const row = unwrap(
    await admin.from('projects').select('api_key_hash').eq('slug', slug).single(),
    `read hash for ${slug}`,
  );
  return row.api_key_hash as string;
}

const fileFor = (slug: string, overrides: Partial<ProjectFile> = {}): ProjectFile => ({
  ...parseProjectFile(routeserveYaml, 'projects/routeserve.yaml'),
  slug,
  ...overrides,
});

const runScript = (
  script: string,
  args: readonly string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } => {
  const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', script), ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const findKey = (stdout: string): string => {
  const keys = stdout.match(KEY_PATTERN) ?? [];
  // Asserted on the count alone so a failure message can never carry a key.
  expect(keys.length, 'exactly one key must be printed').toBe(1);
  const [key] = keys;
  if (key === undefined) {
    throw new Error('unreachable');
  }
  return key;
};

describe('project repository (spec section 10)', () => {
  const env = readIntegrationEnv();
  const admin = createSecretClient(process.env);
  const anon = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomUUID().slice(0, 8);
  const slug = `proj-${suffix}`;
  const orphanSlug = `proj-orphan-${suffix}`;
  const unknownSlug = `proj-unknown-${suffix}`;
  let issuedKey: string;

  afterAll(async () => {
    unwrap(await admin.from('projects').delete().like('slug', `proj-%${suffix}`), 'cleanup');
  });

  describe('addProject', () => {
    it('inserts the YAML columns and stores only the hash of the key it returns', async () => {
      issuedKey = await addProject(admin, fileFor(slug));

      expect(issuedKey.startsWith(API_KEY_PREFIX)).toBe(true);

      const expected = toProjectRow(fileFor(slug));
      // Every column but api_key_hash, named so a failure diff can never include the hash.
      const row = unwrap(
        await admin
          .from('projects')
          .select(
            'id, created_at, slug, name, tagline, description, visibility, repo_url, default_branch, dev_stack, test_stack, layer_rules, name_normalization, declared_suites, coverage_floors, expected_cadence_days, sort_order, retention_days',
          )
          .eq('slug', slug)
          .single(),
        'read project',
      );
      const { id, created_at, ...columns } = row;
      expect(typeof id).toBe('string');
      expect(typeof created_at).toBe('string');
      expect(columns).toEqual(expected);
      expect(await storedHash(admin, slug)).toBe(hashApiKey(issuedKey));
    });

    it('refuses a slug that already has a row', async () => {
      await expect(addProject(admin, fileFor(slug))).rejects.toThrow(
        new RegExp(`"${slug}".*already exists`),
      );
    });
  });

  describe('syncProjects', () => {
    it('updates rows from files, leaves the key hash alone, and reports skipped and orphaned slugs', async () => {
      await addProject(admin, fileFor(orphanSlug));
      const before = await storedHash(admin, slug);

      const summary = await syncProjects(admin, [
        fileFor(slug, { name: 'Renamed by sync', sort_order: 42 }),
        fileFor(unknownSlug),
      ]);

      expect(summary.updated).toEqual([slug]);
      expect(summary.skipped).toEqual([unknownSlug]);
      expect(summary.orphaned).toContain(orphanSlug);
      expect(summary.orphaned).not.toContain(slug);

      const row = unwrap(
        await admin.from('projects').select('name, sort_order').eq('slug', slug).single(),
        'read renamed project',
      );
      expect(row).toEqual({ name: 'Renamed by sync', sort_order: 42 });
      expect(await storedHash(admin, slug)).toBe(before);

      const unknown = unwrap(
        await admin.from('projects').select('slug').eq('slug', unknownSlug),
        'read unknown project',
      );
      expect(unknown).toEqual([]);
    });
  });

  describe('rotateProjectKey', () => {
    it('replaces the stored hash so the old key stops matching and the new one matches', async () => {
      const newKey = await rotateProjectKey(admin, slug);

      expect(newKey).not.toBe(issuedKey);
      const after = await storedHash(admin, slug);
      expect(after).toBe(hashApiKey(newKey));
      expect(after).not.toBe(hashApiKey(issuedKey));
      issuedKey = newKey;
    });

    it('fails for a slug with no row', async () => {
      await expect(rotateProjectKey(admin, unknownSlug)).rejects.toThrow(
        new RegExp(`"${unknownSlug}".*not found`),
      );
    });
  });

  describe('as anon (spec section 9)', () => {
    it('reads the project through projects_public without api_key_hash', async () => {
      const rows = unwrap(
        await anon.from('projects_public').select('*').eq('slug', slug),
        'anon select projects_public',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('api_key_hash');
      expect(rows[0]).toMatchObject({ slug, name: 'Renamed by sync' });
    });
  });
});

describe('scripts against the local database (spec section 10)', () => {
  const admin = createSecretClient(process.env);
  const suffix = randomUUID().slice(0, 8);
  const slug = `script-${suffix}`;
  let workDir: string;
  let projectsDir: string;

  const writeProjectFile = (name: string, text: string): void => {
    writeFileSync(join(projectsDir, `${name}.yaml`), text);
  };

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'testpulse-scripts-'));
    projectsDir = join(workDir, 'projects');
    mkdirSync(projectsDir);
    writeProjectFile(slug, routeserveYaml.replace('slug: routeserve', `slug: ${slug}`));
  });

  afterAll(async () => {
    rmSync(workDir, { recursive: true, force: true });
    unwrap(await admin.from('projects').delete().like('slug', `script-%${suffix}`), 'cleanup');
  });

  it('project:add inserts the row and prints a key whose hash is what was stored', async () => {
    const result = runScript('project-add.ts', [slug], workDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/not be shown again/i);
    const key = findKey(result.stdout);
    expect(await storedHash(admin, slug)).toBe(hashApiKey(key));
  });

  it('project:add exits non-zero with one line when the slug already exists', () => {
    const result = runScript('project-add.ts', [slug], workDir);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toContain('already exists');
  });

  it('project:add exits non-zero without a slug argument', () => {
    const result = runScript('project-add.ts', [], workDir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/usage/i);
  });

  it('projects:sync updates known slugs, skips unknown ones, and keeps the key', async () => {
    const before = await storedHash(admin, slug);
    writeProjectFile(
      slug,
      routeserveYaml
        .replace('slug: routeserve', `slug: ${slug}`)
        .replace('name: RouteServe', 'name: Synced by script'),
    );
    const unknown = `script-unknown-${suffix}`;
    writeProjectFile(unknown, routeserveYaml.replace('slug: routeserve', `slug: ${unknown}`));

    const result = runScript('projects-sync.ts', [], workDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`updated: ${slug}`);
    expect(result.stdout).toContain(`skipped: ${unknown}`);
    const row = unwrap(
      await admin.from('projects').select('name').eq('slug', slug).single(),
      'read synced project',
    );
    expect(row).toEqual({ name: 'Synced by script' });
    expect(await storedHash(admin, slug)).toBe(before);
  });

  it('projects:sync exits non-zero and changes nothing when any file is invalid', async () => {
    const before = unwrap(
      await admin.from('projects').select('name').eq('slug', slug).single(),
      'read project',
    );
    writeProjectFile(
      slug,
      routeserveYaml
        .replace('slug: routeserve', `slug: ${slug}`)
        .replace('name: RouteServe', 'name: Must not land'),
    );
    writeProjectFile(`script-bad-${suffix}`, 'slug: not the file name\n');

    const result = runScript('projects-sync.ts', [], workDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`script-bad-${suffix}.yaml`);
    const after = unwrap(
      await admin.from('projects').select('name').eq('slug', slug).single(),
      'read project again',
    );
    expect(after).toEqual(before);
    rmSync(join(projectsDir, `script-bad-${suffix}.yaml`));
  });

  it('project:rotate-key prints a new key whose hash replaces the stored one', async () => {
    const before = await storedHash(admin, slug);

    const result = runScript('project-rotate-key.ts', [slug], workDir);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/not be shown again/i);
    const key = findKey(result.stdout);
    const after = await storedHash(admin, slug);
    expect(after).toBe(hashApiKey(key));
    expect(after).not.toBe(before);
  });

  it('project:rotate-key exits non-zero for an unknown slug', () => {
    const result = runScript('project-rotate-key.ts', [`script-none-${suffix}`], workDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  it.each([
    ['project-add.ts', [slug]],
    ['projects-sync.ts', []],
    ['project-rotate-key.ts', [slug]],
  ])('%s exits non-zero when the database settings are missing', (script, args) => {
    const stripped = { ...process.env };
    delete stripped.SUPABASE_SECRET_KEY;
    const result = spawnSync(process.execPath, [join(repoRoot, 'scripts', script), ...args], {
      cwd: workDir,
      env: stripped,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SUPABASE_SECRET_KEY');
  });
});
