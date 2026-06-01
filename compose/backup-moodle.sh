#!/usr/bin/env bash
# Create a timestamped .tar.gz backup of all Moodle stack data.
#
# Usage:
#   ./backup-moodle.sh [output-directory]
#
# Default output directory: project root (one level up from compose/).
#
# What is backed up:
#   data/mariadb/    - MariaDB database files
#   data/moodle/     - Moodle application files
#   data/moodledata/ - Moodle user uploads and course data
#   data/chat.db     - Proxy chat history (SQLite)
#
# SSL certificates (data/certbot/) are NOT included — they can be
# re-issued for free via setup-ssl.sh.
#
# The stack can remain running during backup; MariaDB file-level backup
# is safe when MySQL is idle. For high-traffic production use, consider
# mysqldump instead.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"
OUTPUT_DIR="${1:-$PROJECT_ROOT}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="$OUTPUT_DIR/moodle-backup-$TIMESTAMP.tar.gz"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "Error: data directory not found at $DATA_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Starting backup..."
echo "  Source : $DATA_DIR"
echo "  Archive: $ARCHIVE"
echo ""

tar -czf "$ARCHIVE" \
  --exclude="$DATA_DIR/certbot" \
  --exclude="$DATA_DIR/certbot-webroot" \
  -C "$PROJECT_ROOT" data

SIZE=$(du -sh "$ARCHIVE" | cut -f1)
echo "Backup complete: $ARCHIVE ($SIZE)"
