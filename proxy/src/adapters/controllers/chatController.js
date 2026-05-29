import { streamChat } from "../../application/useCases/chat/streamChat.js";
import { searchCourses } from "../../application/useCases/courses/searchCourses.js";
import { validateMessage } from "../../middleware/inputGuard.js";
import { checkUserRateLimit } from "../../middleware/rateLimiter.js";
import { sanitizeChatId } from "./chatId.js";
import config from "../../config/env.js";

/**
 * Factory for the chat controller.
 * Handles HTTP/SSE concerns only — no business logic.
 *
 * @param {Object} deps
 * @param {import("../../application/repositories/IChatRepository.js").IChatRepository} deps.chatRepository
 * @param {import("../../application/repositories/ICourseRepository.js").ICourseRepository} deps.courseRepository
 * @param {import("../../application/repositories/IUserRepository.js").IUserRepository} deps.userRepository
 * @param {import("../../application/repositories/ILLMService.js").ILLMService} deps.llmService
 */
export function createChatController({
  chatRepository,
  courseRepository,
  userRepository,
  llmService,
}) {
  return {
    async handleStream(request, reply) {
      const { message: rawMessage, userId, chatId } = request.body ?? {};

      let message;
      try {
        message = validateMessage(rawMessage, { log: request.log, ip: request.ip });
      } catch (err) {
        return reply.status(err.statusCode ?? 400).send({ error: err.message });
      }

      const numericUserId =
        Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : 0;

      const rateLimitResult = checkUserRateLimit(numericUserId, {
        ip: request.ip,
        log: request.log,
        max: config.userRateLimit.max,
        windowMs: config.userRateLimit.windowMs,
      });
      if (!rateLimitResult.allowed) {
        return reply.status(429).send({
          statusCode: 429,
          error: "Too Many Requests",
          message: "Zu viele Anfragen. Bitte warte eine Minute.",
        });
      }

      const safeChatId = sanitizeChatId(chatId);
      const sessionId = safeChatId ?? `session-${numericUserId}-${Date.now()}`;

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const abortController = new AbortController();
      function onClientClose() {
        abortController.abort();
      }
      request.raw.on("close", onClientClose);

      async function writeSse(chunk) {
        const ok = reply.raw.write(chunk);
        if (!ok) {
          await new Promise((resolve) => reply.raw.once("drain", resolve));
        }
      }

      try {
        await streamChat({
          message,
          userId: numericUserId,
          sessionId,
          chatRepository,
          courseRepository,
          userRepository,
          llmService,
          searchCourses,
          model: config.ollama.model,
          moodleBaseUrl: config.moodle.publicUrl,
          signal: abortController.signal,
          async onChunk(text) {
            await writeSse(`data: ${JSON.stringify({ text, sessionId }) }\n\n`);
          },
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          request.log.error({ err }, "streamChat failed");
          await writeSse(`data: ${JSON.stringify({ error: "Service unavailable" }) }\n\n`);
        }
      } finally {
        request.raw.off("close", onClientClose);
        await writeSse("data: [DONE]\n\n");
        reply.raw.end();
      }
    },
  };
}
