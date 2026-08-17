/**
 * Seed the database from lib/data.ts (idempotent).
 *
 * Standalone: opens its own connection (does not import the server-only client),
 * applies migrations, then upserts content, rewards, settings, and a bootstrap
 * admin (see lib/db/seed-data.ts). Run: `npm run db:seed`.
 *
 * On Vercel this runs from the `vercel-build` script. If no remote database is
 * configured there, seeding is skipped: the app will boot in ephemeral demo mode
 * (in-memory DB, seeded at startup) — see lib/db/connection.ts.
 */
import "./_bootstrap-env"; // MUST be first: defaults NODE_ENV before lib/env loads
import { openDatabase, isEphemeralFallback } from "../lib/db/connection";
import { seedBaseData } from "../lib/db/seed-data";
import { env } from "../lib/env";

async function main() {
  if (isEphemeralFallback(env.databaseUrl)) {
    console.warn(
      "⚠ No remote DATABASE_URL configured on Vercel — skipping build-time seed. " +
        "The app will run in ephemeral demo mode (in-memory database, data is NOT persisted). " +
        "Connect a Turso database (Vercel → Storage → Turso) to persist data. See DEPLOYMENT.md §V.",
    );
    return;
  }
  // Local file or remote Turso — see lib/db/connection.ts. Migrations are applied
  // here (idempotent) so this is also where production migrations run.
  const db = await openDatabase(env.databaseUrl, env.databaseAuthToken, { migrate: true });
  try {
    await seedBaseData(db);
  } finally {
    db.$client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
