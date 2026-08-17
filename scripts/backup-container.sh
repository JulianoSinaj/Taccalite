#!/bin/sh
# Online SQLite backup, run INSIDE the app/scheduler container (which has node +
# @libsql/client + the persisted /app/data volume). The scheduler sidecar invokes
# this nightly; it can also be run manually:
#   docker compose exec scheduler sh /app/scripts/backup-container.sh
#
# Writes a compressed, timestamped copy to /app/backups (bind-mounted to the host)
# and prunes copies older than RETENTION_DAYS.
#
# NOTE: a copy on the same VM is NOT disaster recovery — ship /app/backups off-box
# (Hetzner Storage Box / S3) for that.
#
# Env: DATABASE_URL (default /app/data/taccalite.db), BACKUP_DIR (default
# /app/backups), RETENTION_DAYS (default 14).
set -e

STAMP=$(date +%Y%m%d-%H%M%S)
DB="${DATABASE_URL:-/app/data/taccalite.db}"
DEST="${BACKUP_DIR:-/app/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$DEST"

# SQLite's VACUUM INTO is an online, consistent snapshot (safe while the app is
# writing) — run through the same libSQL client the app uses. The target must not
# already exist.
rm -f "${DEST}/taccalite-${STAMP}.db"
node -e "require('@libsql/client').createClient({url:'file:${DB}'}).execute(\"VACUUM INTO '${DEST}/taccalite-${STAMP}.db'\").then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"

gzip -f "${DEST}/taccalite-${STAMP}.db"
find "$DEST" -name 'taccalite-*.db.gz' -type f -mtime +"$RETENTION_DAYS" -delete

echo "✓ Backup written: ${DEST}/taccalite-${STAMP}.db.gz"
