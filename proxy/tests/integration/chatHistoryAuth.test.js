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

const SECRET = "history-secret";

function sign(userId, ts, secret = SECRET) {
  return createHmac("sha256", secret).update(`${userId}.${ts}`).digest("hex");
}

async function buildApp() {
  const app = Fastify({ logger: false });
  const controllers = {
    chat: { async handleStream() {} },
    history: {
      async get(request, reply) {
        reply.send({ chatId: request.params.chatId, messages: [] });
      },
      async delete(request, reply) {
        reply.send({ cleared: true });
      },
    },
    moodle: {
      async ping() {},
      async getUserCourses() {},
      async getUser() {},
      async debugCache() {},
    },
    health: { async check() {} },
  };

  await registerRoutes(app, controllers, {
    verifyMoodleUser: createVerifyMoodleUser({ secret: SECRET }),
    verifyChatOwnership: createVerifyChatOwnership(),
    verifyChatStreamOwnership: createVerifyChatStreamOwnership(),
  });
  return app;
}

test("GET /api/chat-history returns 401 without a signed token", async () => {
  const app = await buildApp();

  const response = await app.inject({ method: "GET", url: "/api/chat-history/moodle-42-abc" });

  assert.strictEqual(response.statusCode, 401);
  await app.close();
});

test("GET /api/chat-history returns 200 for the owner's own session", async () => {
  const app = await buildApp();
  const ts = Date.now();

  const response = await app.inject({
    method: "GET",
    url: `/api/chat-history/moodle-42-abc?userId=42&ts=${ts}&sig=${sign(42, ts)}`,
  });

  assert.strictEqual(response.statusCode, 200);
  await app.close();
});

test("GET /api/chat-history returns 403 when reading another user's session", async () => {
  const app = await buildApp();
  const ts = Date.now();

  // Valid token for user 42, but the chatId belongs to user 99 (IDOR attempt).
  const response = await app.inject({
    method: "GET",
    url: `/api/chat-history/moodle-99-abc?userId=42&ts=${ts}&sig=${sign(42, ts)}`,
  });

  assert.strictEqual(response.statusCode, 403);
  const body = JSON.parse(response.body);
  assert.deepStrictEqual(body, { statusCode: 403, error: "Forbidden" });
  await app.close();
});

test("DELETE /api/chat-history returns 403 when deleting another user's session", async () => {
  const app = await buildApp();
  const ts = Date.now();

  const response = await app.inject({
    method: "DELETE",
    url: `/api/chat-history/moodle-99-abc?userId=42&ts=${ts}&sig=${sign(42, ts)}`,
  });

  assert.strictEqual(response.statusCode, 403);
  await app.close();
});

test("DELETE /api/chat-history returns 200 for the owner's own session", async () => {
  const app = await buildApp();
  const ts = Date.now();

  const response = await app.inject({
    method: "DELETE",
    url: `/api/chat-history/moodle-42-abc?userId=42&ts=${ts}&sig=${sign(42, ts)}`,
  });

  assert.strictEqual(response.statusCode, 200);
  await app.close();
});

test("GET /api/chat-history returns 401 when query userId does not match the signature", async () => {
  const app = await buildApp();
  const ts = Date.now();

  // Signature minted for 42 but query claims 99 — verifyMoodleUser rejects first.
  const response = await app.inject({
    method: "GET",
    url: `/api/chat-history/moodle-99-abc?userId=99&ts=${ts}&sig=${sign(42, ts)}`,
  });

  assert.strictEqual(response.statusCode, 401);
  await app.close();
});
