import config from "../config/env.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function moodleRoutes(fastify) {
  fastify.get("/moodle/ping", async (request, reply) => {
    if (!config.moodle.isConfigured) {
      reply.code(503);
      return { status: "error", message: "Moodle is not configured" };
    }

    try {
      const response = await fetch(config.moodle.url, { method: "HEAD" });
      return {
        status: response.ok ? "up" : "degraded",
        httpStatus: response.status,
      };
    } catch (error) {
      request.log.error({ err: error }, "Failed to reach Moodle instance");
      reply.code(502);
      return {
        status: "error",
        message: "Unable to reach Moodle",
        detail: error.message,
      };
    }
  });
}
