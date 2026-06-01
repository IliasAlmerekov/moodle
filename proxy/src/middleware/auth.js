import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Factory for a Fastify preHandler that verifies the caller's Moodle identity.
 *
 * Trust model: the userId must NOT be taken on faith from the request body.
 * The Moodle embed snippet signs `${userId}.${ts}` server-side with a shared
 * secret (HMAC-SHA256) and ships userId/ts/sig to the browser. This preHandler
 * recomputes the signature and rejects any request whose userId is unsigned,
 * tampered with, or whose token has expired. Only after a valid signature is
 * the userId trusted (exposed as `request.verifiedUserId`).
 *
 * @param {Object} deps
 * @param {string} deps.secret  Shared HMAC secret, also configured in Moodle.
 * @param {number} [deps.tokenTtlMs=7_200_000]  Max age of a signed token in ms.
 * @param {function(): number} [deps.now=Date.now]
 * @returns {function(import("fastify").FastifyRequest, import("fastify").FastifyReply): Promise<void>}
 */
export function createVerifyMoodleUser({ secret, tokenTtlMs = 7_200_000, now = Date.now }) {
  function parseUserId(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : 0;
  }

  function deny(request, reply, userId) {
    request.log.warn(
      { security: true, type: "auth_failure", userId },
      "Moodle identity verification failed",
    );
    return reply.status(401).send({ statusCode: 401, error: "Unauthorized" });
  }

  return async function verifyMoodleUser(request, reply) {
    // Identity may arrive in the JSON body (POST) or the query string
    // (GET/DELETE chat-history). Body wins when both are present.
    const src = { ...(request.query ?? {}), ...(request.body ?? {}) };
    const userId = parseUserId(src.userId);
    const ts = Number(src.ts);
    const sig = typeof src.sig === "string" ? src.sig : "";

    if (!secret || userId === 0 || !Number.isFinite(ts) || sig === "") {
      return deny(request, reply, userId);
    }

    // Reject stale tokens; abs() also tolerates minor client/server clock skew.
    if (Math.abs(now() - ts) > tokenTtlMs) {
      return deny(request, reply, userId);
    }

    const expected = createHmac("sha256", secret).update(`${userId}.${ts}`).digest("hex");

    // Constant-time comparison; length guard avoids timingSafeEqual throwing.
    const valid =
      expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));

    if (!valid) {
      return deny(request, reply, userId);
    }

    request.verifiedUserId = userId;
  };
}

/**
 * Factory for a Fastify preHandler that authorizes access to a chat session.
 *
 * Must run AFTER `verifyMoodleUser` — it relies on `request.verifiedUserId`.
 * A chatId embeds its owner as `moodle-{userId}-...` (client) or
 * `session-{userId}-...` (server fallback); a caller may only read or delete a
 * session whose embedded userId matches their verified identity. Closes the
 * IDOR on `/api/chat-history/:chatId` (read and delete of another user's chat).
 *
 * @returns {function(import("fastify").FastifyRequest, import("fastify").FastifyReply): Promise<void>}
 */
export function createVerifyChatOwnership() {
  function parseOwnerId(chatId) {
    if (typeof chatId !== "string") {
      return 0;
    }
    const num = Number(chatId.split("-")[1]);
    return Number.isInteger(num) && num > 0 ? num : 0;
  }

  return async function verifyChatOwnership(request, reply) {
    const verifiedUserId = request.verifiedUserId;
    const ownerId = parseOwnerId(request.params?.chatId);

    if (!verifiedUserId || ownerId === 0 || ownerId !== verifiedUserId) {
      request.log.warn(
        { security: true, type: "chat_ownership_denied", userId: verifiedUserId ?? 0 },
        "Chat history ownership check failed",
      );
      return reply.status(403).send({ statusCode: 403, error: "Forbidden" });
    }
  };
}
