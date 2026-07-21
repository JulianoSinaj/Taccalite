#!/bin/sh
set -e

# Apply migrations + seed content and the bootstrap admin (idempotent), then
# start the server. The seed script applies migrations first, so this is where
# production migrations run — the server itself does NOT auto-migrate on the
# request path unless RUN_MIGRATIONS_ON_BOOT=1 (see lib/db/client.ts).
echo "→ Migrating + seeding database (idempotent)…"
npx tsx scripts/seed.ts || echo "⚠ seed skipped/failed (continuing)"

echo "→ Starting Next.js…"
exec npx next start -p "${PORT:-3000}"
