import assert from "node:assert/strict";
import { test, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createContentCipher } from "../../../../src/frameworks/persistence/contentCipher.js";

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

test("sqliteChatStore enables foreign keys and a busy timeout for robustness", () => {
  createSqliteChatStore({ db });

  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
});

test("pruneSessionsOlderThan deletes stale sessions and their messages, keeps fresh ones", async () => {
  let now = 1_000;
  const store = createSqliteChatStore({ db, now: () => now });

  await store.appendMessage("session-old", 1, "user", "stale");
  now = 5_000;
  await store.appendMessage("session-new", 2, "user", "fresh");

  now = 10_000;
  // cutoff = 10_000 - 6_000 = 4_000; session-old (updated_at 1_000) is stale, session-new (5_000) is fresh.
  const deleted = await store.pruneSessionsOlderThan(6_000);

  assert.equal(deleted, 1);
  assert.deepEqual(await store.getHistory("session-old", 10), []);
  assert.equal((await store.getHistory("session-new", 10))[0].content, "fresh");
});

test("pruneSessionsOlderThan is a no-op when nothing is stale", async () => {
  let now = 1_000;
  const store = createSqliteChatStore({ db, now: () => now });

  await store.appendMessage("session-1", 1, "user", "recent");
  now = 2_000;

  const deleted = await store.pruneSessionsOlderThan(10_000);

  assert.equal(deleted, 0);
  assert.equal((await store.getHistory("session-1", 10))[0].content, "recent");
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

test("with an encryption key, content is stored as ciphertext but reads back as plaintext", async () => {
  const cipher = createContentCipher("0".repeat(64));
  const store = createSqliteChatStore({ db, cipher });

  await store.appendMessage("session-enc", 1, "user", "geheime Nachricht");

  // Raw column must not contain the plaintext.
  const raw = db
    .prepare("SELECT content FROM chat_messages WHERE session_id = ?")
    .get("session-enc");
  assert.equal(raw.content.startsWith("enc:v1:"), true);
  assert.equal(raw.content.includes("geheime Nachricht"), false);

  // getHistory transparently decrypts.
  const history = await store.getHistory("session-enc", 10);
  assert.equal(history[0].content, "geheime Nachricht");
});

test("encrypted store still reads legacy plaintext rows", async () => {
  const cipher = createContentCipher("0".repeat(64));
  const store = createSqliteChatStore({ db, cipher });

  // Simulate a row written before encryption was enabled (plaintext content).
  db.prepare(
    "INSERT INTO chat_sessions (id, user_id, created_at, updated_at) VALUES ('legacy', 1, 1, 1)",
  ).run();
  db.prepare(
    "INSERT INTO chat_messages (session_id, user_id, role, content, created_at) VALUES ('legacy', 1, 'user', 'old plaintext', 1)",
  ).run();

  const history = await store.getHistory("legacy", 10);
  assert.equal(history[0].content, "old plaintext");
});
