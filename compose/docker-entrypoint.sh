#!/bin/bash
set -e

# Fix permissions on moodledata so www-data can write everywhere
chown -R www-data:www-data /bitnami/moodledata 2>/dev/null || true

# Ensure request tmp dir exists and is writable
mkdir -p /tmp/requestdir
chown www-data:www-data /tmp/requestdir
chmod 777 /tmp/requestdir

exec "$@"
