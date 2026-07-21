#!/bin/sh
# In-container scheduler sidecar for the Taccalite stack.
#
# It reuses the app image and runs alongside the server, so `docker compose up`
# is self-sufficient: no host crontab and no Docker-socket access required. Every
# interval it triggers the app's scheduled jobs (outbox drain/retry, porchetta
# reminders, points expiry, session GC — all idempotent) via the secret-gated
# /api/cron endpoint, and once a day (after BACKUP_HOUR) it runs an online backup.
#
# Env: CRON_SECRET (required, shared with the app), APP_URL (default
# http://app:3000), CRON_INTERVAL_SEC (default 900), BACKUP_HOUR (default 3).
set -eu

INTERVAL="${CRON_INTERVAL_SEC:-900}"
APP_URL="${APP_URL:-http://app:3000}"
BACKUP_HOUR="${BACKUP_HOUR:-3}"
last_backup_day=""

echo "→ Scheduler started (cron every ${INTERVAL}s, nightly backup after ${BACKUP_HOUR}:00)"

while true; do
  # Trigger all scheduled jobs. Never let a transient failure kill the loop.
  node -e "fetch('${APP_URL}/api/cron?job=all',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>console.log('cron '+r.status)).catch(e=>console.error('cron error '+e.message))" || true

  # Nightly online backup, at most once per calendar day. Strip the leading zero
  # from the hour without bash's base#num notation (dash/busybox lack it).
  hour=$(date +%H | sed 's/^0//'); [ -z "$hour" ] && hour=0
  day=$(date +%Y%m%d)
  if [ "$hour" -ge "$BACKUP_HOUR" ] && [ "$day" != "$last_backup_day" ]; then
    echo "→ Running nightly backup…"
    sh /app/scripts/backup-container.sh || echo "✗ backup failed"
    last_backup_day="$day"
  fi

  sleep "$INTERVAL"
done
