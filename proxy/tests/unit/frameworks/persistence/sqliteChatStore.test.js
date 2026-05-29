import assert from "node:assert/strict";
import { test, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

let savedEnv;
let createSqliteChatStore;

beforeAll(async () => {
  savedEnv = { ...process.env };
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";
  process.env.CHAT_DB_PATH = ":memory:";

  const mod = await import("../../../../src/frameworks/persistence/sqliteChatStore.js");
  createSqliteChatStore = mod.createSqliteChatStore;
});

afterAll(() => {
  Object.keys(process.env).forEach((k) => delete process.env[k]);
  Object.assign(process.env, savedEnv);
});

let db;
beforeEach(() => {
  db = new Database(":memory:");
});
afterEach(() => {
  db.close();
});

test("sqliteChatStore initializes sessions/messages tables and message index", () => {
  createSqliteChatStore({ db });

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .all()
    .map((row) => row.name);

  assert.equal(tables.includes("chat_sessions"), true);
  assert.equal(tables.includes("chat_messages"), true);
  assert.equal(indexes.includes("idx_msg_session"), true);
});

test("sqliteChatStore appends messages and returns chronological limited history", async () => {
  let now = 1_000;
  const store = createSqliteChatStore({ db, now: () => now });

  await store.appendMessage("session-1", 42, "user", "Hallo");
  now += 1;
  await store.appendMessage("session-1", 42, "assistant", "Hi");
  now += 1;
  await store.appendMessage("session-1", 42, "user", "Second");

  const history = await store.getHistory("session-1", 2);

  assert.deepEqual(history, [
    { role: "assistant", content: "Hi", timestamp: 1_001 },
    { role: "user", content: "Second", timestamp: 1_002 },
  ]);
});

test("sqliteChatStore clears one session without touching another session", async () => {
  const store = createSqliteChatStore({ db });

  await store.appendMessage("session-1", 1, "user", "delete me");
  await store.appendMessage("session-2", 2, "user", "keep me");
  await store.clearSession("session-1");

  assert.deepEqual(await store.getHistory("session-1", 10), []);
  assert.equal((await store.getHistory("session-2", 10))[0].content, "keep me");
});

test("sqliteChatStore trims old messages after append and keeps latest 48", async () => {
  let now = 10_000;
  const store = createSqliteChatStore({ db, now: () => now, maxMessages: 48 });

  for (let i = 0; i < 55; i += 1) {
    now += 1;
    await store.appendMessage("session-1", 7, "user", `message-${i}`);
  }

  const history = await store.getHistory("session-1", 100);

  assert.equal(history.length, 48);
  assert.equal(history[0].content, "message-7");
  assert.equal(history[47].content, "message-54");
});

test("getHistory returns empty array for unknown session", async () => {
  const store = createSqliteChatStore({ db });
  const history = await store.getHistory("no-such-session", 10);
  assert.deepEqual(history, []);
});

test("clearSession is idempotent for nonexistent session", async () => {
  const store = createSqliteChatStore({ db });
  await store.clearSession("nonexistent");
  const history = await store.getHistory("nonexistent", 10);
  assert.deepEqual(history, []);
});
