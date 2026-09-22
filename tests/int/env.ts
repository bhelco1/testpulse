export interface IntegrationEnv {
  url: string;
  publishableKey: string;
  secretKey: string;
}

export function readIntegrationEnv(): IntegrationEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !publishableKey || !secretKey) {
    const missing = [
      ['NEXT_PUBLIC_SUPABASE_URL', url],
      ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publishableKey],
      ['SUPABASE_SECRET_KEY', secretKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(
      `Integration tests need ${missing.join(', ')}. ` +
        'Run `supabase start`, then copy API_URL, PUBLISHABLE_KEY and SECRET_KEY from ' +
        '`supabase status -o env` into .env.local under the names in .env.example.',
    );
  }

  return { url, publishableKey, secretKey };
}
