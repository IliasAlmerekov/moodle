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
 */
export async function registerRoutes(app, controllers, options = {}) {
  const { chat, history, moodle, health } = controllers;
  const { verifyMoodleUser } = options;

  // Health check
  app.get("/health", health.check.bind(health));

  // Chat stream with JSON Schema validation
  app.post(
    "/api/chat-stream",
    {
      schema: {
        body: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string", minLength: 1, maxLength: 500 },
            userId: { type: "number" },
            chatId: { type: "string", maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
          },
        },
      },
      ...(verifyMoodleUser ? { preHandler: [verifyMoodleUser] } : {}),
    },
    chat.handleStream.bind(chat),
  );

  // Chat history
  const chatHistorySchema = {
    params: {
      type: "object",
      required: ["chatId"],
      properties: {
        chatId: { type: "string", maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" },
      },
    },
  };
  app.get("/api/chat-history/:chatId", { schema: chatHistorySchema }, history.get.bind(history));
  app.delete("/api/chat-history/:chatId", { schema: chatHistorySchema }, history.delete.bind(history));

  // Moodle endpoints
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
  app.get("/moodle/users/:userId/courses", { schema: userIdParamSchema }, moodle.getUserCourses.bind(moodle));

  const idParamSchema = {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "integer", minimum: 1 },
      },
    },
  };
  app.get("/moodle/user/:id", { schema: idParamSchema }, moodle.getUser.bind(moodle));
  app.get("/moodle/debug/cache", moodle.debugCache.bind(moodle));
}
