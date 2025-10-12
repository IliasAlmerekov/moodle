import {
  getMoodlePing,
  getUserCoursesById,
  getUserInfoById,
} from "../controllers/moodleController.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function moodleRoutes(fastify) {
  fastify.get("/moodle/ping", getMoodlePing);

  // get user courses by userId
  fastify.get("/moodle/users/:userId/courses", getUserCoursesById);
  fastify.get("/moodle/user/:id", getUserInfoById);
}
