#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Deploy started at $(date) ===${NC}"

PROJECT_DIR="/home/admin/moodle"
cd "$PROJECT_DIR"

# === AUTO-DETECT NETWORK ===
echo -e "${YELLOW}🔍 Auto-detecting network...${NC}"

# Load .env variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
fi

# Function to check Ollama availability
check_ollama() {
    curl -s --connect-timeout 2 --max-time 3 "$1/api/tags" > /dev/null 2>&1
    return $?
}

# Auto-detect which network is available
if check_ollama "$OLLAMA_URL_SCHOOL"; then
    echo -e "${GREEN}✅ School network detected${NC}"
    export MOODLE_URL="$MOODLE_URL_SCHOOL"
    export OLLAMA_URL="$OLLAMA_URL_SCHOOL"
    DETECTED_ENV="school"
elif check_ollama "$OLLAMA_URL_HOME"; then
    echo -e "${GREEN}✅ Home network detected${NC}"
    export MOODLE_URL="$MOODLE_URL_HOME"
    export OLLAMA_URL="$OLLAMA_URL_HOME"
    DETECTED_ENV="home"
else
    echo -e "${RED}⚠️  Cannot reach Ollama, using default from .env: $ACTIVE_ENV${NC}"
    if [ "$ACTIVE_ENV" = "school" ]; then
        export MOODLE_URL="$MOODLE_URL_SCHOOL"
        export OLLAMA_URL="$OLLAMA_URL_SCHOOL"
    else
        export MOODLE_URL="$MOODLE_URL_HOME"
        export OLLAMA_URL="$OLLAMA_URL_HOME"
    fi
    DETECTED_ENV="$ACTIVE_ENV"
fi

echo -e "   Environment: ${GREEN}$DETECTED_ENV${NC}"
echo -e "   Moodle: ${GREEN}$MOODLE_URL${NC}"
echo -e "   Ollama: ${GREEN}$OLLAMA_URL${NC}"

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

    echo -e "${YELLOW}Updating code from origin/main...${NC}"
    git reset --hard origin/main

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

if docker compose ps | grep -q "Up"; then
    echo -e "${YELLOW}Stopping containers...${NC}"
    docker compose down
fi

if [ "$PROXY_CHANGED" = true ]; then
    echo -e "${YELLOW}Proxy code changed. Rebuilding...${NC}"
    docker compose build proxy
else
    echo -e "${YELLOW}No proxy changes detected. Skipping rebuild.${NC}"
fi

echo -e "${YELLOW}Starting containers with detected environment...${NC}"
# Pass detected URLs as environment variables to docker-compose
MOODLE_URL=$MOODLE_URL OLLAMA_URL=$OLLAMA_URL docker compose up -d

sleep 3

echo -e "${YELLOW}Container status:${NC}"
docker compose ps

echo -e "${YELLOW}Checking services health...${NC}"
sleep 2
if curl -sf http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✓ Proxy is healthy!${NC}"
else
    echo -e "${RED}✗ Proxy health check failed!${NC}"
fi

echo -e "${GREEN}=== Deploy completed successfully at $(date) ===${NC}"
