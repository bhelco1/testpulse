import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

// lib/supabase/server.ts holds the secret key, which bypasses row-level security (spec section
// 15). Matched in any path form: "@/lib/supabase/server", "../supabase/server.ts" and so on.
const SECRET_CLIENT = {
  regex: String.raw`(^|/)supabase/server(\.ts)?$`,
  message:
    'lib/supabase/server is server-only: it holds the secret key and must not be imported from ' +
    'app/, components/ or lib/queries/. Public pages read through lib/queries/.',
};

// lib/ingest/ingest.ts builds the secret client for the ingestion route, the one app/ file
// allowed it. The rest of lib/ingest is pure and shared with components.
const INGEST = {
  regex: String.raw`(^|/)ingest/ingest(\.ts)?$`,
  message:
    'lib/ingest/ingest uses the secret client and is only for app/api/v1/reports. Public pages ' +
    'read through lib/queries/.',
};

// lib/jobs/cron.ts builds the secret client for the daily cron route, and lib/jobs/daily.ts writes
// with it; only app/api may import them.
const JOBS = {
  regex: String.raw`(^|/)jobs/(cron|daily)(\.ts)?$`,
  message:
    'lib/jobs runs the daily job with the secret client and is only for app/api/cron. Public ' +
    'pages read through lib/queries/.',
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // The Claude Design handoff bundle is committed as exported and never edited by hand.
    'design/**',
  ]),
  {
    // app/ and components/ can end up in a client bundle, and lib/queries/ is what public pages
    // read through, so none of them may import the secret client directly. Lint sees only a
    // file's own imports; lib/queries/boundary.test.ts walks the whole graph.
    files: ['app/**', 'components/**', 'lib/queries/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SECRET_CLIENT] }],
    },
  },
  {
    // The same files outside the API routes may not reach the secret client through lib/ingest or
    // lib/jobs either.
    // This object replaces the rule options above for the files it matches, so it repeats them.
    files: ['app/**', 'components/**', 'lib/queries/**'],
    ignores: ['app/api/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SECRET_CLIENT, INGEST, JOBS] }],
    },
  },
  prettier,
]);

export default eslintConfig;
