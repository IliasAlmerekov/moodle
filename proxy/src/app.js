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

  const controllers = { chat, history, moodle, health };

  await registerRoutes(app, controllers);

  app.addHook("onReady", async () => {
    app.log.info("Warming up course cache...");
    try {
      await moodleCache.getAllCourses();
      app.log.info("Course cache warmed up successfully");
    } catch (err) {
      app.log.warn({ err }, "Course cache warmup failed — will retry on first request");
    }
  });

  return app;
}
