import { streamChat } from "../../application/useCases/chat/streamChat.js";
import { searchCourses } from "../../application/useCases/courses/searchCourses.js";
import { validateMessage } from "../../middleware/inputGuard.js";
import { checkUserRateLimit } from "../../middleware/rateLimiter.js";
import { sanitizeChatId } from "./chatId.js";
import config from "../../config/env.js";

function getCorsHeaders(request) {
  const origin = request.headers?.origin;
  const allowedOrigins = config.cors.origins;

  if (!origin || !Array.isArray(allowedOrigins) || !allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

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
        message = validateMessage(rawMessage, {
          log: request.log,
          ip: request.ip,
          maxLength: config.chat.maxMessageLength,
        });
      } catch (err) {
        return reply.status(err.statusCode ?? 400).send({ error: err.message });
      }

      // Prefer the identity verified by the auth preHandler over the raw body
      // value — the body userId must never be trusted on its own (IDOR).
      const claimedUserId = request.verifiedUserId ?? userId;
      const numericUserId =
        Number.isInteger(Number(claimedUserId)) && Number(claimedUserId) > 0
          ? Number(claimedUserId)
          : 0;

      // Rate-limit by userId AND IP (PR-03): a composite key prevents all
      // unverified callers (userId 0) from sharing one global bucket and keeps
      // a single abuser on one IP from exhausting a legitimate user's quota.
      const rateLimitKey = `${numericUserId}:${request.ip ?? "unknown"}`;
      const rateLimitResult = checkUserRateLimit(rateLimitKey, {
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
        ...getCorsHeaders(request),
      });

      const abortController = new AbortController();
      function onClientClose() {
        abortController.abort();
      }
      request.raw.on("close", onClientClose);

      // Guard every write: once the client disconnects or the socket is closed,
      // writing throws and the backpressure `drain` would never fire — so we
      // skip writes when the response is no longer writable, and race `drain`
      // against `close`/`error` so a dead socket can never hang the handler (PR-04).
      async function writeSse(chunk) {
        if (reply.raw.writableEnded || reply.raw.destroyed || abortController.signal.aborted) {
          return;
        }
        const ok = reply.raw.write(chunk);
        if (!ok) {
          await new Promise((resolve) => {
            const settle = () => {
              reply.raw.off?.("drain", settle);
              reply.raw.off?.("close", settle);
              reply.raw.off?.("error", settle);
              resolve();
            };
            reply.raw.once("drain", settle);
            reply.raw.once("close", settle);
            reply.raw.once("error", settle);
          });
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
          maxHistoryMessages: config.chat.maxHistoryMessages,
          signal: abortController.signal,
          async onChunk(text) {
            await writeSse(`data: ${JSON.stringify({ text, sessionId })}\n\n`);
          },
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          request.log.error({ err }, "streamChat failed");
          await writeSse(`data: ${JSON.stringify({ error: "Service unavailable" })}\n\n`);
        }
      } finally {
        request.raw.off("close", onClientClose);
        // writeSse is a no-op once aborted/ended, so [DONE] is skipped on a
        // disconnect. Only end a socket that is still writable.
        await writeSse("data: [DONE]\n\n");
        if (!reply.raw.writableEnded && !reply.raw.destroyed) {
          reply.raw.end();
        }
      }
    },
  };
}
