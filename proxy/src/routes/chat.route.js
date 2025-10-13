import { handleChatStream } from "../controllers/chatController.js";
import {
  getChatHistory,
  resetChatHistory,
} from "../controllers/chatHistoryController.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function chatRoutes(fastify) {
  // endpoint for streaming response with Moodle context
  fastify.post("/api/chat-stream", handleChatStream);
  fastify.get("/api/chat-history/:chatId", getChatHistory);
  fastify.delete("/api/chat-history/:chatId", resetChatHistory);
}
