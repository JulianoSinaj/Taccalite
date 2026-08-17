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
  // @libsql/client pulls in the native `libsql` package for `file:` URLs — keep
  // it out of the bundle (traced into standalone node_modules for Docker; on
  // Vercel the remote Turso URL uses the pure-JS HTTP transport).
  serverExternalPackages: ["@libsql/client", "libsql"],
  images: {
    // Next.js 16 defaults qualities to [75]; ScrollFilm requests 82.
    qualities: [75, 82, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      // Instagram media (Graph API media_url / thumbnail_url / profile pictures)
      // are served from regional CDN hosts under these two domains.
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      // Admin uploads on Vercel live in Vercel Blob (see lib/media.ts).
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
