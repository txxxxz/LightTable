const rawBackendBase =
  process.env.BACKEND_INTERNAL_BASE?.trim() ||
  process.env.BACKEND_INTERNAL_HOSTPORT?.trim() ||
  process.env.NEXT_PUBLIC_API_BASE?.trim() ||
  "http://127.0.0.1:8000";

const backendBase = /^https?:\/\//i.test(rawBackendBase)
  ? rawBackendBase
  : `http://${rawBackendBase}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendBase.replace(/\/+$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
