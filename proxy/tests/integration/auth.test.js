import assert from "node:assert/strict";
import { test } from "vitest";
import Fastify from "fastify";
import { registerRoutes } from "../../src/frameworks/webserver/routes/index.js";
import { createVerifyMoodleUser } from "../../src/middleware/auth.js";

function createMockChatController() {
  return {
    async handleStream() {
      return { done: true };
    },
  };
}

function createMockUserRepository(overrides = {}) {
  return {
    async getUserInfo(userId) {
      if (overrides.getUserInfo) {
        return overrides.getUserInfo(userId);
      }
      return { id: userId, firstname: "Test", lastname: "User", email: "test@example.com" };
    },
  };
}

async function buildApp(overrides = {}) {
  const app = Fastify({ logger: false });
  const chat = createMockChatController();
  const controllers = {
    chat,
    history: { async get() {}, async delete() {} },
    moodle: { async ping() {}, async getUserCourses() {}, async getUser() {}, async debugCache() {} },
    health: { async check() {} },
  };

  const verifyMoodleUser = overrides.verifyMoodleUser
    ?? createVerifyMoodleUser({ userRepository: createMockUserRepository() });

  await registerRoutes(app, controllers, { verifyMoodleUser });
  return app;
}

test("POST /api/chat-stream returns 401 when userId is missing", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello" },
  });

  assert.strictEqual(response.statusCode, 401);
  const body = JSON.parse(response.body);
  assert.deepStrictEqual(body, { statusCode: 401, error: "Unauthorized" });

  await app.close();
});

test("POST /api/chat-stream returns 401 when userId is 0", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 0 },
  });

  assert.strictEqual(response.statusCode, 401);

  await app.close();
});

test("POST /api/chat-stream returns 401 when user does not exist in Moodle", async () => {
  const app = await buildApp({
    verifyMoodleUser: createVerifyMoodleUser({
      userRepository: createMockUserRepository({
        getUserInfo: () => null,
      }),
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 99 },
  });

  assert.strictEqual(response.statusCode, 401);
  const body = JSON.parse(response.body);
  assert.deepStrictEqual(body, { statusCode: 401, error: "Unauthorized" });

  await app.close();
});

test("POST /api/chat-stream passes through when user exists", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/chat-stream",
    payload: { message: "Hello", userId: 42 },
  });

  assert.strictEqual(response.statusCode, 200);

  await app.close();
});
