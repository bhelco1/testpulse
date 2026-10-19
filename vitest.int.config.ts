import { configDefaults, defineConfig } from 'vitest/config';

// Integration tests run against a local Supabase stack, so they live in their own config and
// stay out of the unit run and its coverage floor.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.int.test.ts'],
    exclude: [...configDefaults.exclude, '.next/**', 'tests/e2e/**'],
    setupFiles: ['tests/int/setup.ts'],
    // Every file shares one database, and their cleanups delete projects whose cascades lock the
    // same tables; run in parallel, two cleanups can deadlock (40P01).
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
