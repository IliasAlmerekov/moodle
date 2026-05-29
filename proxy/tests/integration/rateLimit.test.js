import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "vitest";
import { resetCounters } from "../../src/middleware/rateLimiter.js";
import { buildChatApp } from "../helpers/chatTestSetup.js";

let app;

beforeEach(() => {
  resetCounters();
});

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

test("POST /api/chat-stream returns 429 after 10 requests from same user", async () => {
  app = await buildChatApp();
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
});

test("POST /api/chat-stream rate limit is per-user", async () => {
  app = await buildChatApp();

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
});
