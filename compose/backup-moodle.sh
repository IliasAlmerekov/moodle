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
#   data/chat.db     - Proxy chat history (SQLite, WAL mode)
#
# SSL certificates (data/certbot/) are NOT included — they can be
# re-issued for free via setup-ssl.sh.
#
# chat.db is captured via a consistent SQLite online snapshot (requires the
# sqlite3 CLI), so the proxy may keep running. The MariaDB data directory is
# still copied at the file level: that is safe when MySQL is idle, but for a
# fully consistent backup under load stop the stack first (docker compose down)
# or dump MariaDB with mysqldump.

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

# chat.db runs in WAL mode (see proxy/src/frameworks/persistence/sqliteChatStore.js).
# A live file-level tar can capture a torn write or miss the -wal/-shm sidecars,
# yielding a corrupt or stale copy. Take a consistent online snapshot with the
# SQLite backup API and substitute it into the archive for the live files.
CHAT_DB="$DATA_DIR/chat.db"
TAR="${ARCHIVE%.gz}" # uncompressed intermediate; gzip'd to $ARCHIVE at the end
SNAPSHOT_DIR=""
trap 'rm -rf "${SNAPSHOT_DIR:-}" "${TAR:-}"' EXIT

CHAT_TAR_ARGS=()
if [[ -f "$CHAT_DB" ]]; then
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "Error: sqlite3 is required for a consistent chat.db backup." >&2
    echo "Install it (e.g. 'apt-get install sqlite3') or stop the proxy before backing up." >&2
    exit 1
  fi
  SNAPSHOT_DIR="$(mktemp -d)"
  mkdir -p "$SNAPSHOT_DIR/data"
  sqlite3 "$CHAT_DB" ".backup '$SNAPSHOT_DIR/data/chat.db'"
  CHAT_TAR_ARGS=(-C "$SNAPSHOT_DIR" data/chat.db)
fi

echo "Starting backup..."
echo "  Source : $DATA_DIR"
echo "  Archive: $ARCHIVE"
echo ""

# Step 1: archive everything except SSL material and the live chat.db files.
# tar's --exclude is global, so it would also drop the snapshot if added here.
tar -cf "$TAR" \
  --exclude='data/certbot' \
  --exclude='data/certbot-webroot' \
  --exclude='data/chat.db' \
  --exclude='data/chat.db-wal' \
  --exclude='data/chat.db-shm' \
  -C "$PROJECT_ROOT" data

# Step 2: append the consistent snapshot as data/chat.db (no --exclude in scope).
if [[ ${#CHAT_TAR_ARGS[@]} -gt 0 ]]; then
  tar -rf "$TAR" "${CHAT_TAR_ARGS[@]}"
fi

gzip -f "$TAR" # produces $TAR.gz == $ARCHIVE

SIZE=$(du -sh "$ARCHIVE" | cut -f1)
echo "Backup complete: $ARCHIVE ($SIZE)"
