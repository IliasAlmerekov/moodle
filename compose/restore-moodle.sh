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

# --- Safety check: refuse to restore while the stack is running ---------------
# Query by explicit project name (set via `name:` in docker-compose.yml) so the
# check is reliable regardless of the working directory or --env-file used at
# deploy time. Fail CLOSED: if container status cannot be determined, treat it
# as "possibly running" and require explicit confirmation — never silently
# overwrite live data dirs under a running MariaDB.
PROJECT_NAME="moodle-stack"

if RUNNING="$(docker compose -p "$PROJECT_NAME" ps --services --filter status=running 2>/dev/null)"; then
  STATUS_KNOWN=1
else
  STATUS_KNOWN=0
fi

if [[ "$STATUS_KNOWN" -eq 0 ]]; then
  echo "WARNING: could not determine whether the '$PROJECT_NAME' stack is running."
  echo "Restoring over a live data directory will corrupt it."
  read -rp "Are you certain the stack is stopped? Continue anyway? [y/N] " CONFIRM
  if [[ "${CONFIRM,,}" != "y" ]]; then
    echo "Aborted."
    exit 1
  fi
elif [[ -n "$RUNNING" ]]; then
  echo "ERROR: one or more '$PROJECT_NAME' containers are still running:"
  echo "$RUNNING" | sed 's/^/  - /'
  echo "Stop the stack first:"
  echo "  cd compose && docker compose down"
  exit 1
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
