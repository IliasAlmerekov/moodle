# Moodle AI Chatbot

> AI-powered learning assistant embedded in Moodle — students ask questions in natural language, the chatbot searches the course catalogue and answers using a local LLM. No data leaves the school server.

![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-4-000000?logo=fastify&logoColor=white)
![Ollama](https://img.shields.io/badge/LLM-Ollama-black)
![Moodle](https://img.shields.io/badge/Moodle-4.4-F98012?logo=moodle&logoColor=white)

---

## Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Related Docs](#related-docs)

---

## Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| OS | Linux x86_64 | WSL2 also works |
| Docker | 24+ | Compose plugin required |
| Node.js | 20 LTS | Local development only |
| Disk | ≥ 10 GB free | Moodle + LLM model |

---

## Quick Start

**1. Clone and configure**
```bash
git clone <repo-url> && cd raspi
cp .env.example .env
# Edit .env — set MOODLE_TOKEN, passwords, CORS_ORIGIN
```

**2. Start all services**
```bash
cd compose && docker compose --env-file ../.env up -d
```

**3. Pull the LLM model** (once, ~2 GB for the default local model)
```bash
docker exec -it ollama ollama pull llama3.2:3b
```

For Ollama Cloud models such as `gpt-oss:120b-cloud`, sign in inside the Ollama
container first, then pull the cloud model marker:

```bash
docker exec -it ollama ollama signin
docker exec ollama ollama pull gpt-oss:120b-cloud
```

**4. Get the Moodle webservice token**
- Open `http://localhost:8080` and log in as `admin`
- Navigate to: *Site administration → Plugins → Web services → Manage tokens*
- Create a token for the `moodle_mobile_app` service
- Add it to `.env` as `MOODLE_TOKEN=<token>`, then:
  ```bash
  docker compose restart proxy
  ```

**5. Verify**
```bash
curl http://localhost:3000/health
# {"status":"ok","uptime":...}
```

The chatbot iframe is served at `http://localhost:3000/chatbot`.

---

## Environment Variables

All variables with descriptions are in [`.env.example`](.env.example). Copy it to `.env` and fill in the secrets — never commit `.env`.

| Variable | Example | Purpose | Where to get |
|----------|---------|---------|--------------|
| `MOODLE_TOKEN` | `abc123...` | Moodle webservice token | Moodle admin → Web services → Tokens |
| `MOODLE_URL` | `http://moodle:8080` | Internal Moodle URL (Docker network) | Fixed — do not change |
| `PUBLIC_MOODLE_URL` | `https://www.itech-bs14.de` | Public URL shown in course links | Your domain |
| `OLLAMA_MODEL` | `llama3.2:3b` | LLM model name | Must be pulled first |
| `CORS_ORIGIN` | `http://localhost:8080` | Comma-separated allowed origins | Your Moodle URL |
| `CHAT_DB_PATH` | `/data/chat.db` | SQLite path for chat history | Docker volume `/data` |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat-stream` | Streaming chat response (SSE) |
| `POST` | `/api/chat` | Single-turn chat response |
| `GET` | `/health` | Liveness check with dependency status |
| `GET` | `/ollama/models` | List available Ollama models |

---

## Architecture

The proxy follows **Clean Architecture** with four layers. Dependencies flow inward only:

```
frameworks → adapters → application → entities
```

```
proxy/src/
├── entities/          # Pure domain factories (ChatMessage, Course, UserProfile)
├── application/       # Use cases + repository interfaces (no infra imports)
├── adapters/          # HTTP controller factories (Fastify-specific code lives here)
├── frameworks/        # Concrete implementations (Moodle, Ollama, SQLite, Fastify)
├── middleware/        # inputGuard, errorHandler, auth, rate limiting
├── config/            # env.js (validated config), constants.js
└── app.js             # Composition Root — only file that wires all layers
```

### Key Files

| Path | Purpose |
|------|---------|
| `proxy/src/app.js` | Composition Root — start here to understand DI wiring |
| `proxy/src/config/env.js` | Validated config (fails fast on missing vars) |
| `proxy/src/middleware/inputGuard.js` | Security input validation |
| `proxy/src/application/useCases/chat/streamChat.js` | Core chat logic |
| `compose/docker-compose.yml` | Full infrastructure definition |
| `.env.example` | All environment variables with descriptions |

Full architecture specification: [`ARCHITECTURE.md`](ARCHITECTURE.md)  
Quick agent reference: [`ARCHITECTURE_SUMMARY.md`](ARCHITECTURE_SUMMARY.md)

---

## Development

```bash
# Install dependencies
cd proxy && npm install

# Run in development mode (auto-restart on change)
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint
```

Coverage targets: `entities/` ≥ 90% · `application/` ≥ 80% · overall ≥ 70%

---

## Troubleshooting

### 1. Proxy container exits immediately

**Symptom:** Container stops right after `docker compose up`, logs show:
```
Error: Missing required env var: MOODLE_TOKEN
```
**Cause:** `.env` file is missing or a required variable is not set.  
**Fix:** Copy `.env.example` to `.env` and fill in all required values. The proxy fails fast on missing config by design.

---

### 2. Chat returns "Moodle API error" or empty course list

**Symptom:** Every question returns an error or "no courses found".  
**Cause:** `MOODLE_TOKEN` is missing, expired, or lacks the correct service permissions.  
**Fix:**
1. Log in to Moodle → *Site administration → Plugins → Web services → Manage tokens*
2. Create or regenerate a token for the `moodle_mobile_app` service
3. Set `MOODLE_TOKEN=<token>` in `.env`
4. `docker compose restart proxy`

---

### 3. Chat hangs or returns no answer

**Symptom:** SSE connection opens but no tokens stream back; request times out.  
**Cause:** Ollama is running but the model has not been pulled yet.  
**Fix:**
```bash
# Pull the model
docker exec -it ollama ollama pull llama3.2:3b

# Or verify which models are available
curl http://localhost:11434/api/tags
```

---

### 4. Browser shows CORS error

**Symptom:** DevTools shows:
```
Access to fetch at '...' has been blocked by CORS policy
```
**Cause:** The origin of the Moodle page is not listed in `CORS_ORIGIN`.  
**Fix:** Add the embedding page's origin to `.env`:
```
CORS_ORIGIN=http://localhost:8080,https://www.itech-bs14.de
```
Then `docker compose restart proxy`.

---

### 5. Too many requests — 429 response

**Symptom:** After several messages the chatbot returns HTTP 429.  
**Cause:** The rate limiter enforces `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW` per IP (default: 20/minute). This is intentional in production.  
**Fix for development:**
```bash
# In .env
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
```
Restart proxy after changing `.env`.

---

## Related Docs

| Document | Purpose |
|----------|---------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Full Clean Architecture spec with code examples |
| [`ARCHITECTURE_SUMMARY.md`](ARCHITECTURE_SUMMARY.md) | Quick layer reference for agents |
| [`docs/setup.md`](docs/setup.md) | Setup procedures: SSL, token, model swap, backup |
| [`.env.example`](.env.example) | All environment variables with inline comments |
| [`TODO.md`](TODO.md) | Task list toward v1.0.0 |
