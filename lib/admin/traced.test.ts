import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import picomatch from 'picomatch';
import { describe, expect, it } from 'vitest';

import nextConfig, { ADMIN_TRACED_FILES } from '../../next.config.ts';
import { deployedProjectsDir } from './sync.ts';

// The project files reach the deployed /admin function only through output file tracing
// (next.config.ts); tests/e2e/harness/traced.spec.ts reads the built trace itself.

describe('the project files deployed with /admin', () => {
  it('are every projects/*.yaml, traced from the directory the page reads them from', () => {
    expect(nextConfig.outputFileTracingIncludes).toBe(ADMIN_TRACED_FILES);
    const root = process.cwd();
    const dir = relative(root, deployedProjectsDir(root));
    const files = readdirSync(join(root, dir))
      .filter((name) => name.endsWith('.yaml'))
      .map((name) => `./${dir}/${name}`);
    expect(files.length).toBeGreaterThan(0);
    // Next.js globs the patterns from the project's root; compared here without the leading ./.
    const bare = (path: string) => path.replace(/^\.\//, '');
    const match = picomatch(ADMIN_TRACED_FILES['/admin'].map(bare));
    const traced = (path: string) => match(bare(path));
    for (const file of files) expect(traced(file), file).toBe(true);
    expect(traced('./projects/README.md')).toBe(false);
  });
});
