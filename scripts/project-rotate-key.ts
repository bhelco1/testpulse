// Node runs this file directly with type stripping, which needs the real extension on imports.
import { describeIssuedKey } from '../lib/projects/keys.ts';
import { rotateProjectKey } from '../lib/projects/repo.ts';
import { createSecretClient } from '../lib/supabase/server.ts';

const slug = process.argv[2];
if (slug === undefined || process.argv.length > 3) {
  console.error('Usage: npm run project:rotate-key <slug>');
  process.exit(2);
}

try {
  const key = await rotateProjectKey(createSecretClient(), slug);
  console.log(`Rotated the API key for "${slug}". The previous key stops working immediately.`);
  console.log(describeIssuedKey(slug, key));
} catch (error) {
  console.error(
    `project:rotate-key failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
