import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { splitJunitByProject } from '../lib/ci/playwright-junit';

// The e2e job's "Split Playwright results by project" step. It is part of reporting, so like the
// reporter it exits 0 whatever happens (reporting standard section 7).

const script = fileURLToPath(new URL('./split-playwright-junit.ts', import.meta.url));
const fixture = fileURLToPath(
  new URL('../fixtures/testpulse/junit/playwright-one-failure.xml', import.meta.url),
);

let dir = '';
afterEach(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
  dir = '';
});

const run = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

describe('scripts/split-playwright-junit.ts', () => {
  it('writes one file per project, as splitJunitByProject splits it', () => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-split-'));
    const out = join(dir, 'e2e-junit');

    const result = run(fixture, out);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`Split ${fixture} into 1 projects: chromium\n`);
    expect(readdirSync(out)).toEqual(['chromium.xml']);
    expect(readFileSync(join(out, 'chromium.xml'), 'utf8')).toBe(
      splitJunitByProject(readFileSync(fixture, 'utf8')).get('chromium'),
    );
  });

  it('warns and exits 0 when the junit file is missing, as after a run that never started', () => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-split-'));

    const result = run(join(dir, 'missing.xml'), join(dir, 'out'));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      `::warning::testpulse: no Playwright junit file at ${join(dir, 'missing.xml')}; nothing split\n`,
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it('warns and exits 0 when the file cannot be split', () => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-split-'));
    const broken = join(dir, 'broken.xml');
    writeFileSync(broken, readFileSync(fixture, 'utf8').replace(/ hostname="[^"]*"/, ''));

    const result = run(broken, join(dir, 'out'));

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^::warning::testpulse: could not split .*without a hostname/);
  });

  it('skips a project whose name is not a plain file name', () => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-split-'));
    const odd = join(dir, 'odd.xml');
    writeFileSync(
      odd,
      readFileSync(fixture, 'utf8').replace(/hostname="chromium"/, 'hostname="../up"'),
    );

    const result = run(odd, join(dir, 'out'));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      '::warning::testpulse: Playwright project "../up" skipped\n' +
        `Split ${odd} into 1 projects: chromium\n`,
    );
    expect(readdirSync(join(dir, 'out'))).toEqual(['chromium.xml']);
  });

  it('warns and exits 0 when the output directory cannot be written', () => {
    dir = mkdtempSync(join(tmpdir(), 'testpulse-split-'));
    const blocker = join(dir, 'file');
    writeFileSync(blocker, '');

    const result = run(fixture, join(blocker, 'out'));

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^::warning::testpulse: could not write to .*; nothing split\n$/);
  });

  it('warns and exits 0 with the usage when an argument is missing', () => {
    const result = run(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      '::warning::testpulse: usage: split-playwright-junit.ts <playwright-junit.xml> <out-dir>; ' +
        'nothing split\n',
    );
  });
});
