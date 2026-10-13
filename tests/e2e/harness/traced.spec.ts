import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { deployedProjectsDir } from '../../../lib/admin/sync.ts';

// Admin reads each projects/*.yaml at runtime (lib/admin/sync.ts), and Vercel deploys a function
// with only the files its build trace lists. This reads the trace of the production build the
// webServer made and finds every project file in the /admin function's, at the path the page reads
// it from (spec section 15, "Admin" as built). next.config.ts's outputFileTracingIncludes puts them
// there; lib/admin/traced.test.ts checks its pattern.

test('the /admin function is deployed with every project file', () => {
  const root = process.cwd();
  const trace = join(root, '.next', 'server', 'app', 'admin', 'page.js.nft.json');
  const { files } = JSON.parse(readFileSync(trace, 'utf8')) as { files: string[] };
  const traced = new Set(files.map((file) => resolve(dirname(trace), file)));

  const dir = deployedProjectsDir(root);
  const projectFiles = readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => join(dir, name));
  expect(projectFiles.length).toBeGreaterThan(0);
  for (const file of projectFiles) expect(traced.has(file), file).toBe(true);
});
