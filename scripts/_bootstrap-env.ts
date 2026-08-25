/**
 * Local-CLI environment bootstrap.
 *
 * Two jobs, in this order, both of which must happen BEFORE `lib/env.ts` is
 * imported — it snapshots `process.env` at module load and never re-reads it.
 *
 * 1. **Load `.env`.** Next loads it automatically (`next dev` prints
 *    "Environments: .env"); plain `tsx` does not, and nothing here ever called
 *    dotenv. So `db:seed`, `db:seed:demo` and `admin:reset` silently ran on
 *    `lib/env.ts`'s built-in defaults while the dev server used the file — the
 *    two disagreed about every value. Concretely: `admin:reset` set the
 *    password to the DEV_DEFAULTS one no matter what `ADMIN_PASSWORD` said, and
 *    a `.env`-only `DATABASE_URL` (a Turso URL, say) was ignored, so the seed
 *    went into the local SQLite file instead of the database being deployed.
 *
 *    `process.loadEnvFile` leaves already-set variables alone, so the real
 *    environment still wins — same precedence as Next, and the reason this is
 *    safe on Vercel and in Docker, where the values arrive as actual env vars
 *    (and `.dockerignore` keeps `.env` out of the image entirely).
 *
 * 2. **Default `NODE_ENV`.** The runtime security guard in `lib/env.ts` fails
 *    closed: any `NODE_ENV` that isn't explicitly `development` gets the strict
 *    path (real secrets required). That's correct for a server, but the
 *    maintenance scripts are normally run on a dev machine with `NODE_ENV`
 *    unset — they shouldn't demand production secrets there. In production the
 *    container sets `NODE_ENV=production` (see the Dockerfile), so this never
 *    downgrades a real deployment — the guard still fires and warns about
 *    default secrets.
 *
 * IMPORTANT: import this FIRST, before importing anything from `lib/`.
 */

// Added in Node 20.12; the Dockerfile pins `node:20-bookworm-slim`, which is
// well past that, but an older local Node must not crash the seed — it simply
// keeps the previous behaviour of reading whatever is already exported.
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // No `.env` (CI, Docker, a fresh clone). Not an error: every value has a
    // default or is already exported.
  }
}

if (!process.env.NODE_ENV) {
  // `NODE_ENV` is typed read-only; assign through a widened view of process.env.
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
}
