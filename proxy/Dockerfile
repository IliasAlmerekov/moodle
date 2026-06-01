# syntax=docker/dockerfile:1
# Base image pinned 2026-05-29
# Reason: reproducible builds, avoid breaking changes from unpinned tag
# See DECISIONS.md "Pin Docker images" for upgrade policy
FROM node:20.19.1-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/frameworks/webserver/server.js"]
