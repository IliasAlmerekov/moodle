import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "vitest";
import { createVerifyMoodleUser, createVerifyChatOwnership } from "../../../src/middleware/auth.js";

const SECRET = "test-secret";

function sign(userId, ts, secret = SECRET) {
  return createHmac("sha256", secret).update(`${userId}.${ts}`).digest("hex");
}

function createMockReply() {
  const calls = [];
  return {
    status(code) {
      calls.push({ method: "status", code });
      return this;
    },
    send(body) {
      calls.push({ method: "send", body });
      return this;
    },
    _calls: calls,
  };
}

function createMockRequest(overrides = {}) {
  return {
    body: overrides.body ?? {},
    log: overrides.log ?? { warn() {} },
    ip: overrides.ip ?? "127.0.0.1",
  };
}

test("allows request with a valid, fresh signature and exposes verifiedUserId", async () => {
  const now = () => 1000;
  const verify = createVerifyMoodleUser({ secret: SECRET, now });
  const ts = 1000;
  const request = createMockRequest({ body: { userId: 42, ts, sig: sign(42, ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls.length, 0);
  assert.strictEqual(request.verifiedUserId, 42);
});

test("returns 401 when userId is missing", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET });
  const request = createMockRequest({ body: { message: "Hello" } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
  assert.deepStrictEqual(reply._calls[1].body, { statusCode: 401, error: "Unauthorized" });
  assert.strictEqual(request.verifiedUserId, undefined);
});

test("returns 401 when userId is 0", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET });
  const ts = Date.now();
  const request = createMockRequest({ body: { userId: 0, ts, sig: sign(0, ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when userId is negative", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET });
  const ts = Date.now();
  const request = createMockRequest({ body: { userId: -1, ts, sig: sign(-1, ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when userId is not an integer", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET });
  const ts = Date.now();
  const request = createMockRequest({ body: { userId: "abc", ts, sig: sign("abc", ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when signature is missing", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET });
  const request = createMockRequest({ body: { userId: 42, ts: Date.now() } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when timestamp is missing", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET });
  const request = createMockRequest({ body: { userId: 42, sig: "deadbeef" } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when the signature is wrong", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET, now: () => 1000 });
  const ts = 1000;
  const request = createMockRequest({
    body: { userId: 42, ts, sig: sign(42, ts, "wrong-secret") },
  });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
  assert.strictEqual(request.verifiedUserId, undefined);
});

test("returns 401 when userId is tampered (signature does not match)", async () => {
  const verify = createVerifyMoodleUser({ secret: SECRET, now: () => 1000 });
  const ts = 1000;
  // Signature was minted for user 42, but the body claims user 99.
  const request = createMockRequest({ body: { userId: 99, ts, sig: sign(42, ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when the token is expired", async () => {
  const ts = 1000;
  const verify = createVerifyMoodleUser({ secret: SECRET, tokenTtlMs: 5000, now: () => 7000 });
  const request = createMockRequest({ body: { userId: 42, ts, sig: sign(42, ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("accepts a token at the edge of the freshness window", async () => {
  const ts = 1000;
  const verify = createVerifyMoodleUser({ secret: SECRET, tokenTtlMs: 5000, now: () => 6000 });
  const request = createMockRequest({ body: { userId: 42, ts, sig: sign(42, ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls.length, 0);
  assert.strictEqual(request.verifiedUserId, 42);
});

test("returns 401 when no secret is configured", async () => {
  const verify = createVerifyMoodleUser({ secret: "", now: () => 1000 });
  const ts = 1000;
  const request = createMockRequest({ body: { userId: 42, ts, sig: sign(42, ts) } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("logs security warning on failure without leaking details", async () => {
  const warnings = [];
  const verify = createVerifyMoodleUser({ secret: SECRET, now: () => 1000 });
  const ts = 1000;
  const request = createMockRequest({
    body: { userId: 5, ts, sig: "00" },
    log: {
      warn(meta, msg) {
        warnings.push({ meta, msg });
      },
    },
  });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].meta.security, true);
  assert.strictEqual(warnings[0].meta.type, "auth_failure");
  assert.strictEqual(warnings[0].meta.userId, 5);
  assert.deepStrictEqual(reply._calls[1].body, { statusCode: 401, error: "Unauthorized" });
  assert.ok(!reply._calls[1].body.message);
});

test("ownership: allows when chatId owner matches the verified user", async () => {
  const verify = createVerifyChatOwnership();
  const request = {
    verifiedUserId: 42,
    params: { chatId: "moodle-42-abc-def" },
    log: { warn() {} },
  };
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls.length, 0);
});

test("ownership: allows the server-side session- prefix too", async () => {
  const verify = createVerifyChatOwnership();
  const request = {
    verifiedUserId: 7,
    params: { chatId: "session-7-1700000000000" },
    log: { warn() {} },
  };
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls.length, 0);
});

test("ownership: returns 403 when chatId belongs to another user", async () => {
  const verify = createVerifyChatOwnership();
  const request = { verifiedUserId: 42, params: { chatId: "moodle-99-abc" }, log: { warn() {} } };
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 403);
  assert.deepStrictEqual(reply._calls[1].body, { statusCode: 403, error: "Forbidden" });
});

test("ownership: returns 403 when identity was not verified", async () => {
  const verify = createVerifyChatOwnership();
  const request = { params: { chatId: "moodle-42-abc" }, log: { warn() {} } };
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 403);
});

test("ownership: returns 403 when chatId has no parseable owner", async () => {
  const verify = createVerifyChatOwnership();
  const request = { verifiedUserId: 42, params: { chatId: "abc123" }, log: { warn() {} } };
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 403);
});

test("ownership: logs security warning without leaking details", async () => {
  const warnings = [];
  const verify = createVerifyChatOwnership();
  const request = {
    verifiedUserId: 42,
    params: { chatId: "moodle-99-abc" },
    log: {
      warn(meta) {
        warnings.push(meta);
      },
    },
  };
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].security, true);
  assert.strictEqual(warnings[0].type, "chat_ownership_denied");
});
