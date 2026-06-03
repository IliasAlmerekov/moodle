import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "vitest";
import Fastify from "fastify";
import { registerRoutes } from "../../src/frameworks/webserver/routes/index.js";
import {
  createVerifyMoodleUser,
  createVerifyChatOwnership,
  createVerifyChatStreamOwnership,
} from "../../src/middleware/auth.js";

const SECRET = "integration-secret";

function sign(userId, ts, secret = SECRET) {
  return createHmac("sha256", secret).update(`${userId}.${ts}`).digest("hex");
}

function createMockChatController() {
  return {
    async handleStream() {
      return { done: true };
    },
  };
}

async function buildApp(overrides = {}) {
  const app = Fastify({ logger: false });
  const controllers = {
    chat: createMockChatController(),
    history: { async get() {}, async delete() {} },
    moodle: {
      async ping() {},
      async getUserCourses() {},
      async getUser() {},
      async debugCache() {},
    },
    health: { async check() {} },
  };

  const verifyMoodleUser = overrides.verifyMoodleUser ?? createVerifyMoodleUser({ secret: SECRET });

  await registerRoutes(app, controllers, {
    verifyMoodleUser,
    verifyChatOwnership: createVerifyChatOwnership(),
    verifyChatStreamOwnership: createVerifyChatStreamOwnership(),
  });
  return app;
}

test("POST /api/chat-stream returns 401 when identity is unsigned", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 42 },
  });

  assert.strictEqual(response.statusCode, 401);
  const body = JSON.parse(response.body);
  assert.deepStrictEqual(body, { statusCode: 401, error: "Unauthorized" });

  await app.close();
});

test("POST /api/chat-stream returns 401 when the signature is forged", async () => {
  const app = await buildApp();
  const ts = Date.now();

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 42, ts, sig: sign(42, ts, "wrong-secret") },
  });

  assert.strictEqual(response.statusCode, 401);

  await app.close();
});

test("POST /api/chat-stream returns 401 when userId is swapped for another user", async () => {
  const app = await buildApp();
  const ts = Date.now();

  // Token minted for user 42, request claims user 99 (IDOR attempt).
  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 99, ts, sig: sign(42, ts) },
  });

  assert.strictEqual(response.statusCode, 401);

  await app.close();
});

test("POST /api/chat-stream passes through with a valid signed token", async () => {
  const app = await buildApp();
  const ts = Date.now();

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 42, ts, sig: sign(42, ts) },
  });

  assert.strictEqual(response.statusCode, 200);

  await app.close();
});

test("POST /api/chat-stream returns 403 when chatId belongs to another user", async () => {
  const app = await buildApp();
  const ts = Date.now();

  // Verified as user 42 but supplying a chatId owned by user 99 (cross-user read/write attempt).
  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 42, ts, sig: sign(42, ts), chatId: "moodle-99-abc" },
  });

  assert.strictEqual(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.deepStrictEqual(body, { statusCode: 403, error: "Forbidden" });

  await app.close();
});

test("POST /api/chat-stream passes through with an owned chatId", async () => {
  const app = await buildApp();
  const ts = Date.now();

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 42, ts, sig: sign(42, ts), chatId: "moodle-42-abc" },
  });

  assert.strictEqual(response.statusCode, 200);

  await app.close();
});
