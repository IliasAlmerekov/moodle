# Copilot Instructions

## Project

AI-powered learning assistant embedded in Moodle (school LMS), running with Docker Compose.

**Stack:** Node.js 20 ESM · Fastify 4 · Ollama · Moodle 4.4 REST API · SQLite · Vitest

**Goal:** Production-ready v1.0.0 — task list in `TODO.md`.

---

## Architecture

This project follows **Uncle Bob's Clean Architecture** with 4 layers. Read `ARCHITECTURE_SUMMARY.md` for the full reference.

```
proxy/src/
├── entities/          # Layer 1: pure domain objects (factory functions + Object.freeze)
├── application/       # Layer 2: use cases + repository interfaces
│   ├── repositories/  # IChatRepository, ICourseRepository, ILLMService, ...
│   └── useCases/      # streamChat, searchCourses, getHistory, clearSession
├── adapters/          # Layer 3: HTTP controller factories
│   └── controllers/   # createChatController, createHealthController, ...
├── frameworks/        # Layer 4: concrete implementations
│   ├── moodle/        # moodleClient.js, moodleCache.js
│   ├── llm/           # ollamaClient.js, ollamaQueue.js
│   ├── persistence/   # sqliteChatStore.js, inMemoryChatStore.js
│   └── webserver/     # routes/index.js, server.js
├── middleware/        # inputGuard.js, errorHandler.js, auth.js
├── config/            # env.js (validated config), constants.js
└── app.js             # Composition Root — only file that imports across all layers
```

**Dependency rule:** imports flow inward only — `frameworks → adapters → application → entities`.

---

## Code Rules

| Rule       | Detail                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| Entities   | Factory functions `createX({})` + `Object.freeze`. No classes.             |
| Use cases  | Pure functions. Deps via parameter object. No infra imports.               |
| Controllers| Factory `createXController(deps)`. HTTP logic only, no business logic.     |
| Frameworks | Implement interfaces. No business logic. Retry on external calls.          |
| Imports    | Always `.js` extension. Top-level `await` is OK.                           |
| Async      | `async/await` only. `Promise.all` for parallel. No `.then()` chains.       |
| Errors     | `Object.assign(new Error("msg"), { statusCode: 400 })`. No empty `catch`. |
| Logging    | `request.log` / `app.log` (pino). Never `console.log` in `src/`.          |
| Comments   | Only for non-obvious WHY. No JSDoc except on interface contracts.          |

---

## Key Files

| File                      | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `ARCHITECTURE_SUMMARY.md` | Architecture quick reference                         |
| `TODO.md`                 | Task list toward v1.0.0                              |
| `PROJECT_STATE.md`        | Current phase, blockers, next step                   |
| `DECISIONS.md`            | Accepted/rejected decisions                          |
| `proxy/src/app.js`        | Composition Root — DI wiring                         |
| `compose/docker-compose.yml` | Full infrastructure definition                    |
| `.env.example`            | All environment variables with descriptions          |

---

## Environment Variables

```
MOODLE_URL          http://moodle:8080
PUBLIC_MOODLE_URL   https://www.itech-bs14.de
MOODLE_TOKEN        <webservice token from Moodle admin>
OLLAMA_URL          http://ollama:11434
OLLAMA_MODEL        llama3.2:3b
CORS_ORIGIN         https://www.itech-bs14.de,http://localhost:8080
```

---

## Running

```bash
cd proxy && npm run dev        # Development with auto-restart
npm test                       # Run tests
cd compose && docker compose up -d  # Full stack with Docker
curl http://localhost:3000/health   # Health check
```
