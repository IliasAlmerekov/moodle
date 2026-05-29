import assert from "node:assert/strict";
import { test } from "vitest";
import { createHistoryController } from "../../../../src/adapters/controllers/historyController.js";

function createMockRequest(overrides = {}) {
  const errors = [];
  return {
    params: overrides.params ?? {},
    log: {
      error(data) {
        errors.push(data);
      },
      info() {},
      warn() {},
    },
    _errors: errors,
  };
}

function createMockReply() {
  return {
    _status: null,
    _sent: null,
    status(code) {
      this._status = code;
      return this;
    },
    send(data) {
      this._sent = data;
    },
  };
}

function createMockChatRepository(historyData = []) {
  return {
    history: historyData,
    async getHistory(sessionId, limit) {
      return this.history.filter((h) => h.sessionId === sessionId).slice(0, limit);
    },
    async clearSession(sessionId) {
      this.history = this.history.filter((h) => h.sessionId !== sessionId);
    },
  };
}

test("get returns chat history for valid chatId", async () => {
  const messages = [
    { sessionId: "abc", role: "user", content: "Hi", timestamp: 1 },
    { sessionId: "abc", role: "assistant", content: "Hello", timestamp: 2 },
  ];
  const chatRepository = createMockChatRepository(messages);
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "abc" } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, null);
  assert.strictEqual(reply._sent.chatId, "abc");
  assert.strictEqual(reply._sent.messages.length, 2);
  assert.strictEqual(reply._sent.messages[0].role, "user");
  assert.strictEqual(reply._sent.messages[1].role, "assistant");
});

test("get returns empty array when no history exists", async () => {
  const chatRepository = createMockChatRepository([]);
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "new-session" } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, null);
  assert.deepStrictEqual(reply._sent.messages, []);
  assert.strictEqual(reply._sent.chatId, "new-session");
});

test("get returns 400 for missing chatId", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: {} });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid chatId parameter");
});

test("get returns 400 for non-string chatId", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: 123 } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid chatId parameter");
});

test("get returns 400 for empty chatId", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "" } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid chatId parameter");
});

test("get returns 400 for chatId exceeding 64 chars", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "a".repeat(65) } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid chatId parameter");
});

test("get returns 400 for chatId with unsafe characters", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "../../etc/passwd" } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid chatId parameter");
});

test("get returns 500 and logs error when repository throws", async () => {
  const chatRepository = {
    async getHistory() {
      throw new Error("DB failure");
    },
  };
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "abc" } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, 500);
  assert.strictEqual(reply._sent.error, "Failed to retrieve chat history");
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "DB failure");
});

test("delete clears session and returns confirmation", async () => {
  const messages = [{ sessionId: "abc", role: "user", content: "Hi", timestamp: 1 }];
  const chatRepository = createMockChatRepository(messages);
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "abc" } });
  const reply = createMockReply();

  await controller.delete(request, reply);

  assert.strictEqual(reply._status, null);
  assert.strictEqual(reply._sent.cleared, true);
  assert.strictEqual(reply._sent.sessionId, "abc");
  assert.strictEqual(chatRepository.history.length, 0);
});

test("delete returns 400 for invalid chatId", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "bad<id>" } });
  const reply = createMockReply();

  await controller.delete(request, reply);

  assert.strictEqual(reply._status, 400);
  assert.strictEqual(reply._sent.error, "Invalid chatId parameter");
});

test("delete returns 500 and logs error when repository throws", async () => {
  const chatRepository = {
    async clearSession() {
      throw new Error("DB failure");
    },
  };
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "abc" } });
  const reply = createMockReply();

  await controller.delete(request, reply);

  assert.strictEqual(reply._status, 500);
  assert.strictEqual(reply._sent.error, "Failed to clear chat history");
  assert.strictEqual(request._errors.length, 1);
  assert.strictEqual(request._errors[0].err.message, "DB failure");
});

test("sanitizeChatId trims whitespace", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "  abc  " } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._sent.chatId, "abc");
});

test("sanitizeChatId allows underscores and hyphens", async () => {
  const chatRepository = createMockChatRepository();
  const controller = createHistoryController({ chatRepository });
  const request = createMockRequest({ params: { chatId: "my-session_123" } });
  const reply = createMockReply();

  await controller.get(request, reply);

  assert.strictEqual(reply._status, null);
  assert.strictEqual(reply._sent.chatId, "my-session_123");
});
