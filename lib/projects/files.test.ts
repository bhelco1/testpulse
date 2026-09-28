import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadProjectFile, loadProjectFiles, projectFilePath } from './files.ts';
import { ProjectFileError } from './schema.ts';

const repoProjectsDir = fileURLToPath(new URL('../../projects', import.meta.url));

describe('projectFilePath', () => {
  it('maps a slug to projects/<slug>.yaml', () => {
    expect(projectFilePath('routeserve')).toBe(join('projects', 'routeserve.yaml'));
    expect(projectFilePath('routeserve', '/somewhere/projects')).toBe(
      '/somewhere/projects/routeserve.yaml',
    );
  });

  it('refuses a slug that could escape the projects directory', () => {
    for (const slug of ['../secrets', 'Upper', 'a b', '']) {
      expect(() => projectFilePath(slug)).toThrow(/slug/);
    }
  });
});

describe('loadProjectFile', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-files-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('parses a real project file', () => {
    const file = loadProjectFile(join(repoProjectsDir, 'routeserve.yaml'));
    expect(file.slug).toBe('routeserve');
  });

  it('rejects a file whose name does not match its slug', () => {
    const path = join(dir, 'renamed.yaml');
    writeFileSync(path, readFileSync(join(repoProjectsDir, 'routeserve.yaml')));

    expect(() => loadProjectFile(path)).toThrow(ProjectFileError);
    expect(() => loadProjectFile(path)).toThrow(/renamed\.yaml.*slug.*routeserve/);
  });

  it('reports a missing file by path instead of a raw ENOENT', () => {
    const path = join(dir, 'missing.yaml');
    expect(() => loadProjectFile(path)).toThrow(ProjectFileError);
    expect(() => loadProjectFile(path)).toThrow(/missing\.yaml.*not found/);
  });
});

describe('loadProjectFiles', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-files-'));
    writeFileSync(
      join(dir, 'zeta.yaml'),
      'slug: zeta\nname: Zeta\ntagline: Last.\ndescription: Z.\nvisibility: public\nlayer_rules:\n  - default: unit\n',
    );
    writeFileSync(
      join(dir, 'alpha.yaml'),
      'slug: alpha\nname: Alpha\ntagline: First.\ndescription: A.\nvisibility: private\nlayer_rules:\n  - default: unit\n',
    );
    writeFileSync(join(dir, 'broken.yaml'), 'slug: broken\nname: Broken\n');
    writeFileSync(join(dir, 'README.md'), 'not a project file');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads every checked-in project file in slug order with no errors', () => {
    const { files, errors } = loadProjectFiles(repoProjectsDir);

    expect(errors).toEqual([]);
    expect(files.map((file) => file.slug)).toEqual(['ostomate2', 'routeserve', 'testpulse']);
  });

  it('collects every invalid file instead of stopping at the first, and ignores non-YAML', () => {
    const { files, errors } = loadProjectFiles(dir);

    expect(files.map((file) => file.slug)).toEqual(['alpha', 'zeta']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ProjectFileError);
    expect(errors[0]?.file).toBe(join(dir, 'broken.yaml'));
  });

  it('fails clearly when the directory does not exist', () => {
    expect(() => loadProjectFiles(join(dir, 'nope'))).toThrow(/nope.*not found/);
  });
});
