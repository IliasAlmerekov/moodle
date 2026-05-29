import assert from "node:assert/strict";
import { test } from "vitest";
import { createInMemoryChatStore } from "../../../src/frameworks/persistence/inMemoryChatStore.js";

test("appendMessage and getHistory return saved messages", async () => {
  const store = createInMemoryChatStore({ now: () => 1_000 });
  await store.appendMessage("sess1", 1, "user", "Hello");
  await store.appendMessage("sess1", 1, "assistant", "Hi");

  const history = await store.getHistory("sess1");
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].role, "user");
  assert.strictEqual(history[0].content, "Hello");
  assert.strictEqual(history[0].timestamp, 1_000);
  assert.strictEqual(history[1].role, "assistant");
  assert.strictEqual(history[1].content, "Hi");
});

test("getHistory for unknown session returns empty array", async () => {
  const store = createInMemoryChatStore();
  const history = await store.getHistory("unknown");
  assert.deepStrictEqual(history, []);
});

test("getHistory respects limit", async () => {
  const store = createInMemoryChatStore({ now: () => 1_000 });
  await store.appendMessage("sess1", 1, "user", "A");
  await store.appendMessage("sess1", 1, "user", "B");
  await store.appendMessage("sess1", 1, "user", "C");

  const history = await store.getHistory("sess1", 2);
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].content, "B");
  assert.strictEqual(history[1].content, "C");
});

test("clearSession removes history", async () => {
  const store = createInMemoryChatStore({ now: () => 1_000 });
  await store.appendMessage("sess1", 1, "user", "Hello");
  await store.clearSession("sess1");

  const history = await store.getHistory("sess1");
  assert.deepStrictEqual(history, []);
});

test("messages are trimmed to maxMessages limit", async () => {
  const store = createInMemoryChatStore({ now: () => 1_000, maxMessages: 3 });
  await store.appendMessage("sess1", 1, "user", "A");
  await store.appendMessage("sess1", 1, "user", "B");
  await store.appendMessage("sess1", 1, "user", "C");
  await store.appendMessage("sess1", 1, "user", "D");

  const history = await store.getHistory("sess1");
  assert.strictEqual(history.length, 3);
  assert.strictEqual(history[0].content, "B");
  assert.strictEqual(history[1].content, "C");
  assert.strictEqual(history[2].content, "D");
});

test("appendMessage updates userId on existing session", async () => {
  const store = createInMemoryChatStore({ now: () => 1_000 });
  await store.appendMessage("sess1", 1, "user", "Hello");
  await store.appendMessage("sess1", 2, "user", "Hi");

  const history = await store.getHistory("sess1");
  assert.strictEqual(history.length, 2);
});

test("messages are cloned on getHistory", async () => {
  const store = createInMemoryChatStore({ now: () => 1_000 });
  await store.appendMessage("sess1", 1, "user", "Hello");

  const history1 = await store.getHistory("sess1");
  history1[0].content = "Modified";

  const history2 = await store.getHistory("sess1");
  assert.strictEqual(history2[0].content, "Hello");
});

test("clearSession is idempotent for nonexistent session", async () => {
  const store = createInMemoryChatStore();
  await store.clearSession("nonexistent");
  const history = await store.getHistory("nonexistent");
  assert.deepStrictEqual(history, []);
});
