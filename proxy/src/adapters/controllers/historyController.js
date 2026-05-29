import { getHistory } from "../../application/useCases/chat/getHistory.js";
import { clearSession } from "../../application/useCases/chat/clearSession.js";
import { sanitizeChatId } from "./chatId.js";

/**
 * Factory for the chat history controller.
 * Handles HTTP concerns only — no business logic.
 *
 * @param {Object} deps
 * @param {import("../../application/repositories/IChatRepository.js").IChatRepository} deps.chatRepository
 */
export function createHistoryController({ chatRepository }) {
  return {
    async get(request, reply) {
      const { chatId: rawChatId } = request.params ?? {};
      const sessionId = sanitizeChatId(rawChatId);

      if (!sessionId) {
        return reply.status(400).send({ error: "Invalid chatId parameter" });
      }

      try {
        const messages = await getHistory({ sessionId, chatRepository, limit: 100 });
        return reply.send({ chatId: sessionId, messages });
      } catch (err) {
        request.log.error({ err, sessionId }, "getHistory failed");
        return reply.status(500).send({ error: "Failed to retrieve chat history" });
      }
    },

    async delete(request, reply) {
      const { chatId: rawChatId } = request.params ?? {};
      const sessionId = sanitizeChatId(rawChatId);

      if (!sessionId) {
        return reply.status(400).send({ error: "Invalid chatId parameter" });
      }

      try {
        const result = await clearSession({ sessionId, chatRepository });
        return reply.send(result);
      } catch (err) {
        request.log.error({ err, sessionId }, "clearSession failed");
        return reply.status(500).send({ error: "Failed to clear chat history" });
      }
    },
  };
}
