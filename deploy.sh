#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Deploy started at $(date) ===${NC}"

PROJECT_DIR="/home/admin/moodle"
cd "$PROJECT_DIR"

# === FIX PERMISSIONS (if needed) ===
if [ ! -w .git/objects ]; then
    echo -e "${YELLOW}Fixing git permissions...${NC}"
    sudo chown -R $(whoami):$(whoami) "$PROJECT_DIR"
    sudo chmod -R u+rwX "$PROJECT_DIR/.git"
fi

# === GIT UPDATE ===
echo -e "${YELLOW}Fetching from GitHub...${NC}"
git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${YELLOW}No changes detected. Skipping git pull.${NC}"
else
    echo -e "${YELLOW}Changes detected!${NC}"
    echo -e "  Current: ${LOCAL:0:7}"
    echo -e "  New:     ${REMOTE:0:7}"
    
    if [ -f .env ]; then
        echo -e "${YELLOW}Preserving .env file...${NC}"
        cp .env /tmp/.env.deploy.backup
    fi

    # Never silently discard local work (DEP-05): refuse to update when the
    # working tree has uncommitted changes to tracked files, and fast-forward
    # only — a diverged history aborts the deploy instead of being overwritten.
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo -e "${RED}✗ Uncommitted changes to tracked files. Commit or stash them before deploying.${NC}"
        git status --short
        exit 1
    fi

    echo -e "${YELLOW}Updating code from origin/main (fast-forward only)...${NC}"
    if ! git merge --ff-only origin/main; then
        echo -e "${RED}✗ Local history has diverged from origin/main. Resolve manually; not overwriting.${NC}"
        exit 1
    fi

    if [ -f /tmp/.env.deploy.backup ]; then
        echo -e "${YELLOW}Restoring .env file...${NC}"
        cp /tmp/.env.deploy.backup .env
        rm /tmp/.env.deploy.backup
    fi
fi


echo -e "${YELLOW}Latest commit:${NC}"
git log -1 --pretty=format:"%h - %s (%an)" && echo

PROXY_CHANGED=false
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "^proxy/"; then
    PROXY_CHANGED=true
fi

# === DOCKER DEPLOYMENT ===
cd compose

# Use absolute path for .env file
ENV_FILE="$PROJECT_DIR/.env"

if docker compose ps | grep -q "Up"; then
    echo -e "${YELLOW}Stopping containers...${NC}"
    docker compose --env-file "$ENV_FILE" down
fi

if [ "$PROXY_CHANGED" = true ]; then
    echo -e "${YELLOW}Proxy code changed. Rebuilding...${NC}"
    docker compose --env-file "$ENV_FILE" build proxy
else
    echo -e "${YELLOW}No proxy changes detected. Skipping rebuild.${NC}"
fi

echo -e "${YELLOW}Ensuring data directory exists...${NC}"
mkdir -p data

echo -e "${YELLOW}Starting containers...${NC}"
docker compose --env-file "$ENV_FILE" up -d

sleep 3

echo -e "${YELLOW}Container status:${NC}"
docker compose ps

echo -e "${YELLOW}Checking services health...${NC}"
sleep 2
# Proxy port 3000 is internal-only (behind nginx). Use exec to reach it directly.
if docker compose --env-file "$ENV_FILE" exec -T proxy curl -sf http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✓ Proxy is healthy!${NC}"
    echo -e "${YELLOW}Invalidating course cache...${NC}"
    if docker compose --env-file "$ENV_FILE" exec -T proxy curl -sf -X POST http://localhost:3000/admin/cache/invalidate > /dev/null; then
        echo -e "${GREEN}✓ Course cache invalidated${NC}"
    else
        echo -e "${YELLOW}⚠ Cache invalidation failed (non-fatal)${NC}"
    fi
else
    echo -e "${RED}✗ Proxy health check failed!${NC}"
fi

echo -e "${GREEN}=== Deploy completed successfully at $(date) ===${NC}"
