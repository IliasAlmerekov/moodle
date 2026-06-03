/**
 * Factory for the health controller.
 * Handles HTTP concerns only — no business logic.
 *
 * @param {Object} deps
 * @param {import("../../application/repositories/ICourseRepository.js").ICourseRepository} deps.courseRepository
 * @param {import("../../application/repositories/ILLMService.js").ILLMService} deps.llmService
 * @param {Function} [deps.getCacheStats]
 * @param {Function} [deps.getQueueMetrics]
 * @param {string} [deps.version]
 * @param {Function} [deps.getUptime]
 */
export function createHealthController({
  courseRepository,
  llmService,
  getCacheStats,
  getQueueMetrics,
  version = "0.0.0",
  getUptime = () => Math.floor(process.uptime()),
}) {
  async function pingMoodle() {
    return courseRepository.getAllCourses();
  }

  async function pingOllama() {
    return llmService.listModels();
  }

  async function probeServices() {
    const [moodleResult, ollamaResult] = await Promise.allSettled([pingMoodle(), pingOllama()]);

    const services = {
      moodle: moodleResult.status === "fulfilled" ? "ok" : "error",
      ollama: ollamaResult.status === "fulfilled" ? "ok" : "error",
    };
    const allOk = services.moodle === "ok" && services.ollama === "ok";

    return {
      services,
      allOk,
      payload: {
        status: allOk ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: getUptime(),
        version,
        services,
      },
    };
  }

  return {
    // Public liveness probe. Intentionally omits cache/queue internals — those
    // leak operational signal (circuit state, failure counts) useful for
    // probing, so they live on the localhost-only /health/details endpoint.
    async check(_request, reply) {
      const { allOk, payload } = await probeServices();
      return reply.status(allOk ? 200 : 503).send(payload);
    },

    // Detailed health, including cache stats and queue/circuit-breaker metrics.
    // Wired to a localhost-only route in the composition root.
    async checkDetails(request, reply) {
      const { allOk, payload } = await probeServices();

      if (typeof getCacheStats === "function") {
        try {
          payload.cache = getCacheStats();
        } catch (err) {
          request.log.error({ err }, "getCacheStats failed");
          payload.cache = { error: "Failed to retrieve cache stats" };
        }
      }

      if (typeof getQueueMetrics === "function") {
        try {
          payload.queue = getQueueMetrics();
        } catch (err) {
          request.log.error({ err }, "getQueueMetrics failed");
          payload.queue = { error: "Failed to retrieve queue metrics" };
        }
      }

      return reply.status(allOk ? 200 : 503).send(payload);
    },
  };
}
