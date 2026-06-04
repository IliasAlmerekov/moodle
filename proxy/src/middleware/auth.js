import { createHmac, timingSafeEqual } from "node:crypto";

// A chatId embeds its owner as the second dash-segment: `moodle-{userId}-...`
// (client) or `session-{userId}-...` (server fallback). Returns the owner id, or
// 0 when the id is missing/unparseable so callers can fail closed.
function parseChatOwnerId(chatId) {
  if (typeof chatId !== "string") {
    return 0;
  }
  const num = Number(chatId.split("-")[1]);
  return Number.isInteger(num) && num > 0 ? num : 0;
}

function denyOwnership(request, reply, userId) {
  request.log.warn(
    { security: true, type: "chat_ownership_denied", userId: userId ?? 0 },
    "Chat ownership check failed",
  );
  return reply.status(403).send({ statusCode: 403, error: "Forbidden" });
}

// Tolerance for a token timestamp in the future, covering minor client/server
// clock skew. Beyond this, a future-dated `ts` is rejected so it cannot widen
// the replay window past `tokenTtlMs` (AUTH-TTL).
const CLOCK_SKEW_MS = 60_000;

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
 * @param {string[]} [deps.previousSecrets=[]]  Additional secrets still accepted
 *   during a rotation overlap window. Lets the proxy validate tokens signed with
 *   either the new or the old secret so a key can be rotated with zero downtime
 *   (AUTH-KID): deploy proxy accepting [new, old] → switch Moodle to new → drop old.
 * @param {number} [deps.tokenTtlMs=7_200_000]  Max age of a signed token in ms.
 * @param {function(): number} [deps.now=Date.now]
 * @returns {function(import("fastify").FastifyRequest, import("fastify").FastifyReply): Promise<void>}
 */
export function createVerifyMoodleUser({
  secret,
  previousSecrets = [],
  tokenTtlMs = 7_200_000,
  now = Date.now,
}) {
  const acceptedSecrets = [secret, ...previousSecrets].filter(Boolean);

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

  // Constant-time match against every accepted secret (no early return on the
  // first miss, so verification time does not reveal which secret matched).
  function signatureMatchesAnySecret(userId, ts, sig) {
    let matched = false;
    for (const candidate of acceptedSecrets) {
      const expected = createHmac("sha256", candidate).update(`${userId}.${ts}`).digest("hex");
      if (
        expected.length === sig.length &&
        timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
      ) {
        matched = true;
      }
    }
    return matched;
  }

  return async function verifyMoodleUser(request, reply) {
    // Identity may arrive in the JSON body (POST chat-stream) or, for
    // GET/DELETE chat-history, in `X-Chat-*` request headers. The query string
    // is still accepted (lowest precedence) for backward compatibility, but the
    // client now sends headers to keep identity out of URLs/logs (F-08).
    const headers = request.headers ?? {};
    const fromHeaders = {
      userId: headers["x-chat-user"],
      ts: headers["x-chat-ts"],
      sig: headers["x-chat-sig"],
    };
    const src = {
      ...(request.query ?? {}),
      ...Object.fromEntries(Object.entries(fromHeaders).filter(([, v]) => v !== undefined)),
      ...(request.body ?? {}),
    };
    const userId = parseUserId(src.userId);
    const ts = Number(src.ts);
    const sig = typeof src.sig === "string" ? src.sig : "";

    if (acceptedSecrets.length === 0 || userId === 0 || !Number.isFinite(ts) || sig === "") {
      return deny(request, reply, userId);
    }

    // Reject stale tokens (older than the TTL) and future-dated tokens beyond a
    // small clock-skew tolerance.
    const age = now() - ts;
    if (age > tokenTtlMs || age < -CLOCK_SKEW_MS) {
      return deny(request, reply, userId);
    }

    if (!signatureMatchesAnySecret(userId, ts, sig)) {
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
  return async function verifyChatOwnership(request, reply) {
    const verifiedUserId = request.verifiedUserId;
    const ownerId = parseChatOwnerId(request.params?.chatId);

    if (!verifiedUserId || ownerId === 0 || ownerId !== verifiedUserId) {
      return denyOwnership(request, reply, verifiedUserId);
    }
  };
}

/**
 * Factory for a Fastify preHandler that authorizes the chatId on `/api/chat-stream`.
 *
 * Must run AFTER `verifyMoodleUser`. The chatId arrives in the request body and is
 * optional: when absent the controller mints a fresh server-side session owned by
 * the verified user, so there is nothing to authorize. When present, its embedded
 * owner must match the verified identity — otherwise a caller could read another
 * user's history into the LLM context and write into their session.
 *
 * @returns {function(import("fastify").FastifyRequest, import("fastify").FastifyReply): Promise<void>}
 */
export function createVerifyChatStreamOwnership() {
  return async function verifyChatStreamOwnership(request, reply) {
    const chatId = request.body?.chatId;
    if (chatId === undefined || chatId === null) {
      return;
    }

    const verifiedUserId = request.verifiedUserId;
    const ownerId = parseChatOwnerId(chatId);

    if (!verifiedUserId || ownerId === 0 || ownerId !== verifiedUserId) {
      return denyOwnership(request, reply, verifiedUserId);
    }
  };
}
