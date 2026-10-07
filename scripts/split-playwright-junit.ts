import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Node runs this file directly with type stripping, which needs the real extension on imports.
import { isSafeProjectName, splitJunitByProject } from '../lib/ci/playwright-junit.ts';

// Usage: node scripts/split-playwright-junit.ts <playwright-junit.xml> <out-dir>
// Writes <out-dir>/<project>.xml for each Playwright project in the file, for CI to report each
// project as its own platform. This is part of reporting, and reporting never fails the build
// (reporting standard section 7): every problem is a warning and exit 0, and the report steps
// that then find no file warn again.

function skip(message: string): never {
  console.log(`::warning::testpulse: ${message}; nothing split`);
  process.exit(0);
}

const [input, outDir] = process.argv.slice(2);
if (input === undefined || outDir === undefined || process.argv.length > 4) {
  skip('usage: split-playwright-junit.ts <playwright-junit.xml> <out-dir>');
}

let xml: string;
try {
  xml = readFileSync(input, 'utf8');
} catch {
  skip(`no Playwright junit file at ${input}`);
}

let projects: Map<string, string>;
try {
  projects = splitJunitByProject(xml);
} catch (error) {
  skip(`could not split ${input}: ${error instanceof Error ? error.message : String(error)}`);
}

const written: string[] = [];
try {
  mkdirSync(outDir, { recursive: true });
  for (const [project, document] of projects) {
    if (!isSafeProjectName(project)) {
      console.log(`::warning::testpulse: Playwright project ${JSON.stringify(project)} skipped`);
      continue;
    }
    writeFileSync(join(outDir, `${project}.xml`), document);
    written.push(project);
  }
} catch (error) {
  skip(`could not write to ${outDir}: ${error instanceof Error ? error.message : String(error)}`);
}
console.log(`Split ${input} into ${written.length} projects: ${written.join(', ')}`);
