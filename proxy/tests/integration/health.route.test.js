import assert from "node:assert/strict";
import { test, afterEach } from "vitest";
import Fastify from "fastify";
import { registerRoutes } from "../../src/frameworks/webserver/routes/index.js";
import { createHealthController } from "../../src/adapters/controllers/healthController.js";

function createMockHealthDeps(overrides = {}) {
  return {
    courseRepository: {
      async getAllCourses() {
        if (overrides.moodleFail) throw new Error("Moodle down");
        return [{ id: 1, name: "LF07" }];
      },
    },
    llmService: {
      async listModels() {
        if (overrides.ollamaFail) throw new Error("Ollama down");
        return ["llama3.2:3b"];
      },
    },
    getCacheStats: () => ({ hits: 10, misses: 2 }),
    getQueueMetrics: () => ({ size: 0, pending: 0 }),
    version: "1.0.0-test",
    getUptime: () => 123,
  };
}

let app;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

async function buildApp(overrides = {}) {
  const appInstance = Fastify({ logger: false });
  const health = createHealthController(createMockHealthDeps(overrides));
  const controllers = {
    chat: { async handleStream() {} },
    history: { async get() {}, async delete() {} },
    moodle: {
      async ping() {},
      async getUserCourses() {},
      async getUser() {},
      async debugCache() {},
    },
    health,
  };
  await registerRoutes(appInstance, controllers, { allowUnauthenticated: true });
  return appInstance;
}

test("GET /health returns 200 with correct structure", async () => {
  app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.status, "ok");
  assert.strictEqual(body.version, "1.0.0-test");
  assert.strictEqual(body.uptime, 123);
  assert.strictEqual(body.services.moodle, "ok");
  assert.strictEqual(body.services.ollama, "ok");
  assert.ok(body.timestamp);
  assert.deepStrictEqual(body.cache, { hits: 10, misses: 2 });
  assert.deepStrictEqual(body.queue, { size: 0, pending: 0 });
});

test("GET /health returns 503 when Moodle is unavailable", async () => {
  app = await buildApp({ moodleFail: true });
  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.strictEqual(response.statusCode, 503);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.status, "degraded");
  assert.strictEqual(body.services.moodle, "error");
  assert.strictEqual(body.services.ollama, "ok");
});

test("GET /health returns 503 when Ollama is unavailable", async () => {
  app = await buildApp({ ollamaFail: true });
  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.strictEqual(response.statusCode, 503);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.status, "degraded");
  assert.strictEqual(body.services.moodle, "ok");
  assert.strictEqual(body.services.ollama, "error");
});
