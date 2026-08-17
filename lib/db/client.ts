import "server-only";
import type { Client } from "@libsql/client";
import { env } from "@/lib/env";
import * as schema from "./schema";
import {
  applyLocalPragmas,
  isEphemeralFallback,
  isRemoteDatabaseUrl,
  migrateDatabase,
  openClient,
  wrapDrizzle,
  type Db,
} from "./connection";
import { seedBaseData } from "./seed-data";

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

/**
 * True when the app is running on Vercel without a configured database and is
 * therefore using an ephemeral in-memory DB (demo mode). Exposed so the admin
 * UI can show a banner.
 */
export const ephemeralDatabase = isEphemeralFallback(env.databaseUrl);

function createDb(): Db {
  const raw = openClient(env.databaseUrl, env.databaseAuthToken);
  const remote = isRemoteDatabaseUrl(env.databaseUrl);

  const ready: Promise<void> = (async () => {
    if (ephemeralDatabase) {
      // Nothing persists here, so build the schema and base content on every
      // cold start. Loud, because a real shop must not run like this.
      console.warn(
        "[db] ⚠ No database configured on Vercel — running on an EPHEMERAL in-memory database. " +
          "The site works, but orders, bookings, admin edits and logins are NOT persisted and vanish on every " +
          "cold start. Connect a Turso database (Vercel → Storage → Turso) to persist data. See DEPLOYMENT.md §V.",
      );
      const tmp = wrapDrizzle(raw);
      await migrateDatabase(tmp, env.databaseUrl);
      await seedBaseData(tmp, () => {});
      return;
    }
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

// Always keep the singleton on globalThis, not just in dev: Next bundles server
// code per route, so a plain module-level instance would be duplicated across
// route bundles (one connection per route — and, in ephemeral demo mode, one
// *separate empty in-memory database* per route). globalThis is per process,
// so every route shares the same connection.
export const db: Db = globalForDb.__taccaliteDb ?? (globalForDb.__taccaliteDb = createDb());

export { schema };
