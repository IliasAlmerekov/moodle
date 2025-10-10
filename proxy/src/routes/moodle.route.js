import {
  getMoodlePing,
  getCurrentUserProfile,
} from "../controllers/moodleController.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function moodleRoutes(fastify) {
  fastify.get("/moodle/ping", getMoodlePing);

  // get full profile of current user
  fastify.get("/moodle/me", getCurrentUserProfile);
}
