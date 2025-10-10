import { getOllamaModels } from "../controllers/ollamaController.js";
/**
 * @param {import('fastify').FastifyInstance} fastify
 */

export default async function ollamaRoutes(fastify) {
  // endpoint to get available models from Ollama
  fastify.get("/ollama/models", getOllamaModels);
}
