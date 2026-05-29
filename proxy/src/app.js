import { createFastifyInstance } from "./frameworks/webserver/fastify.js";
import config from "./config/env.js";

/**
 * Composition Root — creates and configures the Fastify application.
 * Full wiring of controllers, routes, and repositories will be added
 * in COMP-01 (MILESTONE 6).
 *
 * @returns {Promise<import("fastify").FastifyInstance>}
 */
export async function createApp() {
  const app = await createFastifyInstance(config);
  return app;
}
