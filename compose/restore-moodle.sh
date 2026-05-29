#!/usr/bin/env bash
# Restore Moodle stack data from a backup archive created by backup-moodle.sh.
#
# Usage:
#   ./restore-moodle.sh <backup-file.tar.gz>
#
# IMPORTANT: the stack MUST be stopped before running this script.
#   cd compose && docker compose down
#
# After restore, restart the stack:
#   docker compose up -d

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# --- Argument validation -------------------------------------------------------

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-file.tar.gz>" >&2
  exit 1
fi

ARCHIVE="$1"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Error: archive not found: $ARCHIVE" >&2
  exit 1
fi

# --- Safety check: warn if any stack container is running ---------------------

if docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps --services --filter status=running 2>/dev/null | grep -q .; then
  echo "WARNING: one or more stack containers are still running."
  echo "Stop the stack first:"
  echo "  cd compose && docker compose down"
  echo ""
  read -rp "Continue anyway? [y/N] " CONFIRM
  if [[ "${CONFIRM,,}" != "y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# --- Restore ------------------------------------------------------------------

echo "Restoring from: $ARCHIVE"
echo "  Target: $PROJECT_ROOT/data/"
echo ""

# Preserve SSL certificates — extract everything except certbot directories
tar -xzf "$ARCHIVE" \
  --exclude="data/certbot" \
  --exclude="data/certbot-webroot" \
  -C "$PROJECT_ROOT"

# Fix MariaDB data ownership (Bitnami image expects UID/GID 1001)
if [[ -d "$PROJECT_ROOT/data/mariadb" ]]; then
  sudo chown -R 1001:1001 "$PROJECT_ROOT/data/mariadb"
fi

echo ""
echo "Restore complete."
echo ""
echo "Next steps:"
echo "  1. cd compose && docker compose up -d"
echo "  2. Wait ~60 seconds for MariaDB to start"
echo "  3. Verify: curl http://localhost:3000/health"
