#!/bin/bash
# Simple startup script with auto-detection
# Usage: ./start.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Moodle stack...${NC}"

# Load .env variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Function to check Ollama availability
check_ollama() {
    curl -s --connect-timeout 2 --max-time 3 "$1/api/tags" > /dev/null 2>&1
    return $?
}

# Auto-detect network
echo -e "${YELLOW}🔍 Detecting network...${NC}"

if check_ollama "$OLLAMA_URL_SCHOOL"; then
    echo -e "${GREEN}✅ School network${NC}"
    export MOODLE_URL="$MOODLE_URL_SCHOOL"
    export OLLAMA_URL="$OLLAMA_URL_SCHOOL"
elif check_ollama "$OLLAMA_URL_HOME"; then
    echo -e "${GREEN}✅ Home network${NC}"
    export MOODLE_URL="$MOODLE_URL_HOME"
    export OLLAMA_URL="$OLLAMA_URL_HOME"
else
    echo -e "${YELLOW}⚠️  Using default: $ACTIVE_ENV${NC}"
    if [ "$ACTIVE_ENV" = "school" ]; then
        export MOODLE_URL="$MOODLE_URL_SCHOOL"
        export OLLAMA_URL="$OLLAMA_URL_SCHOOL"
    else
        export MOODLE_URL="$MOODLE_URL_HOME"
        export OLLAMA_URL="$OLLAMA_URL_HOME"
    fi
fi

echo -e "   Moodle: ${GREEN}$MOODLE_URL${NC}"
echo -e "   Ollama: ${GREEN}$OLLAMA_URL${NC}"
echo ""

# Start containers
cd compose
echo -e "${YELLOW}Starting containers...${NC}"
MOODLE_URL=$MOODLE_URL OLLAMA_URL=$OLLAMA_URL docker compose up -d

sleep 2

echo ""
echo -e "${GREEN}✅ Stack started!${NC}"
docker compose ps
