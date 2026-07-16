import "server-only";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Singleton SQLite connection + Drizzle wrapper.
 *
 * Migrations are applied automatically on first init (idempotent — Drizzle tracks
 * applied migrations in its journal table), so a fresh checkout or a fresh server
 * just works. WAL mode is enabled for better read/write concurrency.
 */
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __taccaliteDb?: DrizzleDb };

function createDb(): DrizzleDb {
  const dbPath = resolve(process.cwd(), env.databaseUrl);
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = join(process.cwd(), "drizzle");
  if (existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }

  return db;
}

export const db: DrizzleDb = globalForDb.__taccaliteDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__taccaliteDb = db;

export { schema };
