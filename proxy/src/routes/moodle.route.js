import {
  getMoodlePing,
  getSiteInformation,
  getUserCoursesController,
  getUserInformation,
} from "../controllers/moodleController.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function moodleRoutes(fastify) {
  fastify.get("/moodle/ping", getMoodlePing);

  fastify.get("/moodle/site-info", getSiteInformation);

  fastify.get("/moodle/user/:userId", getUserInformation);

  fastify.get("/moodle/user/:userId/courses", getUserCoursesController);
}
