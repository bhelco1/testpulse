// Node runs this file directly with type stripping, which needs the real extension on imports.
import { loadProjectFile, projectFilePath } from '../lib/projects/files.ts';
import { describeIssuedKey } from '../lib/projects/keys.ts';
import { addProject } from '../lib/projects/repo.ts';
import { createSecretClient } from '../lib/supabase/server.ts';

const slug = process.argv[2];
if (slug === undefined || process.argv.length > 3) {
  console.error('Usage: npm run project:add <slug>   (reads projects/<slug>.yaml)');
  process.exit(2);
}

try {
  const file = loadProjectFile(projectFilePath(slug));
  const key = await addProject(createSecretClient(), file);
  console.log(`Registered project "${slug}" (${file.visibility}).`);
  console.log(describeIssuedKey(slug, key));
} catch (error) {
  console.error(`project:add failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
