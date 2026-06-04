# syntax=docker/dockerfile:1
# Base image pinned 2026-05-29
# Reason: reproducible builds, avoid breaking changes from unpinned tag
# See DECISIONS.md "Pin Docker images" for upgrade policy

# --- Build stage: compile native deps (better-sqlite3) with a toolchain that
# --- never ships in the runtime image. ---
FROM node:20.19.1-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm ci --omit=dev

# --- Runtime stage: slim image, no build toolchain, runs as non-root. ---
FROM node:20.19.1-bookworm-slim AS runtime

WORKDIR /app

# curl is required by the container HEALTHCHECK below.
# Also drop the globally-bundled npm/corepack/npx: the app runs via `node` and
# never needs them at runtime, and they ship a vulnerable bundled `tar`
# (CVE-2026-31802). Removing them shrinks the image's attack surface.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production

# Drop root. The `node` user (uid 1000) ships with the base image; the mounted
# /data volume for chat.db must be writable by uid 1000 on the host.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "src/frameworks/webserver/server.js"]
