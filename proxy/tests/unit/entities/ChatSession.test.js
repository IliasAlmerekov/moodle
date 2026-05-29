import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatSession, MAX_HISTORY_MESSAGES } from "../../../src/entities/ChatSession.js";

test("addMessage appends a message", () => {
  const session = createChatSession({ id: "s1", userId: "u1" });
  session.addMessage("user", "Hello");
  const history = session.history;
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].role, "user");
  assert.strictEqual(history[0].content, "Hello");
});

test("toHistoryString formats correctly", () => {
  const session = createChatSession({ id: "s1", userId: "u1" });
  session.addMessage("user", "Hello");
  session.addMessage("assistant", "Hi");
  const str = session.toHistoryString();
  assert.strictEqual(str, "user: Hello\nassistant: Hi");
});

test("history is trimmed to MAX_HISTORY * 2", () => {
  const session = createChatSession({ id: "s1", userId: "u1" });
  const limit = MAX_HISTORY_MESSAGES * 2;
  for (let i = 0; i < limit + 5; i++) {
    session.addMessage(i % 2 === 0 ? "user" : "assistant", `msg${i}`);
  }
  assert.strictEqual(session.history.length, limit);
  assert.strictEqual(session.history[0].content, "msg5");
});

test("clear empties history", () => {
  const session = createChatSession({ id: "s1", userId: "u1" });
  session.addMessage("user", "Hello");
  session.clear();
  assert.strictEqual(session.history.length, 0);
});

test("missing id throws 400", () => {
  assert.throws(
    () => createChatSession({ id: undefined, userId: "u1" }),
    (err) => err.statusCode === 400 && err.message === "Session id is required",
  );
});

test("missing userId throws 400", () => {
  assert.throws(
    () => createChatSession({ id: "s1", userId: undefined }),
    (err) => err.statusCode === 400 && err.message === "userId is required",
  );
});

test("null userId throws 400", () => {
  assert.throws(
    () => createChatSession({ id: "s1", userId: null }),
    (err) => err.statusCode === 400 && err.message === "userId is required",
  );
});

test("returns frozen object", () => {
  const session = createChatSession({ id: "s1", userId: "u1" });
  assert.strictEqual(Object.isFrozen(session), true);
});

test("history getter returns copy", () => {
  const session = createChatSession({ id: "s1", userId: "u1" });
  session.addMessage("user", "Hello");
  const h1 = session.history;
  const h2 = session.history;
  assert.notStrictEqual(h1, h2);
  assert.deepStrictEqual(h1, h2);
});

test("preloaded messages are accepted", () => {
  const session = createChatSession({
    id: "s1",
    userId: "u1",
    messages: [{ role: "user", content: "Hi" }],
  });
  assert.strictEqual(session.history.length, 1);
  assert.strictEqual(session.history[0].content, "Hi");
});
