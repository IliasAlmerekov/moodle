import {
  getMoodlePing,
  getUserCoursesById,
  getUserInfoById,
} from "../controllers/moodleController.js";
import { getCoursesStructure } from "../services/courseCache.service.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function moodleRoutes(fastify) {
  fastify.get("/moodle/ping", getMoodlePing);

  // get user courses by userId
  fastify.get("/moodle/users/:userId/courses", getUserCoursesById);
  fastify.get("/moodle/user/:id", getUserInfoById);

  // Debug route to check cached course URLs
  fastify.get("/moodle/debug/cache", async (request, reply) => {
    try {
      const courses = getCoursesStructure();
      
      // Return only first 2 courses with sample URLs for inspection
      const sample = courses.slice(0, 2).map((course) => ({
        id: course.id,
        name: course.name,
        url: course.url,
        sampleSection: course.sections[0] ? {
          name: course.sections[0].name,
          sampleModule: course.sections[0].modules[0] ? {
            name: course.sections[0].modules[0].name,
            url: course.sections[0].modules[0].url,
            sampleFile: course.sections[0].modules[0].files[0]
          } : null
        } : null
      }));

      return {
        totalCourses: courses.length,
        moodleBaseUrl: process.env.MOODLE_URL,
        sample
      };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
}
