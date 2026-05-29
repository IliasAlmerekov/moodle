import { fileURLToPath } from "url";
import { createApp } from "../../app.js";
import config from "../../config/env.js";

/**
 * Starts the HTTP server.
 * Creates the application via createApp(), listens on the configured port,
 * and sets up graceful shutdown handlers.
 *
 * @param {Function} [createAppFn] — injectable for tests
 * @param {Object} [deps]
 * @param {NodeJS.Process} [deps.process] — injectable process object for tests
 */
export async function startServer(createAppFn = createApp, deps = { process }) {
  const { process: proc } = deps;
  let app;

  try {
    app = await createAppFn();
    await app.listen({ port: config.port, host: "0.0.0.0" });
    app.log.info(`Server listening on http://0.0.0.0:${config.port}`);
  } catch (err) {
    if (app?.log) {
      app.log.error(err, "Failed to start server");
    }
    proc.exit(1);
    return;
  }

  async function shutdown(signal) {
    app.log.info(`Received ${signal}, shutting down gracefully`);
    try {
      await app.close();
      proc.exit(0);
    } catch (error) {
      app.log.error(error, "Error during shutdown");
      proc.exit(1);
    }
  }

  proc.on("SIGTERM", () => shutdown("SIGTERM"));
  proc.on("SIGINT", () => shutdown("SIGINT"));
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] === modulePath) {
  startServer();
}
