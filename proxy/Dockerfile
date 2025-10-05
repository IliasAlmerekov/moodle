# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/server.mjs"]
