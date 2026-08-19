import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // Enables React's <ViewTransition> and makes Next trigger it on navigation,
    // so a product photo morphs from the grid into its detail page instead of
    // the two pages swapping with no visual link between them.
    viewTransition: true,
  },
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
  // Migrations are read from disk at runtime (`migrateDatabase` resolves
  // `<cwd>/drizzle`), but that path is deliberately opaque to the file tracer,
  // so name the folder explicitly — otherwise `.next/standalone` would ship a
  // server that cannot migrate. The Dockerfile also copies it, for the same
  // reason; this keeps the standalone output correct on its own.
  outputFileTracingIncludes: {
    "/*": ["drizzle/**"],
  },
  // `/negozi` (the two shop locations) sat one letter away from `/negozio` (the
  // online store) and the pair was a standing source of misdirected links. The
  // locations moved to `/sedi`, which is also what the nav calls them; these keep
  // the indexed URLs and any printed material working.
  async redirects() {
    return [
      { source: "/negozi", destination: "/sedi", permanent: true },
      { source: "/negozi/:slug", destination: "/sedi/:slug", permanent: true },
    ];
  },
  images: {
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
