import { loadCoursesStructure } from "./services/courseCache.service.js";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import config from "./config/env.js";
import { setupErrorHandler } from "./middleware/errorHandler.js";
import healthRoutes from "./routes/health.route.js";
import chatRoutes from "./routes/chat.route.js";
import ollamaRoutes from "./routes/ollama.route.js";
import moodleRoutes from "./routes/moodle.route.js";

const { NODE_ENV } = process.env;

// Initialize Fastify FIRST
const fastify = Fastify({
  logger: {
    level: config.logLevel,
    transport: NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
  },
  requestIdHeader: "x-request-id",
  genReqId: () => crypto.randomUUID(),
  pluginTimeout: 60000, // allow up to 60s for slow startup hooks (e.g. Moodle cache warmup)
});

setupErrorHandler(fastify);

// THEN add hooks
fastify.addHook("onReady", async () => {
  try {
    fastify.log.info(`Moodle URL: ${config.moodle.url}`);
    fastify.log.info("Loading courses structure cache...");
    await loadCoursesStructure(fastify.log);
    fastify.log.info("Cache ready!");
  } catch (error) {
    fastify.log.error({ error: error }, "Failed to load courses structure");
  }
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(",") ?? false,
});

await fastify.register(rateLimit, {
  max: 20,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: "Zu viele Anfragen. Bitte warte eine Minute.",
  }),
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

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    fastify.log.error(error, "Failed to start server");
    process.exit(1);
  }
};

async function shutdown(signal) {
  fastify.log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await fastify.close();
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
