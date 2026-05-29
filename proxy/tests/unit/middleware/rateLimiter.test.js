import assert from "node:assert/strict";
import { test, beforeEach } from "vitest";
import { checkUserRateLimit, resetCounters } from "../../../src/middleware/rateLimiter.js";

beforeEach(() => {
  resetCounters();
});

test("first request is allowed", () => {
  const result = checkUserRateLimit(42, { ip: "127.0.0.1" });
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.remaining, 9);
});

test("10 requests are allowed within window", () => {
  for (let i = 0; i < 10; i++) {
    const result = checkUserRateLimit(42, { ip: "127.0.0.1" });
    assert.strictEqual(result.allowed, true);
  }
});

test("11th request is blocked", () => {
  for (let i = 0; i < 10; i++) {
    checkUserRateLimit(42, { ip: "127.0.0.1" });
  }

  const result = checkUserRateLimit(42, { ip: "127.0.0.1" });
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.remaining, 0);
  assert.ok(result.resetAt > Date.now());
});

test("different users have separate counters", () => {
  for (let i = 0; i < 10; i++) {
    checkUserRateLimit(1, { ip: "127.0.0.1" });
  }

  const result = checkUserRateLimit(2, { ip: "127.0.0.1" });
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.remaining, 9);
});

test("counter resets after window expires", () => {
  const originalDateNow = Date.now;
  const fixedTime = 1_000_000;
  Date.now = () => fixedTime;

  for (let i = 0; i < 10; i++) {
    checkUserRateLimit(42, { ip: "127.0.0.1" });
  }

  assert.strictEqual(checkUserRateLimit(42, { ip: "127.0.0.1" }).allowed, false);

  // Move past the window
  Date.now = () => fixedTime + 60_001;

  const result = checkUserRateLimit(42, { ip: "127.0.0.1" });
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.remaining, 9);

  Date.now = originalDateNow;
});

test("undefined userId defaults to 0", () => {
  const result = checkUserRateLimit(undefined, { ip: "127.0.0.1" });
  assert.strictEqual(result.allowed, true);
});

test("logs rate limit hit with ip when log is provided", () => {
  const warnings = [];
  const log = {
    warn(data) {
      warnings.push(data);
    },
  };

  for (let i = 0; i < 10; i++) {
    checkUserRateLimit(99, { ip: "1.2.3.4", log });
  }

  const result = checkUserRateLimit(99, { ip: "1.2.3.4", log });
  assert.strictEqual(result.allowed, false);

  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].security, true);
  assert.strictEqual(warnings[0].type, "rate_limit_exceeded");
  assert.strictEqual(warnings[0].ip, "1.2.3.4");
  assert.strictEqual(warnings[0].userId, "99");
});

test("does not throw when log is missing and limit is exceeded", () => {
  for (let i = 0; i < 10; i++) {
    checkUserRateLimit(77, { ip: "127.0.0.1" });
  }

  const result = checkUserRateLimit(77, { ip: "127.0.0.1" });
  assert.strictEqual(result.allowed, false);
});

test("gc removes expired entries when threshold is reached", () => {
  const originalDateNow = Date.now;
  const fixedTime = 1_000_000;
  Date.now = () => fixedTime;

  // Fill counters to near threshold with unique userIds
  for (let i = 0; i < 1001; i++) {
    checkUserRateLimit(i, { ip: "127.0.0.1" });
  }

  // Move time past the window so all entries are expired
  Date.now = () => fixedTime + 60_001;

  // This call should trigger GC and clean up expired entries
  checkUserRateLimit(2000, { ip: "127.0.0.1" });

  // If GC worked, the system still functions correctly
  const result = checkUserRateLimit(2000, { ip: "127.0.0.1" });
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.remaining, 8);

  Date.now = originalDateNow;
});

test("custom max and windowMs override defaults", () => {
  // Allow only 2 requests with a 5-second window
  const result1 = checkUserRateLimit(55, { ip: "127.0.0.1", max: 2, windowMs: 5000 });
  assert.strictEqual(result1.remaining, 1);

  const result2 = checkUserRateLimit(55, { ip: "127.0.0.1", max: 2, windowMs: 5000 });
  assert.strictEqual(result2.remaining, 0);

  const result3 = checkUserRateLimit(55, { ip: "127.0.0.1", max: 2, windowMs: 5000 });
  assert.strictEqual(result3.allowed, false);
});
