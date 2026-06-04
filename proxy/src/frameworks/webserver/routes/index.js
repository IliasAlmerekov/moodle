// Internal-only guard: diagnostic and admin endpoints expose PII or operational
// internals and must never be reachable from outside the host. Gating on the
// loopback address is independent of NODE_ENV, so a misconfigured environment
// cannot accidentally expose them. Returns the reply to halt the chain on deny.
async function requireLoopback(request, reply) {
  const ip = request.ip;
  if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
    return reply.code(403).send({ error: "Forbidden" });
  }
}

/**
 * Registers all HTTP routes on the Fastify instance.
 *
 * @param {import("fastify").FastifyInstance} app
 * @param {Object} controllers
 * @param {Object} controllers.chat
 * @param {Function} controllers.chat.handleStream
 * @param {Object} controllers.history
 * @param {Function} controllers.history.get
 * @param {Function} controllers.history.delete
 * @param {Object} controllers.moodle
 * @param {Function} controllers.moodle.ping
 * @param {Function} controllers.moodle.getUserCourses
 * @param {Function} controllers.moodle.getUser
 * @param {Function} controllers.moodle.debugCache
 * @param {Object} controllers.health
 * @param {Function} controllers.health.check
 * @param {Object} [options]
 * @param {Function} [options.verifyMoodleUser]
 * @param {Function} [options.verifyChatOwnership]
 * @param {Function} [options.verifyChatStreamOwnership]
 * @param {Function} [options.invalidateCourseCache]
 * @param {boolean} [options.allowUnauthenticated=false] Test-only opt-out for the auth guard.
 * @param {number} [options.maxMessageLength=500] Max chat message length for the request schema.
 */
export async function registerRoutes(app, controllers, options = {}) {
  const { chat, history, moodle, health } = controllers;
  const {
    verifyMoodleUser,
    verifyChatOwnership,
    verifyChatStreamOwnership,
    invalidateCourseCache,
    allowUnauthenticated = false,
    maxMessageLength = 500,
  } = options;

  // Fail closed: the protected routes (chat-stream, chat-history) must receive
  // their auth preHandlers. A miswired Composition Root that forgets them must
  // crash at startup, not silently serve unauthenticated. Tests that register
  // routes without auth must opt out explicitly via `allowUnauthenticated`.
  if (
    !allowUnauthenticated &&
    !(verifyMoodleUser && verifyChatOwnership && verifyChatStreamOwnership)
  ) {
    throw new Error(
      "registerRoutes requires verifyMoodleUser, verifyChatOwnership, and verifyChatStreamOwnership. " +
        "Pass { allowUnauthenticated: true } only in tests.",
    );
  }

  // Public liveness probe (used by the container HEALTHCHECK and load balancers).
  app.get("/health", health.check.bind(health));

  // Detailed health (cache stats, queue/circuit metrics) — localhost only, since
  // it exposes operational internals useful for probing.
  if (typeof health.checkDetails === "function") {
    app.get(
      "/health/details",
      { preHandler: requireLoopback },
      health.checkDetails.bind(health),
    );
  }

  // Chat stream with JSON Schema validation — SSE: disable compression
  app.post(
    "/api/chat-stream",
    {
      config: { compress: false },
      schema: {
        body: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string", minLength: 1, maxLength: maxMessageLength },
            userId: { type: "number" },
            chatId: { type: "string", maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
            ts: { type: "number" },
            sig: { type: "string", maxLength: 128, pattern: "^[a-f0-9]+$" },
          },
        },
      },
      ...(verifyMoodleUser
        ? {
            preHandler: [
              verifyMoodleUser,
              ...(verifyChatStreamOwnership ? [verifyChatStreamOwnership] : []),
            ],
          }
        : {}),
    },
    chat.handleStream.bind(chat),
  );

  // Chat history — identity (userId/ts/sig) arrives via query string
  const chatHistorySchema = {
    params: {
      type: "object",
      required: ["chatId"],
      properties: {
        chatId: { type: "string", maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
      },
    },
    querystring: {
      type: "object",
      properties: {
        userId: { type: "number" },
        ts: { type: "number" },
        sig: { type: "string", maxLength: 128, pattern: "^[a-f0-9]+$" },
      },
    },
  };

  // Authorize history access only when both auth preHandlers are wired:
  // verifyMoodleUser proves identity, verifyChatOwnership enforces ownership.
  const historyAuth =
    verifyMoodleUser && verifyChatOwnership
      ? { preHandler: [verifyMoodleUser, verifyChatOwnership] }
      : {};

  app.get(
    "/api/chat-history/:chatId",
    { schema: chatHistorySchema, ...historyAuth },
    history.get.bind(history),
  );
  app.delete(
    "/api/chat-history/:chatId",
    { schema: chatHistorySchema, ...historyAuth },
    history.delete.bind(history),
  );

  // Moodle endpoints.
  // `/moodle/ping` is a PII-free liveness probe and stays public. The remaining
  // routes are diagnostic-only (they expose user PII and cache internals, with
  // no consumer in the chat flow), so they are restricted to loopback in
  // addition to the production block enforced in the controller.
  app.get("/moodle/ping", moodle.ping.bind(moodle));

  const userIdParamSchema = {
    params: {
      type: "object",
      required: ["userId"],
      properties: {
        userId: { type: "integer", minimum: 1 },
      },
    },
  };
  app.get(
    "/moodle/users/:userId/courses",
    { schema: userIdParamSchema, preHandler: requireLoopback },
    moodle.getUserCourses.bind(moodle),
  );

  const idParamSchema = {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "integer", minimum: 1 },
      },
    },
  };
  app.get(
    "/moodle/user/:id",
    { schema: idParamSchema, preHandler: requireLoopback },
    moodle.getUser.bind(moodle),
  );
  app.get(
    "/moodle/debug/cache",
    { preHandler: requireLoopback },
    moodle.debugCache.bind(moodle),
  );

  // Cache invalidation — localhost only
  if (invalidateCourseCache) {
    app.post(
      "/admin/cache/invalidate",
      { preHandler: requireLoopback },
      async (_request, reply) => {
        invalidateCourseCache();
        return reply.code(200).send({ ok: true });
      },
    );
  }
}
