import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import compress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Defense-in-depth against logging student message content / credentials (PR-05).
// Covers the common shapes a body/identity could be logged under without
// clobbering `err.message` (error messages must stay readable in logs).
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.message",
  "req.body.content",
  "req.body.sig",
  "body.message",
  "body.content",
  "body.sig",
];

/**
 * Creates a Fastify instance with logger, request ID, and security plugins.
 *
 * @param {Object} config
 * @param {string} config.nodeEnv
 * @param {boolean|number|string} [config.trustProxy] Fastify trustProxy setting
 * @param {string} config.logLevel
 * @param {Object} config.cors
 * @param {string[]|false} config.cors.origins
 * @param {Object} config.rateLimit
 * @param {number} config.rateLimit.max
 * @param {string} config.rateLimit.window
 * @param {Object} config.moodle
 * @param {string} config.moodle.publicUrl
 * @returns {Promise<import("fastify").FastifyInstance>}
 */
export async function createFastifyInstance(config) {
  const app = Fastify({
    // Behind nginx, request.ip must reflect the real client, not the proxy.
    // A hop count (e.g. 1) is safer than `true`: it ignores client-spoofed
    // X-Forwarded-For entries and trusts only the IP appended by our proxy.
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel,
      transport: config.nodeEnv !== "production" ? { target: "pino-pretty" } : undefined,
      redact: { paths: LOG_REDACT_PATHS, remove: true },
    },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    pluginTimeout: 60_000,
    // The only request bodies are small chat JSON payloads (message + identity);
    // 64 KB is generous while shrinking the parser's exposure to oversized input.
    bodyLimit: 65_536,
    // Inbound HTTP timeouts (PR-07). These bound time to RECEIVE a request and
    // idle keep-alive; they do not limit response duration, so long-lived SSE
    // responses are unaffected. Protects against slow-loris / stuck sockets.
    requestTimeout: 30_000,
    keepAliveTimeout: 72_000,
  });

  const connectSrc = ["'self'"];
  if (config.moodle.publicUrl) {
    connectSrc.push(config.moodle.publicUrl);
  } else {
    app.log.warn(
      { plugin: "helmet" },
      "PUBLIC_MOODLE_URL is empty; CSP connect-src will not include Moodle origin",
    );
  }

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc,
      },
    },
    xFrameOptions: { action: "sameorigin" },
    // Chatbot assets are intentionally loaded cross-origin from Moodle pages
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, {
    origin: config.cors.origins,
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
    allowList: (request) => request.url.startsWith("/chatbot/"),
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Zu viele Anfragen. Bitte warte eine Minute.",
    }),
  });

  // SSE routes opt out via config: { compress: false } on the route
  await app.register(compress, { global: true });

  const NO_CACHE_FILES = new Set(["index.html", "moodle-embed.html", "chatbot.js", "sanitize.js"]);

  // @fastify/static v9 applies its own Cache-Control after setHeaders when
  // `cacheControl` is enabled, which would clobber the per-file override. Manage
  // the header entirely in setHeaders so entrypoints stay uncached while the
  // rest keep a one-day TTL.
  const ONE_DAY = "public, max-age=86400";

  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "..", "..", "public"),
    prefix: "/",
    cacheControl: false,
    setHeaders(res, filePath) {
      const value = NO_CACHE_FILES.has(path.basename(filePath)) ? "no-cache" : ONE_DAY;
      res.setHeader("Cache-Control", value);
    },
  });

  return app;
}
