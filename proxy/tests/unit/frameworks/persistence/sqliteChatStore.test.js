import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

async function importSqliteChatStore() {
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";
  process.env.CHAT_DB_PATH = ":memory:";

  const moduleUrl = new URL("../../../../src/frameworks/persistence/sqliteChatStore.js", import.meta.url);
  moduleUrl.searchParams.set("cacheBust", crypto.randomUUID());
  return import(moduleUrl.href);
}

function createMemoryDb() {
  return new Database(":memory:");
}

test("sqliteChatStore initializes sessions/messages tables and message index", async () => {
  const db = createMemoryDb();
  const { createSqliteChatStore } = await importSqliteChatStore();

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

  db.close();
});

test("sqliteChatStore appends messages and returns chronological limited history", async () => {
  const db = createMemoryDb();
  let now = 1_000;
  const { createSqliteChatStore } = await importSqliteChatStore();
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

  db.close();
});

test("sqliteChatStore clears one session without touching another session", async () => {
  const db = createMemoryDb();
  const { createSqliteChatStore } = await importSqliteChatStore();
  const store = createSqliteChatStore({ db });

  await store.appendMessage("session-1", 1, "user", "delete me");
  await store.appendMessage("session-2", 2, "user", "keep me");
  await store.clearSession("session-1");

  assert.deepEqual(await store.getHistory("session-1", 10), []);
  assert.equal((await store.getHistory("session-2", 10))[0].content, "keep me");

  db.close();
});

test("sqliteChatStore trims old messages after append and keeps latest 48", async () => {
  const db = createMemoryDb();
  let now = 10_000;
  const { createSqliteChatStore } = await importSqliteChatStore();
  const store = createSqliteChatStore({ db, now: () => now, maxMessages: 48 });

  for (let i = 0; i < 55; i += 1) {
    now += 1;
    await store.appendMessage("session-1", 7, "user", `message-${i}`);
  }

  const history = await store.getHistory("session-1", 100);

  assert.equal(history.length, 48);
  assert.equal(history[0].content, "message-7");
  assert.equal(history[47].content, "message-54");

  db.close();
});
