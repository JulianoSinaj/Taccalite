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
// Every `process.cwd()`-rooted path below carries a `turbopackIgnore` comment.
// Without it Next's file tracer cannot resolve these dynamic paths and assumes the
// whole project might be read at runtime, which drags the entire source tree
// (app/, test/, docs/, e2e/, .env…) into `.next/standalone`. The comment only
// scopes the build-time trace — the paths still resolve normally at runtime.
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
  const abs = resolve(/* turbopackIgnore: true */ process.cwd(), path);
  const dir = dirname(abs);
  if (!existsSync(/* turbopackIgnore: true */ dir)) mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  return { url: `file:${abs}` };
}

/** Absolute directory of a local database file, or null for remote/in-memory. */
export function localDatabaseDir(rawUrl: string): string | null {
  if (isRemoteDatabaseUrl(rawUrl) || isEphemeralFallback(rawUrl) || rawUrl === ":memory:" || rawUrl.startsWith("file::memory:")) {
    return null;
  }
  const path = rawUrl.startsWith("file:") ? rawUrl.slice("file:".length) : rawUrl;
  return dirname(resolve(/* turbopackIgnore: true */ process.cwd(), path));
}

/**
 * Per-connection pragmas for a local file DB. Remote Turso manages journaling
 * itself and enforces foreign keys by default, so these are file-only.
 */
export async function applyLocalPragmas(client: Client): Promise<void> {
  // busy_timeout FIRST. Switching to WAL needs a brief exclusive lock, and with
  // the default timeout of 0 any contention fails instantly rather than waiting
  // — which `next build` reproduces reliably, because its worker pool opens the
  // same file from a dozen processes at once. Worse than the noise: the throw
  // aborted the rest of this function, so `foreign_keys = ON` never ran and that
  // connection went on to work with referential integrity silently disabled.
  await client.execute("PRAGMA busy_timeout = 5000");
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
}

/** Open a raw libSQL client for `rawUrl` (local pragmas are NOT applied here). */
export function openClient(rawUrl: string, authToken = ""): Client {
  return createClient(databaseConfig(rawUrl, authToken));
}

/** Drizzle instance over an existing client, typed with the app schema. */
export function wrapDrizzle(client: Client): Db {
  return withBusyRetry(drizzle(client, { schema }));
}

/** True when an error is SQLite refusing to wait for a lock it cannot get. */
function isBusy(err: unknown): boolean {
  const code = (err as { code?: string; rawCode?: number } | null)?.code;
  return (
    code === "SQLITE_BUSY" ||
    code === "SQLITE_BUSY_SNAPSHOT" ||
    (err as { rawCode?: number } | null)?.rawCode === 5 ||
    (err instanceof Error && /SQLITE_BUSY|database is locked/i.test(err.message))
  );
}

const BUSY_ATTEMPTS = 5;

/**
 * Retry a whole transaction when SQLite says the database is busy.
 *
 * `PRAGMA busy_timeout = 5000` is applied at boot — and applies to **that
 * connection only**. The libSQL sqlite3 driver hands each `transaction()` the
 * current connection and then drops its reference, so the next caller lazily
 * opens a *fresh* one, and a fresh connection's busy timeout is **0**. Verified
 * directly: open a client, set the pragma, take a transaction, and the next
 * connection reports `busy_timeout: 0` again.
 *
 * The consequence is that every transaction after the first has no timeout at
 * all, so any contention fails instantly rather than waiting — a raw
 * `SQLITE_BUSY` thrown out of a checkout, a stock movement, a points debit or a
 * coupon count, on a codebase that otherwise takes concurrency seriously and
 * claims a transaction "locks the row from the first read". It also lingers: a
 * contended commit leaves the file busy long enough to knock over the *next*
 * sequential caller, which is why the test suites had to be ordered around it.
 *
 * Retrying the whole callback is the correct shape rather than raising the
 * timeout, because a transaction that lost the write lock has been rolled back
 * — there is nothing to resume, only something to redo. Callbacks here are
 * short, deterministic and already written to be safe to re-run: every one of
 * them re-reads its rows inside the transaction and claims what it needs with a
 * conditional UPDATE, so a replay either wins or refuses.
 *
 * The backoff is jittered so two racers do not simply collide again in step.
 */
function withBusyRetry(db: Db): Db {
  const original = db.transaction.bind(db) as Db["transaction"];
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== "transaction") return Reflect.get(target, prop, receiver);
      return async (...args: Parameters<Db["transaction"]>) => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= BUSY_ATTEMPTS; attempt++) {
          try {
            return await original(...args);
          } catch (err) {
            if (!isBusy(err)) throw err;
            lastError = err;
            if (attempt === BUSY_ATTEMPTS) break;
            const backoffMs = Math.round(2 ** attempt * (5 + Math.random() * 15));
            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }
        throw lastError;
      };
    },
  }) as Db;
}

/**
 * Apply pending Drizzle migrations from `<cwd>/drizzle` (idempotent — Drizzle
 * tracks applied migrations in its own journal table). Also runs the local
 * pragmas first when the DB is a file.
 */
export async function migrateDatabase(db: Db, rawUrl: string): Promise<void> {
  if (!isRemoteDatabaseUrl(rawUrl) && !isEphemeralFallback(rawUrl)) await applyLocalPragmas(db.$client);
  const migrationsFolder = join(/* turbopackIgnore: true */ process.cwd(), "drizzle");
  if (!existsSync(/* turbopackIgnore: true */ migrationsFolder)) return;
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
