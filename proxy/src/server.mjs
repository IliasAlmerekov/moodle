import Fastify from "fastify";
import cors from "@fastify/cors";
import config from "./config/env.js";
import healthRoutes from "./routes/health.route.js";
import chatRoutes from "./routes/chat.route.js";
import ollamaRoutes from "./routes/ollama.route.js";
import moodleRoutes from "./routes/moodle.route.js";

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
