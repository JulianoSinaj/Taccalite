import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Image hosts that may be loaded directly rather than through `/_next/image`.
 * Kept next to `images.remotePatterns` below so the CSP and the image allow-list
 * cannot drift apart — a host added to one and not the other renders a blank box
 * with only a console error to say why.
 */
const IMAGE_HOSTS = [
  "https://images.unsplash.com",
  "https://*.cdninstagram.com",
  "https://*.fbcdn.net",
  "https://*.public.blob.vercel-storage.com",
].join(" ");

/**
 * Security headers.
 *
 * These lived only in the `Caddyfile`, which covers exactly one of the three
 * documented deploy paths — and not the one DEPLOYMENT.md calls recommended.
 * Coolify (§0) and Vercel (§V) both terminate TLS at their own proxy and add
 * none of this, so the app shipped there with no CSP, no HSTS and no
 * clickjacking protection. Defining them here makes them travel with the
 * application instead of with one operator's reverse proxy; Caddy's `header`
 * directive replaces rather than appends, so path B is unaffected.
 *
 * `unsafe-inline` in script-src is still required by Next's inline hydration
 * bootstrap (nonces would need a middleware pass). `img-src` needs the remote
 * hosts only for images bypassing the optimizer — everything rendered through
 * `next/image` is same-origin by the time the browser fetches it.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "object-src 'none'",
  `img-src 'self' data: blob: ${IMAGE_HOSTS}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // `unsafe-eval` is required by Turbopack's dev runtime and by React Refresh;
  // it must never reach production.
  isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
  // Browsers exempt localhost, but `next dev` is routinely opened on the LAN
  // address it prints at startup — where this would rewrite every asset request
  // to https:// against a server that only speaks http.
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses any of them; denying is cheaper than auditing later.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: CSP },
  // Only meaningful over TLS, and actively hostile on a plain-HTTP dev box.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  devIndicators: false,
  // Advertising the framework and its major version to every visitor buys
  // nothing and narrows the search for an attacker picking targets.
  poweredByHeader: false,
  // `experimental.viewTransition` used to live here, to enable React's
  // <ViewTransition> and have Next trigger it on navigation — that is what makes
  // a product photo morph from the grid into its detail page instead of the two
  // pages swapping with no visual link between them.
  //
  // Next 16.3 graduated it: the flag was dropped from `ExperimentalConfig`
  // altogether (so leaving it here is a type error, not a no-op) because the
  // App Router now does this with no configuration at all — see
  // `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`. The
  // `<ViewTransition>` usage in app/(site)/layout.tsx, ProductTile and the
  // product page is unchanged and keeps working.
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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
