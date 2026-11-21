/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ts/types', '@ts/validation'],
  // Browser calls stay same-origin, so the API's httpOnly refresh cookie is
  // stored and replayed without exposing any server-only environment value.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
