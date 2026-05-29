#!/bin/bash
# Automated Moodle backup
# Saves: database, data files, custom themes, configuration

BACKUP_DIR="/home/admin/moodle/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_DIR="/home/admin/moodle/compose"
LOG_FILE="/home/admin/moodle/backup.log"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting backup ==="

# Enable Moodle maintenance mode (optional, uncomment if needed)
# log "Enabling maintenance mode..."
# docker exec moodle-stack-moodle-1 php /bitnami/moodle/admin/cli/maintenance.php --enable 2>/dev/null

# 1. Create database dump
log "Creating database dump..."
docker exec moodle-stack-mariadb-1 mysqldump \
  -u root \
  -p'Supersecretpassword123!' \
  --single-transaction \
  --routines \
  --triggers \
  bitnami_moodle 2>/dev/null | gzip > "$BACKUP_DIR/moodle_db_$TIMESTAMP.sql.gz"

if [ $? -eq 0 ]; then
    log "✓ Database saved: moodle_db_$TIMESTAMP.sql.gz"
else
    log "✗ ERROR creating database dump!"
    exit 1
fi

# 2. Archive user files (moodledata)
log "Archiving user files..."
if [ -d "/home/admin/moodle/data/moodledata" ]; then
    tar -czf "$BACKUP_DIR/moodledata_$TIMESTAMP.tar.gz" \
      -C /home/admin/moodle/data \
      --warning=no-file-changed \
      moodledata 2>/dev/null

    if [ $? -eq 0 ] || [ $? -eq 1 ]; then
        # Exit code 1 means "files changed during archiving" - this is OK
        log "✓ User files saved: moodledata_$TIMESTAMP.tar.gz"
    else
        log "✗ ERROR archiving moodledata!"
    fi
else
    log "⚠ Warning: moodledata directory not found"
fi

# 3. Archive custom themes and plugins (if any)
log "Archiving custom Moodle files..."
CUSTOM_DIRS=""
[ -d "/home/admin/moodle/data/moodle/theme" ] && CUSTOM_DIRS="$CUSTOM_DIRS theme/"
[ -d "/home/admin/moodle/data/moodle/local" ] && CUSTOM_DIRS="$CUSTOM_DIRS local/"

if [ -n "$CUSTOM_DIRS" ]; then
    tar -czf "$BACKUP_DIR/moodle_custom_$TIMESTAMP.tar.gz" \
      -C /home/admin/moodle/data/moodle \
      --exclude='cache/*' \
      --exclude='localcache/*' \
      --warning=no-file-changed \
      $CUSTOM_DIRS 2>/dev/null

    if [ $? -eq 0 ] || [ $? -eq 1 ]; then
        log "✓ Custom files saved: moodle_custom_$TIMESTAMP.tar.gz"
    else
        log "⚠ Warning: failed to save custom files"
    fi
else
    log "ℹ Custom directories (theme/local) not found - skipping"
fi

# 4. Save docker-compose.yml and .env
log "Saving Docker configuration..."
cp "$COMPOSE_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose_$TIMESTAMP.yml"
cp "$COMPOSE_DIR/.env" "$BACKUP_DIR/env_$TIMESTAMP.txt" 2>/dev/null

log "✓ Docker configuration saved"

# 5. Remove old backups (older than 7 days)
log "Removing old backups (older than 7 days)..."
DELETED=$(find "$BACKUP_DIR" -name "*_*.*" -mtime +7 -delete -print | wc -l)
log "✓ Old files removed: $DELETED"

# Disable maintenance mode (if enabled)
# log "Disabling maintenance mode..."
# docker exec moodle-stack-moodle-1 php /bitnami/moodle/admin/cli/maintenance.php --disable 2>/dev/null

# 6. Show statistics
log "=== Backup completed ==="
log "Backup directory: $BACKUP_DIR"
log "Size of latest backup:"
du -sh "$BACKUP_DIR"/*_$TIMESTAMP.* 2>/dev/null | tee -a "$LOG_FILE"

log "Total backups in system:"
ls -1 "$BACKUP_DIR"/*.gz 2>/dev/null | wc -l | xargs echo "Files:" | tee -a "$LOG_FILE"
du -sh "$BACKUP_DIR" | tee -a "$LOG_FILE"
