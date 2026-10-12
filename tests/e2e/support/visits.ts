// The salt the server under test hashes addresses with (playwright.config.ts hands it to
// `next start`). Not a secret: it exists only for local and CI test runs, it is long enough for
// lib/visits/ip-hash.ts to accept, and its name says what it is. Production's IP_HASH_SALT lives
// only in Vercel's environment settings.
export const E2E_IP_HASH_SALT = 'e2e-test-only-ip-hash-salt-not-a-secret-0123456789';
