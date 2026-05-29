import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatMessage } from "../../../src/entities/ChatMessage.js";

test("valid role 'user' passes", () => {
  const result = createChatMessage({ role: "user", content: "Hello" });
  assert.strictEqual(result.role, "user");
  assert.strictEqual(result.content, "Hello");
  assert.ok(result.timestamp);
});

test("valid role 'assistant' passes", () => {
  const result = createChatMessage({ role: "assistant", content: "Hi there" });
  assert.strictEqual(result.role, "assistant");
  assert.strictEqual(result.content, "Hi there");
});

test("invalid role 'admin' throws 400", () => {
  assert.throws(
    () => createChatMessage({ role: "admin", content: "Hello" }),
    (err) => err.statusCode === 400 && err.message === "Invalid role: admin",
  );
});

test("empty content throws 400", () => {
  assert.throws(
    () => createChatMessage({ role: "user", content: "" }),
    (err) => err.statusCode === 400 && err.message === "Content cannot be empty",
  );
});

test("whitespace-only content throws 400", () => {
  assert.throws(
    () => createChatMessage({ role: "user", content: "   " }),
    (err) => err.statusCode === 400 && err.message === "Content cannot be empty",
  );
});

test("null content throws 400", () => {
  assert.throws(
    () => createChatMessage({ role: "user", content: null }),
    (err) => err.statusCode === 400 && err.message === "Content cannot be empty",
  );
});

test("undefined content throws 400", () => {
  assert.throws(
    () => createChatMessage({ role: "user", content: undefined }),
    (err) => err.statusCode === 400 && err.message === "Content cannot be empty",
  );
});

test("returns frozen object", () => {
  const result = createChatMessage({ role: "user", content: "Hello" });
  assert.strictEqual(Object.isFrozen(result), true);
});

test("content is trimmed", () => {
  const result = createChatMessage({ role: "user", content: "  Hello  " });
  assert.strictEqual(result.content, "Hello");
});

test("uses provided timestamp", () => {
  const ts = 1234567890;
  const result = createChatMessage({ role: "user", content: "Hello", timestamp: ts });
  assert.strictEqual(result.timestamp, ts);
});

test("auto-generates timestamp when not provided", () => {
  const before = Date.now();
  const result = createChatMessage({ role: "user", content: "Hi" });
  const after = Date.now();
  assert.ok(result.timestamp >= before && result.timestamp <= after);
});
