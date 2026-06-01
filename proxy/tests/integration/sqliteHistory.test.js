import assert from "node:assert/strict";
import { test, beforeAll, afterAll, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import Database from "better-sqlite3";

let createSqliteChatStore;
let savedEnv;

const dbPath = join(tmpdir(), `smoke-history-${process.pid}.db`);

beforeAll(async () => {
  savedEnv = { ...process.env };
  process.env.MOODLE_URL = "https://moodle.example.test";
  process.env.MOODLE_TOKEN = "test-token";
  process.env.OLLAMA_URL = "http://ollama.example.test";
  process.env.OLLAMA_MODEL = "llama-default";
  process.env.CHAT_DB_PATH = dbPath;

  const mod = await import("../../src/frameworks/persistence/sqliteChatStore.js");
  createSqliteChatStore = mod.createSqliteChatStore;
});

afterAll(() => {
  Object.keys(process.env).forEach((k) => delete process.env[k]);
  Object.assign(process.env, savedEnv);
});

afterEach(() => {
  if (existsSync(dbPath)) unlinkSync(dbPath);
});

test("SQLite chat history survives store restart (simulates server restart)", async () => {
  const db1 = new Database(dbPath);
  const store1 = createSqliteChatStore({ db: db1 });
  await store1.appendMessage("session-1", 42, "user", "Was ist LF07?");
  await store1.appendMessage("session-1", 42, "assistant", "LF07 ist Lernfeld 7.");
  db1.close();

  const db2 = new Database(dbPath);
  const store2 = createSqliteChatStore({ db: db2 });
  const history = await store2.getHistory("session-1");
  db2.close();

  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].role, "user");
  assert.strictEqual(history[0].content, "Was ist LF07?");
  assert.strictEqual(history[1].role, "assistant");
  assert.strictEqual(history[1].content, "LF07 ist Lernfeld 7.");
});

test("SQLite history is not shared between different sessions after restart", async () => {
  const db1 = new Database(dbPath);
  const store1 = createSqliteChatStore({ db: db1 });
  await store1.appendMessage("session-A", 1, "user", "Frage A");
  await store1.appendMessage("session-B", 2, "user", "Frage B");
  db1.close();

  const db2 = new Database(dbPath);
  const store2 = createSqliteChatStore({ db: db2 });
  const historyA = await store2.getHistory("session-A");
  const historyB = await store2.getHistory("session-B");
  db2.close();

  assert.strictEqual(historyA.length, 1);
  assert.strictEqual(historyA[0].content, "Frage A");
  assert.strictEqual(historyB.length, 1);
  assert.strictEqual(historyB[0].content, "Frage B");
});

test("clearSession removes history permanently (survives restart)", async () => {
  const db1 = new Database(dbPath);
  const store1 = createSqliteChatStore({ db: db1 });
  await store1.appendMessage("session-clear", 5, "user", "Frage");
  await store1.clearSession("session-clear");
  db1.close();

  const db2 = new Database(dbPath);
  const store2 = createSqliteChatStore({ db: db2 });
  const history = await store2.getHistory("session-clear");
  db2.close();

  assert.strictEqual(history.length, 0);
});
