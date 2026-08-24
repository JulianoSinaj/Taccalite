/**
 * Environment configuration — the single place env vars are read.
 *
 * Everything is optional with safe local defaults so the app runs with zero setup.
 * Production swaps (real site URL, SMTP, Stripe, session secret) are env-only changes.
 * See `.env.example`.
 */

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v == null || v === "" ? fallback : v;
}

function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

const nodeEnv = process.env.NODE_ENV;
const isProd = nodeEnv === "production";
const isDev = nodeEnv === "development";

/**
 * Enforce production-grade security for anything that is NOT explicitly
 * `development` — that includes `production`, `test`, `staging`, and (crucially)
 * an unset or unrecognized `NODE_ENV`. This fails closed: a server that boots
 * without a properly configured environment gets the strict path, not the
 * insecure dev defaults. Local CLI scripts (seed/reset) default `NODE_ENV` to
 * `development` via `scripts/_bootstrap-env.ts` so zero-setup dev still works.
 */
const enforceSecurity = !isDev;

/** Dev fallbacks that are safe locally but MUST be overridden in production. */
const DEV_DEFAULTS = {
  sessionSecret: "dev-insecure-secret-change-me-in-production",
  cronSecret: "dev-cron-secret",
  adminPassword: "taccalite-admin",
} as const;

