import { getOllamaModels } from "../controllers/ollamaController";
/**
 * @param {import('fastify').FastifyInstance} fastify
 */

import { getOllamaModels } from "../controllers/ollamaController";

export default async function ollamaRoutes(fastify) {
  // endpoint to get available models from Ollama
  fastify.get("/ollama/models", getOllamaModels);
}
