/**
 * Factory for a Fastify preHandler that verifies the userId exists in Moodle.
 *
 * @param {Object} deps
 * @param {import("../application/repositories/IUserRepository.js").IUserRepository} deps.userRepository
 * @param {number} [deps.ttlMs=300_000]
 * @param {function(): number} [deps.now=Date.now]
 * @returns {function(import("fastify").FastifyRequest, import("fastify").FastifyReply): Promise<void>}
 */
export function createVerifyMoodleUser({ userRepository, ttlMs = 300_000, now = Date.now }) {
  const cache = new Map();

  function parseUserId(body) {
    const raw = body?.userId;
    const num = Number(raw);
    return Number.isInteger(num) && num > 0 ? num : 0;
  }

  function gcExpired() {
    const nowMs = now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= nowMs) {
        cache.delete(key);
      }
    }
  }

  return async function verifyMoodleUser(request, reply) {
    const userId = parseUserId(request.body);

    if (userId === 0) {
      return reply.status(401).send({ statusCode: 401, error: "Unauthorized" });
    }

    const cached = cache.get(userId);
    const nowMs = now();
    if (cached && cached.expiresAt > nowMs) {
      if (cached.verified) {
        return;
      }
      return reply.status(401).send({ statusCode: 401, error: "Unauthorized" });
    }

    if (cache.size >= 1000) {
      gcExpired();
    }

    try {
      const user = await userRepository.getUserInfo(userId);
      if (user) {
        cache.set(userId, { verified: true, expiresAt: nowMs + ttlMs });
        return;
      }
    } catch {
      request.log.warn(
        { security: true, type: "auth_failure", userId },
        "Moodle user verification failed",
      );
    }

    cache.set(userId, { verified: false, expiresAt: nowMs + ttlMs });
    return reply.status(401).send({ statusCode: 401, error: "Unauthorized" });
  };
}
