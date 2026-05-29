#!/usr/bin/env bash
# Obtain the initial Let's Encrypt certificate for the stack.
#
# Run this ONCE BEFORE the first `docker compose up`.
# nginx must NOT be running yet (standalone mode binds to port 80 directly).
#
# Prerequisites:
#   sudo apt install certbot
#   Ports 80 and 443 must be reachable from the internet (check router/firewall).
#
# After running this script, start the full stack:
#   docker compose up -d
#
# Certificate auto-renewal: certbot installs a systemd timer or cron job automatically.
# After renewal, reload nginx:
#   docker compose exec nginx nginx -s reload
# Add to crontab if certbot does not reload nginx automatically:
#   0 3 * * 1 docker compose -f /path/to/compose/docker-compose.yml exec nginx nginx -s reload

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$(dirname "$SCRIPT_DIR")/.env"

# Read domain from .env if available
if [[ -f "$ENV_FILE" ]]; then
  DOMAIN=$(grep -E '^PUBLIC_MOODLE_URL=' "$ENV_FILE" | cut -d'/' -f3 | tr -d '\r' || true)
fi
DOMAIN="${DOMAIN:-www.itech-bs14.de}"

# Read email from .env or prompt
EMAIL=$(grep -E '^CERTBOT_EMAIL=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '\r' || true)
if [[ -z "$EMAIL" ]]; then
  read -rp "Enter your email for Let's Encrypt notifications: " EMAIL
fi

echo "Domain : $DOMAIN"
echo "Email  : $EMAIL"
echo ""

DATA_DIR="$(dirname "$SCRIPT_DIR")/data"

# Create directories for certbot artifacts
mkdir -p "$DATA_DIR/certbot"
mkdir -p "$DATA_DIR/certbot/work"
mkdir -p "$DATA_DIR/certbot/logs"
mkdir -p "$DATA_DIR/certbot-webroot"

# Obtain certificate using standalone mode (nginx must not be running).
# --config-dir puts live/ and archive/ under data/certbot/ — exactly where
# nginx mounts ../data/certbot as /etc/letsencrypt.
sudo certbot certonly \
  --standalone \
  --config-dir "$DATA_DIR/certbot" \
  --work-dir   "$DATA_DIR/certbot/work" \
  --logs-dir   "$DATA_DIR/certbot/logs" \
  --domain "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo ""
echo "Certificate stored in: $DATA_DIR/certbot/live/$DOMAIN/"
echo ""
echo "Next steps:"
echo "  1. cd compose && docker compose up -d"
echo "  2. Verify HTTPS: curl -I https://$DOMAIN/health"
echo ""
echo "To renew manually:"
echo "  sudo certbot renew"
echo "  docker compose exec nginx nginx -s reload"
