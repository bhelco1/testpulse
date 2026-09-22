import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

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
  ]),
  {
    // lib/supabase/server.ts holds the secret key, which bypasses row-level security (spec
    // section 15). Nothing under app/ or components/ may import it, in any path form, because
    // those trees can end up in a client bundle.
    files: ['app/**', 'components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`(^|/)lib/supabase/server(\.ts)?$`,
              message:
                'lib/supabase/server is server-only: it holds the secret key and must not be ' +
                'imported from app/ or components/. Call a lib/ function instead.',
            },
          ],
        },
      ],
    },
  },
  prettier,
]);

export default eslintConfig;
