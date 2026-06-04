import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFastifyInstance } from "./frameworks/webserver/fastify.js";
import { registerRoutes } from "./frameworks/webserver/routes/index.js";
import { sqliteChatStore } from "./frameworks/persistence/sqliteChatStore.js";
import { inMemoryChatStore } from "./frameworks/persistence/inMemoryChatStore.js";
import { moodleCache } from "./frameworks/moodle/moodleCache.js";
import { ollamaClient } from "./frameworks/llm/ollamaClient.js";
import { queueMetrics } from "./frameworks/llm/ollamaQueue.js";
import { createChatController } from "./adapters/controllers/chatController.js";
import { createHistoryController } from "./adapters/controllers/historyController.js";
import { createMoodleController } from "./adapters/controllers/moodleController.js";
import { createHealthController } from "./adapters/controllers/healthController.js";
import {
  createVerifyMoodleUser,
  createVerifyChatOwnership,
  createVerifyChatStreamOwnership,
} from "./middleware/auth.js";
import { setupErrorHandler } from "./middleware/errorHandler.js";
import config from "./config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.join(__dirname, "..", "package.json");

/**
 * Composition Root — creates and configures the Fastify application.
 * Wires all layers: frameworks -> adapters -> application -> entities.
 *
 * @returns {Promise<import("fastify").FastifyInstance>}
 */
export async function createApp() {
  const { version } = JSON.parse(readFileSync(packagePath, "utf8"));
  const app = await createFastifyInstance(config);

  setupErrorHandler(app);

  const chatRepository = config.nodeEnv === "test" ? inMemoryChatStore : sqliteChatStore;

  // moodleCache implements both ICourseRepository and IUserRepository
  const chat = createChatController({
    chatRepository,
    courseRepository: moodleCache,
    userRepository: moodleCache,
    llmService: ollamaClient,
  });

  const history = createHistoryController({ chatRepository });

  const moodle = createMoodleController({
    userRepository: moodleCache,
    getCacheStats: () => moodleCache.stats,
  });

  const health = createHealthController({
    courseRepository: moodleCache,
    llmService: ollamaClient,
    getCacheStats: () => moodleCache.stats,
    getQueueMetrics: () => queueMetrics,
    version,
  });

  const verifyMoodleUser = createVerifyMoodleUser({
    secret: config.auth.secret,
    previousSecrets: config.auth.previousSecrets,
    tokenTtlMs: config.auth.tokenTtlMs,
  });

  const verifyChatOwnership = createVerifyChatOwnership();
  const verifyChatStreamOwnership = createVerifyChatStreamOwnership();

  const controllers = { chat, history, moodle, health };

  await registerRoutes(app, controllers, {
    verifyMoodleUser,
    verifyChatOwnership,
    verifyChatStreamOwnership,
    invalidateCourseCache: () => moodleCache.invalidateCourseCache(),
    maxMessageLength: config.chat.maxMessageLength,
  });

  app.addHook("onReady", async () => {
    app.log.info("Warming up course cache...");
    try {
      await moodleCache.getAllCourses();
      app.log.info("Course cache warmed up successfully");
    } catch (err) {
      app.log.warn({ err }, "Course cache warmup failed — will retry on first request");
    }

    if (config.chat.retentionMs > 0) {
      try {
        const pruned = await chatRepository.pruneSessionsOlderThan(config.chat.retentionMs);
        app.log.info({ pruned }, "Pruned stale chat sessions on startup");
      } catch (err) {
        app.log.warn({ err }, "Chat session pruning failed");
      }
    }
  });

  // Retention must hold for a long-lived process, not only at startup (PR-06):
  // prune on a daily interval and stop the timer when the app closes. unref()
  // keeps the timer from holding the event loop open.
  if (config.chat.retentionMs > 0) {
    const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const pruneTimer = setInterval(() => {
      chatRepository
        .pruneSessionsOlderThan(config.chat.retentionMs)
        .then((pruned) => app.log.info({ pruned }, "Pruned stale chat sessions (scheduled)"))
        .catch((err) => app.log.warn({ err }, "Scheduled chat session pruning failed"));
    }, PRUNE_INTERVAL_MS);
    pruneTimer.unref();
    app.addHook("onClose", async () => clearInterval(pruneTimer));
  }

  return app;
}
