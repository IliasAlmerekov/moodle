import config from "../config/env.js";

export function setupErrorHandler(server) {
  server.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    request.log.error({
      err: error,
      requestId: request.id,
      url: request.url,
      method: request.method,
      statusCode,
    });

    // In production only expose messages that are explicitly client-safe:
    // Fastify schema-validation errors (statusCode < 500 with `validation`) and
    // errors deliberately flagged `expose: true`. Everything else — including
    // arbitrary 4xx thrown deeper in the stack — gets a generic message so no
    // internal detail (paths, identifiers, library internals) leaks.
    const clientSafe =
      statusCode < 500 && (error.expose === true || Array.isArray(error.validation));
    const message =
      config.nodeEnv !== "production" || clientSafe ? error.message : "Ein Fehler ist aufgetreten.";

    reply.status(statusCode).send({ error: true, message });
  });
}
