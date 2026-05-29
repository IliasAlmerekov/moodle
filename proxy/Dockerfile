# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/frameworks/webserver/server.js"]
