// Node runs this file directly with type stripping, which needs the real extension on imports.
import { loadProjectFiles, PROJECTS_DIR } from '../lib/projects/files.ts';
import { syncProjects } from '../lib/projects/repo.ts';
import { createSecretClient } from '../lib/supabase/server.ts';

if (process.argv.length > 2) {
  console.error('Usage: npm run projects:sync   (reads every projects/*.yaml)');
  process.exit(2);
}

const report = (label: string, slugs: readonly string[]): void => {
  for (const slug of slugs) {
    console.log(`${label}: ${slug}`);
  }
};

try {
  const { files, errors } = loadProjectFiles(PROJECTS_DIR);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error.message);
    }
    console.error(
      `projects:sync failed: ${errors.length} invalid project file(s); nothing was written`,
    );
    process.exit(1);
  }

  const summary = await syncProjects(createSecretClient(), files);
  report('updated', summary.updated);
  report('skipped', summary.skipped);
  report('orphaned', summary.orphaned);
  console.log(
    `projects:sync: ${summary.updated.length} updated, ${summary.skipped.length} skipped ` +
      `(file without a row; run project:add), ${summary.orphaned.length} orphaned ` +
      '(row without a file; left alone)',
  );
} catch (error) {
  console.error(`projects:sync failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
