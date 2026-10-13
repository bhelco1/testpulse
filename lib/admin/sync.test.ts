import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadProjectFile } from '../projects/files.ts';
import { toProjectRow } from '../projects/repo.ts';
import type { ProjectFile } from '../projects/schema.ts';
import {
  compareProject,
  deployedProjectsDir,
  projectSync,
  readDeployedProjectFiles,
} from './sync.ts';

// Admin's YAML sync column (spec section 15; design/components.md, Admin, "Projects table"; Bobby's
// decision for Phase 6): each projects/*.yaml deployed with the site against its database row,
// compared when the page loads, in the four drawn states.

const routeserve = loadProjectFile(join('projects', 'routeserve.yaml'));
const testpulse = loadProjectFile(join('projects', 'testpulse.yaml'));
const rowOf = (file: ProjectFile) => ({ id: `id-${file.slug}`, ...toProjectRow(file) });

describe('compareProject', () => {
  it('reads a row made from its file as in sync', () => {
    expect(compareProject(routeserve, rowOf(routeserve))).toEqual({ kind: 'in-sync' });
  });

  it('ignores the order Postgres gives jsonb object keys', () => {
    const row = rowOf(routeserve);
    const reordered = {
      ...row,
      coverage_floors: Object.fromEntries(Object.entries(row.coverage_floors).reverse()),
      dev_stack: row.dev_stack.map(({ category, items }) => ({ items, category })),
    };
    expect(compareProject(routeserve, reordered)).toEqual({ kind: 'in-sync' });
  });

  it('lists each field that differs, with both values for short scalars', () => {
    const row = {
      ...rowOf(routeserve),
      expected_cadence_days: 7,
      name: 'Routeserve',
      repo_url: 'https://example.org/routeserve',
    };
    expect(compareProject(routeserve, row)).toEqual({
      kind: 'differs',
      fields: [
        { field: 'name', yaml: '“RouteServe”', database: '“Routeserve”' },
        { field: 'repo_url', yaml: 'null', database: '“https://example.org/routeserve”' },
        { field: 'expected_cadence_days', yaml: '8', database: '7' },
      ],
    });
  });

  it('names a structured or long field without printing it', () => {
    const row = {
      ...rowOf(routeserve),
      layer_rules: [{ default: 'unit' as const }],
      description: `${routeserve.description} More.`,
    };
    expect(compareProject(routeserve, row)).toEqual({
      kind: 'differs',
      fields: [
        { field: 'description', yaml: null, database: null },
        { field: 'layer_rules', yaml: null, database: null },
      ],
    });
  });

  it('reads a file without a row as not registered, and a row without a file as no YAML', () => {
    expect(compareProject(routeserve, undefined)).toEqual({
      kind: 'not-registered',
      file: 'projects/routeserve.yaml',
    });
    expect(compareProject(undefined, rowOf(routeserve))).toEqual({ kind: 'no-yaml' });
  });
});

describe('projectSync', () => {
  it('pairs files and rows by slug, rows first in the order the site sorts them', () => {
    const orphan = { ...rowOf(testpulse), id: 'id-orphan', slug: 'orphan', sort_order: 5 };
    const pairs = projectSync([routeserve, testpulse], [rowOf(testpulse), orphan]);
    expect(pairs.map(({ slug, sync }) => [slug, sync.kind])).toEqual([
      ['orphan', 'no-yaml'],
      ['routeserve', 'not-registered'],
      ['testpulse', 'in-sync'],
    ]);
    expect(pairs.map(({ row, file }) => [row?.id ?? null, file?.slug ?? null])).toEqual([
      ['id-orphan', null],
      [null, 'routeserve'],
      ['id-testpulse', 'testpulse'],
    ]);
  });
});

describe('readDeployedProjectFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-admin-sync-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads projects/ from the working directory, as next start and Vercel run it', () => {
    expect(deployedProjectsDir('/var/task')).toBe('/var/task/projects');
    expect(readDeployedProjectFiles().map(({ slug }) => slug)).toEqual([
      'ostomate2',
      'routeserve',
      'testpulse',
    ]);
  });

  it('refuses to compare against a file that does not validate, naming it', () => {
    expect(() => readDeployedProjectFiles(dir)).toThrow(/projects directory/);
    const projects = join(dir, 'projects');
    mkdirSync(projects);
    writeFileSync(join(projects, 'broken.yaml'), 'slug: broken\n');
    expect(() => readDeployedProjectFiles(dir)).toThrow(/broken\.yaml/);
  });
});
