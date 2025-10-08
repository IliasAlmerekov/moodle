import config from "../config/env.js";
import {
  getSiteInfo,
  getUserInfo,
  getUserCourses,
} from "../services/moodle.service.js";

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


  fastify.get("/moodle/site-info", async (request, reply) => {
    try {
      const info = await getSiteInfo();
      return { status: "ok", data: info };
    } catch (error) {
      reply.code(500);
      return { status: "error", message: error.message };
    }
  });


  fastify.get("/moodle/user/:userId", async (request, reply) => {
    try {
      const userId = request.params.userId;
      const user = await getUserInfo(userId);
      return { status: "ok", data: user };
    } catch (error) {
      reply.code(500);
      return { status: "error", message: error.message };
    }
  });


  fastify.get("/moodle/user/:userId/courses", async (request, reply) => {
    try {
      const userId = request.params.userId;
      const courses = await getUserCourses(userId);
      return { status: "ok", data: courses };
    } catch (error) {
      reply.code(500);
      return { status: "error", message: error.message };
    }
  });
}
