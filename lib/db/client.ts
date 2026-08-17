import "server-only";
import type { Client } from "@libsql/client";
import { env } from "@/lib/env";
import * as schema from "./schema";
import {
  applyLocalPragmas,
  isRemoteDatabaseUrl,
  migrateDatabase,
  openClient,
  wrapDrizzle,
  type Db,
} from "./connection";

/**
 * Singleton libSQL connection + Drizzle wrapper.
 *
 * Local file databases get WAL + foreign keys + busy timeout; remote Turso
 * databases (Vercel) need none of that. In development migrations are applied
 * automatically before the first query so a fresh checkout "just works"; in
 * production they run explicitly (`npm run db:seed` — the Vercel build step and
 * docker-entrypoint.sh both do this) unless RUN_MIGRATIONS_ON_BOOT=1.
 *
 * All libSQL calls are async. Because module init is synchronous, the
 * "migrate/pragma before first query" ordering is enforced by wrapping the raw
 * client in a proxy whose query methods await a one-shot `ready` promise — so
 * callers can keep using `db` as a plain value.
 */

const GATED = new Set<PropertyKey>(["execute", "batch", "migrate", "transaction", "executeMultiple"]);

function gatedClient(raw: Client, ready: Promise<void>): Client {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function" && GATED.has(prop)) {
        return async (...args: unknown[]) => {
          await ready;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
}

const globalForDb = globalThis as unknown as { __taccaliteDb?: Db };

function createDb(): Db {
  const raw = openClient(env.databaseUrl, env.databaseAuthToken);
  const remote = isRemoteDatabaseUrl(env.databaseUrl);

  const ready: Promise<void> = (async () => {
    if (env.runMigrationsOnBoot) {
      // migrateDatabase applies the local pragmas itself before migrating.
      await migrateDatabase(wrapDrizzle(raw), env.databaseUrl);
    } else if (!remote) {
      await applyLocalPragmas(raw);
    }
  })();
  // Surface a broken boot loudly instead of as an unhandled rejection; every
  // gated call re-awaits `ready` and will rethrow the same error.
  ready.catch((err) => console.error("[db] initialisation failed:", err));

  return wrapDrizzle(gatedClient(raw, ready));
}

export const db: Db = globalForDb.__taccaliteDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__taccaliteDb = db;

export { schema };
