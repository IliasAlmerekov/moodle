#!/bin/bash
# Moodle restore script

BACKUP_DIR="/home/admin/moodle/backups"
DATA_DIR="/home/admin/moodle/data"
COMPOSE_DIR="/home/admin/moodle/compose"

# Output colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Restoring Moodle from backup ===${NC}"
echo ""

# List available backups
echo "Available database backups:"
ls -lht "$BACKUP_DIR"/moodle_db_*.sql.gz 2>/dev/null | head -10

echo ""
echo -e "${YELLOW}Enter backup timestamp in format YYYYMMDD_HHMMSS${NC}"
echo "Example: 20251011_140530"
read -p "Backup timestamp: " TIMESTAMP

if [ -z "$TIMESTAMP" ]; then
    echo -e "${RED}Error: timestamp not provided${NC}"
    exit 1
fi

# Check backup files exist
DB_BACKUP="$BACKUP_DIR/moodle_db_$TIMESTAMP.sql.gz"
DATA_BACKUP="$BACKUP_DIR/moodledata_$TIMESTAMP.tar.gz"
CUSTOM_BACKUP="$BACKUP_DIR/moodle_custom_$TIMESTAMP.tar.gz"

if [ ! -f "$DB_BACKUP" ]; then
    echo -e "${RED}Error: DB backup file not found: $DB_BACKUP${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Found the following files for restore:${NC}"
[ -f "$DB_BACKUP" ] && echo "✓ Database: $DB_BACKUP"
[ -f "$DATA_BACKUP" ] && echo "✓ User files: $DATA_BACKUP"
[ -f "$CUSTOM_BACKUP" ] && echo "✓ Custom files: $CUSTOM_BACKUP"

echo ""
echo -e "${RED}WARNING! This will overwrite existing data!${NC}"
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled by user."
    exit 0
fi

# Stop containers
echo ""
echo "Stopping containers..."
cd "$COMPOSE_DIR" && docker compose down

# Restore database
echo ""
echo "Restoring database..."

# Clear old database
sudo rm -rf "$DATA_DIR/mariadb"
sudo mkdir -p "$DATA_DIR/mariadb"
sudo chown -R 1001:1001 "$DATA_DIR/mariadb"

# Start MariaDB only
cd "$COMPOSE_DIR" && docker compose up -d mariadb
echo "Waiting for MariaDB to start..."
sleep 20

# Restore dump
echo "Importing data into database..."
zcat "$DB_BACKUP" | docker exec -i moodle-stack-mariadb-1 mysql \
  -u root \
  -p'Supersecretpassword123!' \
  bitnami_moodle

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database restored${NC}"
else
    echo -e "${RED}✗ ERROR restoring database!${NC}"
    exit 1
fi

# Restore data files
if [ -f "$DATA_BACKUP" ]; then
    echo ""
    echo "Restoring user files..."
    sudo rm -rf "$DATA_DIR/moodledata"
    sudo mkdir -p "$DATA_DIR"
    sudo tar -xzf "$DATA_BACKUP" -C "$DATA_DIR/"
    sudo chown -R 1001:1001 "$DATA_DIR/moodledata"
    sudo chmod -R 777 "$DATA_DIR/moodledata"
    echo -e "${GREEN}✓ User files restored${NC}"
fi

# Restore custom files
if [ -f "$CUSTOM_BACKUP" ]; then
    echo ""
    echo "Restoring custom files..."
    sudo tar -xzf "$CUSTOM_BACKUP" -C "$DATA_DIR/moodle/"
    sudo chown -R 1001:1001 "$DATA_DIR/moodle"
    echo -e "${GREEN}✓ Custom files restored${NC}"
fi

# Start all containers
echo ""
echo "Starting all containers..."
cd "$COMPOSE_DIR" && docker compose up -d

echo ""
echo -e "${GREEN}=== Restore completed! ===${NC}"
echo "Wait 1-2 minutes for Moodle to fully start."
echo "Check: http://192.168.178.49:8080"
