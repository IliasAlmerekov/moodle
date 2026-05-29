import assert from "node:assert/strict";
import { test, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerRoutes } from "../../src/frameworks/webserver/routes/index.js";
import { resetCounters } from "../../src/middleware/rateLimiter.js";

async function importChatController() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";

  const moduleUrl = new URL("../../src/adapters/controllers/chatController.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

function createMockChatDeps() {
  return {
    chatRepository: {
      async getHistory() { return []; },
      async appendMessage() {},
      async clearSession() {},
    },
    userRepository: {
      async getUserInfo() {
        return { id: 1, firstname: "Test", lastname: "User", email: "test@example.com" };
      },
      async getUserCourses() { return []; },
    },
    courseRepository: {
      async getAllCourses() { return []; },
      async getCourseContents() { return []; },
    },
    llmService: {
      async streamResponse() {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ response: "Hi", done: true })));
            controller.close();
          },
        });
      },
    },
  };
}

async function buildApp() {
  const { createChatController } = await importChatController();
  const app = Fastify({ logger: false });
  const chat = createChatController(createMockChatDeps());
  const controllers = {
    chat,
    history: { async get() {}, async delete() {} },
    moodle: { async ping() {}, async getUserCourses() {}, async getUser() {}, async debugCache() {} },
    health: { async check() {} },
  };
  await registerRoutes(app, controllers);
  return app;
}

beforeEach(() => {
  resetCounters();
});

test("POST /api/chat-stream returns 429 after 10 requests from same user", async () => {
  const app = await buildApp();
  const payload = { message: "Hello", userId: 42 };

  for (let i = 0; i < 10; i++) {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat-stream",
      payload,
    });
    assert.notStrictEqual(response.statusCode, 429, `request ${i + 1} should not be rate limited`);
  }

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload,
  });

  assert.strictEqual(response.statusCode, 429);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.statusCode, 429);
  assert.strictEqual(body.error, "Too Many Requests");
  assert.ok(body.message.includes("Zu viele Anfragen"));

  await app.close();
});

test("POST /api/chat-stream rate limit is per-user", async () => {
  const app = await buildApp();

  for (let i = 0; i < 10; i++) {
    await app.inject({
      method: "POST",
      url: "/api/chat-stream",
      payload: { message: "Hi", userId: 1 },
    });
  }

  const blocked = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hi", userId: 1 },
  });
  assert.strictEqual(blocked.statusCode, 429);

  const allowed = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hi", userId: 2 },
  });
  assert.notStrictEqual(allowed.statusCode, 429);

  await app.close();
});
