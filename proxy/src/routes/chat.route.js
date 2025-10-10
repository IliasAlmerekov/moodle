import { handleChatStream } from "../controllers/chatController.js";
/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function chatRoutes(fastify) {
  // endpoint for streaming response with Moodle context
  fastify.post("/api/chat-stream", handleChatStream);
}
