#!/bin/sh
set -e

# Runs as root so it can fix ownership of the (bind-mounted) data volume, then
# drops privileges to the unprivileged `node` user for everything else.
mkdir -p /app/data
chown -R node:node /app/data

# Apply migrations + seed content and the bootstrap admin (idempotent), then
# start the server. The seed script applies migrations first, so this is where
# production migrations run — the server itself does NOT auto-migrate on the
# request path unless RUN_MIGRATIONS_ON_BOOT=1 (see lib/db/client.ts).
#
# `set -e` means a failed migration/seed aborts startup instead of booting the
# server against an un-migrated database.
echo "→ Migrating + seeding database (idempotent)…"
gosu node npx tsx scripts/seed.ts

echo "→ Starting Next.js…"
exec gosu node npx next start -p "${PORT:-3000}"
