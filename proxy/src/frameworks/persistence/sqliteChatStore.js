import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import config from "../../config/env.js";
import { MAX_SQLITE_MESSAGES } from "../../config/constants.js";

function openDatabase(dbPath) {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  return new Database(dbPath);
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_msg_session
      ON chat_messages(session_id, created_at);
  `);
}

export function createSqliteChatStore({
  dbPath = config.chat.dbPath,
  db = openDatabase(dbPath),
  now = Date.now,
  maxMessages = MAX_SQLITE_MESSAGES,
} = {}) {
  initializeSchema(db);

  const upsertSession = db.prepare(`
    INSERT INTO chat_sessions (id, user_id, created_at, updated_at)
    VALUES (@sessionId, @userId, @timestamp, @timestamp)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      updated_at = excluded.updated_at
  `);

  const insertMessage = db.prepare(`
    INSERT INTO chat_messages (session_id, user_id, role, content, created_at)
    VALUES (@sessionId, @userId, @role, @content, @timestamp)
  `);

  const trimMessages = db.prepare(`
    DELETE FROM chat_messages
    WHERE session_id = @sessionId
      AND id NOT IN (
        SELECT id
        FROM chat_messages
        WHERE session_id = @sessionId
        ORDER BY created_at DESC, id DESC
        LIMIT @maxMessages
      )
  `);

  const appendTransaction = db.transaction(({ sessionId, userId, role, content, timestamp }) => {
    upsertSession.run({ sessionId, userId, timestamp });
    insertMessage.run({ sessionId, userId, role, content, timestamp });
    trimMessages.run({ sessionId, maxMessages });
  });

  const selectHistory = db.prepare(`
    SELECT role, content, created_at AS timestamp
    FROM (
      SELECT id, role, content, created_at
      FROM chat_messages
      WHERE session_id = @sessionId
      ORDER BY created_at DESC, id DESC
      LIMIT @limit
    )
    ORDER BY timestamp ASC, id ASC
  `);

  const deleteMessages = db.prepare("DELETE FROM chat_messages WHERE session_id = ?");
  const deleteSession = db.prepare("DELETE FROM chat_sessions WHERE id = ?");
  const clearTransaction = db.transaction((sessionId) => {
    deleteMessages.run(sessionId);
    deleteSession.run(sessionId);
  });

  return {
    async getHistory(sessionId, limit = maxMessages) {
      return selectHistory.all({ sessionId, limit });
    },

    async appendMessage(sessionId, userId, role, content) {
      appendTransaction({
        sessionId,
        userId,
        role,
        content,
        timestamp: now(),
      });
    },

    async clearSession(sessionId) {
      clearTransaction(sessionId);
    },
  };
}

export const sqliteChatStore = createSqliteChatStore();
