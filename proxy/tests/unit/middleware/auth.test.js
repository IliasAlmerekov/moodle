import assert from "node:assert/strict";
import { test } from "vitest";
import { createVerifyMoodleUser } from "../../../src/middleware/auth.js";

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

test("returns 401 when userId is missing", async () => {
  const verify = createVerifyMoodleUser({ userRepository: createMockUserRepository() });
  const request = createMockRequest({ body: { message: "Hello" } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls.length, 2);
  assert.strictEqual(reply._calls[0].code, 401);
  assert.deepStrictEqual(reply._calls[1].body, { statusCode: 401, error: "Unauthorized" });
});

test("returns 401 when userId is 0", async () => {
  const verify = createVerifyMoodleUser({ userRepository: createMockUserRepository() });
  const request = createMockRequest({ body: { userId: 0 } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when userId is negative", async () => {
  const verify = createVerifyMoodleUser({ userRepository: createMockUserRepository() });
  const request = createMockRequest({ body: { userId: -1 } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("returns 401 when userId is not an integer", async () => {
  const verify = createVerifyMoodleUser({ userRepository: createMockUserRepository() });
  const request = createMockRequest({ body: { userId: "abc" } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
});

test("allows request when user exists", async () => {
  const verify = createVerifyMoodleUser({ userRepository: createMockUserRepository() });
  const request = createMockRequest({ body: { userId: 42 } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls.length, 0);
});

test("returns 401 when user is not found", async () => {
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: () => null,
    }),
  });
  const request = createMockRequest({ body: { userId: 99 } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
  assert.deepStrictEqual(reply._calls[1].body, { statusCode: 401, error: "Unauthorized" });
});

test("returns 401 when userRepository throws", async () => {
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: () => {
        throw new Error("Moodle down");
      },
    }),
  });
  const request = createMockRequest({ body: { userId: 7 } });
  const reply = createMockReply();

  await verify(request, reply);

  assert.strictEqual(reply._calls[0].code, 401);
  assert.deepStrictEqual(reply._calls[1].body, { statusCode: 401, error: "Unauthorized" });
});

test("caches successful verification and skips second call to userRepository", async () => {
  let calls = 0;
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: (userId) => {
        calls += 1;
        return { id: userId, firstname: "Test", lastname: "User" };
      },
    }),
  });

  const request1 = createMockRequest({ body: { userId: 1 } });
  const reply1 = createMockReply();
  await verify(request1, reply1);
  assert.strictEqual(calls, 1);

  const request2 = createMockRequest({ body: { userId: 1 } });
  const reply2 = createMockReply();
  await verify(request2, reply2);
  assert.strictEqual(calls, 1);
  assert.strictEqual(reply2._calls.length, 0);
});

test("caches failed verification and skips second call to userRepository", async () => {
  let calls = 0;
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: () => {
        calls += 1;
        return null;
      },
    }),
  });

  const request1 = createMockRequest({ body: { userId: 2 } });
  const reply1 = createMockReply();
  await verify(request1, reply1);
  assert.strictEqual(calls, 1);

  const request2 = createMockRequest({ body: { userId: 2 } });
  const reply2 = createMockReply();
  await verify(request2, reply2);
  assert.strictEqual(calls, 1);
  assert.strictEqual(reply2._calls[0].code, 401);
});

test("refetches after cache ttl expires", async () => {
  let nowMs = 0;
  let calls = 0;
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: (userId) => {
        calls += 1;
        return { id: userId, firstname: "Test", lastname: "User" };
      },
    }),
    ttlMs: 300_000,
    now: () => nowMs,
  });

  const request1 = createMockRequest({ body: { userId: 3 } });
  const reply1 = createMockReply();
  await verify(request1, reply1);
  assert.strictEqual(calls, 1);

  nowMs = 300_001;

  const request2 = createMockRequest({ body: { userId: 3 } });
  const reply2 = createMockReply();
  await verify(request2, reply2);
  assert.strictEqual(calls, 2);
  assert.strictEqual(reply2._calls.length, 0);
});

test("logs security warning on auth failure without leaking details", async () => {
  const warnings = [];
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: () => {
        throw new Error("Connection refused");
      },
    }),
  });

  const request = createMockRequest({
    body: { userId: 5 },
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
  assert.strictEqual(reply._calls[1].body.error, "Unauthorized");
  assert.ok(!reply._calls[1].body.message);
});

test("different userIds are verified independently", async () => {
  const calls = new Map();
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: (userId) => {
        calls.set(userId, (calls.get(userId) || 0) + 1);
        return { id: userId, firstname: "Test", lastname: "User" };
      },
    }),
  });

  const request1 = createMockRequest({ body: { userId: 10 } });
  await verify(request1, createMockReply());

  const request2 = createMockRequest({ body: { userId: 20 } });
  await verify(request2, createMockReply());

  assert.strictEqual(calls.get(10), 1);
  assert.strictEqual(calls.get(20), 1);
});

test("gc removes expired entries when cache reaches 1000", async () => {
  let nowMs = 0;
  let calls = 0;
  const verify = createVerifyMoodleUser({
    userRepository: createMockUserRepository({
      getUserInfo: (userId) => {
        calls += 1;
        return { id: userId, firstname: "Test", lastname: "User" };
      },
    }),
    ttlMs: 100,
    now: () => nowMs,
  });

  // fill cache with 1000 entries
  for (let i = 1; i <= 1000; i += 1) {
    const request = createMockRequest({ body: { userId: i } });
    await verify(request, createMockReply());
  }
  assert.strictEqual(calls, 1000);

  // advance time past ttl — all entries expired
  nowMs = 101;

  // request userId 1001 triggers gc + fresh fetch
  const request = createMockRequest({ body: { userId: 1001 } });
  await verify(request, createMockReply());
  assert.strictEqual(calls, 1001);

  // old entries were gc'd, so userId 1 should be re-fetched
  const request2 = createMockRequest({ body: { userId: 1 } });
  await verify(request2, createMockReply());
  assert.strictEqual(calls, 1002);
});
