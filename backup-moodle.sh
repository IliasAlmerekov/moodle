#!/bin/bash
set -o pipefail
# Automated Moodle backup
# Saves: database, data files, custom themes, configuration
#
# Required env vars:
#   MYSQL_ROOT_PASSWORD — MariaDB root password (must be set before running)
#
# Cron example (runs at 03:00 daily):
#   0 3 * * * MYSQL_ROOT_PASSWORD=secret /home/admin/moodle/backup-moodle.sh

# Paths derive from the script's own location so the backup works on any host
# (no hardcoded /home/admin). Overridable via env for custom layouts.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_DIR="${COMPOSE_DIR:-$SCRIPT_DIR/compose}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/backup.log}"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/data}"
MARIADB_CONTAINER="${MARIADB_CONTAINER:-moodle-stack-mariadb-1}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Trim log to last 1000 lines to prevent unbounded growth
tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"

log "=== Starting backup ==="

if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    log "✗ ERROR: MYSQL_ROOT_PASSWORD is not set. Aborting."
    exit 1
fi

# Enable Moodle maintenance mode (optional, uncomment if needed)
# log "Enabling maintenance mode..."
# docker exec moodle-stack-moodle-1 php /bitnami/moodle/admin/cli/maintenance.php --enable 2>/dev/null

# 1. Create database dump
log "Creating database dump..."
docker exec $MARIADB_CONTAINER mysqldump \
  -u root \
  --password="$MYSQL_ROOT_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  bitnami_moodle 2>> "$LOG_FILE" | gzip > "$BACKUP_DIR/moodle_db_$TIMESTAMP.sql.gz"

if [ $? -eq 0 ]; then
    log "✓ Database saved: moodle_db_$TIMESTAMP.sql.gz"
else
    log "✗ ERROR creating database dump!"
    exit 1
fi

# 2. Backup chat database (SQLite) using the built-in hot backup API
log "Backing up chat database..."
if [ -f "$DATA_DIR/chat.db" ]; then
    sqlite3 "$DATA_DIR/chat.db" \
      ".backup '$BACKUP_DIR/chat_db_$TIMESTAMP.db'"
    if [ $? -eq 0 ]; then
        log "✓ Chat database backed up: chat_db_$TIMESTAMP.db"
    else
        log "✗ ERROR backing up chat database!"
    fi
else
    log "ℹ Chat database not found (optional)"
fi

# 3. Archive user files (moodledata)
log "Archiving user files..."
if [ -d "$DATA_DIR/moodledata" ]; then
    tar -czf "$BACKUP_DIR/moodledata_$TIMESTAMP.tar.gz" \
      -C $DATA_DIR \
      --warning=no-file-changed \
      moodledata 2>/dev/null

    # Exit code 1 means "files changed during archiving" — acceptable for a live system
    if [ $? -eq 0 ] || [ $? -eq 1 ]; then
        log "✓ User files saved: moodledata_$TIMESTAMP.tar.gz"
    else
        log "✗ ERROR archiving moodledata!"
    fi
else
    log "⚠ Warning: moodledata directory not found"
fi

# 4. Archive custom themes and plugins (if any)
log "Archiving custom Moodle files..."
CUSTOM_DIRS=()
[ -d "$DATA_DIR/moodle/theme" ] && CUSTOM_DIRS+=("theme/")
[ -d "$DATA_DIR/moodle/local" ] && CUSTOM_DIRS+=("local/")

if [ ${#CUSTOM_DIRS[@]} -gt 0 ]; then
    tar -czf "$BACKUP_DIR/moodle_custom_$TIMESTAMP.tar.gz" \
      -C $DATA_DIR/moodle \
      --exclude='cache/*' \
      --exclude='localcache/*' \
      --warning=no-file-changed \
      "${CUSTOM_DIRS[@]}" 2>/dev/null

    if [ $? -eq 0 ] || [ $? -eq 1 ]; then
        log "✓ Custom files saved: moodle_custom_$TIMESTAMP.tar.gz"
    else
        log "⚠ Warning: failed to save custom files"
    fi
else
    log "ℹ Custom directories (theme/local) not found - skipping"
fi

# 5. Save docker-compose.yml (secrets in .env are excluded — restore them from a secrets store)
log "Saving Docker configuration..."
cp "$COMPOSE_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose_$TIMESTAMP.yml"
log "✓ Docker configuration saved"

# 6. Rotate backups: keep 7 latest sets, delete files older than 30 days
log "Rotating backups..."

DELETED_30=$(find "$BACKUP_DIR" -type f -name "*_*.*" -mtime +30 -delete -print | wc -l)
log "✓ Files older than 30 days removed: $DELETED_30"

KEEP_TIMESTAMPS=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "*_*.*" \
  -printf '%f\n' | sed 's/.*_\([0-9]\{8\}_[0-9]\{6\}\)\..*/\1/' | sort -u -r | head -7)
log "Keeping backup sets: $(echo "$KEEP_TIMESTAMPS" | tr '\n' ' ')"

find "$BACKUP_DIR" -maxdepth 1 -type f -name "*_*.*" | while read -r file; do
    FILE_TIMESTAMP=$(basename "$file" | sed 's/.*_\([0-9]\{8\}_[0-9]\{6\}\)\..*/\1/')
    if ! echo "$KEEP_TIMESTAMPS" | grep -q "$FILE_TIMESTAMP"; then
        rm -f "$file"
        log "Deleted old backup: $(basename "$file")"
    fi
done

log "✓ Backup rotation completed"

# Disable maintenance mode (if enabled above)
# log "Disabling maintenance mode..."
# docker exec moodle-stack-moodle-1 php /bitnami/moodle/admin/cli/maintenance.php --disable 2>/dev/null

# 7. Show statistics
log "=== Backup completed ==="
log "Backup directory: $BACKUP_DIR"
log "Size of latest backup set:"
du -sh "$BACKUP_DIR"/*_"$TIMESTAMP".* 2>/dev/null | tee -a "$LOG_FILE"
log "Total backup files: $(find "$BACKUP_DIR" -maxdepth 1 -name "*.gz" -o -name "*.db" -o -name "*.yml" | wc -l)"
du -sh "$BACKUP_DIR" | tee -a "$LOG_FILE"
