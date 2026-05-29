import assert from "node:assert/strict";
import { test } from "vitest";
import Fastify from "fastify";
import { registerRoutes } from "../../src/frameworks/webserver/routes/index.js";

function createMockControllers() {
  return {
    health: {
      async check(request, reply) {
        reply.send({ status: "ok" });
      },
    },
    chat: {
      async handleStream(request, reply) {
        reply.send({ done: true });
      },
    },
    history: {
      async get(request, reply) {
        reply.send({ chatId: request.params.chatId });
      },
      async delete(request, reply) {
        reply.send({ cleared: true });
      },
    },
    moodle: {
      async ping(request, reply) {
        reply.send({ moodle: "pong" });
      },
      async getUserCourses(request, reply) {
        reply.send({ userId: request.params.userId });
      },
      async getUser(request, reply) {
        reply.send({ id: request.params.id });
      },
      async debugCache(request, reply) {
        reply.send({ cache: "stats" });
      },
    },
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  const controllers = createMockControllers();
  await registerRoutes(app, controllers);
  return app;
}

test("POST /api/chat-stream with valid body returns 200", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 42, chatId: "abc123" },
  });
  assert.strictEqual(response.statusCode, 200);
  await app.close();
});

test("POST /api/chat-stream without message returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { userId: 42 },
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});

test("POST /api/chat-stream with message over 500 chars returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "x".repeat(501) },
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});

test("POST /api/chat-stream with invalid chatId pattern returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", chatId: "../../etc/passwd" },
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});

test("GET /api/chat-history/:chatId with valid id returns 200", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/chat-history/abc123",
  });
  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.chatId, "abc123");
  await app.close();
});

test("GET /api/chat-history/:chatId with too long id returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: `/api/chat-history/${"x".repeat(65)}`,
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});

test("GET /api/chat-history/:chatId with invalid pattern returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/chat-history/bad<id>",
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});

test("DELETE /api/chat-history/:chatId with invalid pattern returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "DELETE",
    url: "/api/chat-history/bad<id>",
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});

test("GET /moodle/users/:userId/courses with valid integer returns 200", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/moodle/users/42/courses",
  });
  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.userId, 42);
  await app.close();
});

test("GET /moodle/users/:userId/courses with invalid id returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/moodle/users/abc/courses",
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});

test("GET /moodle/user/:id with valid integer returns 200", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/moodle/user/7",
  });
  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.id, 7);
  await app.close();
});

test("GET /moodle/user/:id with invalid id returns 400", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/moodle/user/zero",
  });
  assert.strictEqual(response.statusCode, 400);
  await app.close();
});
