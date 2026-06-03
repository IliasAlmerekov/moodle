import { MAX_SQLITE_MESSAGES } from "../../config/constants.js";

function cloneMessage({ role, content, timestamp }) {
  return { role, content, timestamp };
}

export function createInMemoryChatStore({
  now = Date.now,
  maxMessages = MAX_SQLITE_MESSAGES,
} = {}) {
  const sessions = new Map();

  function getOrCreateSession(sessionId, userId) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { userId, messages: [], updatedAt: now() });
    }

    return sessions.get(sessionId);
  }

  function trimMessages(messages) {
    const excessCount = messages.length - maxMessages;

    if (excessCount > 0) {
      messages.splice(0, excessCount);
    }
  }

  return {
    async getHistory(sessionId, limit = maxMessages) {
      const session = sessions.get(sessionId);

      if (!session) {
        return [];
      }

      return session.messages.slice(-limit).map(cloneMessage);
    },

    async appendMessage(sessionId, userId, role, content) {
      const session = getOrCreateSession(sessionId, userId);
      session.userId = userId;
      session.updatedAt = now();
      session.messages.push({
        role,
        content,
        timestamp: now(),
      });
      trimMessages(session.messages);
    },

    async clearSession(sessionId) {
      sessions.delete(sessionId);
    },

    async pruneSessionsOlderThan(maxAgeMs) {
      const cutoff = now() - maxAgeMs;
      let deleted = 0;
      for (const [sessionId, session] of sessions) {
        if (session.updatedAt < cutoff) {
          sessions.delete(sessionId);
          deleted += 1;
        }
      }
      return deleted;
    },
  };
}

export const inMemoryChatStore = createInMemoryChatStore();
