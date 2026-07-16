/**
 * Create or reset an admin user.
 *
 * Reuses the app's own scrypt hashing and the same email normalization the login
 * uses (trim + lowercase), so the resulting credentials actually work. Standalone:
 * opens its own DB connection (the runtime client is server-only) and applies
 * migrations first, exactly like scripts/seed.ts.
 *
 *   npx tsx scripts/reset-admin.ts <email> <password> [name]
 *
 * With no arguments it falls back to ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
 * If the email already exists, its password is reset and role forced to "admin";
 * otherwise a new admin is created.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
import { env } from "../lib/env";

const email = (process.argv[2] ?? env.admin.email).trim().toLowerCase();
const password = process.argv[3] ?? env.admin.password;
const name = process.argv[4] ?? env.admin.name;

if (!email || !password) {
  console.error("Usage: npx tsx scripts/reset-admin.ts <email> <password> [name]");
  process.exit(1);
}

const dbPath = resolve(process.cwd(), env.databaseUrl);
if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });

async function main() {
  const passwordHash = hashPassword(password);
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.users)
      .set({ passwordHash, role: "admin", name })
      .where(eq(schema.users.email, email));
    console.log(`✓ Admin password reset for ${email}`);
  } else {
    await db.insert(schema.users).values({
      email,
      name,
      passwordHash,
      role: "admin",
      emailVerifiedAt: new Date(),
    });
    console.log(`✓ Admin created: ${email}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
