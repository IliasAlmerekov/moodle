#!/bin/bash
# Simple stop script
# Usage: ./stop.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping Moodle stack...${NC}"

cd compose
docker compose down

echo -e "${GREEN}✅ Stack stopped${NC}"
