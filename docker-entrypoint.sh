#!/bin/sh
set -e

# Runs as root so it can fix ownership of the (bind-mounted) data + backups
# volumes, then drops privileges to the unprivileged `node` user for everything
# else.
mkdir -p /app/data /app/backups
chown -R node:node /app/data /app/backups

# Apply migrations + seed content and the bootstrap admin (idempotent), then
# start the server. The seed bundle applies migrations first, so this is where
# production migrations run — the server itself does NOT auto-migrate on the
# request path unless RUN_MIGRATIONS_ON_BOOT=1 (see lib/db/client.ts).
#
# `set -e` means a failed migration/seed aborts startup instead of booting the
# server against an un-migrated database.
#
# seed.cjs and server.js are plain-node artifacts (esbuild bundle + Next
# standalone) — no tsx / full dependency tree in this image.
echo "→ Migrating + seeding database (idempotent)…"
gosu node node seed.cjs

echo "→ Starting Next.js (standalone)…"
exec gosu node node server.js
