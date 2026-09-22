import { execFileSync } from 'node:child_process';

// Node runs this file directly with type stripping, which needs the real extension on imports.
import { findSuspiciousPaths } from '../lib/secrets/tracked-paths.ts';

const trackedPaths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((path) => path !== '');

const suspicious = findSuspiciousPaths(trackedPaths);

if (suspicious.length > 0) {
  for (const { reason, path } of suspicious) {
    console.log(`${reason}: ${path}`);
  }
  process.exit(1);
}

console.log('No tracked files match secret patterns.');
