import type { Config } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "./data/taccalite.db";
const remote = /^(libsql|https?|wss?):\/\//i.test(url);

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  // `turso` for a remote libSQL URL, plain `sqlite` for a local file.
  dialect: remote ? "turso" : "sqlite",
  dbCredentials: remote
    ? { url, authToken: process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN }
    : { url },
} satisfies Config;
