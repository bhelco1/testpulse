import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A tracked link is /v/<token> (spec section 14). Its handler uses the secret client, which
  // only app/api may reach, so the public address is rewritten, on the server, to the API route.
  async rewrites() {
    return [{ source: '/v/:token', destination: '/api/v/:token' }];
  },
};

export default nextConfig;
