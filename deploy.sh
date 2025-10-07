#!/bin/bash
set -euo pipefail


GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Deploy started at $(date) ===${NC}"


PROJECT_DIR="/home/admin/moodle"
cd "$PROJECT_DIR"


echo -e "${YELLOW}Backing up configuration files...${NC}"
cp -n .env .env.backup 2>/dev/null || true


echo -e "${YELLOW}Fetching from GitHub...${NC}"
git fetch origin main


LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${YELLOW}No changes detected. Skipping deploy.${NC}"
    exit 0
fi

echo -e "${YELLOW}Changes detected!${NC}"
echo -e "  Current: ${LOCAL:0:7}"
echo -e "  New:     ${REMOTE:0:7}"


if [ -f .env ]; then
    echo -e "${YELLOW}Preserving .env file...${NC}"
    cp .env /tmp/.env.deploy.backup
fi

echo -e "${YELLOW}Updating code from origin/main...${NC}"
git reset --hard origin/main

if [ -f /tmp/.env.deploy.backup ]; then
    echo -e "${YELLOW}Restoring .env file...${NC}"
    cp /tmp/.env.deploy.backup .env
    rm /tmp/.env.deploy.backup
fi

echo -e "${YELLOW}Latest commit:${NC}"
git log -1 --pretty=format:"%h - %s (%an)" && echo

PROXY_CHANGED=false
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "^proxy/"; then
    PROXY_CHANGED=true
fi

cd compose

if docker compose --env-file ../.env ps | grep -q "Up"; then
    echo -e "${YELLOW}Stopping containers...${NC}"
    docker compose --env-file ../.env down
fi

if [ "$PROXY_CHANGED" = true ]; then
    echo -e "${YELLOW}Proxy code changed. Rebuilding...${NC}"
    docker compose --env-file ../.env build proxy
else
    echo -e "${YELLOW}No proxy changes detected. Skipping rebuild.${NC}"
fi

echo -e "${YELLOW}Starting containers...${NC}"
docker compose --env-file ../.env up -d

sleep 3

echo -e "${YELLOW}Container status:${NC}"
docker compose --env-file ../.env ps

echo -e "${YELLOW}Checking services health...${NC}"
sleep 2
if curl -sf http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✓ Proxy is healthy!${NC}"
else
    echo -e "${RED}✗ Proxy health check failed!${NC}"
fi

# Copy chatbot files to Moodle
echo -e "${YELLOW}Copying chatbot files to Moodle...${NC}"
MOODLE_CHATBOT_DIR="/var/www/html/local/aichatbot"
if [ ! -d "$MOODLE_CHATBOT_DIR" ]; then
    mkdir -p "$MOODLE_CHATBOT_DIR"
    echo -e "${YELLOW}Created directory: $MOODLE_CHATBOT_DIR${NC}"
fi

cp -r proxy/public/chatbot/* "$MOODLE_CHATBOT_DIR/"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Chatbot files copied to Moodle${NC}"
else
    echo -e "${RED}✗ Failed to copy chatbot files${NC}"
fi

echo -e "${GREEN}=== Deploy completed successfully at $(date) ===${NC}"
