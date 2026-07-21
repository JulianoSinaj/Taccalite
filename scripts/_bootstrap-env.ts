/**
 * Local-CLI environment bootstrap.
 *
 * The runtime security guard in `lib/env.ts` fails closed: any `NODE_ENV` that
 * isn't explicitly `development` gets the strict path (real secrets required).
 * That's correct for a server, but the maintenance scripts (`db:seed`,
 * `admin:reset`) are normally run on a dev machine with `NODE_ENV` unset — we
 * don't want them to demand production secrets there.
 *
 * So: if `NODE_ENV` is genuinely unset, default it to `development` BEFORE any
 * module that reads it (`lib/env.ts`) is imported. In production the container
 * sets `NODE_ENV=production` (see the Dockerfile), so this never downgrades a
 * real deployment — the guard still fires and refuses default secrets.
 *
 * IMPORTANT: import this FIRST, before importing anything from `lib/`.
 */
if (!process.env.NODE_ENV) {
  // `NODE_ENV` is typed read-only; assign through a widened view of process.env.
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
}
