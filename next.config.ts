import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  // Emit a self-contained server (`.next/standalone`) with only the traced
  // dependencies, so the runtime image drops the full node_modules, the C build
  // toolchain, and tsx (see Dockerfile). The seed/migrate step is precompiled to
  // a plain-node bundle (`npm run db:compile-seed`) for the same reason.
  output: "standalone",
  // better-sqlite3 is a native module — keep it out of the bundle (kept external,
  // it is still traced into the standalone node_modules with its prebuilt binary).
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    // Belt-and-suspenders: guarantee the native binary is carried into standalone.
    "/**": ["./node_modules/better-sqlite3/build/Release/better_sqlite3.node"],
  },
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
