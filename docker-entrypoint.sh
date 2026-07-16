#!/bin/sh
set -e

# Apply migrations + seed content and the bootstrap admin (idempotent), then
# start the server. Migrations also run automatically on first DB access, but
# seeding the admin/content requires the seed script.
echo "→ Seeding database (idempotent)…"
npx tsx scripts/seed.ts || echo "⚠ seed skipped/failed (continuing)"

echo "→ Starting Next.js…"
exec npx next start -p "${PORT:-3000}"
