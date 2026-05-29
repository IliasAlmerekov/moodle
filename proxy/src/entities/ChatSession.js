import { createChatMessage } from "./ChatMessage.js";

// Business rule: keep the last N message pairs in the in-memory session.
// Exported so application-layer callers can reference the same value.
export const MAX_HISTORY_MESSAGES = 12;

export function createChatSession({ id, userId, messages = [] }) {
  if (!id) {
    throw Object.assign(new Error("Session id is required"), { statusCode: 400 });
  }
  if (userId === null || userId === undefined) {
    throw Object.assign(new Error("userId is required"), { statusCode: 400 });
  }

  // Closure variable — intentionally mutable; methods below control access.
  let _messages = messages.map((m) => createChatMessage(m));

  return Object.freeze({
    id,
    userId,
    get history() {
      return [..._messages];
    },
    addMessage(role, content) {
      _messages.push(createChatMessage({ role, content }));
      if (_messages.length > MAX_HISTORY_MESSAGES * 2) {
        _messages = _messages.slice(-MAX_HISTORY_MESSAGES * 2);
      }
    },
    toHistoryString() {
      return _messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    },
    clear() {
      _messages = [];
    },
  });
}
