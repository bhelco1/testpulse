import type { NextConfig } from 'next';

// Admin compares each project file deployed with the site with its database row when /admin
// loads (lib/admin/sync.ts). Nothing imports the files, so the build's file tracing would leave
// them out of the function Vercel deploys; this puts them in, at the same projects/ path the
// page reads them from (spec section 15, "Admin" as built).
export const ADMIN_TRACED_FILES = { '/admin': ['./projects/*.yaml'] };

const nextConfig: NextConfig = {
  outputFileTracingIncludes: ADMIN_TRACED_FILES,
  // A tracked link is /v/<token> (spec section 14). Its handler uses the secret client, which
  // only app/api may reach, so the public address is rewritten, on the server, to the API route.
  async rewrites() {
    return [{ source: '/v/:token', destination: '/api/v/:token' }];
  },
};

export default nextConfig;
