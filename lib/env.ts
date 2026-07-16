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

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  nodeEnv: process.env.NODE_ENV ?? "development",

  /** Public base URL (canonical/OG/JSON-LD, absolute links in emails). */
  siteUrl: str("NEXT_PUBLIC_SITE_URL", isProd ? "https://taccalite.it" : "http://localhost:3000"),

  /** SQLite database file path. */
  databaseUrl: str("DATABASE_URL", "./data/taccalite.db"),

  /** Secret used to sign session cookies. MUST be set in production. */
  sessionSecret: str("SESSION_SECRET", "dev-insecure-secret-change-me-in-production"),

  /** Transactional email (Nodemailer SMTP). If host is empty, mail goes to the dev outbox. */
  smtp: {
    host: str("SMTP_HOST"),
    port: Number(str("SMTP_PORT", "587")),
    secure: bool("SMTP_SECURE", false),
    user: str("SMTP_USER"),
    pass: str("SMTP_PASS"),
    from: str("MAIL_FROM", "Norcineria Taccalite <norcineriataccalitepaolo@gmail.com>"),
  },

  /** Where reservation/order notifications for the shop are sent. */
  ownerEmail: str("OWNER_EMAIL", "norcineriataccalitepaolo@gmail.com"),

  /** Stripe (test mode). If secret is empty, checkout runs in "simulate" mode. */
  stripe: {
    secretKey: str("STRIPE_SECRET_KEY"),
    publishableKey: str("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
  },

  /** Cron/automation shared secret for the scheduled-jobs endpoint. */
  cronSecret: str("CRON_SECRET", "dev-cron-secret"),

  /** Bootstrap admin (seeded on first migration if no admin exists). */
  admin: {
    email: str("ADMIN_EMAIL", "admin@taccalite.local"),
    password: str("ADMIN_PASSWORD", "taccalite-admin"),
    name: str("ADMIN_NAME", "Amministratore"),
  },
} as const;

export const smtpConfigured = env.smtp.host !== "";
export const stripeConfigured = env.stripe.secretKey !== "";
