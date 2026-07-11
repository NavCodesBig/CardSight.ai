import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev-only: phones on the LAN reach the dev server via the machine's IP,
  // which Next treats as cross-origin and blocks for /_next dev
  // assets/endpoints. Ignored by production builds.
  allowedDevOrigins: ["192.168.68.*", "*.local"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
};

export default nextConfig;
