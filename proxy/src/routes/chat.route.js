import { handleChatStream } from "../controllers/chatController";
/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function chatRoutes(fastify) {
  // endpoint for streaming response
  fastify.post("/api/chat-stream", handleChatStream);
}
