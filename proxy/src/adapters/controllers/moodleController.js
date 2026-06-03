import { createUserProfile } from "../../entities/UserProfile.js";

// Diagnostic Moodle endpoints expose user PII (name, email, enrolments) and
// cache internals. They have no consumer in the chat flow and exist only for
// local debugging, so they must never serve data in production.
function blockedInProduction(reply) {
  if (process.env.NODE_ENV === "production") {
    reply.status(404).send({ error: "Not found" });
    return true;
  }
  return false;
}

/**
 * Factory for the Moodle controller.
 * Handles HTTP concerns only — no business logic.
 *
 * @param {Object} deps
 * @param {import("../../application/repositories/IUserRepository.js").IUserRepository} deps.userRepository
 * @param {Function} [deps.getCacheStats] — optional cache stats provider (e.g. () => moodleCache.stats)
 */
export function createMoodleController({ userRepository, getCacheStats }) {
  return {
    async ping(_request, reply) {
      return reply.send({ status: "ok" });
    },

    async getUserCourses(request, reply) {
      if (blockedInProduction(reply)) return;

      const userId = Number(request.params?.userId);

      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ error: "Invalid user ID" });
      }

      try {
        const courses = await userRepository.getUserCourses(userId);
        return reply.send({ status: "ok", userId, courses });
      } catch (err) {
        request.log.error({ err, userId }, "getUserCourses failed");
        const statusCode = err.statusCode || 500;
        return reply.status(statusCode).send({ error: "Failed to retrieve user courses" });
      }
    },

    async getUser(request, reply) {
      if (blockedInProduction(reply)) return;

      const userId = Number(request.params?.id);

      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ error: "Invalid user ID" });
      }

      try {
        const user = await userRepository.getUserInfo(userId);
        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }
        const profile = createUserProfile({ ...user, courses: [] });
        return reply.send({
          status: "ok",
          userId: profile.id,
          firstname: profile.firstname,
          lastname: profile.lastname,
          fullname: profile.fullname,
          email: profile.email,
        });
      } catch (err) {
        request.log.error({ err, userId }, "getUser failed");
        const statusCode = err.statusCode || 500;
        return reply.status(statusCode).send({ error: "Failed to retrieve user info" });
      }
    },

    async debugCache(request, reply) {
      if (blockedInProduction(reply)) return;

      if (typeof getCacheStats !== "function") {
        return reply.status(404).send({ error: "Cache stats not available" });
      }

      try {
        const stats = getCacheStats();
        return reply.send({ status: "ok", cache: stats });
      } catch (err) {
        request.log.error({ err }, "debugCache failed");
        return reply.status(500).send({ error: "Failed to retrieve cache stats" });
      }
    },
  };
}
