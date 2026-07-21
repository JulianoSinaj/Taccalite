#!/bin/sh
# Online backup of the Taccalite SQLite database (safe while the app is running).
#
# Run from the repo directory on the host (where docker-compose.yml lives), e.g.
# from cron:
#   0 3 * * *  cd /opt/taccalite && ./scripts/backup.sh >> /var/log/taccalite-backup.log 2>&1
#
# Produces a compressed, timestamped copy under ./backups and prunes copies older
# than RETENTION_DAYS. Ship ./backups off-box (Hetzner Storage Box / S3) for real
# disaster recovery — a copy on the same VM is not a backup.
#
# Env: BACKUP_DIR (default ./backups), RETENTION_DAYS (default 14).
set -e

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$DEST"

# Use better-sqlite3's online backup API inside the running container. Writing to
# /app/data (the persisted volume) means the file also appears on the host via
# the ./data bind mount, from where we move + compress it.
docker compose exec -T app node -e "require('better-sqlite3')('/app/data/taccalite.db').backup('/app/data/backup.tmp.db').then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"

mv ./data/backup.tmp.db "$DEST/taccalite-$STAMP.db"
gzip -f "$DEST/taccalite-$STAMP.db"

find "$DEST" -name 'taccalite-*.db.gz' -type f -mtime +"$RETENTION_DAYS" -delete

echo "✓ Backup written: $DEST/taccalite-$STAMP.db.gz"
