/**
 * libSQL / Turso connection plumbing shared by the server client
 * (`lib/db/client.ts`) and the standalone CLI scripts (`scripts/seed.ts`,
 * `scripts/reset-admin.ts`, `scripts/seed-demo.ts`).
 *
 * `DATABASE_URL` accepts three shapes:
 *   - a plain path (`./data/taccalite.db`) or `file:` URL → local SQLite file
 *     (zero-setup dev, Docker volume, vitest);
 *   - `:memory:` → throwaway in-memory database;
 *   - `libsql://…` / `https://…` → a remote Turso database, authenticated with
 *     `DATABASE_AUTH_TOKEN` (alias `TURSO_AUTH_TOKEN`). This is the Vercel path:
 *     serverless functions have no persistent disk, so the DB lives in Turso.
 *
 * Deliberately NOT marked `server-only` so the CLI scripts can import it.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { createClient, type Client, type Config } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

const REMOTE_SCHEME = /^(libsql|https?|wss?):\/\//i;

/** True when `url` points at a remote libSQL server (Turso) rather than a file. */
export function isRemoteDatabaseUrl(url: string): boolean {
  return REMOTE_SCHEME.test(url);
}

/**
 * True when running on Vercel (serverless, no persistent filesystem) with a
 * local-file `DATABASE_URL` — i.e. no real database was configured. In that
 * case the app runs on an ephemeral in-memory database (demo mode).
 */
export function isEphemeralFallback(url: string): boolean {
  return Boolean(process.env.VERCEL) && !isRemoteDatabaseUrl(url) && !url.startsWith(":memory:") && !url.startsWith("file::memory:");
}

/**
 * Normalise `DATABASE_URL` into a `@libsql/client` config. Local paths are made
 * absolute (relative to `process.cwd()`, as before) and their directory is
 * created so a fresh checkout works with zero setup.
 */
export function databaseConfig(rawUrl: string, authToken = ""): Config {
  if (isRemoteDatabaseUrl(rawUrl)) {
    if (!authToken) {
      throw new Error(
        `DATABASE_URL is a remote libSQL URL (${rawUrl}) but DATABASE_AUTH_TOKEN is empty. ` +
          "Set DATABASE_AUTH_TOKEN (or TURSO_AUTH_TOKEN) to the Turso database token.",
      );
    }
    return { url: rawUrl, authToken };
  }
  // Serverless has no persistent disk, so a local file path there can't work.
  // Rather than crash, fall back to an in-memory database (ephemeral demo mode:
  // the site comes up with zero configuration, but nothing written survives a
  // cold start). `lib/db/client.ts` migrates + seeds it at boot and warns loudly.
  if (isEphemeralFallback(rawUrl)) {
    return { url: ":memory:" };
  }
  if (rawUrl === ":memory:" || rawUrl.startsWith("file::memory:")) {
    return { url: rawUrl };
  }
  const path = rawUrl.startsWith("file:") ? rawUrl.slice("file:".length) : rawUrl;
  const abs = resolve(process.cwd(), path);
  const dir = dirname(abs);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return { url: `file:${abs}` };
}

/** Absolute directory of a local database file, or null for remote/in-memory. */
export function localDatabaseDir(rawUrl: string): string | null {
  if (isRemoteDatabaseUrl(rawUrl) || isEphemeralFallback(rawUrl) || rawUrl === ":memory:" || rawUrl.startsWith("file::memory:")) {
    return null;
  }
  const path = rawUrl.startsWith("file:") ? rawUrl.slice("file:".length) : rawUrl;
  return dirname(resolve(process.cwd(), path));
}

/**
 * Per-connection pragmas for a local file DB. Remote Turso manages journaling
 * itself and enforces foreign keys by default, so these are file-only.
 */
export async function applyLocalPragmas(client: Client): Promise<void> {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("PRAGMA busy_timeout = 5000");
}

/** Open a raw libSQL client for `rawUrl` (local pragmas are NOT applied here). */
export function openClient(rawUrl: string, authToken = ""): Client {
  return createClient(databaseConfig(rawUrl, authToken));
}

/** Drizzle instance over an existing client, typed with the app schema. */
export function wrapDrizzle(client: Client): Db {
  return drizzle(client, { schema });
}

/**
 * Apply pending Drizzle migrations from `<cwd>/drizzle` (idempotent — Drizzle
 * tracks applied migrations in its own journal table). Also runs the local
 * pragmas first when the DB is a file.
 */
export async function migrateDatabase(db: Db, rawUrl: string): Promise<void> {
  if (!isRemoteDatabaseUrl(rawUrl) && !isEphemeralFallback(rawUrl)) await applyLocalPragmas(db.$client);
  const migrationsFolder = join(process.cwd(), "drizzle");
  if (!existsSync(migrationsFolder)) return;
  await migrate(db, { migrationsFolder });
}

/**
 * Convenience for CLI scripts: open + (optionally) migrate in one call.
 * Returns the drizzle instance; call `db.$client.close()` when done.
 */
export async function openDatabase(
  rawUrl: string,
  authToken = "",
  opts: { migrate?: boolean } = {},
): Promise<Db> {
  const client = openClient(rawUrl, authToken);
  const db = wrapDrizzle(client);
  if (opts.migrate) {
    await migrateDatabase(db, rawUrl);
  } else if (!isRemoteDatabaseUrl(rawUrl) && !isEphemeralFallback(rawUrl)) {
    await applyLocalPragmas(client);
  }
  return db;
}
