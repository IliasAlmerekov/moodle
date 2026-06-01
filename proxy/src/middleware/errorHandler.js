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

    const message =
      config.nodeEnv === "production" && statusCode >= 500
        ? "Ein Fehler ist aufgetreten."
        : error.message;

    reply.status(statusCode).send({ error: true, message });
  });
}
