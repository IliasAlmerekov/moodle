# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.0.0] - 2026-05-29

First production-ready release. Full rewrite from a single-file Fastify prototype
to a Clean Architecture application with security hardening, CI/CD, and HTTPS.

### Added

**Architecture**
- Clean Architecture with four layers: `entities → application → adapters → frameworks`
- Composition root (`proxy/src/app.js`) as the single wiring point for all dependencies
- Repository pattern with interface contracts in `application/repositories/`
- Factory-function entities: `ChatMessage`, `ChatSession`, `Course`, `UserProfile`
- Use cases: `streamChat`, `searchCourses`, `getHistory`, `clearSession`
- In-memory repository implementation for tests (`inMemoryChatStore`)

**Features**
- Streaming chat via Server-Sent Events (SSE) on `POST /api/chat-stream`
- Course search integrated into chat context using Moodle REST API
- Persistent chat history backed by SQLite (survives container restarts)
- Moodle course cache with configurable TTL (`CACHE_TTL_COURSES`)
- Ollama concurrency queue with configurable parallelism (`OLLAMA_CONCURRENCY`)
- Health endpoint (`GET /health`) with Moodle and Ollama dependency status
- Admin cache invalidation endpoint (`POST /admin/cache/invalidate`, localhost-only)
- Moodle user profile verification on every request via Moodle REST API
- Chatbot embed iframe served at `/chatbot`

**Infrastructure**
- Docker Compose stack: MariaDB, Moodle, Ollama, Fastify proxy, nginx
- All Docker image versions pinned for reproducible builds
- Ollama model auto-pull on stack start (`ollama-init` service)
- nginx reverse proxy with HTTPS termination (Let's Encrypt via certbot)
- SQLite volume for proxy chat history (`/data/chat.db`)
- `compose/backup-moodle.sh` — timestamped backup of all Moodle data
- `compose/restore-moodle.sh` — restore from backup with safety checks

**CI/CD**
- GitHub Actions deploy workflow (`deploy.yml`) with health-check gate
- Security scanning in CI: `gitleaks` (secret detection) + `npm audit`
- Docker image pinning policy documented in `DECISIONS.md`

**Security**
- Per-IP rate limiting on all endpoints via `@fastify/rate-limit`
- Per-userId rate limiting on `POST /api/chat-stream`
- Input validation with 22 injection patterns (prompt injection, XSS, jailbreak, DAN)
- HTTP security headers via `@fastify/helmet` with tuned Content Security Policy
- System prompt injection protection (payload size + pattern checks)
- Moodle userId verified against Moodle API on every chat request (no local trust)

**Testing**
- Vitest test suite for entities, use cases, middleware, and HTTP routes
- Coverage thresholds: `entities/` ≥ 90%, `application/` ≥ 80%, overall ≥ 70%
- HTTP tests via `app.inject()` (no real server or Docker required)

**Documentation**
- `README.md` — quick start, requirements, troubleshooting, architecture overview
- `ARCHITECTURE.md` — full Clean Architecture spec with code examples
- `docs/setup.md` — operations runbook with five step-by-step procedures
- `DECISIONS.md` — log of accepted/rejected architectural decisions

### Changed

- Proxy restructured from a single `server.mjs` to Clean Architecture (`src/` with 6 layers)
- Config loaded and validated at startup from `proxy/src/config/env.js`; server refuses to start on missing required variables
- Logging switched from `console.log` to pino structured logging (`LOG_LEVEL` configurable)
- Error responses in production return generic messages — no stack traces exposed to clients
- `docker compose up` now requires `--env-file ../.env` for explicit environment loading

### Fixed

- Hardcoded IP addresses removed from frontend (`chatbot.js`), controllers, and embed HTML
- Chat history was lost on proxy restart — now persisted in SQLite
- Ollama requests had no queue limit — now bounded by `OLLAMA_MAX_QUEUE` (returns 503 when full)

### Security

- **CORS** restricted from `"*"` to `CORS_ORIGIN` environment variable (comma-separated origins)
- **Rate limiting** added — was absent entirely; now enforced per IP and per userId
- **Input validation** added — user messages validated for type, length, and injection patterns before reaching any business logic
- **HTTP headers** hardened — `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and a restrictive CSP now sent on all responses
- **No secrets in repository** — gitleaks runs in CI on every push to `main`

### Known Issues

- **Fastify 4.x high-severity advisories (deferred):** `fastify@4.28.1` is flagged with three high-severity CVEs (GHSA-mrq3-vjjr-p77c, GHSA-jx2c-rxcm-jvmq, GHSA-444r-cwp2-x5xf). The only fix is upgrading to Fastify 5, which breaks `@fastify/cors`, `@fastify/helmet`, and other plugins in this codebase. Exploitability is low for this deployment: the `sendWebStream` DoS CVE does not apply (SSE uses `reply.raw`); the X-Forwarded spoofing CVE does not apply (`request.protocol/host` are not used in source). The upgrade is tracked as a dedicated future milestone. See `DECISIONS.md` for full rationale.

---

*Earlier development history (prototype phase, pre-architecture) is available in git log.*
