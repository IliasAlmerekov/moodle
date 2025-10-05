import config from "../config/env";

/**
 * 
 * @param {import('fastify').FastifyInstance} fastify 
 */

export default async function healthRoutes(fastify) {
  fastify.get("/health", async () => ({
    status: "ok",
    moodleConfigured: config.moodle.isConfigured,
    ollamaConfigured: config.ollama.isConfigured,
  }));
}
