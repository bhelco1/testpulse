// Node runs this file directly with type stripping, which needs the real extension on imports.
import { createSeedClient } from '../lib/seed/local.ts';
import { planSeed, SEED_NOW } from '../lib/seed/plan.ts';
import { describeSeed, seedDatabase } from '../lib/seed/seed.ts';

if (process.argv.length > 2) {
  console.error('Usage: npm run db:seed   (seeds local Supabase for e2e; run db:reset first)');
  process.exit(2);
}

try {
  // The URL check comes first, so a hosted database is refused before a client exists.
  const client = createSeedClient(process.env);
  const summary = await seedDatabase(client, planSeed(new Date(SEED_NOW)), process.cwd());
  console.log(describeSeed(summary));
} catch (error) {
  console.error(`db:seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
