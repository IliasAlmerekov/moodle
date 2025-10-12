import { loadCoursesStructure } from "./services/courseCache.service.js";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import cors from "@fastify/cors";
import config from "./config/env.js";
import healthRoutes from "./routes/health.route.js";
import chatRoutes from "./routes/chat.route.js";
import ollamaRoutes from "./routes/ollama.route.js";
import moodleRoutes from "./routes/moodle.route.js";

fastify.addHook("onReady", async () => {
  try {
    fastify.log.info("Loading courses structure cache...");
    await loadCoursesStructure(fastify.log);
    fastify.log.info("Cache ready!");
  } catch (error) {
    fastify.log.error({ error: error }, "Failed to load courses structure");
  }
});

// Initialize Fastify
const fastify = Fastify({
  logger: {
    level: "info",
  },
});

// register cors plugin
await fastify.register(cors, {
  origin: "*",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, "..", "public"),
  prefix: "/",
});

// register all routes
await fastify.register(healthRoutes);
await fastify.register(chatRoutes);
await fastify.register(ollamaRoutes);
await fastify.register(moodleRoutes);

// warning about missing vars
if (config.validation.missingVars.length > 0) {
  fastify.log.warn(
    `Missing required environment variables: ${config.validation.missingVars.join(
      ", "
    )}`
  );
}

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    fastify.log.error(error, "Failed to start server");
    process.exit(1);
  }
};

start();
