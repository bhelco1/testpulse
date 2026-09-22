import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.int.test.ts', '.next/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'components/**'],
      // index.ts only re-exports; there is nothing in it for a test to execute.
      exclude: ['**/*.test.ts', '**/*.int.test.ts', 'lib/parsers/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
      },
    },
  },
});
