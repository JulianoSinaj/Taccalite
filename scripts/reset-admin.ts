/**
 * Create or reset an admin user.
 *
 * Reuses the app's own scrypt hashing and the same username normalization the login
 * uses (trim + lowercase), so the resulting credentials actually work. Standalone:
 * opens its own DB connection (the runtime client is server-only) and applies
 * migrations first, exactly like scripts/seed.ts.
 *
 *   npx tsx scripts/reset-admin.ts <username> <password> [name]
 *
 * With no arguments it falls back to ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_NAME.
 * If the username already exists, its password is reset and role forced to "admin";
 * otherwise a new admin is created.
 */
import "./_bootstrap-env"; // MUST be first: defaults NODE_ENV before lib/env loads
import { openDatabase } from "../lib/db/connection";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
import { env } from "../lib/env";

const username = (process.argv[2] ?? env.admin.username).trim().toLowerCase();
const password = process.argv[3] ?? env.admin.password;
const name = process.argv[4] ?? env.admin.name;

if (!username || !password) {
  console.error("Usage: npx tsx scripts/reset-admin.ts <username> <password> [name]");
  process.exit(1);
}

async function main() {
  // Local file or remote Turso — see lib/db/connection.ts. Migrations are applied
  // here (idempotent) so this is also where production migrations run.
  const db = await openDatabase(env.databaseUrl, env.databaseAuthToken, { migrate: true });
  try {
    await run(db);
  } finally {
    db.$client.close();
  }
}

async function run(db: Awaited<ReturnType<typeof openDatabase>>) {
  const passwordHash = hashPassword(password);
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.users)
      .set({ passwordHash, role: "admin", name })
      .where(eq(schema.users.username, username));
    console.log(`✓ Admin password reset for ${username}`);
  } else {
    await db.insert(schema.users).values({
      username,
      name,
      passwordHash,
      role: "admin",
    });
    console.log(`✓ Admin created: ${username}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
