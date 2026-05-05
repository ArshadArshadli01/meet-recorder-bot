/**
 * Rewrites run on the Next.js server. In Docker, `localhost` is the dashboard
 * container — proxy to the API service hostname instead (`INTERNAL_API_BASE_URL`).
 * Browsers still use relative `/api/*` and `/socket.io/*` on the dashboard origin.
 */
const rewriteApiBase =
  process.env.INTERNAL_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.PUBLIC_BASE_URL?.trim() ||
  "http://localhost:3000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${rewriteApiBase}/:path*`,
      },
      {
        source: "/firebase-config",
        destination: `${rewriteApiBase}/firebase-config`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${rewriteApiBase}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
