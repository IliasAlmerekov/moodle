import {
  getMoodlePing,
  getCurrentUserProfile,
  getUserCoursesById,
} from "../controllers/moodleController.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function moodleRoutes(fastify) {
  fastify.get("/moodle/ping", getMoodlePing);

  // get user courses by userId
  fastify.get("/moodle/users/:userId/courses", getUserCoursesById);
  fastify.get("/moodle/user/:id", getUserInfoById);

  // get full profile of current user
  fastify.get("/moodle/me", getCurrentUserProfile);
}
