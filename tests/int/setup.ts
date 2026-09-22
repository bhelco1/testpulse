import { loadEnvConfig } from '@next/env';
import { vi } from 'vitest';

import { readIntegrationEnv } from './env.ts';

// Vitest sets NODE_ENV=test, and in test mode Next deliberately skips .env.local. The local
// Supabase keys live there, so load it the way `next dev` would, then restore NODE_ENV.
vi.stubEnv('NODE_ENV', 'development');
try {
  loadEnvConfig(process.cwd(), true);
} finally {
  vi.unstubAllEnvs();
}

readIntegrationEnv();