export const env = {
  isProd,
  /**
   * True ONLY for an explicit `NODE_ENV=development`. Deliberately not
   * `!isProd`: an unset or unrecognized NODE_ENV must not unlock development
   * affordances (see `enforceSecurity`). This is what gates simulated payments,
   * which mark an order paid with no money moving.
   */
  isDev,
  nodeEnv: nodeEnv ?? "development",

  /**
   * Emit `Secure` cookies (and generally behave as a hardened server) for any
   * non-development environment. Keyed off `enforceSecurity` rather than
   * `isProd` so an HTTPS staging box or a deploy with an unset `NODE_ENV` still
   * gets Secure cookies instead of silently downgrading.
   */
  secureCookies: enforceSecurity,

  /** Public base URL (canonical/OG/JSON-LD, absolute links in emails). */
  siteUrl: str("NEXT_PUBLIC_SITE_URL", isProd ? "https://taccalite.it" : "http://localhost:3000"),

  /**
   * Database location. A local SQLite file path (`./data/taccalite.db`, the
   * zero-setup default; also `file:` URLs and `:memory:`) or a remote Turso /
   * libSQL URL (`libsql://<db>-<org>.turso.io`) — the latter is what a Vercel
   * deployment uses, since serverless functions have no persistent disk.
   */
  databaseUrl: str("DATABASE_URL", str("TURSO_DATABASE_URL", "./data/taccalite.db")),

  /** Auth token for a remote Turso database (ignored for local files).
   *  `TURSO_*` are the names the Vercel Marketplace Turso integration injects. */
  databaseAuthToken: str("DATABASE_AUTH_TOKEN", str("TURSO_AUTH_TOKEN")),

  /**
   * Whether to apply migrations automatically on first DB access. On in
   * development (zero-setup), opt-in in production where migrations should run
   * explicitly before the server boots (docker-entrypoint.sh).
   */
  runMigrationsOnBoot: bool("RUN_MIGRATIONS_ON_BOOT", !isProd),

  /**
   * Whether to trust the `x-forwarded-for` / `x-real-ip` headers for the client
   * IP (rate limiting). Defaults to **false** (secure by default): only enable
   * when a trusted reverse proxy (e.g. Caddy/Coolify) sets/overwrites them —
   * otherwise clients can spoof the header to rotate their key and evade limits.
   */
  trustProxy: bool("TRUST_PROXY", false),

  /**
   * High-entropy secret reserved for signing/verifying tokens (currently the
   * production-config guard below; sessions themselves use opaque random DB
   * tokens, not signed cookies). MUST be overridden in production.
   */
  sessionSecret: str("SESSION_SECRET", DEV_DEFAULTS.sessionSecret),

  /** Transactional email (Nodemailer SMTP). If host is empty, mail goes to the dev outbox. */
  smtp: {
    host: str("SMTP_HOST"),
    port: Number(str("SMTP_PORT", "587")),
    secure: bool("SMTP_SECURE", false),
    user: str("SMTP_USER"),
    pass: str("SMTP_PASS"),
    from: str("MAIL_FROM", "Norcineria Taccalite <no-reply@example.com>"),
  },

  /** Where reservation/order notifications for the shop are sent. Placeholder by
   *  default so a misconfigured server never emails a real inbox — set OWNER_EMAIL. */
  ownerEmail: str("OWNER_EMAIL", "owner@example.com"),

  /** Stripe (test mode). If secret is empty, checkout runs in "simulate" mode. */
  stripe: {
    secretKey: str("STRIPE_SECRET_KEY"),
    publishableKey: str("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
  },

  /**
   * Vercel Blob read/write token. When set, admin image uploads go to Vercel
   * Blob (serverless has no persistent disk); when empty they are written next
   * to the local SQLite file as before. Auto-injected when a Blob store is
   * attached to the Vercel project.
   */
  blobToken: str("BLOB_READ_WRITE_TOKEN"),

  /** Cron/automation shared secret for the scheduled-jobs endpoint. */
  cronSecret: str("CRON_SECRET", DEV_DEFAULTS.cronSecret),

  /**
   * Instagram (Graph API, "Instagram API with Instagram Login"). A long-lived
   * user access token for the shop's professional account. Optional bootstrap:
   * a token saved from the admin panel (settings table) takes precedence, and
   * refreshed tokens are persisted there too. Empty → the homepage section
   * degrades to a plain "follow us" band. See DOCUMENTATION.md § Instagram.
   */
  instagram: {
    accessToken: str("INSTAGRAM_ACCESS_TOKEN"),
    /** Graph API version segment, e.g. `v21.0`. */
    apiVersion: str("INSTAGRAM_API_VERSION", "v21.0"),
  },

  /** Bootstrap admin (seeded on first migration if no admin exists). */
  admin: {
    username: str("ADMIN_USERNAME", "admin"),
    password: str("ADMIN_PASSWORD", DEV_DEFAULTS.adminPassword),
    name: str("ADMIN_NAME", "Amministratore"),
  },
} as const;

export const smtpConfigured = env.smtp.host !== "";
export const stripeConfigured = env.stripe.secretKey !== "";
export const blobConfigured = env.blobToken !== "";

/**
 * Warn loudly if a server boots with known dev-default secrets. Checked for
 * every non-development environment (production, staging, test, or an unset
 * `NODE_ENV`). This does NOT abort startup — the server keeps running with the
 * insecure defaults so a half-configured deploy is still reachable — but the
 * warning is emitted once at module load so it shows up at the top of the
 * server logs. Skipped during `next build` (NEXT_PHASE ===
 * "phase-production-build") so the build doesn't require real secrets.
 */
if (enforceSecurity && process.env.NEXT_PHASE !== "phase-production-build") {
  const insecure: string[] = [];
  if (env.sessionSecret === DEV_DEFAULTS.sessionSecret) insecure.push("SESSION_SECRET");
  if (env.cronSecret === DEV_DEFAULTS.cronSecret) insecure.push("CRON_SECRET");
  if (env.admin.password === DEV_DEFAULTS.adminPassword) insecure.push("ADMIN_PASSWORD");
  if (insecure.length > 0) {
    console.warn(
      `[env] WARNING: running in a non-development environment (NODE_ENV=${
        nodeEnv ?? "unset"
      }) with insecure default secrets: ${insecure.join(
        ", ",
      )}. Set them via environment variables (see .env.example).`,
    );
  }
}
