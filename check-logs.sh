#!/bin/bash
# Quick script to check logs and status on Raspberry Pi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Checking Moodle Stack Status ===${NC}\n"

cd /home/admin/moodle/compose

# Check if .env exists
echo -e "${YELLOW}1. Checking .env file:${NC}"
if [ -f ../.env ]; then
    echo -e "${GREEN}✓ .env exists${NC}"
    echo "Size: $(wc -l < ../.env) lines"
else
    echo -e "${RED}✗ .env NOT FOUND!${NC}"
fi

echo ""

# Check Docker containers
echo -e "${YELLOW}2. Docker containers status:${NC}"
docker compose ps

echo ""

# Check if services are responding
echo -e "${YELLOW}3. Services health:${NC}"

# Proxy
if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Proxy (port 3000): OK${NC}"
else
    echo -e "${RED}✗ Proxy (port 3000): FAILED${NC}"
fi

# Moodle
if curl -sf http://localhost:8080 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Moodle (port 8080): OK${NC}"
else
    echo -e "${RED}✗ Moodle (port 8080): FAILED${NC}"
fi

echo ""

# Show recent logs
echo -e "${YELLOW}4. Recent logs from proxy:${NC}"
docker compose logs proxy --tail 10

echo ""
echo -e "${YELLOW}5. Recent logs from moodle:${NC}"
docker compose logs moodle --tail 10

echo ""
echo -e "${GREEN}=== Check completed ===${NC}"
echo ""
echo "Commands for more details:"
echo "  docker compose logs proxy -f      # Follow proxy logs"
echo "  docker compose logs moodle -f     # Follow moodle logs"
echo "  docker compose logs mariadb -f    # Follow database logs"
echo "  docker compose restart proxy      # Restart proxy"
echo "  docker compose restart moodle     # Restart moodle"
