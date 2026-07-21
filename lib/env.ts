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

  /** SQLite database file path. */
  databaseUrl: str("DATABASE_URL", "./data/taccalite.db"),

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

  /** Cron/automation shared secret for the scheduled-jobs endpoint. */
  cronSecret: str("CRON_SECRET", DEV_DEFAULTS.cronSecret),

  /** Bootstrap admin (seeded on first migration if no admin exists). */
  admin: {
    username: str("ADMIN_USERNAME", "admin"),
    password: str("ADMIN_PASSWORD", DEV_DEFAULTS.adminPassword),
    name: str("ADMIN_NAME", "Amministratore"),
  },
} as const;

export const smtpConfigured = env.smtp.host !== "";
export const stripeConfigured = env.stripe.secretKey !== "";

/**
 * Fail fast if a server would boot with known dev-default secrets. Enforced for
 * every non-development environment (production, staging, test, or an unset
 * `NODE_ENV`) — fail closed. Skipped during `next build`
 * (NEXT_PHASE === "phase-production-build") so the build doesn't require real
 * secrets; enforced when the server actually starts.
 */
if (enforceSecurity && process.env.NEXT_PHASE !== "phase-production-build") {
  const insecure: string[] = [];
  if (env.sessionSecret === DEV_DEFAULTS.sessionSecret) insecure.push("SESSION_SECRET");
  if (env.cronSecret === DEV_DEFAULTS.cronSecret) insecure.push("CRON_SECRET");
  if (env.admin.password === DEV_DEFAULTS.adminPassword) insecure.push("ADMIN_PASSWORD");
  if (insecure.length > 0) {
    throw new Error(
      `Refusing to start in production with insecure default secrets: ${insecure.join(
        ", ",
      )}. Set them via environment variables (see .env.example).`,
    );
  }
}
