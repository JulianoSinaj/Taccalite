import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  // better-sqlite3 is a native module — keep it out of the bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Note: `output: "standalone"` is enabled in Phase 6 (deployment) together with
  // outputFileTracingIncludes for the native binary + drizzle migrations.
  images: {
    // Next.js 16 defaults qualities to [75]; ScrollFilm requests 82.
    qualities: [75, 82, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
